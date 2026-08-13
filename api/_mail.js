async function sendEmail(to, subject, text, html) {
  const email = String(to || "").trim();
  if (!email || !email.includes("@")) throw new Error("Invalid email");
  const key = process.env.RESEND_API_KEY;
  if (key) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.NOTIFY_FROM || "In the Middle of the [Mess]age <onboarding@resend.dev>",
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
    throw new Error(data.message || "Email send failed");
  }
  return { ok: true, via: "formsubmit" };
}

module.exports = { sendEmail };
