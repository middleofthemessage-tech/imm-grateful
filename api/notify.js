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

function cleanPhone(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d[0] === "1") return "+" + d;
  if (String(phone || "").startsWith("+") && d.length >= 10) return "+" + d;
  return d.length >= 10 ? "+" + d : "";
}

async function sendEmail(to, subject, text, html) {
  const key = process.env.RESEND_API_KEY;
  if (key) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.NOTIFY_FROM || "In the Middle of the [Mess]age <onboarding@resend.dev>",
        to: [to],
        subject,
        text,
        html: html || "<p>" + String(text).replace(/\n/g, "<br>") + "</p>",
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || "Resend failed");
    return { ok: true, via: "resend" };
  }
  const r = await fetch("https://formsubmit.co/ajax/" + encodeURIComponent(to), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      _subject: subject,
      _template: "box",
      _captcha: "false",
      message: text,
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok && data.success !== "true" && data.success !== true) {
    throw new Error(data.message || "Email send failed");
  }
  return { ok: true, via: "formsubmit" };
}

async function sendSms(phone, text) {
  const to = cleanPhone(phone);
  if (!to) throw new Error("Invalid phone");
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (sid && token && from) {
    const auth = Buffer.from(sid + ":" + token).toString("base64");
    const r = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + sid + "/Messages.json", {
      method: "POST",
      headers: { Authorization: "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: from, Body: text }).toString(),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || "Twilio failed");
    return { ok: true, via: "twilio" };
  }
  const r = await fetch("https://textbelt.com/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: to,
      message: text.slice(0, 320),
      key: process.env.TEXTBELT_KEY || "textbelt",
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!data.success) throw new Error(data.error || "SMS send failed");
  return { ok: true, via: "textbelt" };
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
  const subject = String(body.subject || "In the Middle of the [Mess]age").slice(0, 160);
  const text = String(body.text || "").slice(0, 4000);
  const html = body.html ? String(body.html).slice(0, 8000) : "";
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
    if (wantSms) results.sms = await sendSms(phone, text);
  } catch (e) {
    results.sms = { ok: false, error: e.message };
  }
  const ok = (results.email && results.email.ok) || (results.sms && results.sms.ok);
  json(res, ok ? 200 : 502, { ok, results });
};
