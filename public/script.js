function getCurrentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function pad(n) {
  return String(n).padStart(2, "0");
}

let waiterList = [];

async function fetchWaitersList() {
  const res = await fetch("/api/waiters/list");
  const list = await res.json();
  waiterList = list;
  return list;
}

async function ensureWaitersList() {
  if (!waiterList || waiterList.length === 0) {
    await fetchWaitersList();
  }
}

function buildWaiterOptions(selectedName = "") {
  return waiterList
    .map(w => {
      const sel = w.name === selectedName ? " selected" : "";
      return `<option value="${w.name}"${sel}>${w.name}</option>`;
    })
    .join("");
}

async function addWaiterRow(prefill) {
  const container = document.getElementById("waiterRows");
  if (!container) return;

  await ensureWaitersList();

  const row = document.createElement("div");
  row.className = "waiter-row";

  const waiterName = prefill?.waiter || "";
  const revenue = prefill?.revenue ?? "";
  const guests = prefill?.guests ?? "";
  const checks = prefill?.checks ?? "";
  const dishes = prefill?.dishes ?? "";

  row.innerHTML = `
    <label>Официант
      <select class="waiterName">
        ${buildWaiterOptions(waiterName)}
      </select>
      <input type="text" class="waiterNameNew" placeholder="Новый официант">
    </label>

    <label>Выручка
      <input type="number" class="waiterRevenue" value="${revenue}" required>
    </label>

    <label>Гостей
      <input type="number" class="waiterGuests" value="${guests}" required>
    </label>

    <label>Чеков
      <input type="number" class="waiterChecks" value="${checks}" required>
    </label>

    <label>Блюда (БКВ)
      <input type="number" class="waiterDishes" value="${dishes}" required>
    </label>
  `;

  container.appendChild(row);
}

function removeLastWaiterRow() {
  const container = document.getElementById("waiterRows");
  if (!container) return;
  const rows = container.querySelectorAll(".waiter-row");
  if (rows.length > 1) {
    container.removeChild(rows[rows.length - 1]);
  }
}

async function loadDayData(date) {
  if (!date) return;

  const res = await fetch(`/api/day?date=${date}`);
  const data = await res.json();

  if (data.day) {
    document.getElementById("dayRevenue").value = data.day.revenue;
    document.getElementById("dayGuests").value = data.day.guests;
    document.getElementById("dayChecks").value = data.day.checks;
  } else {
    document.getElementById("dayRevenue").value = "";
    document.getElementById("dayGuests").value = "";
    document.getElementById("dayChecks").value = "";
  }

  const container = document.getElementById("waiterRows");
  if (!container) return;
  container.innerHTML = "";

  await ensureWaitersList();

  if (data.waiters && data.waiters.length > 0) {
    for (const w of data.waiters) {
      await addWaiterRow({
        waiter: w.waiter,
        revenue: w.revenue,
        guests: w.guests,
        checks: w.checks,
        dishes: w.dishes
      });
    }
  } else {
    await addWaiterRow();
  }
}

// ---------------- ПЛАН ----------------

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
  const currentDay =
    today.getFullYear() === year && today.getMonth() + 1 === month
      ? today.getDate()
      : lastDay;
  const daysLeft = Math.max(1, lastDay - currentDay + 1);
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
    plan ? `${needPerDay.toLocaleString()} ₽/день` : "—";

  const planInput = document.getElementById("planValue");
  if (planInput) planInput.value = plan || "";
}

// -------------- ПРОГНОЗ --------------

async function loadForecast(year, month) {
  const resThis = await fetch(`/api/month-stats?year=${year}&month=${month}`);
  const thisRows = await resThis.json();

  const resPrev = await fetch(
    `/api/month-stats?year=${year - 1}&month=${month}`
  );
  const prevRows = await resPrev.json();

  const totalThis = thisRows.reduce((s, r) => s + (r.revenue || 0), 0);
  const totalPrev = prevRows.reduce((s, r) => s + (r.revenue || 0), 0);

  const daysWithData = thisRows.length;
  const lastDay = new Date(year, month, 0).getDate();
  const avgPerDay = daysWithData ? totalThis / daysWithData : 0;
  const forecast = avgPerDay * lastDay;

  const planRes = await fetch(`/api/plan?year=${year}&month=${month}`);
  const planData = await planRes.json();
  const plan = planData.plan || 0;

  const forecastVsPlan = plan
    ? ((forecast / plan) * 100).toFixed(1) + "%"
    : "—";
  const forecastVsPrev = totalPrev
    ? ((forecast / totalPrev) * 100).toFixed(1) + "%"
    : "—";

  document.getElementById("forecastBlock").innerHTML = `
    <p>Факт на сегодня: <b>${totalThis.toLocaleString()} ₽</b></p>
    <p>Прогноз на месяц: <b>${Math.round(forecast).toLocaleString()} ₽</b></p>
    <p>План месяца: <b>${plan ? plan.toLocaleString() + " ₽" : "—"}</b></p>
    <p>Прошлый год (месяц): <b>${totalPrev.toLocaleString()} ₽</b></p>
    <p>Прогноз / план: <b>${forecastVsPlan}</b></p>
    <p>Прогноз / прошлый год: <b>${forecastVsPrev}</b></p>
  `;
}

