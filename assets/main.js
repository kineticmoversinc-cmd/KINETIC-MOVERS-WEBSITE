document.addEventListener("DOMContentLoaded", function () {
  var toggle = document.getElementById("nav-toggle");
  var nav = document.getElementById("main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  initFloatingButtons();
  initChatWidget();
  initAddressAutocomplete();
  initClickableCards();
  initFormResetOnBack();
  initPhoneQr();
  initPhoneClickTracking();
});

/* ---------- push a dataLayer event whenever someone clicks a tel: link ----------
   Runs on every screen size (mobile dials directly, desktop opens the QR modal
   via initPhoneQr() above — this fires either way). In GTM, add a Custom Event
   trigger listening for "phone_click" and attach your Google Ads conversion tag. */
function initPhoneClickTracking() {
  var links = document.querySelectorAll('a[href^="tel:"]');
  if (!links.length) return;
  window.dataLayer = window.dataLayer || [];
  links.forEach(function (link) {
    link.addEventListener('click', function () {
      window.dataLayer.push({ event: 'phone_click', phone_number: link.getAttribute('href').replace('tel:', '') });
    });
  });
}

/* ---------- on desktop/laptop, tel: links do nothing (no dialer app) ----------
   Show a "scan to call" QR code + copy button instead. On an actual phone,
   the link still dials normally. ---------- */
function initPhoneQr() {
  var links = document.querySelectorAll('a[href^="tel:"]');
  if (!links.length) return;

  // Desktop/laptop detection: match the same 900px breakpoint the site
  // already uses for its mobile nav. More reliable than pointer-type
  // checks, which misclassify touchscreen laptops.
  var isSmallScreen = window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
  if (isSmallScreen) return; // let phones/tablets dial normally

  var modal = null;

  function buildModal() {
    var overlay = document.createElement('div');
    overlay.className = 'kw-qr-overlay';
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="kw-qr-panel" role="dialog" aria-label="Call Kinetic Movers">' +
        '<button class="kw-qr-close" aria-label="Close">&times;</button>' +
        '<h3>Call Kinetic Movers</h3>' +
        '<p class="kw-qr-number" id="kw-qr-number"></p>' +
        '<img class="kw-qr-img" id="kw-qr-img" alt="QR code to call Kinetic Movers" width="180" height="180">' +
        '<p class="kw-qr-hint">Scan with your phone camera to call, or:</p>' +
        '<button class="btn btn-primary kw-qr-copy" id="kw-qr-copy">Copy number</button>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) hide();
    });
    overlay.querySelector('.kw-qr-close').addEventListener('click', hide);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') hide();
    });

    return overlay;
  }

  function show(telHref, displayNumber) {
    if (!modal) modal = buildModal();
    modal.querySelector('#kw-qr-number').textContent = displayNumber;
    modal.querySelector('#kw-qr-img').src =
      'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=' + encodeURIComponent(telHref);

    var copyBtn = modal.querySelector('#kw-qr-copy');
    copyBtn.textContent = 'Copy number';
    copyBtn.onclick = function () {
      var num = telHref.replace('tel:', '');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(num).then(function () {
          copyBtn.textContent = 'Copied!';
          setTimeout(function () { copyBtn.textContent = 'Copy number'; }, 1500);
        });
      }
    };

    modal.hidden = false;
  }

  function hide() {
    if (modal) modal.hidden = true;
  }

  Array.prototype.forEach.call(links, function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      show(link.getAttribute('href'), link.textContent.trim());
    });
  });
}

/* ---------- clear quote forms when a user lands back on the page via the
   browser back/forward button after submitting (bfcache keeps old field
   values otherwise) ---------- */
function initFormResetOnBack() {
  var forms = document.querySelectorAll('form');
  if (!forms.length) return;

  function resetAll() {
    Array.prototype.forEach.call(forms, function (f) {
      f.reset();
    });
  }

  // Fires when the page is restored from the back/forward cache.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      resetAll();
      return;
    }
    // Fallback for browsers that don't set e.persisted but do report
    // a back_forward navigation type.
    if (window.performance && performance.getEntriesByType) {
      var nav = performance.getEntriesByType('navigation')[0];
      if (nav && nav.type === 'back_forward') resetAll();
    }
  });
}

