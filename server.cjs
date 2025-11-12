const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const dbPath = path.join(__dirname, "stats.sqlite");
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const db = new sqlite3.Database(dbPath);

// === Инициализация таблиц ===
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS daily_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE,
    revenue REAL,
    guests INTEGER,
    checks INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS waiters_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    waiter TEXT,
    revenue REAL,
    guests INTEGER,
    checks INTEGER,
    dishes INTEGER
  )`);

  // --- Проверка и автоисправление таблицы планов ---
  db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='plan_stats'`, (err, row) => {
    if (!row) {
      console.log("🔧 Создаём таблицу plan_stats (новая структура)");
      db.run(`CREATE TABLE plan_stats (
        year INTEGER,
        month INTEGER,
        plan_value REAL,
        UNIQUE(year, month)
      )`);
    } else {
      db.all(`PRAGMA table_info(plan_stats)`, (err2, columns) => {
        if (!columns) return;
        const names = columns.map(c => c.name);
        if (names.includes("id")) {
          console.log("🔧 Обновляем структуру plan_stats...");
          db.run(`DROP TABLE plan_stats`, () => {
            db.run(`CREATE TABLE plan_stats (
              year INTEGER,
              month INTEGER,
              plan_value REAL,
              UNIQUE(year, month)
            )`);
          });
        }
      });
    }
  });
});

// === Добавление общих данных ===
app.post("/add", (req, res) => {
  const { date, revenue, guests, checks } = req.body;
  db.run(
    `INSERT INTO daily_stats (date, revenue, guests, checks)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET revenue=excluded.revenue, guests=excluded.guests, checks=excluded.checks`,
    [date, revenue, guests, checks],
    (err) => (err ? res.status(500).json({ error: err.message }) : res.json({ success: true }))
  );
});

// === Добавление официантов ===
app.post("/add-waiters", (req, res) => {
  const { date, waiters } = req.body;
  if (!Array.isArray(waiters)) return res.status(400).json({ error: "Неверный формат" });
  db.run(`DELETE FROM waiters_stats WHERE date = ?`, [date], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    const stmt = db.prepare(`INSERT INTO waiters_stats (date, waiter, revenue, guests, checks, dishes) VALUES (?, ?, ?, ?, ?, ?)`);
    for (const w of waiters) stmt.run(date, w.name, w.revenue, w.guests, w.checks, w.dishes);
    stmt.finalize(() => res.json({ success: true }));
  });
});

// === План месяца ===
app.post("/plan/set", (req, res) => {
  const { year, month, plan } = req.body;
  db.run(
    `INSERT INTO plan_stats (year, month, plan_value)
     VALUES (?, ?, ?)
     ON CONFLICT(year, month) DO UPDATE SET plan_value=excluded.plan_value`,
    [year, month, plan],
    (err) => (err ? res.status(500).json({ error: err.message }) : res.json({ success: true }))
  );
});

app.get("/plan/get", (req, res) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  db.get(`SELECT plan_value FROM plan_stats WHERE year=? AND month=?`, [y, m], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ plan: row ? row.plan_value : 0 });
  });
});

// === Отчёт по общей выручке ===
app.get("/report/revenue", (req, res) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startOfMonth = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastYear = year - 1;

  db.all(`SELECT date, revenue FROM daily_stats WHERE date >= ?`, [startOfMonth], (err, curRows) => {
    if (err) return res.status(500).json({ error: err.message });
    const curSum = curRows.reduce((s, r) => s + (r.revenue || 0), 0);

    db.all(
      `SELECT revenue FROM daily_stats WHERE strftime('%Y', date)=? AND strftime('%m', date)=?`,
      [String(lastYear), String(month).padStart(2, "0")],
      (err2, lastRows) => {
        if (err2) return res.status(500).json({ error: err2.message });
        const lastSum = lastRows.reduce((s, r) => s + (r.revenue || 0), 0);

        const daysPassed = curRows.length;
        const totalDays = new Date(year, month, 0).getDate();
        const forecast = (curSum / Math.max(daysPassed, 1)) * totalDays;
        const diff = curSum - lastSum;
        const percent = lastSum ? (diff / lastSum) * 100 : 0;

        db.get(`SELECT plan_value FROM plan_stats WHERE year=? AND month=?`, [year, month], (err3, planRow) => {
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
            totalDays
          });
        });
      }
    );
  });
});

// === Выполнение плана по неделям ===
app.get("/report/weekly-plan", (req, res) => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;

  db.get(`SELECT plan_value FROM plan_stats WHERE year=? AND month=?`, [y, m], (err, planRow) => {
    if (err) return res.status(500).json({ error: err.message });
    const plan = planRow ? planRow.plan_value : 0;

    db.all(
      `SELECT date, revenue FROM daily_stats WHERE strftime('%Y', date)=? AND strftime('%m', date)=?`,
      [String(y), String(m).padStart(2, "0")],
      (err2, rows) => {
        if (err2) return res.status(500).json({ error: err2.message });

        const weeks = [0, 0, 0, 0, 0];
        for (const r of rows) {
          const day = new Date(r.date).getDate();
          const index = Math.min(Math.floor((day - 1) / 7), 4);
          weeks[index] += r.revenue || 0;
        }

        const result = weeks.map((w, i) => ({
          week: `${i * 7 + 1}-${i * 7 + 7}`,
          revenue: w,
          percent: plan > 0 ? (w / plan) * 100 : 0
        }));

        const totalRevenue = weeks.reduce((a, b) => a + b, 0);
        res.json({ plan, result, totalRevenue });
      }
    );
  });
});

// === Сравнение 2025 vs 2024 по неделям ===
app.get("/report/weekly-compare", (req, res) => {
  const now = new Date();
  const year = now.getFullYear();
  const prevYear = year - 1;
  const month = now.getMonth() + 1;

  const getData = (y, cb) => {
    db.all(
      `SELECT date, revenue, guests, checks FROM daily_stats WHERE strftime('%Y', date)=? AND strftime('%m', date)=?`,
      [String(y), String(month).padStart(2, "0")],
      (err, rows) => {
        if (err) return cb(err);
        const weeks = [[], [], [], [], []];
        for (const r of rows) {
          const day = new Date(r.date).getDate();
          const weekIndex = Math.min(Math.floor((day - 1) / 7), 4);
          weeks[weekIndex].push(r);
        }
        const sums = weeks.map(w => {
          const rev = w.reduce((s, r) => s + (r.revenue || 0), 0);
          const g = w.reduce((s, r) => s + (r.guests || 0), 0);
          const c = w.reduce((s, r) => s + (r.checks || 0), 0);
          const avg = c ? rev / c : 0;
          return { rev, g, c, avg };
        });
        cb(null, sums);
      }
    );
  };

  getData(prevYear, (err, data2024) => {
    if (err) return res.status(500).json({ error: err.message });
    getData(year, (err2, data2025) => {
      if (err2) return res.status(500).json({ error: err2.message });
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
    });
  });
});

app.listen(3000, () => console.log("✅ Сервер запущен: http://localhost:3000"));
