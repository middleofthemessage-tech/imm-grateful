const mail = require("./_mail");
const sms = require("./_sms");
const outbox = require("./_outbox");

const APP_URL = "https://imm-grateful.vercel.app/";

function firstNameOf(user) {
  return String((user && user.firstName) || "there").trim() || "there";
}

function parentEmailText(name) {
  return [
    "Hi " + name + ",",
    "",
    "Your parent account is confirmed. Welcome to In the Middle of the [Mess]age — a quiet community for the messy middle of parenting.",
    "",
    "What this app is",
    "It is a break for your brain. One place to keep care, your village, safety, and a little of you, without the noise of a typical social feed.",
    "",
    "What you can do",
    "• Home: a simple day view, greetings, and what matters right now.",
    "• Track: diapers, feeding, sleep, medicine, play, growth, and age-matched milestones. You can hide tracking on your own Home; Villager helpers still see it so they can log care.",
    "• Village: invite trusted people (Villagers) with a household code. They clock in and out. You choose live updates or one log after they clock out.",
    "• Updates: live safety and recall notes from official sources (CPSC, FDA, USDA, NHTSA, CDC, and related notices).",
    "• Reminders and calendar: care reminders, appointments, and optional Accountability Fee if a requested Villager care step is missed.",
    "• Me: small spaces for the parts of you that are not only “mom” or “dad.”",
    "• Encouragement: an optional daily CSB verse at a time you pick.",
    "",
    "Your information stays in your locked account. Other families cannot see it.",
    "",
    "Open the app anytime:",
    APP_URL,
    "",
    "We are glad you are here.",
    "In the Middle of the [Mess]age",
    "A break for your brain.",
  ].join("\n");
}

function limbEmailText(name) {
  return [
    "Hi " + name + ",",
    "",
    "Your Villager account is confirmed. Welcome to In the Middle of the [Mess]age — the household invited you to help with care.",
    "",
    "What this app is",
    "It is a quiet care space for parents and the people they trust. You are a Villager: a helper in their village, not a public social profile.",
    "",
    "What you can do",
    "• Clock in when your shift starts. Tracking unlocks after you clock in.",
    "• Log diapers, feeding, sleep, medicine, play, and other care the parent asked you to track.",
    "• See reminders and requests the parent shares with you.",
    "• Clock out when you are done. The parent can get a live feed or one summary at the end of the shift.",
    "• Some homes use Care Accountability. If a requested care step is missed, the app may follow up. That is an app care-check, not a message from the parent.",
    "",
    "Sign in with this email or phone and the password you chose:",
    APP_URL,
    "",
    "Thank you for being part of this village.",
    "In the Middle of the [Mess]age",
    "A break for your brain.",
  ].join("\n");
}

function wrapHtml(title, bodyText) {
  const paras = String(bodyText)
    .split("\n\n")
    .map((block) => {
      const escaped = block
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      if (escaped.startsWith("• ")) {
        const items = escaped.split("\n").map((line) => line.replace(/^•\s*/, ""));
        return "<ul style=\"margin:8px 0 16px;padding-left:20px;color:#2C2C2C;font-size:15px;line-height:1.5\">" +
          items.map((i) => "<li style=\"margin:4px 0\">" + i + "</li>").join("") +
          "</ul>";
      }
      const html = escaped.replace(/\n/g, "<br>");
      const isHead = /^(What this app is|What you can do)$/.test(block.trim());
      if (isHead) return "<h3 style=\"margin:20px 0 8px;font-size:16px;color:#5C7D6A\">" + html + "</h3>";
      return "<p style=\"margin:0 0 12px;color:#2C2C2C;font-size:15px;line-height:1.55\">" + html + "</p>";
    })
    .join("");
  return [
    "<div style=\"font-family:Georgia,serif;background:#FBF6F0;padding:24px\">",
    "<div style=\"max-width:560px;margin:0 auto;background:#fff;border:1px solid #E8E0D8;border-radius:16px;padding:28px\">",
    "<p style=\"margin:0 0 4px;color:#5C7D6A;font-size:12px;letter-spacing:.08em;text-transform:uppercase\">Account confirmed</p>",
    "<h1 style=\"margin:0 0 16px;font-size:22px;color:#2C2C2C\">" + title + "</h1>",
    paras,
    "</div></div>",
  ].join("");
}

function welcomeCopy(user) {
  const name = firstNameOf(user);
  const limb = user && user.role === "limb";
  const subject = limb
    ? "Your Villager account is ready — welcome to the village"
    : "Your account is ready — welcome to In the Middle of the [Mess]age";
  const text = limb ? limbEmailText(name) : parentEmailText(name);
  const smsText = limb
    ? ("Hi " + name + ", your Villager account is confirmed. Welcome to the village. Clock in when you start a shift. " + APP_URL)
    : ("Hi " + name + ", your In the Middle of the [Mess]age account is confirmed. Welcome to the community. Track care, invite your village, and stay current on safety. " + APP_URL);
  return {
    subject,
    text,
    html: wrapHtml("Welcome to the community", text),
    smsText,
  };
}

async function sendWelcomeAccount(user, db) {
  const copy = welcomeCopy(user);
  const results = { email: null, sms: null, queued: false };
  try {
    results.email = await mail.sendEmail(user.email, copy.subject, copy.text, copy.html);
  } catch (e) {
    results.email = { ok: false, error: e.message };
    if (db && user.email) {
      outbox.enqueue(db, { kind: "email", to: user.email, subject: copy.subject, text: copy.text, html: copy.html });
      results.queued = true;
    }
  }
  try {
    results.sms = await sms.sendSms(user.phone, copy.smsText);
  } catch (e) {
    results.sms = { ok: false, error: e.message };
    if (db && user.phone) {
      outbox.enqueue(db, { kind: "sms", to: user.phone, text: copy.smsText });
      results.queued = true;
    }
  }
  results.ok = !!(results.email && results.email.ok) || !!(results.sms && results.sms.ok) || results.queued;
  return results;
}

module.exports = { welcomeCopy, sendWelcomeAccount, APP_URL };
