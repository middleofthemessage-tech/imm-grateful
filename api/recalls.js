// Live baby/child recalls from official U.S. government sources.
// Used by Vercel at /api/recalls so the browser is not blocked by CORS.

const CPSC_API = "https://www.saferproducts.gov/RestWebServices/Recall";
const CPSC_RSS = "https://www.cpsc.gov/Newsroom/CPSC-RSS-Feed/Recalls-RSS";
const FDA_FOOD = "https://api.fda.gov/food/enforcement.json";
const FDA_DEVICE = "https://api.fda.gov/device/enforcement.json";

const BABY_RE = /infant|baby|toddler|child|crib|stroller|bassinet|pacifier|teething|high.?chair|car\s*seat|walker|play.?yard|nursery|kids?|children|formula|bottle|sippy|pacifier/i;

function classifyHazard(text) {
  const t = (text || "").toLowerCase();
  if (/drown|pool|bath seat|bathtub/.test(t)) return { hazard: "drowning", hazardLabel: "Drowning Risk", category: "bath" };
  if (/suffocat|asphyx|crib bumper|inclined sleep|lounger|sleep positioner|nursing pillow/.test(t)) return { hazard: "suffocation", hazardLabel: "Suffocation Risk", category: "sleep" };
  if (/chok|magnet ingest|small part|teething/.test(t)) return { hazard: "choking", hazardLabel: "Choking Hazard", category: "toys" };
  if (/entrap/.test(t)) return { hazard: "entrapment", hazardLabel: "Entrapment", category: "gear" };
  if (/fall|walker|stair|tip.?over/.test(t)) return { hazard: "fall", hazardLabel: "Fall Hazard", category: "gear" };
  if (/formula|feed|bottle/.test(t)) return { hazard: "other", hazardLabel: "Feeding Safety", category: "feeding" };
  if (/burn|flamm|sleepwear|pajama/.test(t)) return { hazard: "other", hazardLabel: "Burn Hazard", category: "gear" };
  if (/battery|coin cell|button cell|reese/.test(t)) return { hazard: "other", hazardLabel: "Battery Ingestion", category: "toys" };
  return { hazard: "other", hazardLabel: "Injury Risk", category: "gear" };
}

