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

async function loadPlan(year, month) {
  const res = await fetch(`/api/plan?year=${year}&month=${month}`);
  const data = await res.json();

  const planInfo = document.getElementById("planInfo");
  planInfo.innerHTML = data.plan
    ? `План месяца: <b>${data.plan.toLocaleString()} ₽</b>`
    : "План не установлен";

  const form = document.getElementById("planForm");
  form.onsubmit = async (e) => {
    e.preventDefault();

    const planValue = +document.getElementById("planValue").value;

    await fetch("/api/save-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month, plan: planValue })
    });

    alert("План сохранён");
    loadPlan(year, month);
  };
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
  const resThis = await fetch(`/api/month-stats?year=${year}&month=${month}`);
  const thisYear = await resThis.json();

  const resPrev = await fetch(`/api/month-stats?year=${year - 1}&month=${month}`);
  const lastYear = await resPrev.json();

  const tRev = thisYear.reduce((s, r) => s + r.revenue, 0);
  const tGuests = thisYear.reduce((s, r) => s + r.guests, 0);
  const tChecks = thisYear.reduce((s, r) => s + r.checks, 0);

  const pRev = lastYear.reduce((s, r) => s + r.revenue, 0);
  const pGuests = lastYear.reduce((s, r) => s + r.guests, 0);
  const pChecks = lastYear.reduce((s, r) => s + r.checks, 0);

  const html = `
    <p>Выручка: <b>${tRev.toLocaleString()} ₽</b> (прошлый год: ${pRev.toLocaleString()} ₽)</p>
    <p>Гости: <b>${tGuests}</b> (прошлый: ${pGuests})</p>
    <p>Чеки: <b>${tChecks}</b> (прошлый: ${pChecks})</p>
  `;

  document.getElementById("compareLastYear").innerHTML = html;
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
