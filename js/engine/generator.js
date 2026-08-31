import { RECIPES, DAIRY_PRODUCT_IDS } from "../data/recipes.js";
import { recipeInSeason } from "../data/seasons.js";
import { familyTargets, SLOT_KCAL_SHARE, MEAL_SLOTS, MEAL_SCALE, dislikedProductIds, leftoverPartner, isSkipped } from "../data/family.js";
import {
  recipeNutrition,
  familyMealNutrition,
  recipeCost,
  hasDairy,
  addNutrition,
  emptyNutrition,
  roundNutrition,
} from "./nutrition.js";
import { mulberry32, pickBest } from "./rng.js";

const SLOT_TO_MEAL = {
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
  snackAm: "snack",
  snackPm: "snack",
};

export function generateWeek(settings, seed) {
  const rng = mulberry32(seed);
  const targets = familyTargets(settings.activity);
  const used = new Map();
  const days = [];
  let prevLunchProtein = null;

  for (let d = 0; d < 7; d++) {
    const meals = {};
    const dayUsed = new Set();

    for (const slot of MEAL_SLOTS) {
      const recipe = pickRecipe({
        slot,
        settings,
        rng,
        used,
        dayUsed,
        prevLunchProtein,
        days,
        targets,
        exclude: new Set(),
        cheaperThan: null,
      });
      meals[slot] = recipe;
      if (recipe) {
        dayUsed.add(recipe.id);
        used.set(recipe.id, (used.get(recipe.id) || 0) + 1);
      }
    }

    prevLunchProtein = meals.lunch?.protein ?? null;
    days.push(makeDay(d, meals, targets));
  }

  balanceDays(days, settings, rng, used, targets);
  applyWeeklyGuarantees(days, settings, rng, used, targets);
  syncLeftovers(days, settings, targets);
  if (settings.cookTwoDays && fishCount(days) < 2 && !dislikedProductIds(settings.disliked).has("fishFillet")) {
    forceProtein(days, "fish", 2, settings, rng, used, targets, ["lunch", "dinner"]);
    syncLeftovers(days, settings, targets);
  }

  return refreshWeekNutrition({
    seed,
    days,
    skipped: {},
    targets,
  });
}

export function replaceMeal(week, dayIndex, slot, settings, mode = "any") {
  const days = week.days.map((day) => ({
    ...day,
    meals: { ...day.meals },
  }));
  const current = days[dayIndex].meals[slot];
  const used = countUsed(days);
  const dayUsed = new Set(
    MEAL_SLOTS.map((s) => days[dayIndex].meals[s]?.id).filter(Boolean)
  );
  const rng = mulberry32((week.seed + dayIndex * 17 + slot.charCodeAt(0) + Date.now()) >>> 0);
  const prevLunchProtein = dayIndex > 0 ? days[dayIndex - 1].meals.lunch?.protein : null;
  const cheaperThan = mode === "cheaper" && current ? recipeCost(current) * 0.9 : null;

  const next = pickRecipe({
    slot,
    settings,
    rng,
    used,
    dayUsed,
    prevLunchProtein,
    days,
    targets: week.targets,
    exclude: new Set(current ? [current.id] : []),
    cheaperThan,
  });

  if (!next) return week;

  days[dayIndex].meals[slot] = next;
  const partner = leftoverPartner(dayIndex, settings.cookTwoDays);
  if (partner != null && (slot === "lunch" || slot === "dinner")) {
    days[partner].meals[slot] = next;
  }

  const nextWeek = refreshWeekNutrition({
    ...week,
    days,
  });
  nextWeek.lastReplace = {
    slot,
    dayIndex,
    from: current,
    to: next,
    saved: current ? recipeCost(current) - recipeCost(next) : 0,
  };
  return nextWeek;
}

export function skipMeal(week, dayIndex, slot) {
  const skipped = { ...(week.skipped || {}), [skipKeyFrom(dayIndex, slot)]: true };
  return refreshWeekNutrition({ ...week, skipped });
}

export function restoreMeal(week, dayIndex, slot) {
  const skipped = { ...(week.skipped || {}) };
  delete skipped[skipKeyFrom(dayIndex, slot)];
  return refreshWeekNutrition({ ...week, skipped });
}

export function refreshWeekNutrition(week) {
  const days = week.days.map((day) => makeDay(day.index, day.meals, week.targets, week.skipped));
  return {
    ...week,
    days,
    weekTotals: roundNutrition(sumDays(days)),
  };
}

function skipKeyFrom(dayIndex, slot) {
  return `${dayIndex}:${slot}`;
}

