const dbx = require("./_db");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return dbx.send(res, 204, {});
  const body = req.method === "POST" ? await dbx.readBody(req) : {};
  req.body = body;
  const db = await dbx.load();

  if (req.method === "POST") {
    const ev = {
      id: "ev_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      type: String(body.type || "event").slice(0, 40),
      at: new Date().toISOString(),
      accountId: body.accountId || null,
      role: body.role || null,
      label: String(body.label || "").slice(0, 80),
      meta: {},
    };
    db.events.unshift(ev);
    db.events = db.events.slice(0, 500);
    const u = ev.accountId ? db.users.find((x) => x.id === ev.accountId) : null;
    if (u) u.lastSeen = ev.at;
    await dbx.save(db);
    return dbx.send(res, 200, { ok: true, id: ev.id });
  }

  if (req.method === "GET") {
    const { user } = await dbx.requireUser(req);
    if (!user || !user.developer) return dbx.send(res, 403, { ok: false, error: "Developer only" });
    const users = db.users.map(dbx.publicUser);
    const events = db.events.slice(0, 80);
    const today = new Date().toISOString().slice(0, 10);
    const counts = {
      users: users.length,
      parents: users.filter((u) => u.role === "parent").length,
      limbs: users.filter((u) => u.role === "limb").length,
      signupsToday: users.filter((u) => (u.createdAt || "").slice(0, 10) === today).length,
      eventsToday: db.events.filter((e) => (e.at || "").slice(0, 10) === today).length,
      logins: db.events.filter((e) => e.type === "login").length,
      tracks: db.events.filter((e) => e.type === "track").length,
      clockins: db.events.filter((e) => e.type === "clockin").length,
    };
    return dbx.send(res, 200, {
      ok: true,
      counts,
      users,
      events,
      store: dbx.kind(),
      at: Date.now(),
    });
  }

  return dbx.send(res, 405, { ok: false });
};
