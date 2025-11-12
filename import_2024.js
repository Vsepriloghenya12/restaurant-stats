// import_2024.js — импорт отчёта 2024 года в stats.sqlite
const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");
const sqlite3 = require("sqlite3").verbose();

const dbPath = path.join(__dirname, "stats.sqlite");
const db = new sqlite3.Database(dbPath);

// === настройки ===
const excelFile = "Отчет о среднем чеке 12.11.2025 18.33.47.xlsx";
const mergeFrom = new Date("2024-09-10");

// === читаем Excel ===
if (!fs.existsSync(excelFile)) {
  console.error("❌ Не найден Excel файл:", excelFile);
  process.exit(1);
}

const workbook = xlsx.readFile(excelFile);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = xlsx.utils.sheet_to_json(sheet);

console.log(`📘 Загружено строк: ${rows.length}`);
console.log("🔍 Пример строки:", rows[0]);

// === группируем по дате ===
const grouped = {};
for (const r of rows) {
  if (!r["Операционный день"]) continue;

  // извлекаем дату из строки "01.01.2024, понедельник"
  const datePart = r["Операционный день"].split(",")[0].trim();
  const [day, month, year] = datePart.split(".");
  const dateStr = `${year}-${month}-${day}`;

  const date = new Date(dateStr);
  const kasa = Number(r["Номер кассы"]) || 1;
  const revenue = Number(r["Продажи"]) || 0;
  const guests = Number(r["Гостей"]) || 0;
  const checks = Number(r["Чеков"]) || 0;

  if (!grouped[dateStr]) grouped[dateStr] = { revenue: 0, guests: 0, checks: 0 };

  // объединяем кассы с 10.09.2024
  if (date >= mergeFrom) {
    grouped[dateStr].revenue += revenue;
    grouped[dateStr].guests += guests;
    grouped[dateStr].checks += checks;
  } else {
    if (kasa === 1) {
      grouped[dateStr].revenue += revenue;
      grouped[dateStr].guests += guests;
      grouped[dateStr].checks += checks;
    }
  }
}

// === запись в базу ===
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS daily_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE,
    revenue REAL,
    guests INTEGER,
    checks INTEGER
  )`);

  const stmt = db.prepare(`INSERT OR REPLACE INTO daily_stats (date, revenue, guests, checks)
                           VALUES (?, ?, ?, ?)`);

  let count = 0;
  for (const [date, d] of Object.entries(grouped)) {
    stmt.run(date, d.revenue, d.guests, d.checks);
    count++;
  }

  stmt.finalize(() => {
    console.log(`✅ Импортировано ${count} дней (${Object.keys(grouped).length} строк)`);
    db.close();
  });
});
