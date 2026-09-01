import {
  familyTargets,
  MEAL_SLOTS,
  MEAL_LABELS,
  MONTH_NAMES,
  ACTIVITY_LABELS,
  DISLIKE_OPTIONS,
  MEAL_SCALE,
  WEEKDAY_SHORT,
  portionsFor,
  leftoverPairLabel,
  isSkipped,
  cookSessionsCount,
  cookSessionsHint,
  isCookDay,
  cookSessionForDay,
} from "../data/family.js";
import { PRODUCTS } from "../data/products.js";
import { RECIPE_STEPS } from "../data/recipe-steps.js";
import { RECIPE_LORE } from "../data/recipe-lore.js";
import { adultOnlyNames } from "../data/recipes.js";
import { listReplaceOptions } from "../engine/generator.js";
import { renderReportInner } from "../engine/report.js";
import { APP_VERSION } from "../version.js";
import { recipeNutrition, recipeCost, roundNutrition, scaleNutrition } from "../engine/nutrition.js";
import { buildShoppingList, formatRub } from "../engine/shopping.js";
import { buildSessionPlan } from "../engine/cook.js";

export function render(root, state, actions) {
  const targets = familyTargets(state.settings.activity);
  document.body.classList.toggle("has-report", Boolean(state.reportOpen));
  const monthName = MONTH_NAMES[state.settings.month - 1];
  root.innerHTML = `
    <header class="topbar">
      <div>
        <p class="eyebrow">Республика Башкортостан · ${monthName}</p>
        <h1>Меню на неделю для семьи</h1>
        <p class="app-version">Версия ${APP_VERSION}</p>
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
        ${state.week ? `<button class="btn btn-ghost" data-act="export">Отчёт</button>` : ""}
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
    ${state.replaceOpen ? renderReplaceSheet(state) : ""}
    ${state.recipeOpen ? renderRecipeSheet(state) : ""}
    ${state.recipeOpen && state.loreOpen ? renderLoreSheet(state) : ""}
    ${state.reportOpen ? renderReport(state) : ""}

    <p class="disclaimer">Меню носит ознакомительный характер и не заменяет консультацию педиатра или врача. Нормы ккал — ориентир по МР 2.3.1.0253-21 (активность можно сменить в настройках). Цены — оценка по Уфе/Стерлитамаку, средний чек недели около 7 000 ₽. Ингредиенты со знаком * — только для взрослых. Креветки исключены всегда: аллергия у дочери.</p>
  `;

  root.querySelectorAll("[data-act='generate']").forEach((el) => {
    el.addEventListener("click", () => actions.generate());
  });
  root.querySelectorAll("[data-act='export']").forEach((el) => {
    el.addEventListener("click", () => actions.openReport());
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
  root.querySelectorAll("[data-like]").forEach((el) => {
    el.addEventListener("change", () => actions.toggleLike(el.dataset.like));
  });
  root.querySelectorAll("[data-select-day]").forEach((el) => {
    el.addEventListener("click", () => actions.setDay(+el.dataset.selectDay));
  });
  root.querySelectorAll("[data-recipe]").forEach((el) => {
    el.addEventListener("click", () => actions.openRecipe(+el.dataset.recipeDay, el.dataset.recipe));
  });
  root.querySelectorAll("[data-close-recipe]").forEach((el) => {
    el.addEventListener("click", () => actions.closeRecipe());
  });
  root.querySelectorAll("[data-open-lore]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      actions.openLore();
    });
  });
  root.querySelectorAll("[data-close-lore]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      actions.closeLore();
    });
  });
  root.querySelectorAll("[data-skip]").forEach((el) => {
    el.addEventListener("click", () => actions.skip(+el.dataset.day, el.dataset.skip));
  });
  root.querySelectorAll("[data-restore]").forEach((el) => {
    el.addEventListener("click", () => actions.restore(+el.dataset.day, el.dataset.restore));
  });
  root.querySelectorAll("[data-close-replace]").forEach((el) => {
    el.addEventListener("click", () => actions.closeReplace());
  });
  root.querySelectorAll("[data-pick-recipe]").forEach((el) => {
    el.addEventListener("click", () => actions.pickReplace(el.dataset.pickRecipe));
  });
  const replaceInput = root.querySelector("[data-replace-query]");
  if (replaceInput) {
    replaceInput.addEventListener("input", () => actions.setReplaceQuery(replaceInput.value));
    if (state.replaceFocus) {
      replaceInput.focus();
      const pos = replaceInput.value.length;
      replaceInput.setSelectionRange(pos, pos);
    }
  }
  root.querySelectorAll("[data-close-report]").forEach((el) => {
    el.addEventListener("click", () => actions.closeReport());
  });
  root.querySelectorAll("[data-print-report]").forEach((el) => {
    el.addEventListener("click", () => actions.printReport());
  });
  root.querySelectorAll("[data-share-report]").forEach((el) => {
    el.addEventListener("click", () => actions.shareReport());
  });
  root.querySelectorAll("[data-html-report]").forEach((el) => {
    el.addEventListener("click", () => actions.downloadReportHtml());
  });
  root.querySelectorAll("[data-pdf-report]").forEach((el) => {
    el.addEventListener("click", () => actions.exportPdf());
  });
  root.querySelectorAll("[data-sessions]").forEach((el) => {
    el.addEventListener("click", () => actions.setCookSessions(el.dataset.sessions));
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
  const idx = Math.min(Math.max(state.selectedDay ?? 0, 0), 6);
  const day = week.days[idx];
  return `
    <nav class="day-nav" aria-label="Дни недели">
      ${week.days
        .map((d, i) => {
          const sessions = cookSessionsCount(state.settings);
          const cook = sessions && isCookDay(i, state.settings);
          const leftover = sessions && !cook;
          const lunch = !isSkipped(week, i, "lunch") ? d.meals.lunch?.title : "";
          const first = lunch || (!isSkipped(week, i, "breakfast") ? d.meals.breakfast?.title : "") || "меню";
          const hint = leftover ? "остатки" : shortTitle(first);
          return `<button type="button" class="day-pill ${i === idx ? "on" : ""} ${cook ? "cook-day" : ""} ${leftover ? "leftover-day" : ""}" data-select-day="${i}">
            <span class="day-pill-name">${WEEKDAY_SHORT[i]}</span>
            <span class="day-pill-hint">${escapeHtml(hint)}</span>
          </button>`;
        })
        .join("")}
    </nav>
    ${renderDay(day, state)}
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

function shortTitle(title) {
  if (!title) return "меню";
  return title.length > 18 ? `${title.slice(0, 16)}…` : title;
}

function renderDay(day, state) {
  const t = day.target;
  const kcalOk = day.totals.kcal >= t.kcal * 0.9 && day.totals.kcal <= t.kcal * 1.1;
  return `
    <article class="day day-full">
      <div class="day-head">
        <h2>${day.weekday}</h2>
        <div class="day-kcal">${day.totals.kcal} / ${t.kcal} ккал${kcalOk ? "" : " · вне коридора"}</div>
        <div class="track day-track"><div class="fill ${kcalOk ? "" : "warn"}" style="width:${Math.min(100, Math.round((day.totals.kcal / t.kcal) * 100))}%"></div></div>
      </div>
      ${renderCookSession(day, state)}
      ${MEAL_SLOTS.map((slot) => renderMeal(day, slot, state)).join("")}
    </article>
  `;
}

function renderCookSession(day, state) {
  if (!cookSessionsCount(state.settings) || !isCookDay(day.index, state.settings)) return "";
  const group = cookSessionForDay(day.index, state.settings);
  const lunch = day.meals.lunch;
  const dinner = day.meals.dinner;
  if (!lunch || !dinner || !group) return "";
  const plan = buildSessionPlan(lunch, dinner, group.length);
  const label = leftoverPairLabel(day.index, state.settings);
  return `
    <div class="cook-session">
      <p class="cook-session-title">Сессия готовки · на ${escapeHtml(label)} · ~${plan.wallMinutes} мин у плиты</p>
      <ol class="cook-session-steps">
        ${plan.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}
      </ol>
    </div>
  `;
}

function renderMeal(day, slot, state) {
  const recipe = day.meals[slot];
  if (!recipe) return "";
  if (isSkipped(state.week, day.index, slot)) {
    return `
      <div class="meal meal-skipped">
        <div class="meal-label">${MEAL_LABELS[slot]}</div>
        <p class="meal-title">Убрано из этого дня</p>
        <p class="lede">Покупки пересчитаны без этого блюда.</p>
        <div class="meal-actions">
          <button class="mini mini-primary" data-restore="${slot}" data-day="${day.index}">Вернуть блюдо</button>
        </div>
      </div>
    `;
  }
  const n = roundNutrition(scaleNutrition(recipeNutrition(recipe), MEAL_SCALE[recipe.meal] ?? 1));
  const cost = recipeCost(recipe);
  const local = recipe.cuisine === "bashkir" || recipe.cuisine === "tatar";
  const cuisineLabel = { bashkir: "башкирское", tatar: "татарское", ru: "домашнее" }[recipe.cuisine];
  const leftover =
    (slot === "lunch" || slot === "dinner") && cookSessionsCount(state.settings)
      ? leftoverPairLabel(day.index, state.settings)
      : "";
  const leftoverKind =
    leftover && !isCookDay(day.index, state.settings) ? "остатки" : leftover ? "готовим" : "";
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
        ${recipe.soup ? `<span class="tag soup">суп</span>` : ""}
        ${leftover ? `<span class="tag leftover">${leftoverKind} ${leftover}</span>` : ""}
      </div>
      <p class="child-note"><strong>Для ребёнка:</strong> ${escapeHtml(recipe.childNote)}</p>
      <div class="meal-actions">
        <button class="mini mini-primary" data-recipe="${slot}" data-recipe-day="${day.index}">Рецепт</button>
        <button class="mini" data-replace="any" data-day="${day.index}" data-slot="${slot}">Заменить</button>
        <button class="mini" data-replace="cheaper" data-day="${day.index}" data-slot="${slot}">Дешевле</button>
        <button class="mini" data-skip="${slot}" data-day="${day.index}">Убрать</button>
      </div>
    </div>
  `;
}

function renderRecipeSheet(state) {
  const { dayIndex, slot } = state.recipeOpen;
  const recipe = state.week?.days[dayIndex]?.meals[slot];
  if (!recipe) return "";
  const steps = RECIPE_STEPS[recipe.id] || ["Подробный рецепт для этого блюда скоро появится."];
  const scale = portionsFor(recipe);
  const adultNames = adultOnlyNames(recipe, PRODUCTS);
  const ingredients = recipe.ingredients
    .map((ing) => {
      const prod = PRODUCTS[ing.productId];
      if (!prod) return "";
      const grams = Math.round(ing.grams * scale);
      const star = ing.adultOnly ? ` <span class="ing-star">*</span>` : "";
      return `<li><span>${escapeHtml(prod.name)}${star}</span><strong>${grams} г</strong></li>`;
    })
    .join("");
  return `
    <div class="sheet-backdrop" data-close-recipe="1"></div>
    <aside class="sheet" role="dialog" aria-label="Рецепт">
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <div>
          <p class="meal-label">${MEAL_LABELS[slot]} · ${state.week.days[dayIndex].weekday}</p>
          <h2>${escapeHtml(recipe.title)}</h2>
          <p class="sheet-meta">${recipe.minutes} мин · на семью из трёх человек</p>
        </div>
        <div class="sheet-head-actions">
          <button type="button" class="mini mini-primary" data-open-lore="1">Справка</button>
          <button type="button" class="sheet-close" data-close-recipe="1" aria-label="Закрыть">×</button>
        </div>
      </div>
      <p class="child-note"><strong>Для ребёнка:</strong> ${escapeHtml(recipe.childNote)}</p>
      <h3>Ингредиенты</h3>
      <ul class="ing-list">${ingredients}</ul>
      ${
        adultNames.length
          ? `<p class="ing-note">* только для взрослых, в детскую тарелку не кладём: ${escapeHtml(adultNames.join(", "))}.</p>`
          : ""
      }
      <h3>Как приготовить</h3>
      <ol class="steps">
        ${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}
      </ol>
    </aside>
  `;
}

function renderLoreSheet(state) {
  const { dayIndex, slot } = state.recipeOpen;
  const recipe = state.week?.days[dayIndex]?.meals[slot];
  if (!recipe) return "";
  const lore = RECIPE_LORE[recipe.id] || {
    description: "Домашнее блюдо семейного стола.",
    history: "Краткая историческая справка для этого рецепта пока не собрана.",
  };
  const adultNames = adultOnlyNames(recipe, PRODUCTS);
  return `
    <div class="sheet-backdrop lore-backdrop" data-close-lore="1"></div>
    <aside class="sheet lore-sheet" role="dialog" aria-label="Справка о блюде">
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <div>
          <p class="meal-label">Справка</p>
          <h2>${escapeHtml(recipe.title)}</h2>
        </div>
        <button type="button" class="sheet-close" data-close-lore="1" aria-label="Закрыть справку">×</button>
      </div>
      <h3>О блюде</h3>
      <p class="lore-text">${escapeHtml(lore.description)}</p>
      <h3>Откуда оно</h3>
      <p class="lore-text">${escapeHtml(lore.history)}</p>
      ${
        adultNames.length
          ? `<h3>Что не кладём ребёнку</h3>
             <p class="lore-text">Ингредиенты со знаком * есть в рецепте, но только для взрослых: ${escapeHtml(adultNames.join(", "))}. В детскую тарелку их не добавляем.</p>`
          : ""
      }
    </aside>
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
  const list = buildShoppingList(state.week, state.settings);
  return `
    <section class="totals shop">
      <div class="shop-head">
        <h2>Список покупок на неделю</h2>
        <div class="price-xl">${formatRub(list.total)}</div>
      </div>
      <p class="lede">Оценка по средним ценам Уфы и Стерлитамака, ориентир недели около 7 000 ₽. Порции: двое взрослых и ребёнок (0,4 взрослой порции). Ингредиенты со знаком * тоже в списке — они для взрослых.</p>
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
        <span class="field-title">Активность взрослых</span>
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
        <span class="field-title">Местная кухня</span>
        <div class="seg">
          <button type="button" data-local="1" class="${s.preferLocal ? "on" : ""}">Больше башкирских и татарских блюд</button>
          <button type="button" data-local="0" class="${!s.preferLocal ? "on" : ""}">Нейтрально</button>
        </div>
      </div>
      <div class="field">
        <span class="field-title">Готовка обеда и ужина</span>
        <p class="lede">Основные блюда готовим 2 или 3 раза в неделю, обед и ужин — в одну сессию. Воскресенье всегда из остатков. После смены нажмите «Составить меню».</p>
        <div class="seg">
          <button type="button" data-sessions="0" class="${cookSessionsCount(s) === 0 ? "on" : ""}">Каждый день</button>
          <button type="button" data-sessions="2" class="${cookSessionsCount(s) === 2 ? "on" : ""}">2 раза</button>
          <button type="button" data-sessions="3" class="${cookSessionsCount(s) === 3 ? "on" : ""}">3 раза</button>
        </div>
        ${cookSessionsCount(s) ? `<p class="lede">Сессии: ${cookSessionsHint(s)}.</p>` : ""}
      </div>
      <div class="field">
        <span class="field-title">Месяц сезона</span>
        <select data-month>
          ${MONTH_NAMES.map(
            (name, i) =>
              `<option value="${i + 1}" ${s.month === i + 1 ? "selected" : ""}>${name}</option>`
          ).join("")}
        </select>
      </div>
      <div class="field">
        <span class="field-title">Не любим / не берём</span>
        <p class="lede">Отмеченные продукты не попадут в меню. Креветки выключены всегда — аллергия у дочери.</p>
        <div class="check-grid">
          ${DISLIKE_OPTIONS.map((opt) => {
            const on = opt.locked || s.disliked.includes(opt.id);
            const note = opt.note ? ` <em>(${escapeHtml(opt.note)})</em>` : "";
            return `<label class="${opt.locked ? "locked" : ""}"><input type="checkbox" data-dislike="${opt.id}" ${on ? "checked" : ""} ${opt.locked ? "disabled" : ""} /> ${escapeHtml(opt.label)}${note}</label>`;
          }).join("")}
        </div>
      </div>
      <div class="field">
        <span class="field-title">Любим / берём чаще</span>
        <p class="lede">Эти продукты алгоритм будет подставлять охотнее. Нельзя отметить то, что в запретах.</p>
        <div class="check-grid">
          ${DISLIKE_OPTIONS.filter((opt) => !opt.locked)
            .map((opt) => {
              const blocked = s.disliked.includes(opt.id);
              const on = !blocked && (s.liked || []).includes(opt.id);
              return `<label class="${blocked ? "locked" : ""}"><input type="checkbox" data-like="${opt.id}" ${on ? "checked" : ""} ${blocked ? "disabled" : ""} /> ${escapeHtml(opt.label)}</label>`;
            })
            .join("")}
        </div>
      </div>
    </section>
  `;
}

function renderReplaceSheet(state) {
  const { dayIndex, slot } = state.replaceOpen;
  const current = state.week?.days[dayIndex]?.meals[slot];
  if (!current) return "";
  const q = (state.replaceQuery || "").trim().toLowerCase();
  const options = listReplaceOptions(state.week, dayIndex, slot, state.settings).filter((opt) =>
    q ? opt.recipe.title.toLowerCase().includes(q) : true
  );
  const cuisineLabel = { bashkir: "башкирское", tatar: "татарское", ru: "домашнее" };
  return `
    <div class="sheet-backdrop" data-close-replace="1"></div>
    <aside class="sheet replace-sheet" role="dialog" aria-label="Замена блюда">
      <div class="sheet-handle"></div>
      <div class="sheet-head">
        <div>
          <p class="meal-label">${MEAL_LABELS[slot]} · ${state.week.days[dayIndex].weekday}</p>
          <h2>Заменить блюдо</h2>
          <p class="sheet-meta">Сейчас: ${escapeHtml(current.title)}. Все блюда категории «${MEAL_LABELS[slot]}».</p>
        </div>
        <button type="button" class="sheet-close" data-close-replace="1" aria-label="Закрыть">×</button>
      </div>
      <input type="search" class="replace-search" data-replace-query placeholder="Найти блюдо" value="${escapeHtml(state.replaceQuery || "")}" />
      <div class="pick-list">
        ${
          options.length
            ? options
                .map((opt) => {
                  const r = opt.recipe;
                  const disabled = opt.hasAllergy;
                  const notes = [
                    opt.current ? "сейчас" : "",
                    r.soup ? "суп" : "",
                    opt.cheaper && !opt.current ? "дешевле" : "",
                    !opt.inSeason ? "не сезон" : "",
                    opt.disliked && !opt.hasAllergy ? "в исключениях" : "",
                    opt.preferred ? "любим" : "",
                    opt.sharedPrep ? "общая нарезка" : "",
                    opt.conflict ? "тот же продукт, что в соседнем приёме" : "",
                    opt.hasAllergy ? "аллергия" : "",
                  ].filter(Boolean);
                  return `
                    <button type="button" class="pick-item ${opt.current ? "on" : ""} ${disabled ? "disabled" : ""}" data-pick-recipe="${r.id}" ${disabled ? "disabled" : ""}>
                      <span class="pick-title">${escapeHtml(r.title)}</span>
                      <span class="pick-meta">${r.minutes} мин · ${formatRub(recipeCost(r))} · ${cuisineLabel[r.cuisine] || ""}</span>
                      ${notes.length ? `<span class="pick-notes">${notes.map((n) => `<span class="tag">${escapeHtml(n)}</span>`).join("")}</span>` : ""}
                    </button>`;
                })
                .join("")
            : `<p class="lede">Ничего не найдено.</p>`
        }
      </div>
    </aside>
  `;
}

function renderReport(state) {
  return `
    <div class="report-overlay">
      <div class="report-toolbar">
        <button type="button" class="btn btn-primary" data-print-report>Печать</button>
        <button type="button" class="btn btn-ghost" data-share-report>Поделиться</button>
        <button type="button" class="btn btn-ghost" data-html-report>Скачать HTML</button>
        <button type="button" class="btn btn-ghost" data-pdf-report>PDF</button>
        <button type="button" class="sheet-close" data-close-report aria-label="Закрыть">×</button>
      </div>
      <div class="report-paper">
        ${renderReportInner(state.week, state.settings)}
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
