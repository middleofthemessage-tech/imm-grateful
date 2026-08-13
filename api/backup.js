const dbx = require("./_db");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return dbx.send(res, 204, {});
  const body = ["POST", "PUT"].includes(req.method) ? await dbx.readBody(req) : {};
  req.body = body;
  const { db, user } = await dbx.requireUser(req);
  if (!user) return dbx.send(res, 401, { ok: false, error: "Sign in required" });

  const action = body.action || (req.method === "GET" ? "me" : "put");

  if (action === "me" || (req.method === "GET" && !user.developer)) {
    const vault = db.vaults[user.id] || null;
    return dbx.send(res, 200, {
      ok: true,
      backup: {
        name: "imm-person",
        accountId: user.id,
        user: dbx.publicUser(user),
        vault,
        exportedAt: new Date().toISOString(),
      },
    });
  }

  if (action === "put") {
    const vault = dbx.sanitizeVault(body);
    db.vaults[user.id] = vault;
    if (vault.household) db.households[user.role === "limb" ? (user.householdId || user.id) : user.id] = vault.household;
    user.lastSeen = vault.updatedAt;
    await dbx.save(db);
    return dbx.send(res, 200, { ok: true, updatedAt: vault.updatedAt, db: dbx.stats(db) });
  }

  if (action === "stats") {
    return dbx.send(res, 200, { ok: true, db: dbx.stats(db) });
  }

  if (action === "export" || (req.method === "GET" && user.developer)) {
    if (!user.developer) return dbx.send(res, 403, { ok: false, error: "Developer only" });
    return dbx.send(res, 200, { ok: true, backup: dbx.exportSafe(db), db: dbx.stats(db) });
  }

  return dbx.send(res, 405, { ok: false });
};