function syncLeftovers(days, settings, targets) {
  if (!settings.cookTwoDays) return;
  for (const a of [0, 2, 4]) {
    const b = a + 1;
    days[b].meals.lunch = days[a].meals.lunch;
    days[b].meals.dinner = days[a].meals.dinner;
    days[a] = makeDay(a, days[a].meals, targets);
    days[b] = makeDay(b, days[b].meals, targets);
  }
}

function makeDay(index, meals, targets, skipped) {
  let totals = emptyNutrition();
  for (const slot of MEAL_SLOTS) {
    if (meals[slot] && !isSkipped({ skipped }, index, slot)) {
      totals = addNutrition(totals, familyMealNutrition(meals[slot]));
    }
  }
  return {
    index,
    weekday: WEEKDAYS[index],
    meals,
    totals: roundNutrition(totals),
    target: targets.family,
  };
}

function sumDays(days) {
  return days.reduce((acc, day) => addNutrition(acc, day.totals), emptyNutrition());
}

function countUsed(days) {
  const used = new Map();
  for (const day of days) {
    for (const slot of MEAL_SLOTS) {
      const id = day.meals[slot]?.id;
      if (id) used.set(id, (used.get(id) || 0) + 1);
    }
  }
  return used;
}

function pickRecipe(ctx) {
  const mealType = SLOT_TO_MEAL[ctx.slot];
  let candidates = RECIPES.filter((r) => isEligible(r, mealType, ctx.settings, ctx.exclude));
  if (ctx.cheaperThan != null) {
    const cheaper = candidates.filter((r) => recipeCost(r) <= ctx.cheaperThan);
    if (cheaper.length) candidates = cheaper;
  }
  if (!candidates.length) {
    candidates = RECIPES.filter((r) => r.meal === mealType && r.childSafe);
  }
  const needFish = fishCount(ctx.days) < 2;
  const needLegume = legumeCount(ctx.days) < 1;
  const localLunchShare = localLunchRatio(ctx.days);

  return pickBest(candidates, (recipe) => {
    let s = ctx.rng() * 0.8;
    const times = ctx.used.get(recipe.id) || 0;
    s -= times * 3;
    if (ctx.dayUsed.has(recipe.id)) s -= 8;

    if (ctx.slot === "lunch" && ctx.prevLunchProtein && recipe.protein === ctx.prevLunchProtein) {
      s -= 4;
    }

    if (ctx.settings.preferLocal && (recipe.cuisine === "bashkir" || recipe.cuisine === "tatar")) {
      s += ctx.slot === "lunch" && localLunchShare < 0.3 ? 3.5 : 1.5;
    }

    s -= recipe.costLevel * 0.25;

    const scaledKcal = recipeNutrition(recipe).kcal * (MEAL_SCALE[recipe.meal] ?? 1);
    const slotTarget = (ctx.targets.family.kcal * SLOT_KCAL_SHARE[ctx.slot]) / 2.4;
    const err = Math.abs(scaledKcal - slotTarget) / Math.max(slotTarget, 1);
    s -= err * 2.2;

    if (needFish && recipe.protein === "fish" && (ctx.slot === "lunch" || ctx.slot === "dinner")) s += 3.5;
    if (needLegume && recipe.protein === "legume") s += 3;
    if ((ctx.slot === "snackAm" || ctx.slot === "snackPm") && recipeHasDairyProduct(recipe)) s += 1.2;

    return s;
  });
}

function isEligible(recipe, mealType, settings, exclude) {
  if (recipe.meal !== mealType) return false;
  if (!recipe.childSafe) return false;
  if (exclude.has(recipe.id)) return false;
  if (!recipeInSeason(recipe, settings.month)) return false;
  const blocked = dislikedProductIds(settings.disliked);
  if (recipe.ingredients.some((ing) => blocked.has(ing.productId))) return false;
  return true;
}

function recipeHasDairyProduct(recipe) {
  return recipe.ingredients.some((ing) => DAIRY_PRODUCT_IDS.has(ing.productId));
}

function fishCount(days) {
  let n = 0;
  for (const day of days) {
    for (const slot of ["lunch", "dinner"]) {
      if (day.meals[slot]?.protein === "fish") n += 1;
    }
  }
  return n;
}

function legumeCount(days) {
  return days.reduce((n, day) => {
    return n + MEAL_SLOTS.filter((s) => day.meals[s]?.protein === "legume").length;
  }, 0);
}

