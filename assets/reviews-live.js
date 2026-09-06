// /assets/reviews-live.js
//
// Fetches live Google rating + reviews from our own /api/reviews endpoint (handled by
// the Worker script at /src/index.js -> /src/reviews.js) and, if successful, replaces
// the hardcoded rating number and testimonial cards with real, current data.
//
// IMPORTANT: if the fetch fails for any reason (API not configured yet, Google API
// error, network issue), this script does NOTHING and the existing static HTML stays
// exactly as it is. The page never shows a broken or empty state because of this script.

(function () {
  const ROTATE_INTERVAL_MS = 6000;

  document.addEventListener('DOMContentLoaded', function () {
    fetch('/api/reviews')
      .then((res) => {
        if (!res.ok) throw new Error('reviews endpoint returned ' + res.status);
        return res.json();
      })
      .then((data) => {
        if (data.error) throw new Error(data.error);
        updateRatingStat(data.rating, data.reviewCount);
        updateTestimonials(data.reviews);
      })
      .catch(() => {
        // Silent by design - static fallback content already in the HTML is correct
        // and sufficient. No console noise for site visitors' sake; check network
        // tab / Cloudflare Function logs directly if you need to debug this.
      });
  });

  function updateRatingStat(rating, reviewCount) {
    if (rating == null) return;
    const stats = document.querySelectorAll('.stat');
    stats.forEach((stat) => {
      const label = stat.querySelector('.l');
      if (label && /average rating/i.test(label.textContent)) {
        const n = stat.querySelector('.n');
        if (n) n.textContent = rating.toFixed(1);
        if (reviewCount != null) {
          label.textContent = 'Average rating (' + reviewCount + ' reviews)';
        }
      }
    });

    // Also refresh the Google Reviews header summary above the footer, if present.
    const grsNumber = document.querySelector('.grs-number');
    if (grsNumber) grsNumber.textContent = rating.toFixed(1);
    const grsCount = document.querySelector('.grs-count');
    if (grsCount && reviewCount != null) {
      grsCount.textContent = 'Based on ' + reviewCount + ' Google reviews';
    }
  }

  function updateTestimonials(reviews) {
    if (!reviews || reviews.length === 0) return;
    const grid = document.getElementById('testimonials-grid');
    if (!grid) return;

    const cards = reviews.map(reviewToCardHTML).join('\n');
    grid.innerHTML = cards;
    grid.dataset.live = 'true';

    // Simple "keeps changing" effect: cross-fade which card is highlighted/visible-first
    // by cycling a small opacity pulse across cards. Purely cosmetic - all cards are
    // real Google reviews, this just keeps the section visually active.
    const cardEls = Array.from(grid.querySelectorAll('.testimonial-card'));
    if (cardEls.length <= 1) return;

    let i = 0;
    setInterval(() => {
      cardEls.forEach((el) => el.classList.remove('testimonial-live-highlight'));
      cardEls[i].classList.add('testimonial-live-highlight');
      i = (i + 1) % cardEls.length;
    }, ROTATE_INTERVAL_MS);
  }

  const GOOGLE_G_ICON_SM = '<svg class="google-g-icon-sm" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.9-2.26 5.36-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

  function reviewToCardHTML(review) {
    const stars = review.rating ? '&#9733;'.repeat(review.rating) : '';
    const safeText = escapeHTML(review.text || '');
    const safeAuthor = escapeHTML(review.author || 'Google user');
    const safeTime = escapeHTML(review.relativeTime || '');
    const initial = escapeHTML((review.author || 'G').trim().charAt(0).toUpperCase() || 'G');
    return (
      '<div class="testimonial-card">' +
      '<div class="testimonial-content">' +
      (stars ? '<p class="testimonial-stars" aria-hidden="true">' + stars + '</p>' : '') +
      '<p>&ldquo;' + safeText + '&rdquo;</p>' +
      '<div class="testimonial-footer">' +
      '<div class="testimonial-avatar" aria-hidden="true">' + initial + '</div>' +
      '<div>' +
      '<p class="testimonial-author">' + safeAuthor + '</p>' +
      '<p class="testimonial-source">' + GOOGLE_G_ICON_SM + 'Posted on Google' + (safeTime ? ' &middot; ' + safeTime : '') + '</p>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
