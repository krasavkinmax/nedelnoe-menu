import { MEAL_SLOTS, MEAL_LABELS, MONTH_NAMES, leftoverPairLabel, isSkipped, portionsFor } from "../data/family.js";
import { PRODUCTS } from "../data/products.js";
import { RECIPE_STEPS } from "../data/recipe-steps.js";
import { buildShoppingList, formatRub } from "./shopping.js";

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      if (window.pdfMake) resolve();
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Не удалось загрузить библиотеку PDF"));
    document.head.appendChild(el);
  });
}

async function getPdfMake() {
  if (window.pdfMake) return window.pdfMake;
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.18/pdfmake.min.js");
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.18/vfs_fonts.min.js");
  return window.pdfMake;
}

export async function exportWeekPdf(week, settings) {
  const pdfMake = await getPdfMake();
  const month = MONTH_NAMES[(settings.month || 1) - 1];
  const shop = buildShoppingList(week);
  const content = [
    { text: "Меню на неделю", style: "h1" },
    {
      text: `Семья из трёх человек · Республика Башкортостан · ${month}${settings.cookTwoDays ? " · обед и ужин готовим на 2 дня (пн–вт, ср–чт, пт–сб)" : ""}`,
      style: "lead",
      margin: [0, 0, 0, 16],
    },
    { text: "Список покупок", style: "h2" },
    { text: `Ориентир по ценам Уфы: ${formatRub(shop.total)}`, style: "lead", margin: [0, 0, 0, 8] },
  ];

  for (const group of shop.groups) {
    content.push({ text: group.label, style: "h3", margin: [0, 8, 0, 4] });
    content.push({
      ul: group.items.map((item) => `${item.name} — ${item.display} (${formatRub(item.price)})`),
      margin: [0, 0, 0, 6],
    });
  }

  content.push({ text: "Рецепты по дням", style: "h2", margin: [0, 18, 0, 8] });

  for (const day of week.days) {
    content.push({ text: day.weekday, style: "h3", margin: [0, 12, 0, 4] });
    let any = false;
    for (const slot of MEAL_SLOTS) {
      if (isSkipped(week, day.index, slot)) continue;
      const recipe = day.meals[slot];
      if (!recipe) continue;
      any = true;
      const leftover =
        (slot === "lunch" || slot === "dinner") && settings.cookTwoDays
          ? leftoverPairLabel(day.index, true)
          : "";
      const scale = portionsFor(recipe);
      const ings = recipe.ingredients
        .map((ing) => {
          const prod = PRODUCTS[ing.productId];
          return prod ? `${prod.name} — ${Math.round(ing.grams * scale)} г` : "";
        })
        .filter(Boolean);
      const steps = RECIPE_STEPS[recipe.id] || [];
      content.push({
        text: `${MEAL_LABELS[slot]}: ${recipe.title}${leftover ? ` (готовим на ${leftover})` : ""} · ${recipe.minutes} мин`,
        style: "dish",
        margin: [0, 6, 0, 2],
      });
      content.push({ text: `Для ребёнка: ${recipe.childNote}`, italics: true, fontSize: 9, margin: [0, 0, 0, 4] });
      content.push({ text: "Ингредиенты", bold: true, fontSize: 10 });
      content.push({ ul: ings, fontSize: 9, margin: [0, 0, 0, 4] });
      if (steps.length) {
        content.push({ text: "Как приготовить", bold: true, fontSize: 10 });
        content.push({ ol: steps, fontSize: 9, margin: [0, 0, 0, 8] });
      }
    }
    if (!any) content.push({ text: "В этот день блюда убраны.", italics: true, fontSize: 10 });
  }

  content.push({
    text: "Меню носит ознакомительный характер и не заменяет консультацию врача. Креветки исключены: аллергия у дочери.",
    style: "foot",
    margin: [0, 18, 0, 0],
  });

  return new Promise((resolve, reject) => {
    pdfMake
      .createPdf({
        info: { title: "Меню на неделю", author: "Семейное меню" },
        pageMargins: [40, 40, 40, 48],
        defaultStyle: { font: "Roboto", fontSize: 10 },
        styles: {
          h1: { fontSize: 20, bold: true, margin: [0, 0, 0, 6] },
          h2: { fontSize: 14, bold: true, margin: [0, 10, 0, 4] },
          h3: { fontSize: 12, bold: true },
          dish: { fontSize: 11, bold: true },
          lead: { fontSize: 9, color: "#555" },
          foot: { fontSize: 8, color: "#777" },
        },
        content,
      })
      .download("Menyu-na-nedelyu.pdf", () => resolve());
  });
}