/* ---------- make whole service/location cards clickable, not just "Learn more" ---------- */
function initClickableCards() {
  var cards = document.querySelectorAll('.card');
  Array.prototype.forEach.call(cards, function (card) {
    var link = card.querySelector('a.card-link, a');
    if (!link || !link.getAttribute('href')) return;
    card.classList.add('kw-card-clickable');
    card.addEventListener('click', function (e) {
      if (e.target.closest('a')) return; // let the real link handle its own click
      window.location.href = link.getAttribute('href');
    });
  });
}

/* ---------- address search/autocomplete for "Moving from" / "Moving to" ---------- */
var KW_PROVINCE_ABBR = {
  "Ontario": "ON", "Quebec": "QC", "Québec": "QC", "Nova Scotia": "NS",
  "New Brunswick": "NB", "Manitoba": "MB", "British Columbia": "BC",
  "Prince Edward Island": "PE", "Saskatchewan": "SK", "Alberta": "AB",
  "Newfoundland and Labrador": "NL", "Northwest Territories": "NT",
  "Yukon": "YT", "Nunavut": "NU"
};

/* Build a short, clean "123 Main St, City, ON" string instead of Nominatim's
   long/unreliable display_name (which drags in neighbourhood, region, county
   names and a postcode that is frequently wrong for the exact civic number). */
function kwFormatAddress(result) {
  var a = result.address || {};
  var streetParts = [];
  if (a.house_number) streetParts.push(a.house_number);
  if (a.road) streetParts.push(a.road);
  var street = streetParts.join(' ');

  var city = a.city || a.town || a.village || a.municipality || a.suburb || a.hamlet || '';
  var province = KW_PROVINCE_ABBR[a.state] || a.state || '';

  var parts = [];
  if (street) parts.push(street);
  if (city) parts.push(city);
  if (province) parts.push(province);

  var short = parts.join(', ');
  return short || result.display_name;
}

function initAddressAutocomplete() {
  var inputs = document.querySelectorAll('#from, #to');
  if (!inputs.length) return;

  Array.prototype.forEach.call(inputs, function (input) {
    var field = input.closest('.field') || input.parentElement;
    if (!field) return;
    field.style.position = field.style.position || 'relative';

    var list = document.createElement('div');
    list.className = 'kw-addr-list';
    list.hidden = true;
    field.appendChild(list);

    var timer = null;
    var activeIndex = -1;

    input.setAttribute('autocomplete', 'off');

    input.addEventListener('input', function () {
      var query = input.value.trim();
      activeIndex = -1;
      if (timer) clearTimeout(timer);
      if (query.length < 3) {
        hideList();
        return;
      }
      timer = setTimeout(function () {
        searchAddress(query, function (results) {
          renderList(results);
        });
      }, 400);
    });

    input.addEventListener('keydown', function (e) {
      var items = list.querySelectorAll('div');
      if (!items.length || list.hidden) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, items.length - 1);
        highlight(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        highlight(items);
      } else if (e.key === 'Enter') {
        if (activeIndex >= 0) {
          e.preventDefault();
          items[activeIndex].click();
        }
      } else if (e.key === 'Escape') {
        hideList();
      }
    });

    document.addEventListener('click', function (e) {
      if (e.target !== input && !list.contains(e.target)) hideList();
    });

    function highlight(items) {
      Array.prototype.forEach.call(items, function (el, i) {
        el.classList.toggle('kw-active', i === activeIndex);
      });
    }

    function hideList() {
      list.hidden = true;
      list.innerHTML = '';
    }

    function renderList(results) {
      list.innerHTML = '';
      if (!results.length) {
        hideList();
        return;
      }
      results.forEach(function (r) {
        var shortAddr = kwFormatAddress(r);
        var item = document.createElement('div');
        item.textContent = shortAddr;
        item.title = r.display_name;
        item.addEventListener('click', function () {
          input.value = shortAddr;
          hideList();
        });
        list.appendChild(item);
      });
      list.hidden = false;
    }

    function searchAddress(query, cb) {
      var url = 'https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=ca&q=' + encodeURIComponent(query);
      fetch(url, { headers: { 'Accept': 'application/json' } })
        .then(function (res) { return res.json(); })
        .then(function (data) { cb(data || []); })
        .catch(function () { cb([]); });
    }
  });
}

