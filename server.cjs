const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const multer = require("multer");
const xlsx = require("xlsx");

const app = express();

const dbPath = process.env.SQLITE_PATH || path.join(__dirname, "stats.sqlite");
const db = new Database(dbPath);

const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function pad2(n) {
  return String(n).padStart(2, "0");
}

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
// API: данные дня
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
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get("/api/day", (req, res) => {
  const { date } = req.query;

  const day = db.prepare(`
    SELECT revenue, guests, checks
    FROM daily_stats
    WHERE date = ?
  `).get(date);

  const waiters = db.prepare(`
    SELECT waiter, revenue, guests, checks, dishes
    FROM waiters_stats
    WHERE date = ?
  `).all(date);

  res.json({ day, waiters });
});

// ======================================
// API: справочник официантов
// ======================================

app.get("/api/waiters/list", (req, res) => {
  const list = db.prepare(`
    SELECT name
    FROM waiters_list
    ORDER BY name
  `).all();
  res.json(list);
});

// ======================================
// API: удалить всех официантов за дату
// ======================================

app.post("/api/delete-waiters-day", (req, res) => {
  const { date } = req.body;

  try {
    db.prepare(`DELETE FROM waiters_stats WHERE date = ?`).run(date);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ======================================
// API: добавить показатели официанта
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
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ======================================
// API: план месяца
// ======================================

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

  const row = db.prepare(`
    SELECT plan_value
    FROM plan_stats
    WHERE year = ? AND month = ?
  `).get(year, month);

  res.json({ plan: row ? row.plan_value : 0 });
});

// ======================================
// API: данные месяца по дням
// ======================================

app.get("/api/month-stats", (req, res) => {
  const { year, month } = req.query;
  const prefix = `${year}-${String(month).padStart(2, "0")}`;

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
//  (с optional фильтром по waiter)
// ======================================

app.get("/api/waiters", (req, res) => {
  const { start, end, waiter } = req.query;

  try {
    let sql = `
      SELECT waiter,
             SUM(revenue) AS total_revenue,
             SUM(guests)  AS total_guests,
             SUM(checks)  AS total_checks,
             SUM(dishes)  AS total_dishes
      FROM waiters_stats
      WHERE date >= ? AND date <= ?
    `;
    const params = [start, end];

    if (waiter && waiter.trim() !== "") {
      sql += " AND waiter = ?";
      params.push(waiter);
    }

    sql += " GROUP BY waiter ORDER BY total_revenue DESC";

    const rows = db.prepare(sql).all(...params);

    rows.forEach(r => {
      r.average_check = r.total_checks ? r.total_revenue / r.total_checks : 0;
      r.fill = r.total_checks ? r.total_dishes / r.total_checks : 0;
    });

    res.json(rows);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ======================================
// API: экспорт метрик официантов в CSV
// ======================================

app.get("/api/waiters-export", (req, res) => {
  const { start, end, waiter, year, month, period } = req.query;

  try {
    let sql = `
      SELECT waiter,
             SUM(revenue) AS total_revenue,
             SUM(guests)  AS total_guests,
             SUM(checks)  AS total_checks,
             SUM(dishes)  AS total_dishes
      FROM waiters_stats
      WHERE date >= ? AND date <= ?
    `;
    const params = [start, end];

    if (waiter && waiter.trim() !== "") {
      sql += " AND waiter = ?";
      params.push(waiter);
    }

    sql += " GROUP BY waiter ORDER BY total_revenue DESC";

    const rows = db.prepare(sql).all(...params);

    let csv = "waiter,total_revenue,total_guests,total_checks,total_dishes,average_check,fill\n";
    rows.forEach(r => {
      const avg = r.total_checks ? r.total_revenue / r.total_checks : 0;
      const fill = r.total_checks ? r.total_dishes / r.total_checks : 0;
      csv += [
        `"${r.waiter}"`,
        r.total_revenue || 0,
        r.total_guests || 0,
        r.total_checks || 0,
        r.total_dishes || 0,
        avg.toFixed(2),
        fill.toFixed(2)
      ].join(",") + "\n";
    });

    const y = year || "year";
    const m = month || "month";
    const p = period || "period";

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="waiters_${y}_${m}_${p}.csv"`
    );
    res.send(csv);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ======================================
// API: ЗАГРУЗКА МЕСЯЦА ИЗ EXCEL
// ======================================

app.post("/api/upload-month", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .send("<html><body><p>Файл не получен</p><p><a href=\"/index.html\">Назад</a></p></body></html>");
  }

  try {
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

    const byDate = new Map(); // date -> {revenue, guests, checks}

    for (const row of rows) {
      let dateCell =
        row["Операционный день"] ??
        row["Дата"] ??
        row["date"];

      if (!dateCell) continue;

      let isoDate = null;

      if (dateCell instanceof Date) {
        const d = dateCell;
        isoDate = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      } else {
        const s = String(dateCell).split(",")[0].trim(); // "01.01.2024"
        const parts = s.split(".");
        if (parts.length === 3) {
          const dd = pad2(parts[0]);
          const mm = pad2(parts[1]);
          const yyyy = parts[2];
          isoDate = `${yyyy}-${mm}-${dd}`;
        } else {
          continue;
        }
      }

      const revenue =
        Number(row["Продажи"] ??
               row["Выручка"] ??
               row["Выручка, руб"] ??
               0) || 0;
      const guests =
        Number(row["Гостей"] ??
               row["Гости"] ??
               0) || 0;
      const checks =
        Number(row["Чеков"] ??
               row["Чеки"] ??
               0) || 0;

      if (!isoDate) continue;

      const prev = byDate.get(isoDate) || { revenue: 0, guests: 0, checks: 0 };
      prev.revenue += revenue;
      prev.guests += guests;
      prev.checks += checks;
      byDate.set(isoDate, prev);
    }

    const stmt = db.prepare(`
      INSERT INTO daily_stats (date, revenue, guests, checks)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        revenue = excluded.revenue,
        guests = excluded.guests,
        checks = excluded.checks
    `);

    let importedDays = 0;

    for (const [date, agg] of byDate.entries()) {
      if (!agg.revenue && !agg.guests && !agg.checks) continue;
      stmt.run(date, agg.revenue, agg.guests, agg.checks);
      importedDays++;
    }

    res.send(
      `<html><body>
         <p>Импортировано дней: <b>${importedDays}</b></p>
         <p><a href="/index.html">Назад</a></p>
       </body></html>`
    );
  } catch (e) {
    console.error(e);
    res
      .status(500)
      .send(
        `<html><body>
           <p>Ошибка импорта: ${e.message}</p>
           <p><a href="/index.html">Назад</a></p>
         </body></html>`
      );
  }
});

// ======================================
// Скачивание базы (резервная копия)
// ======================================

app.get("/download-db", (req, res) => {
  res.download(dbPath, "stats.sqlite");
});

// ======================================
// SERVER START
// ======================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server started on port", PORT);
});
