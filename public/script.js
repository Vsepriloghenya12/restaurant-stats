// ======================================================
// ВСПОМОГАТЕЛЬНЫЕ
// ======================================================

function getCurrentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function pad(n) {
  return String(n).padStart(2, "0");
}

// ======================================================
// ЗАГРУЗКА СПРАВОЧНИКА ОФИЦИАНТОВ
// ======================================================

async function loadWaitersList() {
  const res = await fetch("/api/waiters/list");
  const list = await res.json();

  document.querySelectorAll(".waiterName").forEach(select => {
    select.innerHTML = list
      .map(w => `<option value="${w.name}">${w.name}</option>`)
      .join("");
  });
}

// ======================================================
// ДОБАВЛЕНИЕ СТРОКИ ОФИЦИАНТА
// ======================================================

function addWaiterRow() {
  const container = document.getElementById("waiterRows");

  const row = document.createElement("div");
  row.className = "waiter-row";
  row.innerHTML = `
    <label>Официант
      <select class="waiterName"></select>
      <input type="text" class="waiterNameNew" placeholder="Новый официант">
    </label>

    <label>Выручка
      <input type="number" class="waiterRevenue" required>
    </label>

    <label>Гостей
      <input type="number" class="waiterGuests" required>
    </label>

    <label>Чеков
      <input type="number" class="waiterChecks" required>
    </label>

    <label>Блюда (БКВ)
      <input type="number" class="waiterDishes" required>
    </label>
  `;

  container.appendChild(row);
  loadWaitersList();
}

// ======================================================
// ЗАГРУЗКА ДАННЫХ ДНЯ ДЛЯ РЕДАКТИРОВАНИЯ
// ======================================================

async function loadDayData(date) {
  const res = await fetch(`/api/day?date=${date}`);
  const data = await res.json();

  // ====== данные дня ======
  if (data.day) {
    document.getElementById("dayRevenue").value = data.day.revenue;
    document.getElementById("dayGuests").value = data.day.guests;
    document.getElementById("dayChecks").value = data.day.checks;
  }

  // ====== данные официантов ======
  const container = document.getElementById("waiterRows");
  container.innerHTML = "";

  if (data.waiters && data.waiters.length > 0) {
    for (const w of data.waiters) {
      const row = document.createElement("div");
      row.className = "waiter-row";
      row.innerHTML = `
        <label>Официант
          <select class="waiterName"></select>
          <input type="text" class="waiterNameNew" placeholder="Новый официант">
        </label>

        <label>Выручка
          <input type="number" class="waiterRevenue" value="${w.revenue}" required>
        </label>

        <label>Гостей
          <input type="number" class="waiterGuests" value="${w.guests}" required>
        </label>

        <label>Чеков
          <input type="number" class="waiterChecks" value="${w.checks}" required>
        </label>

        <label>Блюда (БКВ)
          <input type="number" class="waiterDishes" value="${w.dishes}" required>
        </label>
      `;

      container.appendChild(row);

      // Загружаем список, затем ставим нужного официанта
      setTimeout(() => {
        loadWaitersList();
        setTimeout(() => {
          row.querySelector(".waiterName").value = w.waiter;
        }, 50);
      }, 50);
    }
  } else {
    addWaiterRow();
  }
}

// ======================================================
// ПЛАН МЕСЯЦА
// ======================================================

async function loadPlan(year, month) {
  const planRes = await fetch(`/api/plan?year=${year}&month=${month}`);
  const planData = await planRes.json();
  const plan = planData.plan || 0;

  const res = await fetch(`/api/month-stats?year=${year}&month=${month}`);
  const rows = await res.json();

  const totalRevenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);
  const left = plan - totalRevenue;

  const today = new Date();
  const lastDay = new Date(year, month, 0).getDate();
  const currentDay = today.getDate();
  const daysLeft = Math.max(1, lastDay - currentDay + 1);
  const needPerDay = plan ? Math.ceil(left / daysLeft) : 0;

  document.getElementById("planValueCell").textContent = plan ? `${plan.toLocaleString()} ₽` : "—";
  document.getElementById("planDoneCell").textContent = `${totalRevenue.toLocaleString()} ₽`;
  document.getElementById("planLeftCell").textContent = plan ? `${left.toLocaleString()} ₽` : "—";
  document.getElementById("planPctCell").textContent = plan ? ((totalRevenue / plan) * 100).toFixed(1) + "%" : "—";
  document.getElementById("planDailyNeedCell").textContent = plan ? `${needPerDay.toLocaleString()} ₽/день` : "—";

  const planInput = document.getElementById("planValue");
  if (planInput) planInput.value = plan;
}

// ======================================================
// ВЫПОЛНЕНИЕ ПЛАНА ПО НЕДЕЛЯМ (расширенное)
// ======================================================

