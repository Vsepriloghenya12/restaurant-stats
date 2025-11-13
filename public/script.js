// ================== ВСПОМОГАТЕЛЬНЫЕ ==================

function getCurrentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

// ================== ОТЧЁТЫ ==================

async function loadPlan(year, month) {
  const planRes = await fetch(`/api/plan?year=${year}&month=${month}`);
  const planData = await planRes.json();
  const plan = planData.plan || 0;

  const res = await fetch(`/api/month-stats?year=${year}&month=${month}`);
  const rows = await res.json();
  const totalRevenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);

  // Остаток
  const left = plan - totalRevenue;

  // Сколько осталось дней
  const today = new Date();
  const lastDay = new Date(year, month, 0).getDate();
  const currentDay = today.getDate();
  const daysLeft = Math.max(1, lastDay - currentDay + 1);

  // Сколько нужно в день
  const needPerDay = plan ? Math.ceil(left / daysLeft) : 0;

  document.getElementById("planValueCell").textContent =
    plan ? `${plan.toLocaleString()} ₽` : "—";
  document.getElementById("planDoneCell").textContent =
    `${totalRevenue.toLocaleString()} ₽`;
  document.getElementById("planLeftCell").textContent =
    plan ? `${left.toLocaleString()} ₽` : "—";
  document.getElementById("planPctCell").textContent =
    plan ? ((totalRevenue / plan) * 100).toFixed(1) + "%" : "—";
  document.getElementById("planDailyNeedCell").textContent =
    plan ? `${needPerDay.toLocaleString()} ₽ / день` : "—";

  const planInput = document.getElementById("planValue");
  if (planInput) planInput.value = plan || "";
}

async function loadWeeklyPlan(year, month) {
  const resThis = await fetch(`/api/month-stats?year=${year}&month=${month}`);
  const thisRows = await resThis.json();

  const resPrev = await fetch(`/api/month-stats?year=${year - 1}&month=${month}`);
  const prevRows = await resPrev.json();

  const planRes = await fetch(`/api/plan?year=${year}&month=${month}`);
  const planData = await planRes.json();
  const plan = planData.plan || 0;

  // массивы
  const weeksThis = [0, 0, 0, 0, 0];
  const weeksPrev = [0, 0, 0, 0, 0];

  const checksThis = [0, 0, 0, 0, 0];
  const checksPrev = [0, 0, 0, 0, 0];

  function fillWeeks(rows, revArr, chkArr) {
    rows.forEach(r => {
      const day = Number(r.date.split("-")[2]);
      const idx = day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : day <= 28 ? 3 : 4;
      revArr[idx] += r.revenue || 0;
      chkArr[idx] += r.checks || 0;
    });
  }

  fillWeeks(thisRows, weeksThis, checksThis);
  fillWeeks(prevRows, weeksPrev, checksPrev);

  let html = `<table>
    <tr>
      <th>Неделя</th>
      <th>${year} Выручка</th>
      <th>${year - 1} Выручка</th>
      <th>Δ</th>
      <th>% к плану</th>
      <th>Ср. чек ${year}</th>
      <th>Ср. чек ${year - 1}</th>
      <th>Δ ср. чека</th>
    </tr>`;

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
      </tr>
    `;
  }

  html += "</table>";
  document.getElementById("weeklyPlan").innerHTML = html;
}

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

  const wThis = await (await fetch(`/api/waiters?period=month&year=${year}&month=${month}`)).json();
  const wPrev = await (await fetch(`/api/waiters?period=month&year=${year - 1}&month=${month}`)).json();

  const dishesThis = wThis.reduce((s, w) => s + (w.total_dishes || 0), 0);
  const dishesPrev = wPrev.reduce((s, w) => s + (w.total_dishes || 0), 0);

  const fillThis = tChecks ? dishesThis / tChecks : 0;
  const fillPrev = pChecks ? dishesPrev / pChecks : 0;

  document.getElementById("compareLastYear").innerHTML = `
    <p>Выручка: <b>${tRev.toLocaleString()} ₽</b> / прошлый год: ${pRev.toLocaleString()} ₽</p>
    <p>Гости: <b>${tGuests}</b> / ${pGuests}</p>
    <p>Чеки: <b>${tChecks}</b> / ${pChecks}</p>
    <p>Средний чек: <b>${Math.round(avgThis)} ₽</b> / ${Math.round(avgPrev)} ₽</p>
    <p>Наполняемость: <b>${fillThis.toFixed(2)}</b> / ${fillPrev.toFixed(2)}</p>
  `;
}

async function loadWaiters(period, year, month) {
  const res = await fetch(`/api/waiters?period=${period}&year=${year}&month=${month}`);
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
        <td>${r.total_guests || 0}</td>
        <td>${r.total_checks || 0}</td>
        <td>${r.total_dishes || 0}</td>
        <td>${Math.round(r.average_check || 0)} ₽</td>
        <td>${(r.fill || 0).toFixed(2)}</td>
      </tr>
    `;
  });

  html += "</table>";
  document.getElementById("waiterStats").innerHTML = html;
}

