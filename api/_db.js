const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEV_PHONES = ["7703168593"];
const STORE_KEY = "imm-grateful-db";
const FILE = process.env.VERCEL
  ? "/tmp/imm-grateful-db.json"
  : path.join(__dirname, "..", "data", "store.json");

let mem = null;
let storeKind = "file";

function emptyDb() {
  return {
    name: "imm-db",
    schemaVersion: 2,
    users: [],
    sessions: [],
    vaults: {},
    events: [],
    invites: {},
    households: {},
    logins: [],
    backups: [],
    meta: { alerts: {}, smsLog: [], outbox: [], createdAt: new Date().toISOString() },
  };
}

function rotateBackups(db) {
  const today = new Date().toISOString().slice(0, 10);
  if (!Array.isArray(db.backups)) db.backups = [];
  const already = db.backups.find((b) => (b.at || "").slice(0, 10) === today);
  const snap = {
    id: "bk_" + today,
    at: new Date().toISOString(),
    users: (db.users || []).length,
    vaults: Object.keys(db.vaults || {}).length,
    households: Object.keys(db.households || {}).length,
    events: (db.events || []).length,
  };
  if (already) Object.assign(already, snap);
  else db.backups.unshift(snap);
  db.backups = db.backups.slice(0, 14);
}

function recordLogin(db, user, source) {
  if (!user) return;
  if (!Array.isArray(db.logins)) db.logins = [];
  db.logins.unshift({
    id: "lg_" + Date.now().toString(36),
    accountId: user.id,
    role: user.role,
    at: new Date().toISOString(),
    source: source || "signin",
  });
  db.logins = db.logins.slice(0, 200);
}

function redisCreds() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

function kind() {
  return redisCreds() ? "upstash" : process.env.VERCEL ? "ephemeral" : "file";
}

async function remoteGet() {
  const creds = redisCreds();
  if (!creds) return null;
  storeKind = "upstash";
  const r = await fetch(creds.url + "/get/" + STORE_KEY, {
    headers: { Authorization: "Bearer " + creds.token },
  });
  const data = await r.json().catch(() => ({}));
  if (data == null || data.result == null) return null;
  if (typeof data.result === "string") {
    try { return JSON.parse(data.result); } catch (e) { return null; }
  }
  return typeof data.result === "object" ? data.result : null;
}

async function remoteSet(db) {
  const creds = redisCreds();
  if (!creds) return false;
  storeKind = "upstash";
  const r = await fetch(creds.url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + creds.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["SET", STORE_KEY, JSON.stringify(db)]),
  });
  return r.ok;
}

function fileLoad() {
  try {
    if (fs.existsSync(FILE)) return Object.assign(emptyDb(), JSON.parse(fs.readFileSync(FILE, "utf8")));
  } catch (e) {}
  return emptyDb();
}

function fileSave(db) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(db));
    return true;
  } catch (e) {
    return false;
  }
}

async function load() {
  if (mem) return mem;
  try {
    const remote = await remoteGet();
    if (remote) {
      mem = Object.assign(emptyDb(), remote);
      return mem;
    }
  } catch (e) {}
  storeKind = kind();
  mem = fileLoad();
  return mem;
}

async function save(db) {
  mem = db;
  try { rotateBackups(db); } catch (e) {}
  try { await remoteSet(db); } catch (e) {}
  fileSave(db);
}

function stats(db) {
  db = db || emptyDb();
  return {
    name: "imm-db",
    schemaVersion: db.schemaVersion || 2,
    store: kind(),
    users: (db.users || []).length,
    sessions: (db.sessions || []).filter((s) => s.exp > Date.now()).length,
    vaults: Object.keys(db.vaults || {}).length,
    households: Object.keys(db.households || {}).length,
    events: (db.events || []).length,
    backups: (db.backups || []).slice(0, 7),
    lastBackup: (db.backups && db.backups[0] && db.backups[0].at) || null,
    lastLogin: (db.logins && db.logins[0] && db.logins[0].at) || null,
  };
}

function exportSafe(db) {
  return {
    name: "imm-db",
    schemaVersion: db.schemaVersion || 2,
    exportedAt: new Date().toISOString(),
    users: (db.users || []).map(publicUser),
    vaults: db.vaults || {},
    households: db.households || {},
    invites: db.invites || {},
    events: (db.events || []).slice(0, 200),
    logins: (db.logins || []).slice(0, 80),
    backups: db.backups || [],
    meta: { alerts: (db.meta && db.meta.alerts) || {}, notifiedVersion: db.meta && db.meta.notifiedVersion },
  };
}

function digits(phone) {
  return String(phone || "").replace(/\D/g, "").slice(-10);
}

function isDevPhone(phone) {
  return DEV_PHONES.includes(digits(phone));
}

function hashPass(password, salt) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 32).toString("hex");
  return { hash, salt };
}

function checkPass(password, user) {
  if (!user || !user.passwordHash || !user.salt) return false;
  const { hash } = hashPass(password, user.salt);
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.passwordHash, "hex"));
  } catch (e) {
    return hash === user.passwordHash;
  }
}

function newToken() {
  return crypto.randomBytes(24).toString("hex");
}

function findUser(db, { id, email, phone }) {
  const e = email ? String(email).trim().toLowerCase() : "";
  const p = phone ? digits(phone) : "";
  return db.users.find((u) => (id && u.id === id) || (e && u.email === e) || (p && u.phone === p)) || null;
}

function getSession(db, token) {
  if (!token) return null;
  const s = db.sessions.find((x) => x.token === token);
  if (!s || s.exp < Date.now()) return null;
  return s;
}

async function requireUser(req) {
  const db = await load();
  const auth = String((req.headers && (req.headers.authorization || req.headers.Authorization)) || "");
  const token = auth.replace(/^Bearer\s+/i, "") || (req.body && req.body.token) || "";
  const sess = getSession(db, token);
  if (!sess) return { db, user: null, sess: null };
  const user = db.users.find((u) => u.id === sess.accountId) || null;
  if (user && isDevPhone(user.phone)) user.developer = true;
  return { db, user, sess };
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    role: u.role,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    phone: u.phone,
    phoneLast4: (u.phone || "").slice(-4),
    developer: !!u.developer || isDevPhone(u.phone),
    householdId: u.householdId || null,
    createdAt: u.createdAt,
    lastSeen: u.lastSeen,
  };
}

function readBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === "string") {
    try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve({}); }
  }
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch (e) { resolve({}); }
    });
  });
}

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.end(JSON.stringify(body));
}

function sanitizeVault(input) {
  const src = input && typeof input === "object" ? input : {};
  const profile = src.profile && typeof src.profile === "object" ? Object.assign({}, src.profile) : null;
  if (profile) {
    delete profile.passwordHash;
    delete profile.password;
    delete profile.salt;
  }
  return {
    updatedAt: new Date().toISOString(),
    profile,
    appData: src.appData && typeof src.appData === "object" ? src.appData : null,
    household: src.household && typeof src.household === "object" ? src.household : null,
    inbox: Array.isArray(src.inbox) ? src.inbox : null,
  };
}

module.exports = {
  DEV_PHONES, load, save, emptyDb, digits, isDevPhone, hashPass, checkPass,
  newToken, findUser, getSession, requireUser, publicUser, readBody, send,
  kind, sanitizeVault, stats, exportSafe, recordLogin, rotateBackups,
};
