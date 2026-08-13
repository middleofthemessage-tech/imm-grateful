const dbx = require("./_db");

function homeId(user) {
  if (!user) return null;
  return user.householdId || (user.role === "limb" ? null : user.id);
}

function mergeShared(existing, incoming) {
  if (!incoming || typeof incoming !== "object") return existing || null;
  if (!existing) return incoming;
  const incEmpty = !(incoming.logs && incoming.logs.length) && !(incoming.appointments && incoming.appointments.length) && !(incoming.careReminders && incoming.careReminders.length);
  const exHas = (existing.logs && existing.logs.length) || (existing.appointments && existing.appointments.length) || (existing.careReminders && existing.careReminders.length);
  if (incEmpty && exHas) return existing;
  if (!existing.updatedAt) return incoming;
  if (!incoming.updatedAt) return existing;
  return String(incoming.updatedAt) >= String(existing.updatedAt) ? incoming : existing;
}

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
  const hid = homeId(user);
  const targetId = String(body.accountId || qid || user.id);
  const sameHome = hid && db.users.some((u) => u.id === targetId && (u.householdId || u.id) === hid);
  const allowed = targetId === user.id || user.developer || sameHome;
  if (!allowed) return dbx.send(res, 403, { ok: false, error: "Not allowed" });

  if (req.method === "GET" || (req.method === "POST" && (body.action === "get" || !body.action))) {
    const vault = db.vaults[targetId] || db.vaults[hid] || null;
    const target = db.users.find((u) => u.id === targetId) || null;
    const household = (hid && db.households[hid]) || null;
    return dbx.send(res, 200, {
      ok: true,
      vault,
      household,
      shared: household && household.shared ? household.shared : null,
      user: dbx.publicUser(target),
    });
  }

  if (req.method === "PUT" || (req.method === "POST" && body.action === "put")) {
    if (targetId !== user.id && !user.developer && !sameHome) return dbx.send(res, 403, { ok: false });
    const vault = dbx.sanitizeVault(body);
    db.vaults[targetId] = vault;
    const u = db.users.find((x) => x.id === targetId) || user;
    if (u) {
      u.lastSeen = vault.updatedAt;
      if (!u.householdId && u.role !== "limb") u.householdId = u.id;
      const code = String((vault.profile && vault.profile.inviteCode) || body.inviteCode || u.inviteCode || "").trim().toUpperCase();
      const key = u.householdId || u.id;
      if (code && u.role !== "limb") {
        u.inviteCode = code;
        db.invites[code] = {
          parentId: key,
          household: vault.household || db.households[key] || null,
          updatedAt: vault.updatedAt,
        };
      }
    }
    const key = hid || (u && (u.householdId || u.id));
    if (key) {
      const prev = db.households[key] || {};
      const next = Object.assign({}, prev, vault.household || {});
      const incomingShared = (vault.household && vault.household.shared) || body.shared || null;
      if (incomingShared) next.shared = mergeShared(prev.shared, incomingShared);
      if (!Array.isArray(next.members)) next.members = prev.members || [];
      db.households[key] = next;
    }
    await dbx.save(db);
    return dbx.send(res, 200, {
      ok: true,
      updatedAt: vault.updatedAt,
      shared: key && db.households[key] ? db.households[key].shared : null,
    });
  }

  return dbx.send(res, 405, { ok: false });
};
