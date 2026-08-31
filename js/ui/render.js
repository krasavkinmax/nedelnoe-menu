import {
  familyTargets,
  MEAL_SLOTS,
  MEAL_LABELS,
  MONTH_NAMES,
  ACTIVITY_LABELS,
  DISLIKE_OPTIONS,
  MEAL_SCALE,
} from "../data/family.js";
import { recipeNutrition, recipeCost, roundNutrition, scaleNutrition } from "../engine/nutrition.js";
import { buildShoppingList, formatRub } from "../engine/shopping.js";

export function render(root, state, actions) {
  const targets = familyTargets(state.settings.activity);
  const monthName = MONTH_NAMES[state.settings.month - 1];
  root.innerHTML = `
    <header class="topbar">
      <div>
        <p class="eyebrow">Республика Башкортостан · ${monthName}</p>
        <h1>Меню на неделю для семьи</h1>
        <p class="lede">Сбалансированный рацион на троих: общие блюда и адаптированная порция для ребёнка 1,5 лет. Сезонные продукты и башкирская/татарская кухня.</p>
        <div class="family-row">
          ${targets.members
            .map(
              (m) =>
                `<span class="chip"><strong>${m.name}</strong> · ${m.age} · ${m.kcal} ккал</span>`
            )
            .join("")}
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-primary" data-act="generate">Составить меню</button>
        ${state.week ? `<button class="btn btn-ghost" data-act="generate">Пересобрать неделю</button>` : ""}
      </div>
    </header>

    <nav class="tabs">
      <button class="tab ${state.tab === "menu" ? "active" : ""}" data-tab="menu">Меню</button>
      <button class="tab ${state.tab === "shop" ? "active" : ""}" data-tab="shop">Покупки</button>
      <button class="tab ${state.tab === "settings" ? "active" : ""}" data-tab="settings">Настройки</button>
    </nav>

    ${state.toast ? `<div class="replace-toast">${escapeHtml(state.toast)}</div>` : ""}
    ${state.tab === "menu" ? renderMenu(state, targets) : ""}
    ${state.tab === "shop" ? renderShop(state) : ""}
    ${state.tab === "settings" ? renderSettings(state) : ""}

    <p class="disclaimer">Меню носит ознакомительный характер и не заменяет консультацию педиатра или врача. Нормы ккал — ориентир по МР 2.3.1.0253-21 (активность можно сменить в настройках). Цены — оценка по Уфе/Стерлитамаку, не чек из магазина.</p>
  `;

  root.querySelectorAll("[data-act='generate']").forEach((el) => {
    el.addEventListener("click", () => actions.generate());
  });
  root.querySelectorAll("[data-tab]").forEach((el) => {
    el.addEventListener("click", () => actions.setTab(el.getAttribute("data-tab")));
  });
  root.querySelectorAll("[data-replace]").forEach((el) => {
    el.addEventListener("click", () => {
      actions.replace(+el.dataset.day, el.dataset.slot, el.dataset.replace);
    });
  });
  root.querySelectorAll("[data-shop]").forEach((el) => {
    el.addEventListener("change", () => actions.toggleShop(el.dataset.shop));
  });
  root.querySelectorAll("[data-activity]").forEach((el) => {
    el.addEventListener("click", () => actions.setActivity(el.dataset.activity));
  });
  root.querySelectorAll("[data-local]").forEach((el) => {
    el.addEventListener("click", () => actions.setPreferLocal(el.dataset.local === "1"));
  });
  root.querySelectorAll("[data-month]").forEach((el) => {
    el.addEventListener("change", () => actions.setMonth(+el.value));
  });
  root.querySelectorAll("[data-dislike]").forEach((el) => {
    el.addEventListener("change", () => actions.toggleDislike(el.dataset.dislike));
  });
}

function renderMenu(state, targets) {
  if (!state.week) {
    return `
      <section class="empty">
        <h2>Неделя ещё не собрана</h2>
        <p>Нажмите «Составить меню» — алгоритм подберёт 7 дней с рыбой, бобовыми, кисломолочным и сезонными блюдами.</p>
        <button class="btn btn-primary" data-act="generate">Составить меню</button>
      </section>
    `;
  }

  const week = state.week;
  return `
    <section class="week">
      ${week.days.map(renderDay).join("")}
    </section>
    <section class="totals">
      <h2>Итоги недели</h2>
      ${renderBars(week.weekTotals, {
        kcal: targets.family.kcal * 7,
        p: targets.family.p * 7,
        f: targets.family.f * 7,
        c: targets.family.c * 7,
      })}
    </section>
  `;
}

function renderDay(day) {
  const t = day.target;
  const kcalOk = day.totals.kcal >= t.kcal * 0.9 && day.totals.kcal <= t.kcal * 1.1;
  return `
    <article class="day">
      <div class="day-head">
        <h2>${day.weekday}</h2>
        <div class="day-kcal">${day.totals.kcal} / ${t.kcal} ккал${kcalOk ? "" : " · вне коридора"}</div>
        <div class="track day-track"><div class="fill ${kcalOk ? "" : "warn"}" style="width:${Math.min(100, Math.round((day.totals.kcal / t.kcal) * 100))}%"></div></div>
      </div>
      ${MEAL_SLOTS.map((slot) => renderMeal(day, slot)).join("")}
    </article>
  `;
}

