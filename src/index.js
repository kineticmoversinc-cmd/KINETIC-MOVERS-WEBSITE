// /src/index.js
//
// This is the actual entry point for the kinetic-movers-website Worker.
//
// This project runs on "Cloudflare Workers with static assets" (NOT classic Cloudflare
// Pages) - confirmed via the dashboard: Overview/Metrics/Deployments/Bindings/Settings
// tabs, "0 workers bound", and "Metrics is unavailable for Workers with only static
// assets". That means there is no `functions/` folder auto-routing convention here (that
// is a Pages-only feature) - every request is handled by this single script, which then
// decides whether to run custom logic or just hand the request off to the static files.
//
// Routing:
//   GET /api/reviews  -> handled here, calls Google Places API server-side (see src/reviews.js)
//   everything else    -> served as a static asset (your existing HTML/CSS/JS/images).
//                         For HTML pages specifically, the JSON-LD "aggregateRating"
//                         block (rating + reviewCount used for Google's star-rating rich
//                         results) is patched in-place with the same live Google Places
//                         data that assets/reviews-live.js shows visitors, so the two
//                         never drift out of sync. If the live fetch fails or isn't
//                         configured yet, the page is served completely unchanged with
//                         its static fallback numbers - this never breaks a page load.

import { handleReviews, getReviewStats } from './reviews.js';

// Matches the aggregateRating block exactly as it appears in every page's JSON-LD,
// e.g.:
//   "aggregateRating": {
//     "@type": "AggregateRating",
//     "ratingValue": "5.0",
//     "reviewCount": "36"
//   }
// Captures the ratingValue and reviewCount strings so they can be swapped for live ones.
const AGGREGATE_RATING_RE = /("aggregateRating"\s*:\s*\{\s*"@type"\s*:\s*"AggregateRating"\s*,\s*"ratingValue"\s*:\s*")[^"]*("\s*,\s*"reviewCount"\s*:\s*")[^"]*("\s*\})/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/reviews' && request.method === 'GET') {
      return handleReviews(request, env, ctx);
    }

    // Not an API route - serve the static asset first.
    const assetResponse = await env.ASSETS.fetch(request);

    const contentType = assetResponse.headers.get('content-type') || '';
    if (request.method !== 'GET' || !contentType.includes('text/html')) {
      return assetResponse;
    }

    // HTML page - try to patch the JSON-LD rating with live data. Any failure here
    // (not configured, Google API down, no aggregateRating block on this page) just
    // falls through to returning the untouched static page.
    try {
      const stats = await getReviewStats(url.origin, env, ctx);
      if (!stats) return assetResponse;

      const html = await assetResponse.text();
      if (!AGGREGATE_RATING_RE.test(html)) return assetResponse;

      const ratingStr = Number(stats.rating).toFixed(1);
      const patched = html.replace(
        AGGREGATE_RATING_RE,
        `$1${ratingStr}$2${stats.reviewCount}$3`
      );

      // Rebuild headers from the original asset response but drop content-length,
      // since the patched body is a different byte length than the static file.
      const headers = new Headers(assetResponse.headers);
      headers.delete('content-length');

      return new Response(patched, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers,
      });
    } catch (err) {
      return assetResponse;
    }
  },
};
