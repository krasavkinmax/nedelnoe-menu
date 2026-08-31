export const MONTH_NAMES = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

export const ACTIVITY_LABELS = {
  low: "низкая",
  mid: "средняя",
  high: "высокая",
};

/** Нормы МР 2.3.1.0253-21, ккал/день. Ребёнок — ориентир 1–3 года. */
export const KCAL_BY_ACTIVITY = {
  low: { man: 2100, woman: 1800, child: 1200 },
  mid: { man: 2450, woman: 2000, child: 1200 },
  high: { man: 2800, woman: 2300, child: 1200 },
};

export const CHILD_PORTION = 0.4;
export const ADULT_COUNT = 2;
export const FAMILY_PORTIONS = ADULT_COUNT + CHILD_PORTION;

/** Множитель «семейной тарелки»: справочная порция ближе к фактическому объёму. */
export const MEAL_SCALE = {
  breakfast: 1.55,
  lunch: 1.8,
  dinner: 1.6,
  snack: 1.15,
};

export function portionsFor(recipe) {
  return FAMILY_PORTIONS * (MEAL_SCALE[recipe.meal] ?? 1);
}

export function familyTargets(activity) {
  const kcal = KCAL_BY_ACTIVITY[activity] ?? KCAL_BY_ACTIVITY.mid;
  const man = macrosFromKcal(kcal.man, 0.15, 0.3, 0.55);
  const woman = macrosFromKcal(kcal.woman, 0.15, 0.3, 0.55);
  const child = { kcal: kcal.child, p: 40, f: 40, c: 160 };
  return {
    members: [
      { id: "man", name: "Папа", age: "31 год", kcal: man.kcal, p: man.p, f: man.f, c: man.c },
      { id: "woman", name: "Мама", age: "29 лет", kcal: woman.kcal, p: woman.p, f: woman.f, c: woman.c },
      { id: "child", name: "Дочь", age: "1,5 года", kcal: child.kcal, p: child.p, f: child.f, c: child.c },
    ],
    family: {
      kcal: man.kcal + woman.kcal + child.kcal,
      p: man.p + woman.p + child.p,
      f: man.f + woman.f + child.f,
      c: man.c + woman.c + child.c,
    },
  };
}

function macrosFromKcal(kcal, pShare, fShare, cShare) {
  return {
    kcal,
    p: Math.round((kcal * pShare) / 4),
    f: Math.round((kcal * fShare) / 9),
    c: Math.round((kcal * cShare) / 4),
  };
}

export const SLOT_KCAL_SHARE = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.25,
  snackAm: 0.075,
  snackPm: 0.075,
};

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snackAm", "snackPm"];

export const MEAL_LABELS = {
  breakfast: "Завтрак",
  lunch: "Обед",
  dinner: "Ужин",
  snackAm: "Перекус утром",
  snackPm: "Перекус днём",
};

export const DEFAULT_SETTINGS = {
  activity: "mid",
  preferLocal: true,
  disliked: [],
  month: new Date().getMonth() + 1,
};

export const DISLIKE_OPTIONS = [
  { id: "fishFillet", label: "Рыба" },
  { id: "liver", label: "Печень" },
  { id: "mushrooms", label: "Грибы" },
  { id: "lentils", label: "Чечевица" },
  { id: "peasDry", label: "Горох" },
  { id: "chickpeas", label: "Нут" },
  { id: "milk", label: "Молоко" },
  { id: "tvorog", label: "Творог" },
];

export const DISLIKE_GROUPS = {
  fishFillet: ["fishFillet", "pike"],
  liver: ["liver"],
  mushrooms: ["mushrooms"],
  lentils: ["lentils"],
  peasDry: ["peasDry"],
  chickpeas: ["chickpeas"],
  milk: ["milk"],
  tvorog: ["tvorog"],
};

export function dislikedProductIds(disliked) {
  const ids = new Set();
  for (const id of disliked) {
    for (const pid of DISLIKE_GROUPS[id] || [id]) ids.add(pid);
  }
  return ids;
}