// ---------- ВЫПОЛНЕНИЕ ПЛАНА ПО НЕДЕЛЯМ ----------

async function loadWeeklyPlan(year, month) {
  const resThis = await fetch(`/api/month-stats?year=${year}&month=${month}`);
  const thisRows = await resThis.json();

  const resPrev = await fetch(
    `/api/month-stats?year=${year - 1}&month=${month}`
  );
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
      const i =
        day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : day <= 28 ? 3 : 4;
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
        <th>${year} выручка</th>
        <th>${year - 1} выручка</th>
        <th>Δ выручки</th>
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
      </tr>
    `;
  }

  html += "</table>";
  document.getElementById("weeklyPlan").innerHTML = html;
}

// ---------- СТАТИСТИКА ПО ДНЯМ НЕДЕЛИ ----------

async function loadWeekdayStats(year, month) {
  const res = await fetch(`/api/month-stats?year=${year}&month=${month}`);
  const rows = await res.json();

  const sums = Array(7)
    .fill(0)
    .map(() => ({ revenue: 0, guests: 0, checks: 0, days: 0 }));

  rows.forEach(r => {
    const d = new Date(r.date + "T00:00:00");
    const wd = d.getDay();
    const slot = sums[wd];
    slot.revenue += r.revenue || 0;
    slot.guests += r.guests || 0;
    slot.checks += r.checks || 0;
    slot.days += 1;
  });

  const names = ["Воскресенье", "Понедельник", "Вторник", "Среда",
    "Четверг", "Пятница", "Суббота"];

  let html = `
    <table>
      <tr>
        <th>День недели</th>
        <th>Средняя выручка</th>
        <th>Сред. гости</th>
        <th>Сред. чеки</th>
        <th>Сред. чек</th>
      </tr>
  `;

  sums.forEach((s, i) => {
    if (!s.days) return;
    const avgRev = s.revenue / s.days;
    const avgGuests = s.guests / s.days;
    const avgChecks = s.checks / s.days;
    const avgCheck = s.checks ? s.revenue / s.checks : 0;

    html += `
      <tr>
        <td>${names[i]}</td>
        <td>${Math.round(avgRev).toLocaleString()} ₽</td>
        <td>${avgGuests.toFixed(1)}</td>
        <td>${avgChecks.toFixed(1)}</td>
        <td>${Math.round(avgCheck)} ₽</td>
      </tr>
    `;
  });

  html += "</table>";
  document.getElementById("weekdayStats").innerHTML = html;
}

// ---------- ДОЛИ КАТЕГОРИЙ ----------

async function loadCategoryShares(year, month) {
  const resThis = await fetch(`/api/categories-month?year=${year}&month=${month}`);
  const thisRows = await resThis.json();

  const resPrev = await fetch(`/api/categories-month?year=${year - 1}&month=${month}`);
  const prevRows = await resPrev.json();

  const totalThis = thisRows.reduce((s, r) => s + (r.total_revenue || 0), 0);
  const totalPrev = prevRows.reduce((s, r) => s + (r.total_revenue || 0), 0);

  const mapPrev = new Map();
  prevRows.forEach(r => mapPrev.set(r.category, r.total_revenue || 0));

  const catsSet = new Set();
  thisRows.forEach(r => catsSet.add(r.category));
  prevRows.forEach(r => catsSet.add(r.category));

  let html = `
    <table>
      <tr>
        <th>Категория</th>
        <th>${year} выручка</th>
        <th>${year} доля</th>
        <th>${year - 1} выручка</th>
        <th>${year - 1} доля</th>
        <th>Δ доли (п.п.)</th>
      </tr>
  `;

  const cats = Array.from(catsSet);
  cats.forEach(cat => {
    const revThis = (thisRows.find(r => r.category === cat)?.total_revenue) || 0;
    const revPrev = mapPrev.get(cat) || 0;
    const shareThis = totalThis ? (revThis / totalThis) * 100 : 0;
    const sharePrev = totalPrev ? (revPrev / totalPrev) * 100 : 0;
    const diff = shareThis - sharePrev;

    html += `
      <tr>
        <td>${cat}</td>
        <td>${revThis.toLocaleString()} ₽</td>
        <td>${shareThis.toFixed(1)}%</td>
        <td>${revPrev.toLocaleString()} ₽</td>
        <td>${sharePrev.toFixed(1)}%</td>
        <td>${diff.toFixed(1)} п.п.</td>
      </tr>
    `;
  });

  html += "</table>";
  document.getElementById("categoryShares").innerHTML = html;
}

// ---------- СРАВНЕНИЕ С ПРОШЛЫМ ГОДОМ ----------

async function loadCompareLastYear(year, month) {
  const thisRows = await (await fetch(
    `/api/month-stats?year=${year}&month=${month}`
  )).json();
  const prevRows = await (await fetch(
    `/api/month-stats?year=${year - 1}&month=${month}`
  )).json();

  const tRev = thisRows.reduce((s, r) => s + (r.revenue || 0), 0);
  const tGuests = thisRows.reduce((s, r) => s + (r.guests || 0), 0);
  const tChecks = thisRows.reduce((s, r) => s + (r.checks || 0), 0);

  const pRev = prevRows.reduce((s, r) => s + (r.revenue || 0), 0);
  const pGuests = prevRows.reduce((s, r) => s + (r.guests || 0), 0);
  const pChecks = prevRows.reduce((s, r) => s + (r.checks || 0), 0);

  const avgThis = tChecks ? tRev / tChecks : 0;
  const avgPrev = pChecks ? pRev / pChecks : 0;

  document.getElementById("compareLastYear").innerHTML = `
    <p>Выручка: <b>${tRev.toLocaleString()} ₽</b> / ${pRev.toLocaleString()} ₽</p>
    <p>Гости: <b>${tGuests}</b> / ${pGuests}</p>
    <p>Чеки: <b>${tChecks}</b> / ${pChecks}</p>
    <p>Средний чек: <b>${Math.round(avgThis)} ₽</b> / ${Math.round(avgPrev)} ₽</p>
  `;
}

// ---------- МЕТРИКИ ОФИЦИАНТОВ ----------

async function loadWaitersMetrics(period, year, month, waiterName = "") {
  function getRange(period) {
    const y = year;
    const m = month;
    let start, end;

    if (period === "w1") {
      start = `${y}-${pad(m)}-01`;
      end = `${y}-${pad(m)}-07`;
    } else if (period === "w2") {
      start = `${y}-${pad(m)}-08`;
      end = `${y}-${pad(m)}-14`;
    } else if (period === "w3") {
      start = `${y}-${pad(m)}-15`;
      end = `${y}-${pad(m)}-21`;
    } else if (period === "w4") {
      start = `${y}-${pad(m)}-22`;
      end = `${y}-${pad(m)}-28`;
    } else if (period === "w5") {
      start = `${y}-${pad(m)}-29`;
      end = `${y}-${pad(m)}-31`;
    } else {
      const lastDay = new Date(y, m, 0).getDate();
      start = `${y}-${pad(m)}-01`;
      end = `${y}-${pad(m)}-${pad(lastDay)}`;
    }
    return { start, end };
  }

  const { start, end } = getRange(period);

  const qs = new URLSearchParams({
    start,
    end,
    waiter: waiterName || ""
  });

  const res = await fetch(`/api/waiters?${qs.toString()}`);
  const rows = await res.json();

  let html = `
    <table>
      <tr>
        <th>Официант</th>
        <th>Выручка</th>
        <th>Гости</th>
        <th>Чеки</th>
        <th>Блюда</th>
        <th>Ср. чек</th>
        <th>Выручка/гостя</th>
        <th>Блюда/чек</th>
        <th>Блюда/гостя</th>
        <th>Наполняемость</th>
      </tr>
  `;

  rows.forEach(r => {
    const avgCheck = r.average_check || 0;
    const revPerGuest = r.total_guests
      ? r.total_revenue / r.total_guests
      : 0;
    const dishesPerCheck = r.total_checks
      ? r.total_dishes / r.total_checks
      : 0;
    const dishesPerGuest = r.total_guests
      ? r.total_dishes / r.total_guests
      : 0;

    html += `
      <tr>
        <td>${r.waiter}</td>
        <td>${(r.total_revenue || 0).toLocaleString()} ₽</td>
        <td>${r.total_guests || 0}</td>
        <td>${r.total_checks || 0}</td>
        <td>${r.total_dishes || 0}</td>
        <td>${Math.round(avgCheck)} ₽</td>
        <td>${Math.round(revPerGuest)} ₽</td>
        <td>${dishesPerCheck.toFixed(2)}</td>
        <td>${dishesPerGuest.toFixed(2)}</td>
        <td>${(r.fill || 0).toFixed(2)}</td>
      </tr>
    `;
  });

  html += "</table>";
  document.getElementById("waiterStats").innerHTML = html;

  const ratingsDiv = document.getElementById("waiterRatings");
  if (!ratingsDiv) return;

  if (!waiterName && rows.length > 0) {
    const byAvgCheck = [...rows].sort(
      (a, b) => (b.average_check || 0) - (a.average_check || 0)
    );
    const byFill = [...rows].sort((a, b) => (b.fill || 0) - (a.fill || 0));

    const top3Check = byAvgCheck.slice(0, 3);
    const bot3Check = byAvgCheck.slice(-3).reverse();
    const top3Fill = byFill.slice(0, 3);
    const bot3Fill = byFill.slice(-3).reverse();

    let txt = "<h3>Рейтинги официантов</h3>";

    txt += "<p><b>TOP-3 по среднему чеку:</b><br>";
    top3Check.forEach(r => {
      txt += `${r.waiter}: ${Math.round(r.average_check || 0)} ₽<br>`;
    });
    txt += "</p>";

    txt += "<p><b>BOTTOM-3 по среднему чеку:</b><br>";
    bot3Check.forEach(r => {
      txt += `${r.waiter}: ${Math.round(r.average_check || 0)} ₽<br>`;
    });
    txt += "</p>";

    txt += "<p><b>TOP-3 по наполняемости:</b><br>";
    top3Fill.forEach(r => {
      txt += `${r.waiter}: ${(r.fill || 0).toFixed(2)}<br>`;
    });
    txt += "</p>";

    txt += "<p><b>BOTTOM-3 по наполняемости:</b><br>";
    bot3Fill.forEach(r => {
      txt += `${r.waiter}: ${(r.fill || 0).toFixed(2)}<br>`;
    });
    txt += "</p>";

    ratingsDiv.innerHTML = txt;
  } else {
    ratingsDiv.innerHTML = "";
  }
}

// ---------- ИНИЦИАЛИЗАЦИЯ ----------

document.addEventListener("DOMContentLoaded", () => {
  let { year, month } = getCurrentYearMonth();

  const dayForm = document.getElementById("dayForm");
  const waiterForm = document.getElementById("waiterForm");
  const dayDateInput = document.getElementById("dayDate");
  const waiterDateInput = document.getElementById("waiterDate");

  if (dayDateInput && waiterDateInput) {
    dayDateInput.addEventListener("change", e => {
      const d = e.target.value;
      waiterDateInput.value = d;
      loadDayData(d);
    });

    waiterDateInput.addEventListener("change", e => {
      const d = e.target.value;
      dayDateInput.value = d;
      loadDayData(d);
    });
  }

  if (dayForm) {
    dayForm.addEventListener("submit", async e => {
      e.preventDefault();

      const body = {
        date: dayDateInput.value,
        revenue: +document.getElementById("dayRevenue").value,
        guests: +document.getElementById("dayGuests").value,
        checks: +document.getElementById("dayChecks").value
      };

      await fetch("/api/add-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      document.getElementById("dayRevenue").value = "";
      document.getElementById("dayGuests").value = "";
      document.getElementById("dayChecks").value = "";
    });
  }

  if (waiterForm) {
    (async () => {
      const container = document.getElementById("waiterRows");
      if (container && container.children.length === 0) {
        await addWaiterRow();
      }
    })();

    const addBtn = document.getElementById("addWaiterRow");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        addWaiterRow();
      });
    }

    const removeBtn = document.getElementById("removeWaiterRow");
    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        removeLastWaiterRow();
      });
    }

    waiterForm.addEventListener("submit", async e => {
      e.preventDefault();

      const date = waiterDateInput.value;
      const rows = document.querySelectorAll(".waiter-row");

      await fetch("/api/delete-waiters-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date })
      });

      for (const row of rows) {
        const newName = row.querySelector(".waiterNameNew").value.trim();
        const selName = row.querySelector(".waiterName").value;
        const waiter = newName !== "" ? newName : selName;

        const revenue = +row.querySelector(".waiterRevenue").value;
        const guests = +row.querySelector(".waiterGuests").value;
        const checks = +row.querySelector(".waiterChecks").value;
        const dishes = +row.querySelector(".waiterDishes").value;

        await fetch("/api/add-waiter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, waiter, revenue, guests, checks, dishes })
        });
      }

      const container = document.getElementById("waiterRows");
      if (container) {
        container.innerHTML = "";
        addWaiterRow();
      }

      waiterList = [];
    });
  }

  if (document.getElementById("weeklyPlan")) {
    const reportMonthInput = document.getElementById("reportMonth");
    if (reportMonthInput) {
      reportMonthInput.value = `${year}-${pad(month)}`;
    }

    const waiterFilterSelect = document.getElementById("waiterFilter");
    (async () => {
      await ensureWaitersList();
      if (waiterFilterSelect) {
        waiterFilterSelect.innerHTML =
          '<option value="">Все</option>' +
          waiterList
            .map(w => `<option value="${w.name}">${w.name}</option>`)
            .join("");
      }
    })();

    async function reloadReports() {
      await loadPlan(year, month);
      await loadForecast(year, month);
      await loadWeeklyPlan(year, month);
      await loadWeekdayStats(year, month);
      await loadCategoryShares(year, month);
      await loadCompareLastYear(year, month);

      const periodSelect = document.getElementById("waiterPeriod");
      const filterSelect = document.getElementById("waiterFilter");
      const period = periodSelect ? periodSelect.value : "w1";
      const waiterName = filterSelect ? filterSelect.value : "";
      await loadWaitersMetrics(period, year, month, waiterName);
    }

    reloadReports();

    const reportMonthInput2 = document.getElementById("reportMonth");
    if (reportMonthInput2) {
      reportMonthInput2.addEventListener("change", e => {
        const val = e.target.value;
        if (val) {
          const [yStr, mStr] = val.split("-");
          year = Number(yStr);
          month = Number(mStr);
          reloadReports();
        }
      });
    }

    const periodSelect = document.getElementById("waiterPeriod");
    if (periodSelect) {
      periodSelect.addEventListener("change", () => {
        const filterSelect = document.getElementById("waiterFilter");
        const waiterName = filterSelect ? filterSelect.value : "";
        loadWaitersMetrics(periodSelect.value, year, month, waiterName);
      });
    }

    if (waiterFilterSelect) {
      waiterFilterSelect.addEventListener("change", () => {
        const periodSelect = document.getElementById("waiterPeriod");
        const period = periodSelect ? periodSelect.value : "w1";
        loadWaitersMetrics(period, year, month, waiterFilterSelect.value);
      });
    }

    const exportBtn = document.getElementById("exportWaitersCsv");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        const periodSelect = document.getElementById("waiterPeriod");
        const filterSelect = document.getElementById("waiterFilter");
        const period = periodSelect ? periodSelect.value : "w1";
        const waiterName = filterSelect ? filterSelect.value : "";

        function getRange(period) {
          const y = year;
          const m = month;
          let start, end;

          if (period === "w1") {
            start = `${y}-${pad(m)}-01`;
            end = `${y}-${pad(m)}-07`;
          } else if (period === "w2") {
            start = `${y}-${pad(m)}-08`;
            end = `${y}-${pad(m)}-14`;
          } else if (period === "w3") {
            start = `${y}-${pad(m)}-15`;
            end = `${y}-${pad(m)}-21`;
          } else if (period === "w4") {
            start = `${y}-${pad(m)}-22`;
            end = `${y}-${pad(m)}-28`;
          } else if (period === "w5") {
            start = `${y}-${pad(m)}-29`;
            end = `${y}-${pad(m)}-31`;
          } else {
            const lastDay = new Date(y, m, 0).getDate();
            start = `${y}-${pad(m)}-01`;
            end = `${y}-${pad(m)}-${pad(lastDay)}`;
          }
          return { start, end };
        }

        const { start, end } = getRange(period);

        const qs = new URLSearchParams({
          start,
          end,
          waiter: waiterName || "",
          year: String(year),
          month: String(month),
          period
        });

        window.open(`/api/waiters-export?${qs.toString()}`, "_blank");
      });
    }

    const planForm = document.getElementById("planForm");
    if (planForm) {
      planForm.addEventListener("submit", async e => {
        e.preventDefault();
        const val = +document.getElementById("planValue").value;

        await fetch("/api/save-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ year, month, plan: val })
        });

        reloadReports();
      });
    }
  }
});
