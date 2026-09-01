import { MEAL_SLOTS, MEAL_LABELS, MONTH_NAMES, leftoverPairLabel, isSkipped, portionsFor, cookSessionsCount, cookSessionsHint, isCookDay, cookSessionForDay } from "../data/family.js";
import { PRODUCTS } from "../data/products.js";
import { RECIPE_STEPS } from "../data/recipe-steps.js";
import { adultOnlyNames } from "../data/recipes.js";
import { buildShoppingList, formatRub } from "./shopping.js";
import { buildSessionPlan } from "./cook.js";

function esc(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildReportModel(week, settings) {
  const month = MONTH_NAMES[(settings.month || 1) - 1];
  const shop = buildShoppingList(week, settings);
  const sessions = cookSessionsCount(settings);
  const days = week.days.map((day) => {
    const meals = [];
    const group = cookSessionForDay(day.index, settings);
    const sessionPlan =
      sessions && isCookDay(day.index, settings) && day.meals.lunch && day.meals.dinner && group
        ? buildSessionPlan(day.meals.lunch, day.meals.dinner, group.length)
        : null;
    for (const slot of MEAL_SLOTS) {
      if (isSkipped(week, day.index, slot)) continue;
      const recipe = day.meals[slot];
      if (!recipe) continue;
      const leftover =
        (slot === "lunch" || slot === "dinner") && sessions
          ? leftoverPairLabel(day.index, settings)
          : "";
      const scale = portionsFor(recipe);
      meals.push({
        slot,
        label: MEAL_LABELS[slot],
        leftover,
        recipe,
        ingredients: recipe.ingredients
          .map((ing) => {
            const prod = PRODUCTS[ing.productId];
            if (!prod) return null;
            return {
              name: prod.name,
              grams: Math.round(ing.grams * scale),
              adultOnly: Boolean(ing.adultOnly),
            };
          })
          .filter(Boolean),
        adultNames: adultOnlyNames(recipe, PRODUCTS),
        steps: RECIPE_STEPS[recipe.id] || [],
      });
    }
    return { weekday: day.weekday, meals, sessionPlan };
  });
  return {
    month,
    twoDays: Boolean(sessions),
    sessionsHint: sessions ? cookSessionsHint(settings) : "",
    shop,
    days,
  };
}

export function renderReportInner(week, settings) {
  const model = buildReportModel(week, settings);
  return `
    <header class="report-head">
      <p class="eyebrow">Республика Башкортостан · ${esc(model.month)}</p>
      <h1>Меню на неделю</h1>
      <p class="lede">Семья из трёх человек${model.twoDays ? ` · обед и ужин готовим сессиями (${esc(model.sessionsHint)})` : ""}</p>
    </header>
    <section>
      <h2>Список покупок</h2>
      <p class="lede">Ориентир по ценам Уфы: ${formatRub(model.shop.total)}</p>
      ${model.shop.groups
        .map(
          (g) => `
        <h3>${esc(g.label)}</h3>
        <ul class="report-list">
          ${g.items.map((item) => `<li>${esc(item.name)} — ${esc(item.display)} (${formatRub(item.price)})</li>`).join("")}
        </ul>`
        )
        .join("")}
    </section>
    <section>
      <h2>Рецепты по дням</h2>
      ${model.days
        .map(
          (day) => `
        <article class="report-day">
          <h3>${esc(day.weekday)}</h3>
          ${
            day.sessionPlan
              ? `<p class="lede">Сессия готовки, ~${day.sessionPlan.wallMinutes} мин: ${day.sessionPlan.steps.map(esc).join(" ")}</p>`
              : ""
          }
          ${
            day.meals.length
              ? day.meals
                  .map(
                    (meal) => `
            <div class="report-meal">
              <p class="report-dish">${esc(meal.label)}: ${esc(meal.recipe.title)}${meal.leftover ? ` (готовим на ${esc(meal.leftover)})` : ""} · ${meal.recipe.minutes} мин</p>
              <p class="report-child"><em>Для ребёнка:</em> ${esc(meal.recipe.childNote)}</p>
              <p class="report-sub">Ингредиенты</p>
              <ul class="report-list">
                ${meal.ingredients.map((ing) => `<li>${esc(ing.name)}${ing.adultOnly ? " *" : ""} — ${ing.grams} г</li>`).join("")}
              </ul>
              ${
                meal.adultNames.length
                  ? `<p class="report-note">* только для взрослых: ${esc(meal.adultNames.join(", "))}. В детскую тарелку не кладём.</p>`
                  : ""
              }
              ${
                meal.steps.length
                  ? `<p class="report-sub">Как приготовить</p><ol class="report-steps">${meal.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`
                  : ""
              }
            </div>`
                  )
                  .join("")
              : `<p class="lede">В этот день блюда убраны.</p>`
          }
        </article>`
        )
        .join("")}
    </section>
    <p class="report-foot">Меню носит ознакомительный характер и не заменяет консультацию врача. Ингредиенты со знаком * — только для взрослых. Креветки исключены: аллергия у дочери.</p>
  `;
}

export function buildStandaloneHtml(week, settings) {
  const inner = renderReportInner(week, settings);
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Меню на неделю</title>
  <style>
    body { font-family: Georgia, "Palatino Linotype", serif; color: #2c241c; max-width: 720px; margin: 0 auto; padding: 24px 16px 48px; line-height: 1.45; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    h2 { font-size: 20px; margin: 28px 0 8px; }
    h3 { font-size: 16px; margin: 18px 0 6px; }
    .lede, .report-note, .report-foot { color: #6d5e50; font-size: 14px; }
    .eyebrow { letter-spacing: .12em; text-transform: uppercase; font-size: 11px; color: #b55232; font-weight: 700; }
    .report-dish { font-weight: 700; margin: 12px 0 4px; }
    .report-child, .report-sub { font-size: 14px; }
    .report-list, .report-steps { margin: 0 0 8px; padding-left: 18px; }
    .report-day { break-inside: avoid; page-break-inside: avoid; }
  </style>
</head>
<body>
${inner}
</body>
</html>`;
}

export function buildReportText(week, settings) {
  const model = buildReportModel(week, settings);
  const lines = [
    "Меню на неделю",
    `Башкортостан · ${model.month}`,
    model.twoDays ? `Обед и ужин готовим сессиями (${model.sessionsHint}).` : "",
    "",
    `Покупки, ориентир: ${formatRub(model.shop.total)}`,
  ];
  for (const g of model.shop.groups) {
    lines.push("", g.label);
    for (const item of g.items) {
      lines.push(`- ${item.name}: ${item.display} (${formatRub(item.price)})`);
    }
  }
  lines.push("", "Рецепты");
  for (const day of model.days) {
    lines.push("", day.weekday);
    if (day.sessionPlan) {
      lines.push(`Сессия готовки (~${day.sessionPlan.wallMinutes} мин):`);
      day.sessionPlan.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    }
    if (!day.meals.length) {
      lines.push("Блюда убраны.");
      continue;
    }
    for (const meal of day.meals) {
      lines.push(
        `${meal.label}: ${meal.recipe.title}${meal.leftover ? ` (на ${meal.leftover})` : ""}`
      );
      lines.push(`Для ребёнка: ${meal.recipe.childNote}`);
      lines.push("Ингредиенты:");
      for (const ing of meal.ingredients) {
        lines.push(`- ${ing.name}${ing.adultOnly ? " *" : ""} — ${ing.grams} г`);
      }
      if (meal.adultNames.length) {
        lines.push(`* только для взрослых: ${meal.adultNames.join(", ")}`);
      }
      if (meal.steps.length) {
        lines.push("Как приготовить:");
        meal.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
      }
    }
  }
  return lines.filter((line, i, arr) => line !== "" || arr[i - 1] !== "").join("\n");
}

export function downloadTextFile(filename, text, mime) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function shareReport(week, settings) {
  const html = buildStandaloneHtml(week, settings);
  const text = buildReportText(week, settings);
  const file = new File([html], "Menyu-na-nedelyu.html", { type: "text/html" });
  if (navigator.share) {
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: "Меню на неделю", files: [file] });
        return "shared";
      }
      await navigator.share({ title: "Меню на неделю", text });
      return "shared";
    } catch (err) {
      if (err?.name === "AbortError") return "cancel";
    }
  }
  downloadTextFile("Menyu-na-nedelyu.html", html, "text/html");
  return "download";
}
