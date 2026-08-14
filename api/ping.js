const dbx = require("./_db");
const sms = require("./_sms");
const outbox = require("./_outbox");
const welcome = require("./_welcome");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return dbx.send(res, 204, {});
  if (req.method !== "GET" && req.method !== "POST") return dbx.send(res, 405, { ok: false });
  const db = await dbx.load();
  const broadcast = await welcome.notifyUsersOfUpdate(db);
  const flushed = await outbox.flushOutbox(db);
  await dbx.save(db);
  return dbx.send(res, 200, {
    ok: true,
    version: sms.APP_VERSION,
    broadcast,
    sent: !!(flushed && flushed.sent),
    skipped: !!broadcast.skipped,
    outbox: flushed,
  });
};
