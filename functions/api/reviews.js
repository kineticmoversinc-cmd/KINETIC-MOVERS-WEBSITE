// /functions/api/reviews.js
//
// Cloudflare Pages Function - serves live Google rating + reviews to the site
// without ever exposing the Google API key to the browser.
//
// Endpoint: GET /api/reviews
// Response: { rating, reviewCount, reviews: [{ author, text, rating, relativeTime, profilePhoto }], fetchedAt }
//
// REQUIRED SETUP (Cloudflare Pages dashboard -> your project -> Settings -> Environment variables):
//   GOOGLE_PLACES_API_KEY   - a Google Cloud API key with the "Places API" enabled and billing on.
//                             Restrict it (API restrictions -> Places API only) since it's used
//                             server-side here, but restrict it anyway as defense in depth.
//   GOOGLE_PLACE_ID         - the Place ID for the "Kinetic Movers" Brampton listing
//                             (starts with "ChIJ..." - find it via
//                             https://developers.google.com/maps/documentation/places/web-service/place-id
//                             using the business name + address, NOT the CID from a maps.app.goo.gl link,
//                             which is a different ID format and will not work here).
//
// CACHING: Responses are cached at Cloudflare's edge for 24 hours (see CACHE_SECONDS below) using the
// standard Cache API, so this does NOT call Google on every visitor - only once per cache window per
// edge location. This keeps it comfortably inside Google's free monthly Places API credit for a
// small business site's traffic.

const CACHE_SECONDS = 60 * 60 * 24; // 24 hours - adjust if you want fresher/staler data

export async function onRequestGet(context) {
  const { env, request } = context;

  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).origin + '/api/reviews', request);

  // 1) Try the edge cache first
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  // 2) Validate configuration
  const apiKey = env.GOOGLE_PLACES_API_KEY;
  const placeId = env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) {
    return jsonResponse({
      error: 'Not configured. GOOGLE_PLACES_API_KEY and GOOGLE_PLACE_ID must be set in Cloudflare Pages environment variables.',
    }, 500);
  }

  // 3) Call Google Places API (Place Details) - server-side only, key never reaches the browser
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

  // Google's Places API returns at most 5 reviews, chosen by Google's own relevance algorithm -
  // this is a hard API limitation, not something this function controls.
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

  // 4) Store in edge cache for next time
  context.waitUntil(cache.put(cacheKey, response.clone()));

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
