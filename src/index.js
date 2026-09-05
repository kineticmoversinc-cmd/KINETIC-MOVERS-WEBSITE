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
//   everything else    -> served as a static asset (your existing HTML/CSS/JS/images),
//                         completely unchanged from how the site worked before this file existed

import { handleReviews } from './reviews.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/reviews' && request.method === 'GET') {
      return handleReviews(request, env, ctx);
    }

    // Not an API route - serve the static site exactly as before.
    // _redirects and _headers in the project root are honored automatically here too.
    return env.ASSETS.fetch(request);
  },
};