function setupWaiterStatsPeriod(year, month) {
  const select = document.getElementById("waiterPeriod");
  if (!select) return;

  select.onchange = () => {
    loadWaiters(select.value, year, month);
  };

  loadWaiters(select.value, year, month);
}

// ================== ДОБАВЛЕНИЕ ОФИЦИАНТОВ (несколько) ==================

function addWaiterRow() {
  const container = document.getElementById("waiterRows");
  if (!container) return;

  const row = document.createElement("div");
  row.className = "waiter-row";
  row.innerHTML = `
    <label>Официант
      <input type="text" class="waiterName" required />
    </label>
    <label>Выручка
      <input type="number" class="waiterRevenue" required />
    </label>
    <label>Гостей
      <input type="number" class="waiterGuests" required />
    </label>
    <label>Чеков
      <input type="number" class="waiterChecks" required />
    </label>
    <label>Блюда (БКВ)
      <input type="number" class="waiterDishes" required />
    </label>
  `;
  container.appendChild(row);
}

// ================== DOMContentLoaded ==================

document.addEventListener("DOMContentLoaded", () => {
  const { year, month } = getCurrentYearMonth();

  // Страница ввода дня
  const dayForm = document.getElementById("dayForm");
  if (dayForm) {
    dayForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = {
        date: document.getElementById("dayDate").value,
        revenue: +document.getElementById("dayRevenue").value,
        guests: +document.getElementById("dayGuests").value,
        checks: +document.getElementById("dayChecks").value
      };
      await fetch("/api/add-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      alert("День сохранён");
      dayForm.reset();
    });
  }

  // Страница ввода официантов (несколько)
  const waiterForm = document.getElementById("waiterForm");
  if (waiterForm) {
    const addBtn = document.getElementById("addWaiterRow");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        addWaiterRow();
      });
    }

    waiterForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const date = document.getElementById("waiterDate").value;
      const rows = document.querySelectorAll(".waiter-row");

      if (!date) {
        alert("Укажите дату смены");
        return;
      }

      for (const row of rows) {
        const name = row.querySelector(".waiterName").value;
        const revenue = +row.querySelector(".waiterRevenue").value;
        const guests = +row.querySelector(".waiterGuests").value;
        const checks = +row.querySelector(".waiterChecks").value;
        const dishes = +row.querySelector(".waiterDishes").value;

        if (!name) continue;

        await fetch("/api/add-waiter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, waiter: name, revenue, guests, checks, dishes })
        });
      }

      alert("Все официанты сохранены");
      // сбрасываем только строки, дату оставляем
      const container = document.getElementById("waiterRows");
      container.innerHTML = "";
      addWaiterRow();
    });
  }

  // Страница отчётов
  if (document.getElementById("weeklyPlan")) {
    loadPlan(year, month);
    loadWeeklyPlan(year, month);
    loadCompareLastYear(year, month);
    setupWaiterStatsPeriod(year, month);

    const planForm = document.getElementById("planForm");
    if (planForm) {
      planForm.onsubmit = async (e) => {
        e.preventDefault();
        const val = +document.getElementById("planValue").value;
        await fetch("/api/save-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ year, month, plan: val })
        });
        alert("План сохранён");
        loadPlan(year, month);
        loadWeeklyPlan(year, month);
      };
    }
  }
});
