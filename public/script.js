const tbody = document.querySelector("#waitersTable tbody");
const addBtn = document.getElementById("addWaiter");
const saveBtn = document.getElementById("saveWaiters");
const status = document.getElementById("status");

// === Добавление строки официанта ===
if (addBtn) {
  addBtn.onclick = () => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" class="name" required></td>
      <td><input type="number" class="revenue" required></td>
      <td><input type="number" class="guests" required></td>
      <td><input type="number" class="checks" required></td>
      <td><input type="number" class="dishes" required></td>
      <td><button type="button" class="remove">✖</button></td>
    `;
    tr.querySelector(".remove").onclick = () => tr.remove();
    tbody.appendChild(tr);
  };
}

// === Сохранение официантов ===
if (saveBtn) {
  saveBtn.onclick = async () => {
    const date = document.getElementById("date").value;
    if (!date) return alert("Сначала укажите дату!");

    const rows = [...tbody.querySelectorAll("tr")];
    const waiters = rows.map(r => ({
      name: r.querySelector(".name").value,
      revenue: parseFloat(r.querySelector(".revenue").value),
      guests: parseInt(r.querySelector(".guests").value),
      checks: parseInt(r.querySelector(".checks").value),
      dishes: parseInt(r.querySelector(".dishes").value)
    }));

    const res = await fetch("/add-waiters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, waiters })
    });

    const out = await res.json();
    status.textContent = out.success ? "✅ Официанты сохранены" : "❌ Ошибка";
  };
}

// === Сохранение общих данных ===
const generalForm = document.getElementById("generalForm");
if (generalForm) {
  generalForm.onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
      date: document.getElementById("date").value,
      revenue: parseFloat(document.getElementById("revenue").value),
      guests: parseInt(document.getElementById("guests").value),
      checks: parseInt(document.getElementById("checks").value),
    };
    const res = await fetch("/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const out = await res.json();
    status.textContent = out.success ? "✅ Общие данные сохранены" : "❌ Ошибка";
  };
}
