// /assets/reviews-live.js
//
// Fetches live Google rating + reviews from our own /api/reviews endpoint (a Cloudflare
// Pages Function - see /functions/api/reviews.js) and, if successful, replaces the
// hardcoded rating number and testimonial cards with real, current data.
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

  function reviewToCardHTML(review) {
    const stars = review.rating ? '&#9733;'.repeat(review.rating) : '';
    const safeText = escapeHTML(review.text || '');
    const safeAuthor = escapeHTML(review.author || 'Google user');
    const safeTime = escapeHTML(review.relativeTime || '');
    return (
      '<div class="testimonial-card">' +
      '<div class="testimonial-content">' +
      (stars ? '<p class="testimonial-stars" aria-hidden="true">' + stars + '</p>' : '') +
      '<p>&ldquo;' + safeText + '&rdquo;</p>' +
      '<p class="testimonial-author">- ' + safeAuthor + (safeTime ? ' &middot; ' + safeTime : '') + ' &middot; Google review</p>' +
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