async function loadWeeklyPlan(year, month) {
  const resThis = await fetch(`/api/month-stats?year=${year}&month=${month}`);
  const thisRows = await resThis.json();

  const resPrev = await fetch(`/api/month-stats?year=${year - 1}&month=${month}`);
  const prevRows = await resPrev.json();

  const planRes = await fetch(`/api/plan?year=${year}&month=${month}`);
  const planData = await planRes.json();
  const plan = planData.plan || 0;

  const weeksThis = [0, 0, 0, 0, 0];
  const weeksPrev = [0, 0, 0, 0, 0];
  const checksThis = [0, 0, 0, 0, 0];
  const checksPrev = [0, 0, 0, 0, 0];

  function fill(rows, revArr, chkArr) {
    rows.forEach(r => {
      const day = Number(r.date.split("-")[2]);
      const i = day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : day <= 28 ? 3 : 4;
      revArr[i] += r.revenue || 0;
      chkArr[i] += r.checks || 0;
    });
  }

  fill(thisRows, weeksThis, checksThis);
  fill(prevRows, weeksPrev, checksPrev);

  let html = `
  <table>
    <tr>
      <th>Неделя</th>
      <th>${year}</th>
      <th>${year - 1}</th>
      <th>Δ</th>
      <th>% к плану</th>
      <th>Ср. чек ${year}</th>
      <th>Ср. чек ${year - 1}</th>
      <th>Δ ср. чека</th>
    </tr>
  `;

  for (let i = 0; i < 5; i++) {
    const avgThis = checksThis[i] ? weeksThis[i] / checksThis[i] : 0;
    const avgPrev = checksPrev[i] ? weeksPrev[i] / checksPrev[i] : 0;
    const pct = plan ? ((weeksThis[i] / plan) * 100).toFixed(1) + "%" : "—";

    html += `
      <tr>
        <td>${i + 1}</td>
        <td>${weeksThis[i].toLocaleString()} ₽</td>
        <td>${weeksPrev[i].toLocaleString()} ₽</td>
        <td>${(weeksThis[i] - weeksPrev[i]).toLocaleString()} ₽</td>
        <td>${pct}</td>
        <td>${Math.round(avgThis)} ₽</td>
        <td>${Math.round(avgPrev)} ₽</td>
        <td>${Math.round(avgThis - avgPrev)} ₽</td>
      </tr>`;
  }

  html += "</table>";
  document.getElementById("weeklyPlan").innerHTML = html;
}

// ======================================================
// СРАВНЕНИЕ С ПРОШЛЫМ ГОДОМ
// ======================================================

async function loadCompareLastYear(year, month) {
  const thisRows = await (await fetch(`/api/month-stats?year=${year}&month=${month}`)).json();
  const prevRows = await (await fetch(`/api/month-stats?year=${year - 1}&month=${month}`)).json();

  const tRev = thisRows.reduce((s, r) => s + (r.revenue || 0), 0);
  const tGuests = thisRows.reduce((s, r) => s + (r.guests || 0), 0);
  const tChecks = thisRows.reduce((s, r) => s + (r.checks || 0), 0);

  const pRev = prevRows.reduce((s, r) => s + (r.revenue || 0), 0);
  const pGuests = prevRows.reduce((s, r) => s + (r.guests || 0), 0);
  const pChecks = prevRows.reduce((s, r) => s + (r.checks || 0), 0);

  const avgThis = tChecks ? tRev / tChecks : 0;
  const avgPrev = pChecks ? pRev / pChecks : 0;

  const fillThis = tChecks ? 0 : 0; // показатели официантов считаются отдельно (опционально)

  document.getElementById("compareLastYear").innerHTML = `
    <p>Выручка: <b>${tRev.toLocaleString()} ₽</b> / ${pRev.toLocaleString()} ₽</p>
    <p>Гости: <b>${tGuests}</b> / ${pGuests}</p>
    <p>Чеки: <b>${tChecks}</b> / ${pChecks}</p>
    <p>Средний чек: <b>${Math.round(avgThis)} ₽</b> / ${Math.round(avgPrev)} ₽</p>
  `;
}

// ======================================================
// МЕТРИКИ ОФИЦИАНТОВ ПО НЕДЕЛЯМ
// ======================================================

