import { PRODUCTS, CATEGORY_LABELS, CATEGORY_ORDER } from "../data/products.js";
import { portionsFor, cookSessionsCount, cookSessionGroups, skipKey } from "../data/family.js";

export function buildShoppingList(week, settings) {
  const grams = new Map();
  if (!week) return { groups: [], total: 0, items: [] };

  const addRecipe = (recipe, multiplier) => {
    if (!recipe || multiplier <= 0) return;
    for (const ing of recipe.ingredients) {
      grams.set(ing.productId, (grams.get(ing.productId) || 0) + ing.grams * portionsFor(recipe) * multiplier);
    }
  };

  const skipped = (dayIndex, slot) => Boolean(week.skipped?.[skipKey(dayIndex, slot)]);

  if (!cookSessionsCount(settings)) {
    for (const day of week.days) {
      for (const slot of Object.keys(day.meals)) {
        if (skipped(day.index, slot)) continue;
        addRecipe(day.meals[slot], 1);
      }
    }
  } else {
    for (const day of week.days) {
      for (const slot of ["breakfast", "snackAm", "snackPm"]) {
        if (skipped(day.index, slot)) continue;
        addRecipe(day.meals[slot], 1);
      }
    }
    for (const group of cookSessionGroups(settings)) {
      const cookDay = week.days[group[0]];
      if (!cookDay) continue;
      for (const slot of ["lunch", "dinner"]) {
        const liveDays = group.filter((d) => !skipped(d, slot)).length;
        addRecipe(cookDay.meals[slot], liveDays);
      }
    }
  }

  const items = [];
  for (const [productId, rawGrams] of grams) {
    const prod = PRODUCTS[productId];
    if (!prod) continue;
    const display = formatAmount(prod, rawGrams);
    const price = (rawGrams / 1000) * prod.pricePerKg;
    items.push({
      productId,
      name: prod.name,
      category: prod.category,
      grams: rawGrams,
      display,
      price,
    });
  }

  items.sort((a, b) => a.name.localeCompare(b.name, "ru"));

  const groups = CATEGORY_ORDER.map((cat) => ({
    id: cat,
    label: CATEGORY_LABELS[cat],
    items: items.filter((i) => i.category === cat),
  })).filter((g) => g.items.length);

  const total = items.reduce((s, i) => s + i.price, 0);
  return { groups, total, items };
}

function formatAmount(prod, grams) {
  if (prod.gramsPerUnit) {
    const pcs = Math.max(1, Math.ceil(grams / prod.gramsPerUnit));
    return `${pcs} ${prod.unitName}`;
  }
  if (prod.category === "dairy" && ["milk", "kefir", "katyk", "yogurt", "ryazhenka"].includes(prod.id)) {
    const liters = Math.ceil(grams / 100) / 10;
    return `${liters.toFixed(1)} л`;
  }
  if (grams >= 1000) {
    return `${(Math.ceil(grams / 50) * 50 / 1000).toFixed(2)} кг`;
  }
  const rounded = Math.max(50, Math.ceil(grams / 50) * 50);
  return `${rounded} г`;
}

export function formatRub(value) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}
