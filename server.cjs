const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const dbPath = process.env.SQLITE_PATH || path.join(__dirname, "stats.sqlite");
const db = new Database(dbPath);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// === Инициализация таблиц ===
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

// === Добавление общей выручки ===
app.post("/add", (req, res) => {
  try {
    const { date, revenue, guests, checks } = req.body;
    const stmt = db.prepare(`
      INSERT INTO daily_stats (date, revenue, guests, checks)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
      revenue=excluded.revenue, guests=excluded.guests, checks=excluded.checks
    `);
    stmt.run(date, revenue, guests, checks);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Добавление данных официантов ===
app.post("/add-waiters", (req, res) => {
  try {
    const { date, waiters } = req.body;
    db.prepare(`DELETE FROM waiters_stats WHERE date = ?`).run(date);
    const stmt = db.prepare(`
      INSERT INTO waiters_stats (date, waiter, revenue, guests, checks, dishes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((waiters) => {
      for (const w of waiters) stmt.run(date, w.name, w.revenue, w.guests, w.checks, w.dishes);
    });
    insertMany(waiters);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === План месяца ===
app.post("/plan/set", (req, res) => {
  try {
    const { year, month, plan } = req.body;
    db.prepare(`
      INSERT INTO plan_stats (year, month, plan_value)
      VALUES (?, ?, ?)
      ON CONFLICT(year, month) DO UPDATE SET plan_value=excluded.plan_value
    `).run(year, month, plan);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/plan/get", (req, res) => {
  try {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const row = db.prepare(`SELECT plan_value FROM plan_stats WHERE year=? AND month=?`).get(y, m);
    res.json({ plan: row ? row.plan_value : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Отчёт по выручке ===
app.get("/report/revenue", (req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const startOfMonth = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastYear = year - 1;

    const curRows = db.prepare(`SELECT date, revenue FROM daily_stats WHERE date >= ?`).all(startOfMonth);
    const curSum = curRows.reduce((s, r) => s + (r.revenue || 0), 0);

    const lastRows = db
      .prepare(`SELECT revenue FROM daily_stats WHERE strftime('%Y', date)=? AND strftime('%m', date)=?`)
      .all(String(lastYear), String(month).padStart(2, "0"));
    const lastSum = lastRows.reduce((s, r) => s + (r.revenue || 0), 0);

    const daysPassed = curRows.length;
    const totalDays = new Date(year, month, 0).getDate();
    const forecast = (curSum / Math.max(daysPassed, 1)) * totalDays;
    const diff = curSum - lastSum;
    const percent = lastSum ? (diff / lastSum) * 100 : 0;

    const planRow = db.prepare(`SELECT plan_value FROM plan_stats WHERE year=? AND month=?`).get(year, month);
    const plan = planRow ? planRow.plan_value : 0;
    const remain = Math.max(plan - curSum, 0);
    const daysLeft = totalDays - daysPassed;
    const needPerDay = daysLeft > 0 ? remain / daysLeft : 0;

    res.json({
      curSum,
      lastSum,
      diff,
      percent,
      forecast,
      plan,
      remain,
      needPerDay,
      daysPassed,
      totalDays,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Выполнение плана по неделям ===
app.get("/report/weekly-plan", (req, res) => {
  try {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const planRow = db.prepare(`SELECT plan_value FROM plan_stats WHERE year=? AND month=?`).get(y, m);
    const plan = planRow ? planRow.plan_value : 0;

    const rows = db
      .prepare(`SELECT date, revenue FROM daily_stats WHERE strftime('%Y', date)=? AND strftime('%m', date)=?`)
      .all(String(y), String(m).padStart(2, "0"));

    const weeks = [0, 0, 0, 0, 0];
    for (const r of rows) {
      const day = new Date(r.date).getDate();
      const index = Math.min(Math.floor((day - 1) / 7), 4);
      weeks[index] += r.revenue || 0;
    }

    const result = weeks.map((w, i) => ({
      week: `${i * 7 + 1}-${i * 7 + 7}`,
      revenue: w,
      percent: plan > 0 ? (w / plan) * 100 : 0,
    }));

    const totalRevenue = weeks.reduce((a, b) => a + b, 0);
    res.json({ plan, result, totalRevenue });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Сравнение 2025 vs 2024 по неделям ===
app.get("/report/weekly-compare", (req, res) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const prevYear = year - 1;
    const month = now.getMonth() + 1;

    const getData = (y) => {
      const rows = db
        .prepare(`SELECT date, revenue, guests, checks FROM daily_stats WHERE strftime('%Y', date)=? AND strftime('%m', date)=?`)
        .all(String(y), String(month).padStart(2, "0"));

      const weeks = [[], [], [], [], []];
      for (const r of rows) {
        const day = new Date(r.date).getDate();
        const weekIndex = Math.min(Math.floor((day - 1) / 7), 4);
        weeks[weekIndex].push(r);
      }

      return weeks.map((w) => {
        const rev = w.reduce((s, r) => s + (r.revenue || 0), 0);
        const g = w.reduce((s, r) => s + (r.guests || 0), 0);
        const c = w.reduce((s, r) => s + (r.checks || 0), 0);
        const avg = c ? rev / c : 0;
        return { rev, g, c, avg };
      });
    };

    const data2024 = getData(prevYear);
    const data2025 = getData(year);

    const result = data2025.map((d, i) => {
      const p = data2024[i] || { rev: 0, g: 0, c: 0, avg: 0 };
      const diffRev = d.rev - p.rev;
      const diffGuests = d.g - p.g;
      const diffChecks = d.c - p.c;
      const diffAvg = d.avg - p.avg;
      return {
        week: `${i * 7 + 1}-${i * 7 + 7}`,
        rev2024: p.rev, rev2025: d.rev,
        g2024: p.g, g2025: d.g,
        c2024: p.c, c2025: d.c,
        avg2024: p.avg, avg2025: d.avg,
        pctRev: p.rev ? (diffRev / p.rev) * 100 : 0,
        pctGuests: p.g ? (diffGuests / p.g) * 100 : 0,
        pctChecks: p.c ? (diffChecks / p.c) * 100 : 0,
        pctAvg: p.avg ? (diffAvg / p.avg) * 100 : 0
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log("✅ Сервер запущен: http://localhost:3000"));