function renderMeal(day, slot) {
  const recipe = day.meals[slot];
  if (!recipe) return "";
  const n = roundNutrition(scaleNutrition(recipeNutrition(recipe), MEAL_SCALE[recipe.meal] ?? 1));
  const cost = recipeCost(recipe);
  const local = recipe.cuisine === "bashkir" || recipe.cuisine === "tatar";
  const cuisineLabel = { bashkir: "башкирское", tatar: "татарское", ru: "домашнее" }[recipe.cuisine];
  return `
    <div class="meal">
      <div class="meal-label">${MEAL_LABELS[slot]}</div>
      <p class="meal-title">${escapeHtml(recipe.title)}</p>
      <div class="meal-meta">
        <span class="tag">${n.kcal} ккал / порция</span>
        <span class="tag">${Math.round(n.p)} б · ${Math.round(n.f)} ж · ${Math.round(n.c)} у</span>
        <span class="tag">${recipe.minutes} мин</span>
        <span class="tag">${formatRub(cost)}</span>
        <span class="tag ${local ? "local" : ""}">${cuisineLabel}</span>
      </div>
      <p class="child-note"><strong>Для ребёнка:</strong> ${escapeHtml(recipe.childNote)}</p>
      <div class="meal-actions">
        <button class="mini" data-replace="any" data-day="${day.index}" data-slot="${slot}">Заменить</button>
        <button class="mini" data-replace="cheaper" data-day="${day.index}" data-slot="${slot}">Дешевле</button>
      </div>
    </div>
  `;
}

function renderBars(actual, target) {
  const rows = [
    ["ккал", actual.kcal, target.kcal],
    ["белки, г", actual.p, target.p],
    ["жиры, г", actual.f, target.f],
    ["углеводы, г", actual.c, target.c],
  ];
  return `<div class="bars">${rows
    .map(([label, a, t]) => {
      const pct = Math.min(120, (a / t) * 100);
      const warn = a < t * 0.9 || a > t * 1.1;
      return `
        <div class="bar-row">
          <div>${label}</div>
          <div class="track"><div class="fill ${warn ? "warn" : ""}" style="width:${pct}%"></div></div>
          <div>${Math.round(a)} / ${Math.round(t)}</div>
        </div>`;
    })
    .join("")}</div>`;
}

function renderShop(state) {
  if (!state.week) {
    return `<section class="empty"><h2>Сначала соберите меню</h2><p>Список покупок появится после генерации недели.</p></section>`;
  }
  const list = buildShoppingList(state.week);
  return `
    <section class="totals shop">
      <div class="shop-head">
        <h2>Список покупок на неделю</h2>
        <div class="price-xl">${formatRub(list.total)}</div>
      </div>
      <p class="lede">Оценка по средним ценам Уфы и Стерлитамака. Порции: двое взрослых и ребёнок (0,4 взрослой порции).</p>
      ${list.groups
        .map(
          (g) => `
        <div class="shop-group">
          <h3>${g.label}</h3>
          ${g.items
            .map((item) => {
              const checked = Boolean(state.shopChecked[item.productId]);
              return `
                <label class="shop-item ${checked ? "done" : ""}">
                  <input type="checkbox" data-shop="${item.productId}" ${checked ? "checked" : ""} />
                  <span>${escapeHtml(item.name)}</span>
                  <span>${item.display}</span>
                  <strong>${formatRub(item.price)}</strong>
                </label>`;
            })
            .join("")}
        </div>`
        )
        .join("")}
    </section>
  `;
}

function renderSettings(state) {
  const s = state.settings;
  return `
    <section class="settings">
      <h2>Настройки рациона</h2>
      <p class="lede">После смены настроек нажмите «Составить меню», чтобы пересобрать неделю.</p>
      <div class="field">
        <label>Активность взрослых</label>
        <div class="seg">
          ${Object.entries(ACTIVITY_LABELS)
            .map(
              ([id, label]) =>
                `<button type="button" data-activity="${id}" class="${s.activity === id ? "on" : ""}">${label}</button>`
            )
            .join("")}
        </div>
      </div>
      <div class="field">
        <label>Местная кухня</label>
        <div class="seg">
          <button type="button" data-local="1" class="${s.preferLocal ? "on" : ""}">Больше башкирских и татарских блюд</button>
          <button type="button" data-local="0" class="${!s.preferLocal ? "on" : ""}">Нейтрально</button>
        </div>
      </div>
      <div class="field">
        <label>Месяц сезона</label>
        <select data-month>
          ${MONTH_NAMES.map(
            (name, i) =>
              `<option value="${i + 1}" ${s.month === i + 1 ? "selected" : ""}>${name}</option>`
          ).join("")}
        </select>
      </div>
      <div class="field">
        <label>Не любим / не берём</label>
        <div class="check-grid">
          ${DISLIKE_OPTIONS.map((opt) => {
            const on = s.disliked.includes(opt.id);
            return `<label><input type="checkbox" data-dislike="${opt.id}" ${on ? "checked" : ""} /> ${opt.label}</label>`;
          }).join("")}
        </div>
      </div>
    </section>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
