import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCTS } from "../js/data/products.js";
import { RECIPES } from "../js/data/recipes.js";
import { RECIPE_STEPS } from "../js/data/recipe-steps.js";
import { RECIPE_LORE } from "../js/data/recipe-lore.js";
import { MEAL_SLOTS, DEFAULT_SETTINGS } from "../js/data/family.js";
import { generateWeek, listReplaceOptions } from "../js/engine/generator.js";
import { buildShoppingList } from "../js/engine/shopping.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FORBIDDEN = [
  "echpochmak",
  "vak-belish",
  "stuffed-pepper",
  "okroshka-kefir",
  "chickpea-stew",
  "zucchini-tvorog",
  "omelette-dinner",
  "pasta-tvorog",
  "veg-ragu-egg",
];
const REQUIRED_NEW = [
  "ham-cheese-sandwich",
  "chicken-burger",
  "ham-pesto-panini",
  "pasta-flotski",
  "tefteli",
  "baked-pink-salmon",
  "trout-veg",
  "duck-veg-stew",
  "duck-plov",
  "baked-chicken-potato-garlic",
  "veg-ragu-chicken",
];
const REQUIRED_SALADS = [
  "salad-caesar",
  "salad-vinegret",
  "salad-vegetable",
  "salad-greek",
  "salad-korean-carrot",
  "salad-apple",
];

const errors = [];
const warns = [];
const byId = new Map();

for (const recipe of RECIPES) {
  if (byId.has(recipe.id)) errors.push(`Дубль id: ${recipe.id}`);
  byId.set(recipe.id, recipe);
}

for (const id of FORBIDDEN) {
  if (byId.has(id)) errors.push(`Запрещённое блюдо осталось в каталоге: ${id}`);
}
for (const id of REQUIRED_NEW) {
  if (!byId.has(id)) errors.push(`Нет обязательного блюда: ${id}`);
}
for (const id of REQUIRED_SALADS) {
  if (!byId.has(id)) errors.push(`Нет обязательного салата: ${id}`);
}

const salads = RECIPES.filter((r) => r.meal === "salad");
if (salads.length !== 20) errors.push(`Салатов должно быть 20, сейчас ${salads.length}`);

for (const recipe of RECIPES) {
  if (/омлет/i.test(recipe.title) && recipe.meal !== "breakfast") {
    errors.push(`Омлет не на завтраке: ${recipe.id} (${recipe.meal})`);
  }
  if (/рагу/i.test(recipe.title) && !["chicken", "beef", "pork", "duck", "turkey", "liver"].includes(recipe.protein)) {
    errors.push(`Рагу без мяса: ${recipe.id} protein=${recipe.protein}`);
  }
  if (!RECIPE_STEPS[recipe.id]?.length) errors.push(`Нет шагов: ${recipe.id}`);
  if (!RECIPE_LORE[recipe.id]?.description || !RECIPE_LORE[recipe.id]?.history) {
    errors.push(`Нет справки: ${recipe.id}`);
  }
  const img = join(ROOT, "img", "recipes", `${recipe.id}.jpg`);
  if (!existsSync(img)) warns.push(`Нет фото: img/recipes/${recipe.id}.jpg`);
  for (const ing of recipe.ingredients || []) {
    if (!PRODUCTS[ing.productId]) errors.push(`${recipe.id}: неизвестный продукт ${ing.productId}`);
  }
}

const pearl = byId.get("pearl-mushrooms");
if (pearl && !pearl.ingredients.some((i) => ["chicken", "beef", "pork", "duck", "turkey"].includes(i.productId))) {
  errors.push("Перловка без мяса");
}

const counts = { breakfast: 0, lunch: 0, dinner: 0, snack: 0, salad: 0 };
for (const r of RECIPES) counts[r.meal] = (counts[r.meal] || 0) + 1;

const settings = { ...DEFAULT_SETTINGS, month: 9, cookSessions: 0 };
const week = generateWeek(settings, 42);
if (!week?.days?.length) errors.push("Генератор не вернул дни");
else {
  for (const day of week.days) {
    for (const slot of ["breakfast", "lunch", "dinner", "snack"]) {
      if (!day.meals[slot]) errors.push(`Пустой слот ${slot} в ${day.weekday}`);
      if (day.meals[slot]?.meal !== slot) errors.push(`Неверный meal у ${slot}: ${day.meals[slot]?.id}`);
    }
    if (day.meals.salad) errors.push(`Салат выбран по умолчанию в ${day.weekday}: ${day.meals.salad.id}`);
  }
  const shop = buildShoppingList(week, settings);
  if (!shop.items.length) errors.push("Пустой список покупок");
  const saladOpts = listReplaceOptions(week, 0, "salad", settings);
  if (saladOpts.length < 15) errors.push(`Мало вариантов салата: ${saladOpts.length}`);
}

const sessionsWeek = generateWeek({ ...settings, cookSessions: 3 }, 99);
if (sessionsWeek.days.some((d) => d.meals.salad)) {
  errors.push("В сессионной неделе салат выбран автоматически");
}

console.log(`Блюд: ${RECIPES.length}`);
console.log(`Слоты: ${JSON.stringify(counts)}`);
console.log(`MEAL_SLOTS: ${MEAL_SLOTS.join(", ")}`);
if (warns.length) {
  console.log(`Предупреждения (${warns.length}):`);
  for (const w of warns) console.log("  !", w);
}
if (errors.length) {
  console.log(`Ошибки (${errors.length}):`);
  for (const e of errors) console.log("  x", e);
  process.exit(1);
}
console.log("Health check OK");
