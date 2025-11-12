// ============ POST DAY =============

document.addEventListener("DOMContentLoaded", () => {

  // ---------- Ввод дня ----------
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

      alert("Данные за день сохранены!");
      dayForm.reset();
    });
  }

  // ---------- Ввод официанта ----------
  const waiterForm = document.getElementById("waiterForm");
  if (waiterForm) {
    waiterForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const body = {
        date: document.getElementById("waiterDate").value,
        waiter: document.getElementById("waiterName").value,
        revenue: +document.getElementById("waiterRevenue").value,
        guests: +document.getElementById("waiterGuests").value,
        checks: +document.getElementById("waiterChecks").value,
        dishes: +document.getElementById("waiterDishes").value
      };

      await fetch("/api/add-waiter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      alert("Данные официанта сохранены!");
      waiterForm.reset();
    });
  }

  // =================================================================
  //                     REPORT PAGE LOGIC
  // =================================================================

  const monthStatsBlock = document.getElementById("monthStats");
  const planInfo = document.getElementById("planInfo");
  const weeklyPlan = document.getElementById("weeklyPlan");
  const compareLastYear = document.getElementById("compareLastYear");
  const waiterStatsBlock = document.getElementById("waiterStats");

  if (monthStatsBlock) loadReports();
  if (waiterStatsBlock) setupWaiterStatsPeriod();
});


// =================================================================
//                          LOAD REPORTS
// =================================================================

async function loadReports() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  loadPlan(year, month);
  loadMonthStats(year, month);
  loadWeeklyPlan(year, month);
  loadCompareLastYear(year, month);
  loadWaiters("week", year, month);
}


// =================================================================
//                          LOAD PLAN
// =================================================================

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

  function fillWeeks(rows, arr) {
    rows.forEach(r => {
      const day = Number(r.date.split("-")[2]);
      const wi = day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : day <= 28 ? 3 : 4;
      arr[wi] += r.revenue;
    });
  }

  fillWeeks(thisRows, weeksThis);
  fillWeeks(prevRows, weeksPrev);

  let html = `<table><tr>
    <th>Неделя</th>
    <th>${year}</th>
    <th>${year - 1}</th>
    <th>Δ</th>
    <th>% к плану</th>
  </tr>`;

  for (let i = 0; i < 5; i++) {
    const pct = plan ? ((weeksThis[i] / plan) * 100).toFixed(1) : "—";
    html += `
      <tr>
        <td>${i + 1}</td>
        <td>${weeksThis[i].toLocaleString()} ₽</td>
        <td>${weeksPrev[i].toLocaleString()} ₽</td>
        <td>${(weeksThis[i] - weeksPrev[i]).toLocaleString()} ₽</td>
        <td>${pct}%</td>
      </tr>
    `;
  }

  html += "</table>";

  document.getElementById("weeklyPlan").innerHTML = html;
}


// =================================================================
//                          MONTH STATS
// =================================================================

async function loadMonthStats(year, month) {
  const res = await fetch(`/api/month-stats?year=${year}&month=${month}`);
  const rows = await res.json();

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalGuests = rows.reduce((s, r) => s + r.guests, 0);
  const totalChecks = rows.reduce((s, r) => s + r.checks, 0);
  const avgCheck = totalChecks ? totalRevenue / totalChecks : 0;

  const block = document.getElementById("monthStats");
  block.innerHTML = `
    <p>Выручка: <b>${totalRevenue.toLocaleString()} ₽</b></p>
    <p>Гости: <b>${totalGuests}</b></p>
    <p>Чеки: <b>${totalChecks}</b></p>
    <p>Средний чек: <b>${Math.round(avgCheck)} ₽</b></p>
  `;
}


// =================================================================
//                     WEEKLY PLAN PROGRESS
// =================================================================

async function loadWeeklyPlan(year, month) {
  const res = await fetch(`/api/month-stats?year=${year}&month=${month}`);
  const rows = await res.json();

  const planRes = await fetch(`/api/plan?year=${year}&month=${month}`);
  const planData = await planRes.json();
  const plan = planData.plan || 0;

  const weeks = [0, 0, 0, 0, 0];

  rows.forEach(r => {
    const day = Number(r.date.split("-")[2]);

    if (day <= 7) weeks[0] += r.revenue;
    else if (day <= 14) weeks[1] += r.revenue;
    else if (day <= 21) weeks[2] += r.revenue;
    else if (day <= 28) weeks[3] += r.revenue;
    else weeks[4] += r.revenue;
  });

  const html = weeks.map((sum, i) => {
    const pct = plan ? ((sum / plan) * 100).toFixed(1) : 0;
    return `<p>Неделя ${i + 1}: <b>${sum.toLocaleString()} ₽</b> (${pct}%)</p>`;
  }).join("");

  document.getElementById("weeklyPlan").innerHTML = html;
}


// =================================================================
//         COMPARE CURRENT MONTH VS LAST YEAR SAME MONTH
// =================================================================

async function loadCompareLastYear(year, month) {
  const thisRows = await (await fetch(`/api/month-stats?year=${year}&month=${month}`)).json();
  const prevRows = await (await fetch(`/api/month-stats?year=${year - 1}&month=${month}`)).json();

  const tRev = thisRows.reduce((s, r) => s + r.revenue, 0);
  const tGuests = thisRows.reduce((s, r) => s + r.guests, 0);
  const tChecks = thisRows.reduce((s, r) => s + r.checks, 0);

  const pRev = prevRows.reduce((s, r) => s + r.revenue, 0);
  const pGuests = prevRows.reduce((s, r) => s + r.guests, 0);
  const pChecks = prevRows.reduce((s, r) => s + r.checks, 0);

  // Средний чек
  const avgThis = tChecks ? tRev / tChecks : 0;
  const avgPrev = pChecks ? pRev / pChecks : 0;

  // Наполняемость (общие БКВ)
  const wThis = await (await fetch(`/api/waiters?period=month&year=${year}&month=${month}`)).json();
  const wPrev = await (await fetch(`/api/waiters?period=month&year=${year-1}&month=${month}`)).json();

  const dishesThis = wThis.reduce((s, w) => s + w.total_dishes, 0);
  const dishesPrev = wPrev.reduce((s, w) => s + w.total_dishes, 0);

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


// =================================================================
//                      WAITER METRICS
// =================================================================

function setupWaiterStatsPeriod() {
  const now = new Date();
  loadWaiters("week", now.getFullYear(), now.getMonth() + 1);

  document.getElementById("waiterPeriod").onchange = function () {
    const p = this.value;
    const now = new Date();
    loadWaiters(p, now.getFullYear(), now.getMonth() + 1);
  };
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
        <td>${r.total_revenue.toLocaleString()} ₽</td>
        <td>${r.total_guests}</td>
        <td>${r.total_checks}</td>
        <td>${r.total_dishes}</td>
        <td>${Math.round(r.average_check)} ₽</td>
        <td>${r.fill.toFixed(2)}</td>
      </tr>
    `;
  });

  html += "</table>";

  document.getElementById("waiterStats").innerHTML = html;
}
