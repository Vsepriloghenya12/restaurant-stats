const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();

const dbPath = process.env.SQLITE_PATH || path.join(__dirname, "stats.sqlite");
const db = new Database(dbPath);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ======================================
// БАЗА: таблицы
// ======================================

db.exec(`
CREATE TABLE IF NOT EXISTS daily_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT UNIQUE,
  revenue REAL,
  guests INTEGER,
  checks INTEGER
);

CREATE TABLE IF NOT EXISTS waiters_list (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE
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


// ======================================
// API: Данные дня
// ======================================

app.post("/api/add-day", (req, res) => {
  const { date, revenue, guests, checks } = req.body;

  try {
    db.prepare(`
      INSERT INTO daily_stats (date, revenue, guests, checks)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        revenue = excluded.revenue,
        guests = excluded.guests,
        checks = excluded.checks
    `).run(date, revenue, guests, checks);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message });
  }
});


app.get("/api/day", (req, res) => {
  const { date } = req.query;

  const day = db.prepare(`
    SELECT revenue, guests, checks FROM daily_stats WHERE date = ?
  `).get(date);

  const waiters = db.prepare(`
    SELECT waiter, revenue, guests, checks, dishes
    FROM waiters_stats WHERE date = ?
  `).all(date);

  res.json({ day, waiters });
});


// ======================================
// API: справочник официантов
// ======================================

app.get("/api/waiters/list", (req, res) => {
  const list = db.prepare(`SELECT name FROM waiters_list ORDER BY name`).all();
  res.json(list);
});


// ======================================
// API: удалить всех официантов за дату
// ======================================

app.post("/api/delete-waiters-day", (req, res) => {
  const { date } = req.body;

  try {
    db.prepare(`DELETE FROM waiters_stats WHERE date = ?`).run(date);
    res.json({ ok:true });
  } catch(e) {
    res.status(500).json({ ok:false, error:e.message });
  }
});


// ======================================
// API: добавить/обновить официанта
// ======================================

app.post("/api/add-waiter", (req, res) => {
  const { date, waiter, revenue, guests, checks, dishes } = req.body;

  try {
    db.prepare(`
      INSERT OR IGNORE INTO waiters_list (name)
      VALUES (?)
    `).run(waiter);

    db.prepare(`
      INSERT INTO waiters_stats (date, waiter, revenue, guests, checks, dishes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(date, waiter, revenue, guests, checks, dishes);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message });
  }
});


// ======================================
// API: план месяца
// ======================================

app.post("/api/save-plan", (req,res)=>{
  const { year, month, plan } = req.body;

  try {
    db.prepare(`
      INSERT INTO plan_stats (year, month, plan_value)
      VALUES (?, ?, ?)
      ON CONFLICT(year, month) DO UPDATE SET
        plan_value = excluded.plan_value
    `).run(year, month, plan);

    res.json({ ok:true });
  } catch(e) {
    res.status(500).json({ ok:false, error:e.message });
  }
});

app.get("/api/plan", (req,res)=>{
  const { year, month } = req.query;

  const row = db.prepare(`
    SELECT plan_value FROM plan_stats
    WHERE year = ? AND month = ?
  `).get(year, month);

  res.json({ plan: row ? row.plan_value : 0 });
});


// ======================================
// API: данные месяца
// ======================================

app.get("/api/month-stats", (req, res) => {
  const { year, month } = req.query;
  const prefix = `${year}-${String(month).padStart(2,"0")}`;

  const rows = db.prepare(`
    SELECT date, revenue, guests, checks
    FROM daily_stats
    WHERE date LIKE ?
    ORDER BY date
  `).all(`${prefix}%`);

  res.json(rows);
});


// ======================================
// API: метрики официантов по диапазону
// ======================================

app.get("/api/waiters", (req,res)=>{
  const { start, end } = req.query;

  try {
    const rows = db.prepare(`
      SELECT waiter,
             SUM(revenue) AS total_revenue,
             SUM(guests) AS total_guests,
             SUM(checks) AS total_checks,
             SUM(dishes) AS total_dishes
      FROM waiters_stats
      WHERE date >= ? AND date <= ?
      GROUP BY waiter
      ORDER BY total_revenue DESC
    `).all(start, end);

    rows.forEach(r=>{
      r.average_check = r.total_checks ? r.total_revenue / r.total_checks : 0;
      r.fill = r.total_checks ? r.total_dishes / r.total_checks : 0;
    });

    res.json(rows);

  } catch(e){
    res.status(500).json({ ok:false, error:e.message });
  }
});


// ======================================
// SERVER START
// ======================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server started on port", PORT);
});
