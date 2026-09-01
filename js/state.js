import { DEFAULT_SETTINGS, ALLERGY_EXCLUDE, cookSessionsCount } from "./data/family.js";
import { RECIPES } from "./data/recipes.js";
import { refreshWeekNutrition } from "./engine/generator.js";

const KEY = "bashkir-week-menu-v1";

const RECIPE_REMAP = {
  echpochmak: "pasta-flotski",
  "vak-belish": "pasta-flotski",
  "stuffed-pepper": "tefteli",
  "chickpea-stew": "duck-veg-stew",
  "pasta-tvorog": "baked-chicken-potato-garlic",
  "veg-ragu-egg": "veg-ragu-chicken",
};

const RECIPE_DROP = new Set(["zucchini-tvorog", "omelette-dinner", "okroshka-kefir"]);

function mondayIndex() {
  return (new Date().getDay() + 6) % 7;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveState(state) {
  const snapshot = {
    settings: state.settings,
    seed: state.seed,
    week: state.week,
    shopChecked: state.shopChecked,
    tab: state.tab,
    selectedDay: state.selectedDay,
  };
  localStorage.setItem(KEY, JSON.stringify(snapshot));
}

function liveRecipe(old, slot) {
  if (!old?.id) return null;
  if (RECIPE_DROP.has(old.id)) return null;
  const id = RECIPE_REMAP[old.id] || old.id;
  const next = RECIPES.find((r) => r.id === id);
  if (!next) return null;
  if (next.meal !== slot) return null;
  return next;
}

function migrateWeek(week) {
  if (!week?.days) return week;
  let changed = false;
  const skipped = { ...(week.skipped || {}) };
  for (const day of week.days) {
    const meals = day.meals || {};
    if (meals.snackAm || meals.snackPm) {
      if (!meals.snack) meals.snack = meals.snackPm || meals.snackAm || null;
      delete meals.snackAm;
      delete meals.snackPm;
      changed = true;
    }
    for (const slot of Object.keys(meals)) {
      const current = meals[slot];
      if (!current) continue;
      const next = liveRecipe(current, slot);
      if (next?.id !== current.id) {
        meals[slot] = next;
        changed = true;
      } else {
        meals[slot] = next;
      }
    }
    for (const slot of ["breakfast", "lunch", "dinner", "snack"]) {
      if (!meals[slot]) {
        meals[slot] = RECIPES.find((r) => r.meal === slot && r.childSafe) || null;
        changed = true;
      }
    }
    if (!("salad" in meals) || meals.salad === undefined) {
      meals.salad = meals.salad || null;
      changed = true;
    }
    const i = day.index;
    if (skipped[`${i}:snackAm`] || skipped[`${i}:snackPm`]) {
      skipped[`${i}:snack`] = true;
      changed = true;
    }
    delete skipped[`${i}:snackAm`];
    delete skipped[`${i}:snackPm`];
  }
  week.skipped = skipped;
  return changed ? refreshWeekNutrition(week) : week;
}

export function initialState() {
  const saved = loadState();
  const settings = { ...DEFAULT_SETTINGS, ...(saved?.settings || {}) };
  const disliked = new Set(settings.disliked || []);
  for (const id of ALLERGY_EXCLUDE) disliked.add(id);
  settings.disliked = [...disliked];
  if (saved?.settings?.cookSessions == null) {
    settings.cookSessions = settings.cookTwoDays ? 3 : 0;
  } else {
    settings.cookSessions = cookSessionsCount(settings);
  }
  delete settings.cookTwoDays;
  const liked = new Set(settings.liked || []);
  for (const id of ALLERGY_EXCLUDE) liked.delete(id);
  for (const id of settings.disliked) liked.delete(id);
  settings.liked = [...liked];
  return {
    settings,
    seed: saved?.seed ?? Date.now() >>> 0,
    week: migrateWeek(saved?.week) ?? null,
    shopChecked: saved?.shopChecked ?? {},
    tab: saved?.tab ?? "menu",
    selectedDay: saved?.selectedDay ?? mondayIndex(),
    recipeOpen: null,
    loreOpen: false,
    replaceOpen: null,
    replaceQuery: "",
    replaceFocus: false,
    reportOpen: false,
    toast: null,
  };
}
