// /src/reviews.js
//
// Fetches live Google rating + reviews server-side. Used by src/index.js in two places:
//   1. GET /api/reviews  -> handleReviews() returns the full JSON payload (rating,
//      reviewCount, individual reviews) consumed client-side by assets/reviews-live.js
//      to update the visible page.
//   2. Every HTML page request -> getReviewStats() returns just {rating, reviewCount}
//      so index.js can patch the JSON-LD "aggregateRating" schema block before serving
//      the page, keeping Google's structured data in sync with the same live number
//      shown to visitors (instead of the old hardcoded "36").
//
// Both paths share one Cache API entry keyed on /api/reviews, so this never calls the
// Google Places API more than once per 24h cache window, regardless of which path
// triggers the fetch first.
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
  const originUrl = new URL(request.url).origin;
  const { payload, response } = await fetchAndCacheReviewData(originUrl, env, ctx);
  if (response) return response; // came straight from cache, already a Response
  if (payload.error) return jsonResponse(payload, payload.status || 502);
  return jsonResponse(payload, 200, CACHE_SECONDS);
}

// Returns { rating, reviewCount } or null if not configured / fetch failed / no cached
// data yet. Never throws - callers should treat null as "leave the static HTML as-is",
// same fail-silent behavior as the client-side reviews-live.js script.
export async function getReviewStats(originUrl, env, ctx) {
  try {
    const { payload } = await fetchAndCacheReviewData(originUrl, env, ctx);
    if (!payload || payload.error) return null;
    if (payload.rating == null || payload.reviewCount == null) return null;
    return { rating: payload.rating, reviewCount: payload.reviewCount };
  } catch (err) {
    return null;
  }
}

// Shared cache-or-fetch logic. Returns { payload, response } where response is only
// set when the data came straight from the Cache API (so handleReviews can return it
// directly without re-serializing).
async function fetchAndCacheReviewData(originUrl, env, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(originUrl + '/api/reviews');

  const cached = await cache.match(cacheKey);
  if (cached) {
    const payload = await cached.clone().json();
    return { payload, response: cached };
  }

  const apiKey = env.GOOGLE_PLACES_API_KEY;
  const placeId = env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) {
    return {
      payload: {
        error: 'Not configured. GOOGLE_PLACES_API_KEY and GOOGLE_PLACE_ID must be set in this Worker\'s Settings -> Variables and Secrets.',
        status: 500,
      },
    };
  }

  const fields = 'rating,user_ratings_total,reviews';
  const googleUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${apiKey}`;

  let googleData;
  try {
    const res = await fetch(googleUrl);
    googleData = await res.json();
  } catch (err) {
    return { payload: { error: 'Failed to reach Google Places API.', status: 502 } };
  }

  if (googleData.status !== 'OK') {
    return {
      payload: {
        error: `Google Places API returned status: ${googleData.status}`,
        details: googleData.error_message || null,
        status: 502,
      },
    };
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

  return { payload };
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
