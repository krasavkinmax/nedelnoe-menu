import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCTS, CATEGORY_LABELS, CATEGORY_ORDER } from "../js/data/products.js";
import { RECIPES } from "../js/data/recipes.js";
import { RECIPE_STEPS } from "../js/data/recipe-steps.js";
import { APP_VERSION } from "../js/version.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MONTHS = ["", "янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MEAL = { breakfast: "Завтрак", lunch: "Обед", dinner: "Ужин", snack: "Перекус", salad: "Салат" };
const CUISINE = { ru: "русская / домашняя", bashkir: "башкирская", tatar: "татарская" };
const PROTEIN = {
  dairy: "молочное",
  egg: "яйцо",
  chicken: "курица",
  turkey: "индейка",
  duck: "утка",
  beef: "говядина",
  pork: "свинина",
  fish: "рыба",
  liver: "печень",
  legume: "бобовые",
  veg: "овощное",
};

function season(recipe) {
  if (!recipe.seasons?.length) return "круглый год";
  return recipe.seasons.map((m) => MONTHS[m]).join(", ");
}

const byMeal = { breakfast: [], lunch: [], dinner: [], snack: [], salad: [] };
for (const r of RECIPES) byMeal[r.meal].push(r);

const proteinCount = {};
let soups = 0;
const cuisineCount = { bashkir: 0, tatar: 0, ru: 0 };
for (const r of RECIPES) {
  proteinCount[r.protein] = (proteinCount[r.protein] || 0) + 1;
  if (r.soup) soups += 1;
  cuisineCount[r.cuisine] = (cuisineCount[r.cuisine] || 0) + 1;
}

const lines = [];
lines.push("# Каталог блюд семейного меню");
lines.push("");
lines.push(
  "Документ для разбора: все блюда с ингредиентами, шагами и заметками для ребёнка, плюс продуктовая база. Чтобы предложить убрать, заменить или добавить блюдо, укажите его **id** латиницей (например `chicken-noodle-soup`)."
);
lines.push("");
lines.push(
  `Версия приложения ${APP_VERSION}. Ингредиенты указаны **на 1 взрослую порцию**. Ребёнку ориентир 0,4 порции (см. заметку). Знак * — только для взрослых, в детскую тарелку не кладём. Креветки в каталоге продуктов есть, но в меню никогда не попадают (аллергия). Салат — отдельная категория каждого дня; по умолчанию не выбран.`
);
lines.push("");
lines.push("## Сводка");
lines.push("");
lines.push(`- Всего блюд: **${RECIPES.length}**`);
lines.push(
  `- Завтраки: ${byMeal.breakfast.length}, обеды: ${byMeal.lunch.length}, ужины: ${byMeal.dinner.length}, перекусы: ${byMeal.snack.length}, салаты: ${byMeal.salad.length}`
);
lines.push(`- Супов: ${soups}`);
lines.push(`- Башкирских: ${cuisineCount.bashkir}, татарских: ${cuisineCount.tatar}, домашних: ${cuisineCount.ru}`);
lines.push("");
lines.push("Белок (основной):");
for (const [k, n] of Object.entries(proteinCount).sort((a, b) => b[1] - a[1])) {
  lines.push(`- ${PROTEIN[k] || k}: ${n}`);
}
lines.push("");
lines.push("## Как пользоваться");
lines.push("");
lines.push(
  "Просмотрите разделы по приёмам пищи. Для каждого блюда: время, кухня, способ готовки (если задан), ингредиенты, шаги, заметка для ребёнка. Можно выписать id блюда (латиницей), чтобы потом сказать, что убрать, заменить или добавить."
);
lines.push("");

let n = 1;
for (const meal of ["breakfast", "lunch", "dinner", "snack", "salad"]) {
  lines.push(`## ${MEAL[meal]} (${byMeal[meal].length})`);
  lines.push("");
  for (const r of byMeal[meal]) {
    lines.push(`### ${n}. ${r.title}`);
    lines.push("");
    lines.push(`- id: \`${r.id}\``);
    const bits = [`${r.minutes} мин`, CUISINE[r.cuisine], `белок: ${PROTEIN[r.protein] || r.protein}`, `стоимость ${r.costLevel}/3`, `сезон: ${season(r)}`];
    if (r.soup) bits.splice(2, 0, "суп");
    lines.push(`- ${bits.join(" · ")}`);
    lines.push(`- Для ребёнка: ${r.childNote}`);
    lines.push("");
    lines.push("**Ингредиенты (1 взрослая порция)**");
    lines.push("");
    for (const ing of r.ingredients) {
      const prod = PRODUCTS[ing.productId];
      const star = ing.adultOnly ? " \\*" : "";
      lines.push(`- ${prod.name}${star} — ${ing.grams} г`);
    }
    lines.push("");
    lines.push("**Как приготовить**");
    lines.push("");
    const steps = RECIPE_STEPS[r.id] || [];
    steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push("");
    n += 1;
  }
}

lines.push("## Продуктовая база");
lines.push("");
for (const cat of CATEGORY_ORDER) {
  const items = Object.values(PRODUCTS).filter((p) => p.category === cat);
  if (!items.length) continue;
  lines.push(`### ${CATEGORY_LABELS[cat]}`);
  lines.push("");
  for (const p of items) {
    lines.push(`- ${p.name} (\`${p.id}\`) — ${p.kcal} ккал / 100 г, Б ${p.p} Ж ${p.f} У ${p.c}, ${p.pricePerKg} ₽/кг`);
  }
  lines.push("");
}

writeFileSync(join(ROOT, "docs", "katalog-blyud.md"), lines.join("\n"), "utf8");
console.log("wrote docs/katalog-blyud.md", RECIPES.length);
