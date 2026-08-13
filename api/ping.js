const dbx = require("./_db");
const sms = require("./_sms");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return dbx.send(res, 204, {});
  if (req.method !== "GET" && req.method !== "POST") return dbx.send(res, 405, { ok: false });
  const db = await dbx.load();
  const result = await sms.notifyOwnerUpdate(db);
  await dbx.save(db);
  return dbx.send(res, 200, {
    ok: true,
    version: sms.APP_VERSION,
    sent: !!result.sent,
    skipped: !!result.skipped,
    via: result.via || null,
    error: result.error || null,
  });
};