function localLunchRatio(days) {
  if (!days.length) return 0;
  let local = 0;
  for (const day of days) {
    const c = day.meals.lunch?.cuisine;
    if (c === "bashkir" || c === "tatar") local += 1;
  }
  return local / days.length;
}

function applyWeeklyGuarantees(days, settings, rng, used, targets) {
  const blocked = dislikedProductIds(settings.disliked);
  const fishBlocked = blocked.has("fishFillet") && blocked.has("pike");
  if (!fishBlocked && fishCount(days) < 2) {
    forceProtein(days, "fish", 2, settings, rng, used, targets, ["lunch", "dinner"]);
  }
  if (legumeCount(days) < 1) {
    forceProtein(days, "legume", 1, settings, rng, used, targets, ["lunch", "dinner"]);
  }
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const dairy = MEAL_SLOTS.some((s) => day.meals[s] && hasDairy(day.meals[s]));
    if (!dairy) {
      const snack = pickRecipe({
        slot: "snackPm",
        settings,
        rng,
        used,
        dayUsed: new Set(MEAL_SLOTS.map((s) => day.meals[s]?.id).filter(Boolean)),
        prevLunchProtein: null,
        days,
        targets,
        exclude: new Set(),
        cheaperThan: null,
      });
      if (snack && hasDairy(snack)) {
        day.meals.snackPm = snack;
        days[i] = makeDay(i, day.meals, targets);
      }
    }
  }
  if (settings.preferLocal && localLunchRatio(days) < 0.28) {
    const localLunches = RECIPES.filter(
      (r) =>
        r.meal === "lunch" &&
        (r.cuisine === "bashkir" || r.cuisine === "tatar") &&
        isEligible(r, "lunch", settings, new Set())
    );
    if (localLunches.length) {
      const idx = Math.min(2, days.length - 1);
      days[idx].meals.lunch = localLunches[Math.floor(rng() * localLunches.length)];
      days[idx] = makeDay(idx, days[idx].meals, targets);
    }
  }
}

function forceProtein(days, protein, minCount, settings, rng, used, targets, slots) {
  let missing = minCount - (protein === "fish" ? fishCount(days) : legumeCount(days));
  const pool = RECIPES.filter((r) => r.protein === protein && r.childSafe);
  for (const day of days) {
    if (missing <= 0) break;
    for (const slot of slots) {
      if (missing <= 0) break;
      if (day.meals[slot]?.protein === protein) continue;
      const mealType = SLOT_TO_MEAL[slot];
      const candidates = pool.filter((r) => isEligible(r, mealType, settings, new Set([day.meals[slot]?.id])));
      if (!candidates.length) continue;
      day.meals[slot] = candidates[Math.floor(rng() * candidates.length)];
      missing -= 1;
    }
  }
  for (let i = 0; i < days.length; i++) {
    days[i] = makeDay(i, days[i].meals, targets);
  }
}

function balanceDays(days, settings, rng, used, targets) {
  const lo = targets.family.kcal * 0.9;
  const hi = targets.family.kcal * 1.1;
  for (let i = 0; i < days.length; i++) {
    let kcal = days[i].totals.kcal;
    let guard = 0;
    while ((kcal < lo || kcal > hi) && guard < 6) {
      const trySlots = kcal < lo ? ["lunch", "dinner", "breakfast"] : ["snackPm", "dinner", "breakfast"];
      const slot = trySlots[guard % trySlots.length];
      const current = days[i].meals[slot];
      const protectedProtein = current && (current.protein === "fish" || current.protein === "legume");
      const next = pickRecipe({
        slot,
        settings,
        rng,
        used,
        dayUsed: new Set(MEAL_SLOTS.map((s) => days[i].meals[s]?.id).filter(Boolean)),
        prevLunchProtein: i > 0 ? days[i - 1].meals.lunch?.protein : null,
        days,
        targets,
        exclude: new Set(current ? [current.id] : []),
        cheaperThan: null,
      });
      if (!next || next.id === current?.id) {
        guard += 1;
        continue;
      }
      if (protectedProtein && next.protein !== current.protein && fishCount(days) <= 2) {
        guard += 1;
        continue;
      }
      const nextKcal = familyMealNutrition(next).kcal;
      const curKcal = current ? familyMealNutrition(current).kcal : 0;
      const better = kcal < lo ? nextKcal > curKcal : nextKcal < curKcal;
      if (better) {
        days[i].meals[slot] = next;
        days[i] = makeDay(i, days[i].meals, targets);
        kcal = days[i].totals.kcal;
      }
      guard += 1;
    }
  }
}

const WEEKDAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