/* ---------- Instagram + WhatsApp floating buttons ---------- */
function initFloatingButtons() {
  var WHATSAPP_NUMBER = "14165237909";
  var INSTAGRAM_URL = "https://instagram.com/kineticmoversinc";

  var wrap = document.createElement("div");
  wrap.className = "kw-floating";
  wrap.innerHTML =
    '<a class="kw-fab kw-fab-ig" href="' + INSTAGRAM_URL + '" target="_blank" rel="noopener" aria-label="Message us on Instagram">' +
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="20" height="20" rx="5" stroke="white" stroke-width="2"/><circle cx="12" cy="12" r="4.5" stroke="white" stroke-width="2"/><circle cx="17.2" cy="6.8" r="1.2" fill="white"/></svg>' +
    '</a>' +
    '<a class="kw-fab kw-fab-wa" href="https://wa.me/' + WHATSAPP_NUMBER + '" target="_blank" rel="noopener" aria-label="Message us on WhatsApp">' +
      '<svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.79.47 3.47 1.29 4.93L2 22l5.29-1.39a9.9 9.9 0 0 0 4.75 1.21h.01c5.46 0 9.9-4.45 9.9-9.91C21.96 6.45 17.5 2 12.04 2Zm5.76 14.02c-.24.68-1.4 1.3-1.93 1.37-.5.07-1.05.1-3.05-.65-2.51-.95-4.14-3.4-4.27-3.55-.13-.15-1.02-1.36-1.02-2.6 0-1.23.65-1.84.88-2.09.23-.25.5-.31.67-.31.17 0 .33 0 .48.01.16.01.36-.06.56.43.24.58.8 2 .87 2.15.07.15.11.32.02.51-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.28.71 1.16 1.53 1.88 1.05.93 1.94 1.22 2.22 1.36.28.14.44.12.6-.07.16-.19.68-.79.87-1.06.18-.27.36-.22.6-.13.24.09 1.55.73 1.82.87.27.13.44.19.51.3.07.11.07.62-.17 1.3Z"/></svg>' +
    '</a>' +
    '<button class="kw-fab kw-fab-chat" id="kw-chat-toggle" aria-label="Chat with Kinetic Movers">' +
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 5h16v11H8l-4 4V5Z" stroke="white" stroke-width="2" stroke-linejoin="round"/></svg>' +
    '</button>';
  document.body.appendChild(wrap);

  // Swap this for your real "leave a review" link — Google Business Profile
  // > Ask for reviews > copy the short link (looks like https://g.page/r/.../review)
  var GOOGLE_REVIEW_URL = "https://maps.app.goo.gl/fe6pbcBXdwawcMHk9";

  var leftWrap = document.createElement("div");
  leftWrap.className = "kw-floating-left";
  leftWrap.innerHTML =
    '<a class="kw-fab kw-fab-google" href="' + GOOGLE_REVIEW_URL + '" target="_blank" rel="noopener" aria-label="Leave us a Google review">' +
      '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.1 6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.6 18.9 12 24 12c3.1 0 5.8 1.1 8 3l6-6C34.1 6 29.3 4 24 4c-7.7 0-14.4 4.4-17.7 10.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.3C29.3 35.6 26.8 36.5 24 36.5c-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.5 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.2 5.3C40.8 36.3 44 30.8 44 24c0-1.3-.1-2.7-.4-3.5z"/></svg>' +
    '</a>';
  document.body.appendChild(leftWrap);
}

