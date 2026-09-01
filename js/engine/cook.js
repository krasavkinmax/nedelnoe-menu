const PREP_FROM_PRODUCT = {
  onion: "onion",
  carrot: "carrot",
  potato: "potato",
  cabbage: "cabbage",
  beet: "beet",
  zucchini: "zucchini",
  chicken: "chicken",
  chickenBreast: "chicken",
  turkey: "turkey",
  beef: "beef",
  pork: "pork",
  liver: "liver",
  fishFillet: "fish",
  pike: "fish",
  pinkSalmon: "fish",
  trout: "fish",
  duck: "duck",
  pepper: "pepper",
  pumpkin: "pumpkin",
  mushrooms: "mushrooms",
};

export const PREP_LABELS = {
  onion: "лук",
  carrot: "морковь",
  potato: "картофель",
  cabbage: "капуста",
  beet: "свёкла",
  zucchini: "кабачок",
  chicken: "курица",
  turkey: "индейка",
  beef: "говядина",
  pork: "свинина",
  liver: "печень",
  fish: "рыба",
  duck: "утка",
  pepper: "перец",
  pumpkin: "тыква",
  mushrooms: "грибы",
};

const HEAT_LABEL = { stove: "плита", oven: "духовка", none: "без нагрева" };
const ATTENTION_LABEL = { passive: "само готовится", active: "у плиты" };

export function inferPrepKeys(recipe) {
  const keys = [];
  const seen = new Set();
  for (const ing of recipe?.ingredients || []) {
    const key = PREP_FROM_PRODUCT[ing.productId];
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

function inferHeat(recipe) {
  const text = `${recipe.id} ${recipe.title}`.toLowerCase();
  if (recipe.soup) return "stove";
  if (/запеч|духовк|baked|панини|бургер/.test(text)) return "oven";
  if (/окрошк|салат|сэндвич/.test(text) && !/суп/.test(text)) return "none";
  return "stove";
}

function inferAttention(recipe) {
  const text = `${recipe.id} ${recipe.title}`.toLowerCase();
  if (recipe.soup) return "passive";
  if (/тушён|рагу|жаркое|гуляш|азу|плов|суп|запеч|духовк|голубц/.test(text)) return "passive";
  if (/салат|омлет|котлет|печень/.test(text)) return "active";
  return "active";
}

export function recipeCook(recipe) {
  if (!recipe) {
    return {
      heat: "none",
      attention: "active",
      prepKeys: [],
      activeMinutes: 0,
      passiveMinutes: 0,
      keepsDays: 2,
      soup: false,
    };
  }
  const prepKeys = recipe.prepKeys?.length ? recipe.prepKeys : inferPrepKeys(recipe);
  const heat = recipe.heat || inferHeat(recipe);
  const attention = recipe.attention || inferAttention(recipe);
  const minutes = recipe.minutes || 30;
  const activeMinutes =
    recipe.activeMinutes ??
    (attention === "passive" ? Math.min(20, Math.round(minutes * 0.35)) : Math.round(minutes * 0.7));
  const passiveMinutes =
    recipe.passiveMinutes ??
    Math.max(0, attention === "passive" ? minutes - activeMinutes : Math.round(minutes * 0.3));
  const keepsDays =
    recipe.keepsDays ?? (recipe.soup ? 4 : heat === "oven" || attention === "passive" ? 3 : 2);
  return { heat, attention, prepKeys, activeMinutes, passiveMinutes, keepsDays, soup: Boolean(recipe.soup) };
}

export function sharedPrepKeys(a, b) {
  if (!a || !b) return [];
  const right = new Set(recipeCook(b).prepKeys);
  return recipeCook(a).prepKeys.filter((key) => right.has(key));
}

export function pairCookDelta(lunch, dinner) {
  if (!lunch || !dinner) return 0;
  const a = recipeCook(lunch);
  const b = recipeCook(dinner);
  let s = 0;
  if (a.heat !== b.heat && a.heat !== "none" && b.heat !== "none") s += 3.5;
  if (a.heat === "stove" && b.heat === "stove" && a.attention === "active" && b.attention === "active") s -= 4.2;
  if (a.heat === "oven" && b.heat === "oven") s -= 2.8;
  if (a.soup && b.soup) s -= 2.4;
  if (!a.soup && !b.soup) s -= 1.4;
  if ((a.soup && !b.soup) || (!a.soup && b.soup)) s += 2.2;
  if (a.attention !== b.attention) s += 2;
  const shared = sharedPrepKeys(lunch, dinner);
  s += Math.min(3, shared.length) * 1.5;
  return s;
}

export function sessionWallMinutes(lunch, dinner) {
  const a = recipeCook(lunch);
  const b = recipeCook(dinner);
  const shared = sharedPrepKeys(lunch, dinner);
  const prep = Math.min(12, shared.length * 4);
  const canParallel =
    a.heat !== b.heat || a.attention !== b.attention || a.soup !== b.soup || a.heat === "oven" || b.heat === "oven";
  const totalA = a.activeMinutes + a.passiveMinutes;
  const totalB = b.activeMinutes + b.passiveMinutes;
  const wall = canParallel
    ? prep + Math.max(totalA, totalB)
    : prep + a.activeMinutes + b.activeMinutes + Math.max(a.passiveMinutes, b.passiveMinutes);
  return Math.max(15, Math.round(wall));
}

function daysWord(n) {
  if (n === 1) return "1 день";
  if (n >= 2 && n <= 4) return `${n} дня`;
  return `${n} дней`;
}

export function buildSessionPlan(lunch, dinner, dayCount) {
  const a = recipeCook(lunch);
  const b = recipeCook(dinner);
  const shared = sharedPrepKeys(lunch, dinner);
  const steps = [];
  if (shared.length) {
    steps.push(`Нарезать общее: ${shared.map((key) => PREP_LABELS[key] || key).join(", ")}.`);
  }

  const lunchFirst =
    a.attention === "passive" || a.soup || (a.heat === "oven" && b.attention === "active") || a.passiveMinutes >= b.passiveMinutes;
  const first = lunchFirst ? lunch : dinner;
  const second = lunchFirst ? dinner : lunch;
  const firstCook = lunchFirst ? a : b;
  const secondCook = lunchFirst ? b : a;
  const firstHeat = HEAT_LABEL[firstCook.heat] || firstCook.heat;
  const secondHeat = HEAT_LABEL[secondCook.heat] || secondCook.heat;

  steps.push(`Запустить «${first.title}» (${firstHeat}, ${ATTENTION_LABEL[firstCook.attention]}).`);
  if (secondCook.attention === "active" || secondCook.heat !== firstCook.heat) {
    steps.push(`Пока первое блюдо идёт — «${second.title}» (${secondHeat}).`);
  } else {
    steps.push(`Затем «${second.title}» (${secondHeat}).`);
  }
  steps.push(`Остудить и разложить на ${daysWord(dayCount)}.`);

  return {
    steps,
    wallMinutes: sessionWallMinutes(lunch, dinner),
    shared,
    lunchMeta: a,
    dinnerMeta: b,
  };
}
