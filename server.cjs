// =========================
//  SERVER FOR RESTAURANT APP
//  Node.js + Express + better-sqlite3
// =========================

const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();

// === DB PATH (Railway uses /mnt/data) ===
const dbPath =
  process.env.SQLITE_PATH || path.join(__dirname, "stats.sqlite");

const db = new Database(dbPath);

// ======================================
//          INIT TABLES
// ======================================

db.exec(`
CREATE TABLE IF NOT EXISTS daily_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT UNIQUE,
  revenue REAL,
  guests INTEGER,
  checks INTEGER
);

CREATE TABLE IF NOT EXISTS waiters_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  waiter TEXT,
  revenue REAL,
  guests INTEGER,
  checks INTEGER,
  dishes INTEGER
);

CREATE TABLE IF NOT EXISTS plan_stats (
  year INTEGER,
  month INTEGER,
  plan_value REAL,
  UNIQUE(year, month)
);
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


// =======================================================
//                  ADD DAILY STATS
// =======================================================

app.post("/api/add-day", (req, res) => {
  const { date, revenue, guests, checks } = req.body;

  try {
    db.prepare(`
      INSERT OR REPLACE INTO daily_stats (date, revenue, guests, checks)
      VALUES (?, ?, ?, ?)
    `).run(date, revenue, guests, checks);

    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});


// =======================================================
//                  ADD WAITER STATS
// =======================================================

app.post("/api/add-waiter", (req, res) => {
  const { date, waiter, revenue, guests, checks, dishes } = req.body;

  try {
    db.prepare(`
      INSERT INTO waiters_stats (date, waiter, revenue, guests, checks, dishes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(date, waiter, revenue, guests, checks, dishes);

    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});


// =======================================================
//                SAVE MONTH PLAN
// =======================================================

app.post("/api/save-plan", (req, res) => {
  const { year, month, plan } = req.body;

  try {
    db.prepare(`
      INSERT OR REPLACE INTO plan_stats (year, month, plan_value)
      VALUES (?, ?, ?)
    `).run(year, month, plan);

    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});


// =======================================================
//                GET PLAN FOR MONTH
// =======================================================

app.get("/api/plan", (req, res) => {
  const { year, month } = req.query;

  const row = db.prepare(`
    SELECT plan_value FROM plan_stats WHERE year = ? AND month = ?
  `).get(year, month);

  res.json({ plan: row ? row.plan_value : null });
});


// =======================================================
//                REPORT: DAILY STATS (MONTH)
// =======================================================

app.get("/api/month-stats", (req, res) => {
  const { year, month } = req.query;

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  const rows = db.prepare(`
    SELECT * FROM daily_stats
    WHERE date LIKE ?
    ORDER BY date
  `).all(`${monthStr}%`);

  res.json(rows);
});


// =======================================================
//           REPORT: WAITER METRICS (WEEK / MONTH)
// =======================================================

function getDateRange(period, year, month) {
  const now = new Date();
  const y = Number(year);
  const m = Number(month) - 1;

  if (period === "month") {
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 1);
    return { start, end };
  }

  if (period === "week") {
    const today = new Date();
    const first = new Date(today.setDate(today.getDate() - today.getDay() + 1));
    const last = new Date(today.setDate(first.getDate() + 6));
    return { start: first, end: last };
  }

  return null;
}


// API: waiter stats
app.get("/api/waiters", (req, res) => {
  const { year, month, period } = req.query;

  const range = getDateRange(period, year, month);
  if (!range) {
    return res.json({ error: "Invalid period" });
  }

  const startStr = range.start.toISOString().slice(0, 10);
  const endStr = range.end.toISOString().slice(0, 10);

  const rows = db.prepare(`
    SELECT waiter,
           SUM(revenue) AS total_revenue,
           SUM(guests) AS total_guests,
           SUM(checks) AS total_checks,
           SUM(dishes) AS total_dishes
    FROM waiters_stats
    WHERE date >= ? AND date <= ?
    GROUP BY waiter
  `).all(startStr, endStr);

  // calculate metrics
  rows.forEach(r => {
    r.average_check = r.total_checks ? (r.total_revenue / r.total_checks) : 0;
    r.fill = r.total_checks ? (r.total_dishes / r.total_checks) : 0;
  });

  res.json(rows);
});


// =======================================================
//                START SERVER
// =======================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server started on port", PORT);
});