function dateLabel(dateRaw) {
  try {
    if (!dateRaw) return "Recent";
    const d = new Date(dateRaw.length === 8 ? dateRaw.slice(0, 4) + "-" + dateRaw.slice(4, 6) + "-" + dateRaw.slice(6, 8) + "T12:00:00" : dateRaw + "T12:00:00");
    if (isNaN(d.getTime())) return dateRaw;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch (e) {
    return dateRaw || "Recent";
  }
}

function mapCpsc(item) {
  const title = item.Title || item.RecallTitle || "Product recall";
  const desc = item.Description || item.RecallDescription || title;
  const products = (item.Products || []).map((p) => p.Name || p.Description).filter(Boolean);
  const product = products[0] || title.split(" Recalled")[0].split(" Due to")[0].slice(0, 80);
  const hazards = (item.Hazards || []).map((h) => h.Name || "").join(" ");
  const classified = classifyHazard(title + " " + desc + " " + hazards);
  const dateRaw = (item.RecallDate || item.AnnouncementDate || "").toString().slice(0, 10);
  const remedies = (item.Remedies || []).map((r) => r.Name || r.Description).filter(Boolean).join("; ");
  const manufacturers = (item.Manufacturers || []).map((m) => m.Name).filter(Boolean).join(", ");
  const blob = title + " " + desc;
  return {
    id: "cpsc-" + (item.RecallID || item.RecallNumber || title).toString(),
    source: "CPSC",
    sourceUrl: item.URL || item.RecallURL || "https://www.cpsc.gov/Recalls",
    product,
    title,
    hazard: classified.hazard,
    hazardLabel: classified.hazardLabel,
    category: classified.category,
    urgent: /death|serious injury|stop using|immediately|drown|suffocat|entrap|walker|magnet|coin battery|button cell|crib bumper/i.test(blob),
    date: dateRaw || "1970-01-01",
    dateLabel: dateLabel(dateRaw),
    location: manufacturers || "See CPSC notice",
    units: item.Units || item.NumberOfUnits || "See notice",
    description: desc,
    remedy: remedies || "Stop use if hazardous. Follow the official CPSC recall notice for remedy.",
    soldAt: manufacturers || "See notice",
  };
}

function mapFda(item, kind) {
  const desc = item.product_description || item.reason_for_recall || "FDA recall";
  const title = (item.product_description || "FDA product recall").split("\n")[0].slice(0, 120);
  const classified = classifyHazard(desc + " " + (item.reason_for_recall || ""));
  const raw = (item.report_date || item.recall_initiation_date || "").toString();
  const iso = raw.length === 8 ? raw.slice(0, 4) + "-" + raw.slice(4, 6) + "-" + raw.slice(6, 8) : raw.slice(0, 10);
  return {
    id: "fda-" + (item.recall_number || title),
    source: "FDA",
    sourceUrl: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts",
    product: title,
    title: title,
    hazard: classified.hazard,
    hazardLabel: item.classification || classified.hazardLabel,
    category: classified.category === "gear" ? "feeding" : classified.category,
    urgent: /class i/i.test(item.classification || "") || /death|infant|botulism|cronobacter|salmonella/i.test(desc),
    date: iso || "1970-01-01",
    dateLabel: dateLabel(iso),
    location: [item.city, item.state].filter(Boolean).join(", ") || item.recalling_firm || "See FDA notice",
    units: item.product_quantity || "See notice",
    description: item.reason_for_recall || desc,
    remedy: "Do not use. Follow the official FDA recall notice. " + (item.recalling_firm ? "Firm: " + item.recalling_firm + "." : ""),
    soldAt: item.recalling_firm || "See notice",
    kind: kind || "food",
  };
}

function isBabyBlob(text) {
  return BABY_RE.test(text || "");
}

function isBabyCpsc(item) {
  const blob = [
    item.Title, item.Description, item.RecallDescription,
    ...(item.Products || []).map((p) => p.Name || p.Description || ""),
    ...(item.Hazards || []).map((h) => h.Name || ""),
  ].join(" ");
  return isBabyBlob(blob);
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(url + " " + res.status);
  return res.json();
}

async function getText(url) {
  const res = await fetch(url, { headers: { Accept: "application/rss+xml, application/xml, text/xml, */*" } });
  if (!res.ok) throw new Error(url + " " + res.status);
  return res.text();
}

function parseRss(xml) {
  const items = [];
  const blocks = xml.split(/<item>/i).slice(1);
  blocks.forEach((block) => {
    const title = (block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1] || "";
    const link = (block.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || "https://www.cpsc.gov/Recalls";
    const desc = (block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i) || [])[1] || title;
    const pub = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || "";
    const clean = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/\s+/g, " ").trim();
    const t = clean(title);
    const d = clean(desc);
    if (!isBabyBlob(t + " " + d)) return;
    const dt = pub ? new Date(pub) : new Date();
    const iso = isNaN(dt.getTime()) ? new Date().toISOString().slice(0, 10) : dt.toISOString().slice(0, 10);
    const classified = classifyHazard(t + " " + d);
    items.push({
      id: "rss-" + t.slice(0, 48),
      source: "CPSC",
      sourceUrl: clean(link) || "https://www.cpsc.gov/Recalls",
      product: t.split(" Recalled")[0].slice(0, 80),
      title: t,
      hazard: classified.hazard,
      hazardLabel: classified.hazardLabel,
      category: classified.category,
      urgent: /death|serious injury|stop using|immediately/i.test(t + " " + d),
      date: iso,
      dateLabel: dateLabel(iso),
      location: "See CPSC notice",
      units: "See notice",
      description: d,
      remedy: "Follow the official CPSC recall notice.",
      soldAt: "See notice",
    });
  });
  return items;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const start = new Date();
  start.setMonth(start.getMonth() - 24);
  const dateStart = start.toISOString().slice(0, 10);
  const byId = new Map();
  const sources = [];

  const cpscQueries = [
    `${CPSC_API}?format=json&RecallDateStart=${dateStart}&RecallTitle=infant`,
    `${CPSC_API}?format=json&RecallDateStart=${dateStart}&RecallTitle=baby`,
    `${CPSC_API}?format=json&RecallDateStart=${dateStart}&ProductName=Toddler`,
    `${CPSC_API}?format=json&RecallDateStart=${dateStart}&RecallTitle=Child`,
    `${CPSC_API}?format=json&RecallDateStart=${dateStart}&ProductName=Crib`,
    `${CPSC_API}?format=json&RecallDateStart=${dateStart}&ProductName=Stroller`,
    `${CPSC_API}?format=json&RecallDateStart=${dateStart}&ProductName=Walker`,
  ];

  await Promise.all(
    cpscQueries.map(async (url) => {
      try {
        const data = await getJson(url);
        const arr = Array.isArray(data) ? data : [];
        if (arr.length) sources.push("CPSC SaferProducts");
        arr.forEach((item) => {
          if (!isBabyCpsc(item)) return;
          const mapped = mapCpsc(item);
          if (!byId.has(mapped.id)) byId.set(mapped.id, mapped);
        });
      } catch (e) {}
    })
  );

  const fdaSearch = encodeURIComponent('product_description:(infant OR baby OR toddler OR child OR formula OR crib)');
  await Promise.all(
    [
      `${FDA_FOOD}?search=${fdaSearch}&limit=40&sort=report_date:desc`,
      `${FDA_DEVICE}?search=${fdaSearch}&limit=20&sort=report_date:desc`,
    ].map(async (url) => {
      try {
        const data = await getJson(url);
        const arr = (data && data.results) || [];
        if (arr.length) sources.push(url.includes("device") ? "FDA devices" : "FDA food");
        arr.forEach((item) => {
          const blob = (item.product_description || "") + " " + (item.reason_for_recall || "");
          if (!isBabyBlob(blob)) return;
          const mapped = mapFda(item, url.includes("device") ? "device" : "food");
          if (!byId.has(mapped.id)) byId.set(mapped.id, mapped);
        });
      } catch (e) {}
    })
  );

  try {
    const xml = await getText(CPSC_RSS);
    const rssItems = parseRss(xml);
    if (rssItems.length) sources.push("CPSC Recalls RSS");
    rssItems.forEach((item) => {
      if (!byId.has(item.id)) byId.set(item.id, item);
    });
  } catch (e) {}

  const items = Array.from(byId.values()).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 50);

  res.status(200).json({
    live: items.length > 0,
    at: Date.now(),
    count: items.length,
    sources: Array.from(new Set(sources)),
    items,
    links: {
      cpsc: "https://www.cpsc.gov/Recalls",
      saferproducts: "https://www.saferproducts.gov/",
      fda: "https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts",
    },
  });
};
