const dbx = require("./_db");
const sms = require("./_sms");
const welcome = require("./_welcome");

function inviteCodeOf(value) {
  return String(value || "").trim().toUpperCase();
}

function addLimbToVillage(vault, limb) {
  if (!vault.profile) vault.profile = {};
  if (!Array.isArray(vault.profile.village)) vault.profile.village = [];
  const village = vault.profile.village;
  const email = String((limb && limb.email) || "").toLowerCase();
  const phone = dbx.digits(limb && limb.phone);
  let existing = village.find((m) =>
    (email && m.email && String(m.email).toLowerCase() === email) ||
    (phone && m.phone && dbx.digits(m.phone) === phone) ||
    (limb && limb.id && m.accountId === limb.id)
  );
  const row = existing || {};
  row.id = row.id || "l_" + Date.now().toString(36);
  row.name = (limb && limb.firstName) || row.name || "Limb";
  row.relation = row.relation || "Limb";
  row.email = (limb && limb.email) || row.email || "";
  row.phone = (limb && limb.phone) || row.phone || "";
  row.active = true;
  row.joined = true;
  row.accountId = (limb && limb.id) || row.accountId;
  row.createdAt = row.createdAt || new Date().toISOString();
  if (!existing) village.push(row);
  vault.updatedAt = new Date().toISOString();
  return vault;
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return dbx.send(res, 204, {});
  const body = req.method === "GET" ? {} : await dbx.readBody(req);
  req.body = body;

  if (req.method === "GET") {
    const { user } = await dbx.requireUser(req);
    if (!user) return dbx.send(res, 401, { ok: false, error: "Sign in required" });
    return dbx.send(res, 200, { ok: true, user: dbx.publicUser(user), store: dbx.kind() });
  }

  if (req.method !== "POST") return dbx.send(res, 405, { ok: false });

  const action = body.action || "signin";
  const db = await dbx.load();

  if (action === "signup") {
    const email = String(body.email || "").trim().toLowerCase();
    const phone = dbx.digits(body.phone);
    const password = String(body.password || "");
    const firstName = String(body.firstName || "").trim();
    if (!email || !phone || password.length < 8 || !firstName) {
      return dbx.send(res, 400, { ok: false, error: "Name, email, phone, and password are required." });
    }
    const existing = dbx.findUser(db, { email, phone });
    if (existing) {
      if (!dbx.checkPass(password, existing)) {
        return dbx.send(res, 409, { ok: false, error: "An account already exists with that email or phone." });
      }
      existing.lastSeen = new Date().toISOString();
      if (dbx.isDevPhone(existing.phone)) existing.developer = true;
      const token = dbx.newToken();
      db.sessions.push({ token, accountId: existing.id, exp: Date.now() + 30 * 86400000 });
      await dbx.save(db);
      return dbx.send(res, 200, { ok: true, token, user: dbx.publicUser(existing), resumed: true, store: dbx.kind() });
    }
    const { hash, salt } = dbx.hashPass(password);
    const user = {
      id: body.id || "u_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      role: body.role === "limb" ? "limb" : "parent",
      firstName,
      lastName: String(body.lastName || "").trim(),
      email,
      phone,
      passwordHash: hash,
      salt,
      developer: dbx.isDevPhone(phone),
      householdId: body.householdId || null,
      inviteCode: inviteCodeOf(body.inviteCode) || null,
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };
    db.users.push(user);
    if (user.role === "parent" && user.inviteCode) {
      db.invites[user.inviteCode] = {
        parentId: user.id,
        household: body.household || null,
        updatedAt: user.createdAt,
      };
    }
    const token = dbx.newToken();
    db.sessions.push({ token, accountId: user.id, exp: Date.now() + 30 * 86400000 });
    const welcomed = await welcome.sendWelcomeAccount(user, db);
    if (user.developer) {
      await sms.notifyOwner(
        db,
        "Your owner account is ready. Sign in at https://imm-grateful.vercel.app/ with this phone. Open the Dev tab at the bottom.",
        "owner-ready"
      );
    } else {
      const who = user.firstName || "Someone";
      const kind = user.role === "limb" ? "Limb" : "parent";
      await sms.notifyOwner(db, who + " just started using the app as a " + kind + ".");
    }
    await dbx.save(db);
    return dbx.send(res, 200, {
      ok: true,
      token,
      user: dbx.publicUser(user),
      store: dbx.kind(),
      welcomed: !!welcomed.ok,
      welcome: welcomed,
    });
  }

  if (action === "signin") {
    const contact = String(body.contact || body.email || body.phone || "").trim();
    const password = String(body.password || "");
    const user = dbx.findUser(db, {
      email: contact.includes("@") ? contact : "",
      phone: contact.includes("@") ? "" : contact,
    });
    if (!user || !dbx.checkPass(password, user)) {
      return dbx.send(res, 401, { ok: false, error: "No account or incorrect password." });
    }
    user.lastSeen = new Date().toISOString();
    if (dbx.isDevPhone(user.phone)) user.developer = true;
    const token = dbx.newToken();
    db.sessions.push({ token, accountId: user.id, exp: Date.now() + 30 * 86400000 });
    db.sessions = db.sessions.filter((s) => s.exp > Date.now()).slice(-200);
    await dbx.save(db);
    return dbx.send(res, 200, { ok: true, token, user: dbx.publicUser(user), store: dbx.kind() });
  }

  if (action === "invite-lookup") {
    const code = inviteCodeOf(body.code);
    const inv = code && db.invites ? db.invites[code] : null;
    if (!inv) return dbx.send(res, 404, { ok: false, error: "That invite code is not valid." });
    const parent = db.users.find((u) => u.id === inv.parentId) || null;
    const household = db.households[inv.parentId] || inv.household || null;
    return dbx.send(res, 200, {
      ok: true,
      parentId: inv.parentId,
      parentName: parent ? parent.firstName : "Parent",
      household: household ? {
        trackingEnabled: household.trackingEnabled,
        limbUpdateMode: household.limbUpdateMode,
        accountabilityFee: !!household.accountabilityFee,
      } : null,
    });
  }

  if (action === "invite-register") {
    const { user } = await dbx.requireUser(req);
    if (!user || user.role === "limb") return dbx.send(res, 403, { ok: false, error: "Parent sign-in required" });
    const code = inviteCodeOf(body.code);
    if (!code) return dbx.send(res, 400, { ok: false, error: "Invite code required" });
    user.inviteCode = code;
    db.invites[code] = {
      parentId: user.id,
      household: body.household || db.households[user.id] || null,
      updatedAt: new Date().toISOString(),
    };
    if (body.household) db.households[user.id] = body.household;
    await dbx.save(db);
    return dbx.send(res, 200, { ok: true });
  }

  if (action === "limb-join") {
    const { user } = await dbx.requireUser(req);
    if (!user) return dbx.send(res, 401, { ok: false, error: "Sign in required" });
    const code = inviteCodeOf(body.inviteCode);
    const inv = code && db.invites ? db.invites[code] : null;
    if (!inv) return dbx.send(res, 404, { ok: false, error: "That invite code is not valid." });
    user.householdId = inv.parentId;
    user.inviteCode = code;
    const vault = db.vaults[inv.parentId] || { profile: { village: [] }, appData: null, household: inv.household, inbox: [] };
    db.vaults[inv.parentId] = addLimbToVillage(vault, {
      id: user.id,
      firstName: user.firstName,
      email: user.email,
      phone: user.phone,
    });
    await dbx.save(db);
    return dbx.send(res, 200, { ok: true, parentId: inv.parentId, household: db.households[inv.parentId] || inv.household || null });
  }

  return dbx.send(res, 400, { ok: false, error: "Unknown action" });
};
