// Sends confirmation and daily digest messages.
// Uses Resend / Twilio when env keys exist; otherwise FormSubmit + Textbelt.

function json(res, code, body) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
}

const sms = require("./_sms");
const mail = require("./_mail");
const welcome = require("./_welcome");

async function sendEmail(to, subject, text, html) {
  return mail.sendEmail(to, subject, text, html);
}

async function sendSms(phone, text) {
  return sms.sendSms(phone, text);
}

function readBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === "string") {
    try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve({}); }
  }
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch (e) { resolve({}); }
    });
  });
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    json(res, 204, {});
    return;
  }
  if (req.method !== "POST") {
    json(res, 405, { ok: false, error: "POST only" });
    return;
  }
  const body = await readBody(req);
  const email = String(body.email || "").trim();
  const phone = String(body.phone || "").trim();
  let subject = String(body.subject || "In the Middle of the [Mess]age").slice(0, 160);
  let text = String(body.text || "").slice(0, 4000);
  let html = body.html ? String(body.html).slice(0, 12000) : "";
  let smsText = String(body.smsText || "").slice(0, 320);
  if (body.type === "welcome") {
    const copy = welcome.welcomeCopy({
      firstName: body.name || body.firstName || "there",
      role: body.role === "limb" ? "limb" : "parent",
      email,
      phone,
    });
    subject = copy.subject;
    text = copy.text;
    html = copy.html;
    smsText = copy.smsText;
  }
  const wantEmail = body.sendEmail !== false && !!email;
  const wantSms = body.sendSms !== false && !!phone;
  if (!text || (!wantEmail && !wantSms)) {
    json(res, 400, { ok: false, error: "Need a message and email or phone" });
    return;
  }
  const results = { email: null, sms: null };
  try {
    if (wantEmail) results.email = await sendEmail(email, subject, text, html);
  } catch (e) {
    results.email = { ok: false, error: e.message };
  }
  try {
    if (wantSms) results.sms = await sendSms(phone, smsText || text);
  } catch (e) {
    results.sms = { ok: false, error: e.message };
  }
  const ok = (results.email && results.email.ok) || (results.sms && results.sms.ok);
  json(res, ok ? 200 : 502, { ok, results });
};