async function loadWaiters(period, year, month) {
  function getRange(period) {
    const y = year;
    const m = month;

    let start, end;

    if (period === "w1") { start = `${y}-${pad(m)}-01`; end = `${y}-${pad(m)}-07`; }
    else if (period === "w2") { start = `${y}-${pad(m)}-08`; end = `${y}-${pad(m)}-14`; }
    else if (period === "w3") { start = `${y}-${pad(m)}-15`; end = `${y}-${pad(m)}-21`; }
    else if (period === "w4") { start = `${y}-${pad(m)}-22`; end = `${y}-${pad(m)}-28`; }
    else if (period === "w5") { start = `${y}-${pad(m)}-29`; end = `${y}-${pad(m)}-31`; }
    else {
      const lastDay = new Date(y, m, 0).getDate();
      start = `${y}-${pad(m)}-01`;
      end = `${y}-${pad(m)}-${pad(lastDay)}`;
    }

    return { start, end };
  }

  const { start, end } = getRange(period);

  const res = await fetch(`/api/waiters?start=${start}&end=${end}`);
  const rows = await res.json();

  let html = `
    <table>
      <tr>
        <th>Официант</th>
        <th>Выручка</th>
        <th>Гости</th>
        <th>Чеки</th>
        <th>Блюда</th>
        <th>Средний чек</th>
        <th>Наполняемость</th>
      </tr>
  `;

  rows.forEach(r => {
    html += `
      <tr>
        <td>${r.waiter}</td>
        <td>${(r.total_revenue || 0).toLocaleString()} ₽</td>
        <td>${r.total_guests}</td>
        <td>${r.total_checks}</td>
        <td>${r.total_dishes}</td>
        <td>${Math.round(r.average_check || 0)} ₽</td>
        <td>${(r.fill || 0).toFixed(2)}</td>
      </tr>`;
  });

  html += "</table>";
  document.getElementById("waiterStats").innerHTML = html;
}

// ======================================================
// DOMContentLoaded
// ======================================================

document.addEventListener("DOMContentLoaded", () => {
  const { year, month } = getCurrentYearMonth();

  // ===== ВВОД ДАННЫХ ДНЯ =====
  const dayForm = document.getElementById("dayForm");
  if (dayForm) {
    dayForm.addEventListener("submit", async e => {
      e.preventDefault();

      const body = {
        date: document.getElementById("dayDate").value,
        revenue: +document.getElementById("dayRevenue").value,
        guests: +document.getElementById("dayGuests").value,
        checks: +document.getElementById("dayChecks").value
      };

      await fetch("/api/add-day", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(body)
      });

      alert("День сохранён");
    });
  }

  // ===== ВВОД ОФИЦИАНТОВ =====
  const waiterForm = document.getElementById("waiterForm");
  if (waiterForm) {
    loadWaitersList();

    document.getElementById("addWaiterRow").addEventListener("click", () => {
      addWaiterRow();
    });

    document.getElementById("removeWaiterRow")?.addEventListener("click", () => {
      const container = document.getElementById("waiterRows");
      const rows = container.querySelectorAll(".waiter-row");
      if (rows.length > 1) {
        container.removeChild(rows[rows.length - 1]);
      } else {
        alert("Должен быть хотя бы один официант.");
      }
    });

    // Подстановка при выборе даты
    document.getElementById("waiterDate").addEventListener("change", e => {
      const date = e.target.value;
      if (date) loadDayData(date);
    });

    // Сохранение всех официантов
    waiterForm.addEventListener("submit", async e => {
      e.preventDefault();

      const date = document.getElementById("waiterDate").value;
      const rows = document.querySelectorAll(".waiter-row");

      // Удаляем старые данные за дату
      await fetch("/api/delete-waiters-day", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ date })
      });

      // Сохраняем новые
      for (const row of rows) {
        const selName = row.querySelector(".waiterName").value;
        const newName = row.querySelector(".waiterNameNew").value.trim();
        const waiter = newName !== "" ? newName : selName;

        const revenue = +row.querySelector(".waiterRevenue").value;
        const guests = +row.querySelector(".waiterGuests").value;
        const checks = +row.querySelector(".waiterChecks").value;
        const dishes = +row.querySelector(".waiterDishes").value;

        await fetch("/api/add-waiter", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ date, waiter, revenue, guests, checks, dishes })
        });
      }

      alert("Данные официантов сохранены");
    });
  }

  // ===== ОТЧЁТЫ =====
  if (document.getElementById("weeklyPlan")) {
    loadPlan(year, month);
    loadWeeklyPlan(year, month);
    loadCompareLastYear(year, month);
    loadWaiters("w1", year, month);

    document.getElementById("waiterPeriod").onchange = e => {
      loadWaiters(e.target.value, year, month);
    };

    const planForm = document.getElementById("planForm");
    if (planForm) {
      planForm.addEventListener("submit", async e => {
        e.preventDefault();
        const val = +document.getElementById("planValue").value;

        await fetch("/api/save-plan", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ year, month, plan: val })
        });

        alert("План обновлён");
        loadPlan(year, month);
        loadWeeklyPlan(year, month);
      });
    }
  }
});
