function fromAddress() {
  return process.env.NOTIFY_FROM || "In the Middle of the [Mess]age <onboarding@resend.dev>";
}

function fromParts() {
  const raw = fromAddress();
  const m = raw.match(/^(.*)<([^>]+)>$/);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, "") || "In the Middle of the [Mess]age", email: m[2].trim() };
  return { name: "In the Middle of the [Mess]age", email: raw };
}

function configuredMail() {
  const list = [];
  if (process.env.RESEND_API_KEY) list.push("resend");
  if (process.env.BREVO_API_KEY) list.push("brevo");
  if (process.env.SENDGRID_API_KEY) list.push("sendgrid");
  if (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN) list.push("mailgun");
  list.push("formsubmit");
  return list;
}

function hasTransactionalMail() {
  return !!(
    process.env.RESEND_API_KEY ||
    process.env.BREVO_API_KEY ||
    process.env.SENDGRID_API_KEY ||
    (process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN)
  );
}

async function viaResend(email, subject, text, html) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Resend not configured");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromAddress(),
      to: [email],
      subject,
      text,
      html: html || "<p>" + String(text).replace(/\n/g, "<br>") + "</p>",
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || "Resend failed");
  return { ok: true, via: "resend" };
}

async function viaBrevo(email, subject, text, html) {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error("Brevo not configured");
  const from = fromParts();
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: { name: from.name, email: from.email.includes("resend.dev") ? "noreply@imm-grateful.app" : from.email },
      to: [{ email }],
      subject,
      textContent: text,
      htmlContent: html || "<p>" + String(text).replace(/\n/g, "<br>") + "</p>",
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || data.error || "Brevo failed");
  return { ok: true, via: "brevo" };
}

async function viaSendgrid(email, subject, text, html) {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) throw new Error("SendGrid not configured");
  const from = fromParts();
  const r = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email }] }],
      from: { email: from.email, name: from.name },
      subject,
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: html || "<p>" + String(text).replace(/\n/g, "<br>") + "</p>" },
      ],
    }),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error((data.errors && data.errors[0] && data.errors[0].message) || "SendGrid failed");
  }
  return { ok: true, via: "sendgrid" };
}

async function viaMailgun(email, subject, text, html) {
  const key = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  if (!key || !domain) throw new Error("Mailgun not configured");
  const auth = Buffer.from("api:" + key).toString("base64");
  const body = new URLSearchParams({
    from: fromAddress(),
    to: email,
    subject,
    text,
    html: html || "<p>" + String(text).replace(/\n/g, "<br>") + "</p>",
  });
  const r = await fetch("https://api.mailgun.net/v3/" + domain + "/messages", {
    method: "POST",
    headers: { Authorization: "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || "Mailgun failed");
  return { ok: true, via: "mailgun" };
}

async function viaFormsubmit(email, subject, text) {
  const r = await fetch("https://formsubmit.co/ajax/" + encodeURIComponent(email), {
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
    throw new Error(data.message || "FormSubmit failed");
  }
  return { ok: true, via: "formsubmit" };
}

async function sendEmail(to, subject, text, html) {
  const email = String(to || "").trim();
  if (!email || !email.includes("@")) throw new Error("Invalid email");
  const errors = [];
  const steps = [
    () => viaResend(email, subject, text, html),
    () => viaBrevo(email, subject, text, html),
    () => viaSendgrid(email, subject, text, html),
    () => viaMailgun(email, subject, text, html),
    () => viaFormsubmit(email, subject, text),
  ];
  for (const step of steps) {
    try {
      return await step();
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      if (!/not configured/i.test(msg)) errors.push(msg);
    }
  }
  throw new Error(errors.join(" | ") || "Email send failed");
}

module.exports = { sendEmail, configuredMail, hasTransactionalMail, fromAddress };