/* ---------- Mini chatbot: asks a few questions, then opens WhatsApp ---------- */
function initChatWidget() {
  var WHATSAPP_NUMBER = "14165237909";

  var panel = document.createElement("div");
  panel.className = "kw-chat-panel";
  panel.id = "kw-chat-panel";
  panel.hidden = true;
  panel.innerHTML =
    '<div class="kw-chat-header"><span>Kinetic Movers</span><button id="kw-chat-close" aria-label="Close chat">&times;</button></div>' +
    '<div class="kw-chat-body" id="kw-chat-body"></div>';
  document.body.appendChild(panel);

  var toggleBtn = document.getElementById("kw-chat-toggle");
  var closeBtn = document.getElementById("kw-chat-close");
  var body = document.getElementById("kw-chat-body");

  var answers = { name: "", type: "", details: "" };
  var started = false;

  toggleBtn.addEventListener("click", function () {
    panel.hidden = !panel.hidden;
    if (!panel.hidden && !started) {
      started = true;
      startChat();
    }
  });
  closeBtn.addEventListener("click", function () {
    panel.hidden = true;
  });

  function addBotMessage(text) {
    var m = document.createElement("div");
    m.className = "kw-msg";
    m.textContent = text;
    body.appendChild(m);
    body.scrollTop = body.scrollHeight;
  }

  function addUserMessage(text) {
    var m = document.createElement("div");
    m.className = "kw-msg kw-msg-user";
    m.textContent = text;
    body.appendChild(m);
    body.scrollTop = body.scrollHeight;
  }

  function clearStep() {
    var existing = body.querySelector(".kw-step");
    if (existing) existing.remove();
  }

  function startChat() {
    addBotMessage("Hi! I'm the Kinetic Movers assistant. What's your name?");
    askName();
  }

  function askName() {
    var step = document.createElement("div");
    step.className = "kw-step";
    step.innerHTML =
      '<input type="text" id="kw-input-name" placeholder="Your name">' +
      '<div class="kw-step-actions"><button class="kw-btn-next" id="kw-next-name">Next</button></div>';
    body.appendChild(step);
    body.scrollTop = body.scrollHeight;

    document.getElementById("kw-next-name").addEventListener("click", function () {
      var val = document.getElementById("kw-input-name").value.trim();
      if (!val) return;
      answers.name = val;
      addUserMessage(val);
      clearStep();
      addBotMessage("Thanks, " + val + "! Is this a local (GTA) move or a long-distance move?");
      askType();
    });
  }

  function askType() {
    var step = document.createElement("div");
    step.className = "kw-step";
    step.innerHTML = '<div class="kw-quick-replies"><button data-val="Local (GTA)">Local (GTA)</button><button data-val="Long-distance">Long-distance</button><button data-val="Commercial/office">Commercial/office</button></div>';
    body.appendChild(step);
    body.scrollTop = body.scrollHeight;

    Array.prototype.forEach.call(step.querySelectorAll("button"), function (btn) {
      btn.addEventListener("click", function () {
        var val = btn.getAttribute("data-val");
        answers.type = val;
        addUserMessage(val);
        clearStep();
        addBotMessage("Got it. Roughly where are you moving from/to, and what's your target move date?");
        askDetails();
      });
    });
  }

  function askDetails() {
    var step = document.createElement("div");
    step.className = "kw-step";
    step.innerHTML =
      '<input type="text" id="kw-input-details" placeholder="e.g. Brampton to Mississauga, mid-September">' +
      '<div class="kw-step-actions"><button class="kw-btn-next" id="kw-next-details">Send to WhatsApp</button></div>';
    body.appendChild(step);
    body.scrollTop = body.scrollHeight;

    document.getElementById("kw-next-details").addEventListener("click", function () {
      var val = document.getElementById("kw-input-details").value.trim();
      answers.details = val;
      if (val) addUserMessage(val);
      clearStep();
      addBotMessage("Perfect \u2014 opening WhatsApp with your details so our team can get you a quote.");
      sendToWhatsApp();
    });
  }

  function sendToWhatsApp() {
    var msg = "Hi Kinetic Movers! My name is " + answers.name +
      ". I'm looking for a " + answers.type + " move. Details: " + answers.details +
      ". Can you send me a quote?";
    var url = "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(msg);
    window.open(url, "_blank", "noopener");
  }
}
