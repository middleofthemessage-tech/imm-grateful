const mail = require("./_mail");
const sms = require("./_sms");

function list(db) {
  const meta = sms.ensureMeta(db);
  return Array.isArray(meta.outbox) ? meta.outbox : [];
}

function enqueue(db, item) {
  const meta = sms.ensureMeta(db);
  const row = {
    id: "ob_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    kind: item.kind === "sms" ? "sms" : "email",
    to: String(item.to || ""),
    subject: String(item.subject || "").slice(0, 160),
    text: String(item.text || "").slice(0, 4000),
    html: item.html ? String(item.html).slice(0, 12000) : "",
    tries: 0,
    status: "pending",
    lastError: "",
    createdAt: new Date().toISOString(),
    sentAt: null,
    via: "",
  };
  meta.outbox.unshift(row);
  meta.outbox = meta.outbox.slice(0, 400);
  return row;
}

async function flushOutbox(db) {
  const meta = sms.ensureMeta(db);
  const pending = meta.outbox.filter((i) => i.status === "pending" && (i.tries || 0) < 8);
  let sent = 0;
  let failed = 0;
  for (const item of pending) {
    item.tries = (item.tries || 0) + 1;
    try {
      let r;
      if (item.kind === "sms") r = await sms.sendSms(item.to, item.text);
      else r = await mail.sendEmail(item.to, item.subject || "In the Middle of the [Mess]age", item.text, item.html);
      item.status = "sent";
      item.sentAt = new Date().toISOString();
      item.via = r.via || "";
      item.lastError = "";
      sent += 1;
    } catch (e) {
      item.lastError = e.message || "send failed";
      if (item.tries >= 8) {
        item.status = "failed";
        failed += 1;
      }
    }
  }
  return {
    sent,
    failed,
    pending: meta.outbox.filter((i) => i.status === "pending").length,
    mail: mail.configuredMail(),
    sms: sms.configuredSms(),
    transactionalMail: mail.hasTransactionalMail(),
  };
}

function summary(db) {
  const rows = list(db);
  return {
    pending: rows.filter((i) => i.status === "pending").length,
    sent: rows.filter((i) => i.status === "sent").length,
    failed: rows.filter((i) => i.status === "failed").length,
    recent: rows.slice(0, 12).map((i) => ({
      id: i.id,
      kind: i.kind,
      to: i.kind === "sms" ? "••••" + String(i.to).replace(/\D/g, "").slice(-4) : i.to,
      status: i.status,
      tries: i.tries,
      via: i.via || "",
      lastError: i.lastError || "",
      at: i.sentAt || i.createdAt,
    })),
    mail: mail.configuredMail(),
    sms: sms.configuredSms(),
    transactionalMail: mail.hasTransactionalMail(),
  };
}

module.exports = { enqueue, flushOutbox, summary, list };
