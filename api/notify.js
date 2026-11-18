/**
 * FireSight alert delivery — Vercel serverless function (Node 18+).
 *
 * GET  /api/notify  -> which roles have demo targets (channel types only, never numbers)
 * POST /api/notify  -> { role, text, lang: "en"|"te", to?, channel? }
 *
 * Environment variables (Vercel > Project > Settings > Environment Variables):
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER   Twilio voice/SMS
 *   TELEGRAM_BOT_TOKEN                                          optional, for tg: targets
 *   ROLE_FIRE, ROLE_TRAFFIC, ROLE_POLICE, ROLE_HOSPITAL, ROLE_PUBLIC, ROLE_POWER
 *       comma-separated targets, each "call:+91XXXXXXXXXX", "sms:+91XXXXXXXXXX" or "tg:<chat id>"
 *   ALLOWED_NUMBERS   comma-separated numbers the app may send to directly (custom hospital entry)
 *   DEMO_KEY          optional shared key the app must send in the x-demo-key header
 */
const ROLES = ['FIRE', 'TRAFFIC', 'POLICE', 'HOSPITAL', 'PUBLIC', 'POWER'];
const VOICE = { en: { voice: 'Polly.Aditi', language: 'en-IN' }, te: { voice: 'Google.te-IN-Standard-C', language: 'te-IN' } };

const targets = role => (process.env['ROLE_' + role] || '').split(',').map(s => s.trim()).filter(Boolean);
const mask = t => (t.length > 4 ? '…' + t.slice(-4) : t);
const xml = s => String(s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

// Trial Twilio accounts refuse inline TwiML on the Calls API, so the call fetches its
// spoken message from this same function (GET ?twiml=1). If even that is refused,
// fall back to Twilio's own text-to-speech template so the phone still rings.
const TEMPLATE_URL = 'https://webhooks.twilio.com/v1/Voice/Template/voice_text_to_speech';
const trialRefusal = e => /trial|disallowed|not allowed|parameter/i.test(e || '');

function twimlFor(text, lang) {
  const v = VOICE[lang] || VOICE.en;
  const say = `<Say voice="${v.voice}" language="${v.language}">${xml(text)}</Say>`;
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="1"/>${say}<Pause length="1"/>${say}</Response>`;
}

async function twilio(path, form, withFrom = true) {
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok || !process.env.TWILIO_FROM_NUMBER) return { ok: false, error: 'Twilio keys are not set' };
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/${path}.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${tok}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(withFrom ? { From: process.env.TWILIO_FROM_NUMBER, ...form } : form),
  });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, id: j.sid } : { ok: false, error: j.message || `Twilio returned ${r.status}` };
}

async function placeCall(to, text, lang, base) {
  const own = `${base}/api/notify?twiml=1&lang=${lang}&t=${encodeURIComponent(text)}`;
  const attempts = [
    ['spoken alert', { To: to, Url: own, Method: 'GET' }, true],
    ['spoken alert', { To: to, Url: own, Method: 'GET' }, false],
    ['Twilio sample message (trial limit)', { To: to, Url: TEMPLATE_URL }, false],
  ];
  let last;
  for (const [mode, form, withFrom] of attempts) {
    last = await twilio('Calls', form, withFrom);
    if (last.ok) return { ...last, mode };
    if (!trialRefusal(last.error)) return last;
  }
  return last;
}

async function deliver(target, text, lang, base) {
  const i = target.indexOf(':');
  const channel = target.slice(0, i), to = target.slice(i + 1);
  try {
    if (channel === 'call') {
      return { channel, to: mask(to), ...(await placeCall(to, text, lang, base)) };
    }
    if (channel === 'sms') return { channel, to: mask(to), ...(await twilio('Messages', { To: to, Body: text })) };
    if (channel === 'tg') {
      const tok = process.env.TELEGRAM_BOT_TOKEN;
      if (!tok) return { channel, to: mask(to), ok: false, error: 'Telegram bot token is not set' };
      const r = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: to, text }),
      });
      const j = await r.json().catch(() => ({}));
      return { channel, to: mask(to), ok: !!j.ok, error: j.ok ? undefined : j.description || `Telegram returned ${r.status}` };
    }
    return { channel, to: mask(to), ok: false, error: `Unknown channel "${channel}"` };
  } catch (e) {
    return { channel, to: mask(to), ok: false, error: 'Network error: ' + e.message };
  }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const q = new URL(req.url, 'http://local').searchParams;
  if (q.get('twiml')) {
    const lang = q.get('lang') === 'te' ? 'te' : 'en';
    const text = String(q.get('t') || 'FireSight alert. Please check the dashboard.').slice(0, 700);
    res.setHeader('Content-Type', 'text/xml; charset=utf-8');
    return res.status(200).send(twimlFor(text, lang));
  }
  if (req.method === 'GET') {
    return res.status(200).json({
      service: 'firesight-notify', keyRequired: !!process.env.DEMO_KEY,
      roles: Object.fromEntries(ROLES.map(r => [r, targets(r).map(t => t.split(':')[0])])),
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use GET or POST' });
  if (process.env.DEMO_KEY && req.headers['x-demo-key'] !== process.env.DEMO_KEY)
    return res.status(401).json({ error: 'Demo key is missing or wrong. Enter it under Alert delivery.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const { role, text, lang = 'en', to, channel = 'sms' } = body || {};
  const msg = String(text || '').trim().slice(0, 700);
  if (!msg) return res.status(400).json({ error: 'Message text is empty' });

  let list;
  if (to) {
    const allowed = (process.env.ALLOWED_NUMBERS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!allowed.includes(to)) return res.status(403).json({ error: `Number ending ${to.slice(-4)} is not in ALLOWED_NUMBERS` });
    if (!['sms', 'call'].includes(channel)) return res.status(400).json({ error: 'Channel must be sms or call' });
    list = [`${channel}:${to}`];
  } else {
    if (!ROLES.includes(role)) return res.status(400).json({ error: `Unknown role "${role}"` });
    list = targets(role);
  }
  const base = process.env.PUBLIC_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const results = await Promise.all(list.map(t => deliver(t, msg, lang === 'te' ? 'te' : 'en', base)));
  return res.status(200).json({ ok: results.some(r => r.ok), results });
};
