// /src/reviews.js
//
// Fetches live Google rating + reviews server-side. Called by src/index.js when a
// request comes in for GET /api/reviews.
//
// REQUIRED SETUP (Cloudflare dashboard -> this Worker -> Settings -> Variables and Secrets):
//   GOOGLE_PLACES_API_KEY   - a Google Cloud API key with the "Places API" enabled and
//                             billing on. Add it as a "Secret" (not a plain text variable)
//                             so it's encrypted and never shown again in the dashboard.
//   GOOGLE_PLACE_ID         - the Place ID for the "Kinetic Movers" Brampton listing
//                             (starts with "ChIJ..." - use Google's Place ID Finder tool
//                             with the business name + address, NOT the CID from a
//                             maps.app.goo.gl link, which is a different ID format).
//
// CACHING: Responses are cached at Cloudflare's edge for 24 hours using the standard
// Cache API, so this does NOT call Google on every visitor.

const CACHE_SECONDS = 60 * 60 * 24; // 24 hours

export async function handleReviews(request, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).origin + '/api/reviews', request);

  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  const apiKey = env.GOOGLE_PLACES_API_KEY;
  const placeId = env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) {
    return jsonResponse({
      error: 'Not configured. GOOGLE_PLACES_API_KEY and GOOGLE_PLACE_ID must be set in this Worker\'s Settings -> Variables and Secrets.',
    }, 500);
  }

  const fields = 'rating,user_ratings_total,reviews';
  const googleUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${apiKey}`;

  let googleData;
  try {
    const res = await fetch(googleUrl);
    googleData = await res.json();
  } catch (err) {
    return jsonResponse({ error: 'Failed to reach Google Places API.' }, 502);
  }

  if (googleData.status !== 'OK') {
    return jsonResponse({
      error: `Google Places API returned status: ${googleData.status}`,
      details: googleData.error_message || null,
    }, 502);
  }

  const result = googleData.result || {};

  // Google's Places API returns at most 5 reviews, chosen by Google's own relevance
  // algorithm - this is a hard API limitation, not something this function controls.
  const reviews = (result.reviews || []).map((r) => ({
    author: r.author_name || 'Google user',
    text: r.text || '',
    rating: r.rating || null,
    relativeTime: r.relative_time_description || '',
    profilePhoto: r.profile_photo_url || null,
  }));

  const payload = {
    rating: result.rating != null ? result.rating : null,
    reviewCount: result.user_ratings_total != null ? result.user_ratings_total : null,
    reviews,
    fetchedAt: new Date().toISOString(),
  };

  const response = jsonResponse(payload, 200, CACHE_SECONDS);

  ctx.waitUntil(cache.put(cacheKey, response.clone()));

  return response;
}

function jsonResponse(data, status = 200, cacheSeconds = 0) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };
  if (cacheSeconds > 0) {
    headers['Cache-Control'] = `public, max-age=${cacheSeconds}`;
  }
  return new Response(JSON.stringify(data), { status, headers });
}
