const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();

// Путь к базе (на Railway будет /mnt/data/stats.sqlite)
const dbPath = process.env.SQLITE_PATH || path.join(__dirname, "stats.sqlite");
const db = new Database(dbPath);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ======================
//   ИНИЦИАЛИЗАЦИЯ БД
// ======================

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

// ======================
//   API: ДЕНЬ
// ======================

// добавление/обновление общих данных за день
app.post("/api/add-day", (req, res) => {
  const { date, revenue, guests, checks } = req.body;
  try {
    db.prepare(`
      INSERT INTO daily_stats (date, revenue, guests, checks)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        revenue = excluded.revenue,
        guests  = excluded.guests,
        checks  = excluded.checks
    `).run(date, revenue, guests, checks);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ======================
//   API: ОФИЦИАНТЫ
// ======================

// добавление строки по официанту
app.post("/api/add-waiter", (req, res) => {
  const { date, waiter, revenue, guests, checks, dishes } = req.body;
  try {
    db.prepare(`
      INSERT INTO waiters_stats (date, waiter, revenue, guests, checks, dishes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(date, waiter, revenue, guests, checks, dishes);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// агрегированные метрики по официантам
app.get("/api/waiters", (req, res) => {
  const { period, year, month } = req.query;
  const y = Number(year);
  const m = Number(month);

  let start, end;

  if (period === "month") {
    start = `${y}-${String(m).padStart(2, "0")}-01`;
    // конец месяца
    const lastDay = new Date(y, m, 0).getDate();
    end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  } else {
    // неделя: берём текущую календарную неделю
    const now = new Date();
    const day = now.getDay() || 7; // 1..7
    const monday = new Date(now);
    monday.setDate(now.getDate() - day + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    start = monday.toISOString().slice(0, 10);
    end = sunday.toISOString().slice(0, 10);
  }

  try {
    const rows = db.prepare(`
      SELECT waiter,
             SUM(revenue) AS total_revenue,
             SUM(guests)  AS total_guests,
             SUM(checks)  AS total_checks,
             SUM(dishes)  AS total_dishes
      FROM waiters_stats
      WHERE date >= ? AND date <= ?
      GROUP BY waiter
      ORDER BY total_revenue DESC
    `).all(start, end);

    rows.forEach(r => {
      r.average_check = r.total_checks ? r.total_revenue / r.total_checks : 0;
      r.fill = r.total_checks ? r.total_dishes / r.total_checks : 0;
    });

    res.json(rows);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ======================
//   API: ПЛАН
// ======================

app.post("/api/save-plan", (req, res) => {
  const { year, month, plan } = req.body;
  try {
    db.prepare(`
      INSERT INTO plan_stats (year, month, plan_value)
      VALUES (?, ?, ?)
      ON CONFLICT(year, month) DO UPDATE SET
        plan_value = excluded.plan_value
    `).run(year, month, plan);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/plan", (req, res) => {
  const { year, month } = req.query;
  try {
    const row = db.prepare(`
      SELECT plan_value FROM plan_stats
      WHERE year = ? AND month = ?
    `).get(year, month);
    res.json({ plan: row ? row.plan_value : 0 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ======================
//   API: ДАННЫЕ МЕСЯЦА
// ======================

app.get("/api/month-stats", (req, res) => {
  const { year, month } = req.query;
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  try {
    const rows = db.prepare(`
      SELECT date, revenue, guests, checks
      FROM daily_stats
      WHERE date LIKE ?
      ORDER BY date
    `).all(`${prefix}-%`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ======================
//   ЗАПУСК
// ======================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server started on port", PORT);
});
