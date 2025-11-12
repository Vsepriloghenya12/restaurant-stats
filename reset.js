// reset.js — очистка данных ресторана
const readline = require("readline");
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("stats.sqlite");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log(`
=========================
 Очистка базы данных
=========================
1. Удалить ВСЕ данные (выручка, официанты, планы)
2. Удалить данные за конкретную дату
3. Удалить только план месяца
=========================
`);

rl.question("Выберите действие (1-3): ", (choice) => {
  if (choice === "1") {
    rl.question("⚠️ Уверены, что хотите удалить ВСЕ данные? (y/n): ", (conf) => {
      if (conf.toLowerCase() === "y") {
        db.serialize(() => {
          db.run("DELETE FROM daily_stats");
          db.run("DELETE FROM waiters_stats");
          db.run("DELETE FROM plan_stats");
          console.log("✅ Все данные успешно удалены.");
          db.close();
          rl.close();
        });
      } else {
        console.log("❌ Отменено.");
        rl.close();
      }
    });
  }

  else if (choice === "2") {
    rl.question("Введите дату (в формате YYYY-MM-DD): ", (date) => {
      db.serialize(() => {
        db.run("DELETE FROM daily_stats WHERE date = ?", [date]);
        db.run("DELETE FROM waiters_stats WHERE date = ?", [date]);
        console.log(`✅ Данные за ${date} удалены.`);
        db.close();
        rl.close();
      });
    });
  }

  else if (choice === "3") {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    db.run("DELETE FROM plan_stats WHERE year=? AND month=?", [y, m], function (err) {
      if (err) console.error("❌ Ошибка:", err.message);
      else console.log(`✅ План за ${y}-${String(m).padStart(2, "0")} удалён.`);
      db.close();
      rl.close();
    });
  }

  else {
    console.log("❌ Неверный выбор.");
    rl.close();
  }
});
