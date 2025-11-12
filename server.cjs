const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const dbPath = process.env.SQLITE_PATH || path.join(__dirname, "stats.sqlite");
const db = new Database(dbPath);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ============================
// ИНИЦИАЛИЗАЦИЯ ТАБЛИЦ
// ============================
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

// ======================================================================
//                             ДОБАВЛЕНИЕ ДАННЫХ
// ======================================================================

// *** Общие показатели ***
app.post("/add", (req, res) => {
  try {
    const { date, revenue, guests, checks } = req.body;

    db.prepare(`
      INSERT INTO daily_stats (date, revenue, guests, checks)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        revenue=excluded.revenue,
        guests=excluded.guests,
        checks=excluded.checks
    `).run(date, revenue, guests, checks);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// *** Официанты ***
app.post("/add-waiters", (req, res) => {
  try {
    const { date, waiters } = req.body;

    db.prepare(`DELETE FROM waiters_stats WHERE date = ?`).run(date);

    const stmt = db.prepare(`
      INSERT INTO waiters_stats (date, waiter, revenue, guests, checks, dishes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((items) => {
      for (const w of items) {
        stmt.run(date, w.name, w.revenue, w.guests, w.checks, w.dishes);
      }
    });

    insertMany(waiters);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================================================================
//                                  ПЛАН
// ======================================================================

// Установить план
app.post("/plan/set", (req, res) => {
  try {
    const { year, month, plan } = req.body;

    db.prepare(`
      INSERT INTO plan_stats (year, month, plan_value)
      VALUES (?, ?, ?)
      ON CONFLICT(year, month) DO UPDATE SET plan_value = excluded.plan_value
    `).run(year, month, plan);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Получить план
app.get("/plan/get", (req, res) => {
  try {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;

    const row = db
      .prepare(`SELECT plan_value FROM plan_stats WHERE year=? AND month=?`)
      .get(y, m);

    res.json({ plan: row ? row.plan_value : 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================================================================
//                        ОФИЦИАНТЫ — НЕДЕЛЬНЫЙ ОТЧЁТ
// ======================================================================
function getWeekIndex(day) {
  return Math.min(Math.floor((day - 1) / 7), 4); // 0..4
}

function computeWaiterMetrics(rows) {
  const r = rows.reduce(
    (acc, x) => {
      acc.revenue += x.revenue || 0;
      acc.guests += x.guests || 0;
      acc.checks += x.checks || 0;
      acc.dishes += x.dishes || 0;
      return acc;
    },
    { revenue: 0, guests: 0, checks: 0, dishes: 0 }
  );

  return {
    revenue: r.revenue,
    guests: r.guests,
    checks: r.checks,
    dishes: r.dishes,
    avgCheck: r.checks ? r.revenue / r.checks : 0,
    bkv: r.checks ? r.dishes / r.checks : 0,
    avgGuest: r.checks ? r.guests / r.checks : 0,
  };
}

app.get("/report/waiters-weekly", (req, res) => {
  try {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;

    const rows = db
      .prepare(`
        SELECT * FROM waiters_stats
        WHERE strftime('%Y', date)=? AND strftime('%m', date)=?
      `)
      .all(String(y), String(m).padStart(2, "0"));

    const weeks = [ {}, {}, {}, {}, {} ];

    for (const r of rows) {
      const d = new Date(r.date).getDate();
      const w = getWeekIndex(d);

      if (!weeks[w][r.waiter]) weeks[w][r.waiter] = [];
      weeks[w][r.waiter].push(r);
    }

    const result = weeks.map((wk, i) => {
      const arr = [];
      for (const waiter of Object.keys(wk)) {
        arr.push({ name: waiter, ...computeWaiterMetrics(wk[waiter]) });
      }
      return {
        week: `${i * 7 + 1}-${i * 7 + 7}`,
        waiters: arr
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================================================================
//                           МЕСЯЧНЫЙ ОТЧЁТ ОФИЦИАНТОВ
// ======================================================================
app.get("/report/waiters-monthly", (req, res) => {
  try {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;

    const rows = db
      .prepare(`
        SELECT * FROM waiters_stats
        WHERE strftime('%Y', date)=? AND strftime('%m', date)=?
      `)
      .all(String(y), String(m).padStart(2, "0"));

    const map = {};

    for (const r of rows) {
      if (!map[r.waiter]) map[r.waiter] = [];
      map[r.waiter].push(r);
    }

    const result = Object.keys(map).map((name) => ({
      name,
      ...computeWaiterMetrics(map[name]),
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================================================================
//                        СРАВНЕНИЕ НЕДЕЛЯ К НЕДЕЛЕ
// ======================================================================
app.get("/report/waiters-weekly-compare", (req, res) => {
  try {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;

    const rows = db
      .prepare(`
        SELECT * FROM waiters_stats
        WHERE strftime('%Y', date)=? AND strftime('%m', date)=?
      `)
      .all(String(y), String(m).padStart(2, "0"));

    const weeks = [ {}, {}, {}, {}, {} ];

    for (const r of rows) {
      const d = new Date(r.date).getDate();
      const w = getWeekIndex(d);

      if (!weeks[w][r.waiter]) weeks[w][r.waiter] = [];
      weeks[w][r.waiter].push(r);
    }

    const result = [];

    for (let w = 1; w < 5; w++) {
      const curr = weeks[w];
      const prev = weeks[w - 1];

      const row = [];

      for (const waiter of Object.keys(curr)) {
        const cur = computeWaiterMetrics(curr[waiter]);
        const prv = prev[waiter] ? computeWaiterMetrics(prev[waiter]) : {
          revenue: 0, guests: 0, checks: 0, dishes: 0,
          avgCheck: 0, bkv: 0, avgGuest: 0
        };

        const diff = {
          revenue: cur.revenue - prv.revenue,
          guests: cur.guests - prv.guests,
          checks: cur.checks - prv.checks,
          dishes: cur.dishes - prv.dishes,
          avgCheck: cur.avgCheck - prv.avgCheck,
          bkv: cur.bkv - prv.bkv,
          avgGuest: cur.avgGuest - prv.avgGuest,
        };

        const pct = {
          revenue: prv.revenue ? diff.revenue / prv.revenue * 100 : 100,
          checks: prv.checks ? diff.checks / prv.checks * 100 : 100,
          guests: prv.guests ? diff.guests / prv.guests * 100 : 100,
          avgCheck: prv.avgCheck ? diff.avgCheck / prv.avgCheck * 100 : 100,
          bkv: prv.bkv ? diff.bkv / prv.bkv * 100 : 100,
          avgGuest: prv.avgGuest ? diff.avgGuest / prv.avgGuest * 100 : 100,
        };

        row.push({ waiter, current: cur, previous: prv, diff, pct });
      }

      result.push({
        week: `${w * 7 + 1}-${w * 7 + 7}`,
        compare: row
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================================================================
//                        СРАВНЕНИЕ МЕСЯЦ К МЕСЯЦУ
// ======================================================================
app.get("/report/waiters-monthly-compare", (req, res) => {
  try {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;

    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? y - 1 : y;

    const load = (year, month) => {
      const rows = db
        .prepare(`
          SELECT * FROM waiters_stats
          WHERE strftime('%Y', date)=? AND strftime('%m', date)=?
        `)
        .all(String(year), String(month).padStart(2, "0"));

      const map = {};
      for (const r of rows) {
        if (!map[r.waiter]) map[r.waiter] = [];
        map[r.waiter].push(r);
      }

      const res = {};
      for (const w of Object.keys(map)) {
        res[w] = computeWaiterMetrics(map[w]);
      }
      return res;
    };

    const curr = load(y, m);
    const prev = load(prevY, prevM);

    const result = [];

    for (const waiter of Object.keys(curr)) {
      const c = curr[waiter];
      const p = prev[waiter] || { revenue: 0, guests: 0, checks: 0, dishes: 0, avgCheck: 0, bkv: 0, avgGuest: 0 };

      const diff = {
        revenue: c.revenue - p.revenue,
        guests: c.guests - p.guests,
        checks: c.checks - p.checks,
        dishes: c.dishes - p.dishes,
        avgCheck: c.avgCheck - p.avgCheck,
        bkv: c.bkv - p.bkv,
        avgGuest: c.avgGuest - p.avgGuest,
      };

      const pct = {
        revenue: p.revenue ? diff.revenue / p.revenue * 100 : 100,
        checks: p.checks ? diff.checks / p.checks * 100 : 100,
        guests: p.guests ? diff.guests / p.guests * 100 : 100,
        avgCheck: p.avgCheck ? diff.avgCheck / p.avgCheck * 100 : 100,
        bkv: p.bkv ? diff.bkv / p.bkv * 100 : 100,
        avgGuest: p.avgGuest ? diff.avgGuest / p.avgGuest * 100 : 100,
      };

      result.push({ waiter, current: c, previous: p, diff, pct });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================================================================
app.listen(3000, () =>
  console.log("✅ Сервер запущен: http://localhost:3000")
);
