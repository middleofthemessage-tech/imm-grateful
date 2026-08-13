const dbx = require("./_db");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return dbx.send(res, 204, {});
  const body = ["POST", "PUT"].includes(req.method) ? await dbx.readBody(req) : {};
  req.body = body;
  const { db, user } = await dbx.requireUser(req);
  if (!user) return dbx.send(res, 401, { ok: false, error: "Sign in required" });

  let qid = "";
  try {
    const host = (req.headers && (req.headers.host || req.headers.Host)) || "localhost";
    qid = new URL(req.url || "/", "http://" + host).searchParams.get("accountId") || "";
  } catch (e) {}
  const targetId = String(body.accountId || qid || user.id);
  const allowed = targetId === user.id || user.developer;
  if (!allowed) return dbx.send(res, 403, { ok: false, error: "Not allowed" });

  if (req.method === "GET" || (req.method === "POST" && (body.action === "get" || !body.action))) {
    const vault = db.vaults[targetId] || null;
    const target = db.users.find((u) => u.id === targetId) || null;
    return dbx.send(res, 200, { ok: true, vault, user: dbx.publicUser(target) });
  }

  if (req.method === "PUT" || (req.method === "POST" && body.action === "put")) {
    if (targetId !== user.id && !user.developer) return dbx.send(res, 403, { ok: false });
    const vault = dbx.sanitizeVault(body);
    db.vaults[targetId] = vault;
    const u = db.users.find((x) => x.id === targetId);
    if (u) {
      u.lastSeen = vault.updatedAt;
      const code = String((vault.profile && vault.profile.inviteCode) || body.inviteCode || u.inviteCode || "").trim().toUpperCase();
      if (code && u.role !== "limb") {
        u.inviteCode = code;
        db.invites[code] = {
          parentId: u.id,
          household: vault.household || db.households[u.id] || null,
          updatedAt: vault.updatedAt,
        };
      }
    }
    if (vault.household) db.households[targetId] = vault.household;
    await dbx.save(db);
    return dbx.send(res, 200, { ok: true, updatedAt: vault.updatedAt });
  }

  return dbx.send(res, 405, { ok: false });
};
