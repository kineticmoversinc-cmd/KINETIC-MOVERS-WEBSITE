// /src/quote.js
//
// POST /api/quote - receives the quote-request form from the website, checks it, and
// emails it to the business inbox. This replaces Formspree as the first choice; the
// website falls back to Formspree automatically whenever this endpoint answers with
// anything other than success or a "your details are wrong" (422) rejection, so a
// lead is never lost because of a problem here.
//
// REQUIRED SETUP (Cloudflare dashboard):
//   1. Email Routing / Email Service must be set up for kineticmovers.ca, with the
//      destination inbox (QUOTE_TO) verified.
//   2. wrangler.jsonc needs the send_email binding named EMAIL.
//   Leads go to DEFAULT_TO from DEFAULT_FROM below. To change either without editing code,
//   add a plain-text variable QUOTE_TO / QUOTE_FROM in the Cloudflare dashboard.
// If the EMAIL binding is missing this returns 503 and the website uses Formspree.
//
// Status codes the website understands:
//   200  lead emailed          -> website shows our /thank-you page
//   422  rejected (bad/missing details, or looks like a bot) -> website shows a message
//   anything else              -> website tries Formspree instead

const DEFAULT_TO = 'kineticmovers.inc@gmail.com'; // inbox that receives leads (verified in Email Routing)
const DEFAULT_FROM = 'info@kineticmovers.ca'; // must be an address on kineticmovers.ca

const MAX = { name: 100, phone: 40, email: 200, place: 200, date: 40, size: 80, extra: 300 };

// Fields the form sends that we show in the email, in this order.
const FIELDS = [
  ['Name', 'name', MAX.name],
  ['Phone', 'phone', MAX.phone],
  ['Email', 'email', MAX.email],
  ['Moving from', 'moving_from', MAX.place],
  ['Moving to', 'moving_to', MAX.place],
  ['Moving date', 'moving_date', MAX.date],
  ['Move size', 'move_size', MAX.size],
];

// Where the lead came from (added to every form by assets/main.js).
const SOURCE_FIELDS = [
  ['Ad click ID (gclid)', 'gclid'],
  ['Ad click ID (gbraid)', 'gbraid'],
  ['Ad click ID (wbraid)', 'wbraid'],
  ['Campaign source', 'utm_source'],
  ['Campaign medium', 'utm_medium'],
  ['Campaign', 'utm_campaign'],
  ['Keyword', 'utm_term'],
  ['Ad content', 'utm_content'],
  ['First page visited', 'landing_page'],
  ['Form on page', 'form_page'],
  ['Came from', 'referrer'],
];

function clean(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ') // control characters
    .trim()
    .slice(0, max);
}

function oneLine(value, max) {
  return clean(value, max).replace(/[\r\n]+/g, ' ');
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function reject(message) {
  return json({ ok: false, error: message }, 422);
}

export async function handleQuote(request, env, ctx) {
  // Only accept posts that come from our own website pages.
  const origin = request.headers.get('Origin');
  const host = new URL(request.url).host;
  if (origin) {
    let originHost = '';
    try { originHost = new URL(origin).host; } catch (e) { /* invalid */ }
    if (originHost !== host) return json({ ok: false, error: 'forbidden' }, 403);
  }

  if (!env.EMAIL) {
    return json({ ok: false, error: 'not_configured' }, 503);
  }

  let form;
  try {
    form = await request.formData();
  } catch (e) {
    return reject('We could not read your request. Please try again.');
  }

  // Hidden trap field: people never see it, form-filling bots do.
  if (clean(form.get('_gotcha'), 50)) return reject('Your request could not be sent.');

  const values = {};
  for (const [, key, max] of FIELDS) values[key] = clean(form.get(key), max);

  if (values.name.length < 2) return reject('Please enter your name.');
  const digits = values.phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return reject('Please enter a valid phone number.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email)) return reject('Please enter a valid email address.');

  const lines = [];
  for (const [label, key] of FIELDS) lines.push(`${label}: ${values[key] || '-'}`);

  const sourceLines = [];
  for (const [label, key] of SOURCE_FIELDS) {
    const v = clean(form.get(key), MAX.extra);
    if (v) sourceLines.push(`${label}: ${v}`);
  }

  const route = values.moving_from || values.moving_to
    ? ` (${oneLine(values.moving_from || '?', 40)} -> ${oneLine(values.moving_to || '?', 40)})`
    : '';
  const subject = `New quote request: ${oneLine(values.name, 60)}${route}`;

  const text = [
    'New quote request from kineticmovers.ca',
    '',
    ...lines,
    '',
    sourceLines.length ? 'Where this lead came from' : 'Where this lead came from: direct visit (no ad or campaign details)',
    ...sourceLines,
    '',
    `Received: ${new Date().toISOString()}`,
    'Reply to this email to answer the customer directly.',
  ].join('\n');

  try {
    await env.EMAIL.send({
      to: env.QUOTE_TO || DEFAULT_TO,
      from: env.QUOTE_FROM || DEFAULT_FROM,
      replyTo: values.email,
      subject,
      text,
    });
  } catch (err) {
    console.error('quote email failed', err && (err.code || err.message || err));
    return json({ ok: false, error: 'send_failed' }, 502);
  }

  return json({ ok: true }, 200);
}
