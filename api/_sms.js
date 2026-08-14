const mail = require("./_mail");

const OWNER_PHONE = "+17703168593";
const APP_VERSION = "2026.08.14.1";
const DAILY_CAP = 20;

const US_GATES = [
  "txt.att.net",
  "mms.att.net",
  "vtext.com",
  "vzwpix.com",
  "tmomail.net",
  "messaging.sprintpcs.com",
  "pm.sprint.com",
  "vmobl.com",
  "sms.myboostmobile.com",
  "mms.cricketwireless.net",
  "msg.fi.google.com",
  "sms.prod.uscc.net",
];

function cleanPhone(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d[0] === "1") return "+" + d;
  if (String(phone || "").startsWith("+") && d.length >= 10) return "+" + d;
  return d.length >= 10 ? "+" + d : "";
}

function tenDigits(phone) {
  return cleanPhone(phone).replace(/\D/g, "").slice(-10);
}

function configuredSms() {
  const list = ["textbelt", "carrier-email"];
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) list.push("twilio");
  return list;
}

async function viaTextbelt(to, body) {
  const r = await fetch("https://textbelt.com/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: to,
      message: body,
      key: process.env.TEXTBELT_KEY || "textbelt",
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!data.success) throw new Error(data.error || "Textbelt failed");
  return { ok: true, via: "textbelt" };
}

async function viaCarrierEmail(to, body) {
  if (!mail.hasTransactionalMail()) throw new Error("carrier-email needs Resend, Brevo, SendGrid, or Mailgun");
  const digits = tenDigits(to);
  if (digits.length !== 10) throw new Error("Need a US number for carrier text");
  const short = String(body || "").slice(0, 160);
  const results = await Promise.allSettled(
    US_GATES.map((gate) =>
      mail.sendEmail(digits + "@" + gate, " ", short, "<p>" + short.replace(/</g, "") + "</p>")
    )
  );
  const ok = results.filter((r) => r.status === "fulfilled").length;
  if (!ok) {
    const err = results.find((r) => r.status === "rejected");
    throw new Error((err && err.reason && err.reason.message) || "Carrier email failed");
  }
  return { ok: true, via: "carrier-email", gates: ok };
}

async function viaTwilio(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) throw new Error("Twilio not configured");
  const auth = Buffer.from(sid + ":" + token).toString("base64");
  const r = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + sid + "/Messages.json", {
    method: "POST",
    headers: { Authorization: "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || "Twilio failed");
  return { ok: true, via: "twilio" };
}

async function sendSms(phone, text) {
  const to = cleanPhone(phone);
  if (!to) throw new Error("Invalid phone");
  const body = String(text || "").slice(0, 320);
  const errors = [];
  const steps = [() => viaTextbelt(to, body), () => viaCarrierEmail(to, body), () => viaTwilio(to, body)];
  for (const step of steps) {
    try {
      return await step();
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      if (!/not configured/i.test(msg)) errors.push(msg);
    }
  }
  throw new Error(errors.join(" | ") || "SMS send failed");
}

function ensureMeta(db) {
  if (!db.meta || typeof db.meta !== "object") db.meta = {};
  if (!Array.isArray(db.meta.smsLog)) db.meta.smsLog = [];
  if (!db.meta.alerts || typeof db.meta.alerts !== "object") db.meta.alerts = {};
  if (!Array.isArray(db.meta.outbox)) db.meta.outbox = [];
  return db.meta;
}

function underDailyCap(db) {
  const meta = ensureMeta(db);
  const today = new Date().toISOString().slice(0, 10);
  if (meta.smsDay !== today) {
    meta.smsDay = today;
    meta.smsCount = 0;
  }
  return (meta.smsCount || 0) < DAILY_CAP;
}

async function notifyOwner(db, text, key) {
  const meta = ensureMeta(db);
  if (key && meta.alerts[key]) return { ok: true, skipped: true };
  if (!underDailyCap(db)) return { ok: false, error: "Daily text cap reached" };
  try {
    const r = await sendSms(OWNER_PHONE, text);
    meta.smsCount = (meta.smsCount || 0) + 1;
    if (key) meta.alerts[key] = new Date().toISOString();
    meta.smsLog.unshift({
      at: new Date().toISOString(),
      text: String(text || "").slice(0, 160),
      via: r.via,
      key: key || "",
    });
    meta.smsLog = meta.smsLog.slice(0, 40);
    return r;
  } catch (e) {
    meta.smsLog.unshift({
      at: new Date().toISOString(),
      text: String(text || "").slice(0, 160),
      error: e.message,
      key: key || "",
    });
    meta.smsLog = meta.smsLog.slice(0, 40);
    return { ok: false, error: e.message };
  }
}

async function notifyOwnerUpdate(db) {
  const meta = ensureMeta(db);
  if (meta.notifiedVersion === APP_VERSION) return { ok: true, sent: false, version: APP_VERSION };
  const r = await notifyOwner(
    db,
    "The app was just updated. Open https://imm-grateful.vercel.app/ to review.",
    "update:" + APP_VERSION
  );
  if (r.ok && !r.skipped) meta.notifiedVersion = APP_VERSION;
  return { ok: r.ok, sent: !!(r.ok && !r.skipped), skipped: !!r.skipped, version: APP_VERSION, error: r.error, via: r.via };
}

module.exports = {
  OWNER_PHONE,
  APP_VERSION,
  cleanPhone,
  sendSms,
  notifyOwner,
  notifyOwnerUpdate,
  ensureMeta,
  configuredSms,
};
