import { RECIPES, DAIRY_PRODUCT_IDS } from "../data/recipes.js";
import { recipeInSeason } from "../data/seasons.js";
import { familyTargets, SLOT_KCAL_SHARE, MEAL_SLOTS, MEAL_SCALE, dislikedProductIds, leftoverPartner, isSkipped, ALLERGY_EXCLUDE } from "../data/family.js";
import {
  recipeNutrition,
  familyMealNutrition,
  recipeCost,
  hasDairy,
  addNutrition,
  emptyNutrition,
  roundNutrition,
} from "./nutrition.js";
import { buildShoppingList } from "./shopping.js";
import { mulberry32, pickBest } from "./rng.js";

const SLOT_TO_MEAL = {
  breakfast: "breakfast",
  lunch: "lunch",
  dinner: "dinner",
  snackAm: "snack",
  snackPm: "snack",
};

const MAIN_PRODUCT_GROUP = {
  chicken: "chicken",
  chickenBreast: "chicken",
  turkey: "turkey",
  beef: "beef",
  pork: "pork",
  liver: "liver",
  fishFillet: "fish",
  pike: "fish",
};

export const TARGET_WEEK_COST = 7000;

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
        minCost: null,
        sameDayLunch: meals.lunch || null,
        sameDayDinner: meals.dinner || null,
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
  fixSameDayMains(days, settings, rng, used, targets);
  ensurePairSoups(days, settings, rng, used, targets);
  syncLeftovers(days, settings, targets);
  if (settings.cookTwoDays && fishCount(days) < 2 && !dislikedProductIds(settings.disliked).has("fishFillet")) {
    forceProtein(days, "fish", 2, settings, rng, used, targets, ["lunch", "dinner"]);
    fixSameDayMains(days, settings, rng, used, targets);
    ensurePairSoups(days, settings, rng, used, targets);
    syncLeftovers(days, settings, targets);
  }
  balanceWeekCost(days, settings, rng, used, targets);
  syncLeftovers(days, settings, targets);
  fixSameDayMains(days, settings, rng, used, targets);
  ensurePairSoups(days, settings, rng, used, targets);
  syncLeftovers(days, settings, targets);

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
    minCost: null,
    sameDayLunch: days[dayIndex].meals.lunch,
    sameDayDinner: days[dayIndex].meals.dinner,
  });

  if (!next) return week;

  days[dayIndex].meals[slot] = next;
  const partner = leftoverPartner(dayIndex, settings.cookTwoDays);
  if (partner != null && (slot === "lunch" || slot === "dinner")) {
    days[partner].meals[slot] = next;
  }
  if (settings.cookTwoDays && (slot === "lunch" || slot === "dinner")) {
    const fill = slot === "lunch" ? "dinner" : "lunch";
    ensurePairSoups(days, settings, rng, used, week.targets, fill);
    syncLeftovers(days, settings, week.targets);
  }

  const nextWeek = refreshWeekNutrition({
    ...week,
    days,
  });
  nextWeek.lastReplace = {
    slot,
    dayIndex,
    from: current,
    to: days[dayIndex].meals[slot],
    saved: current ? recipeCost(current) - recipeCost(days[dayIndex].meals[slot]) : 0,
  };
  return nextWeek;
}

export function mealTypeForSlot(slot) {
  return SLOT_TO_MEAL[slot];
}

export function listReplaceOptions(week, dayIndex, slot, settings) {
  const mealType = SLOT_TO_MEAL[slot];
  const current = week.days[dayIndex]?.meals[slot];
  const other =
    slot === "dinner"
      ? week.days[dayIndex]?.meals.lunch
      : slot === "lunch"
        ? week.days[dayIndex]?.meals.dinner
        : null;
  const blocked = dislikedProductIds(settings.disliked);
  const allergy = new Set(ALLERGY_EXCLUDE);
  return RECIPES.filter((r) => r.meal === mealType)
    .map((recipe) => {
      const hasAllergy = recipe.ingredients.some((ing) => allergy.has(ing.productId));
      const disliked = recipe.ingredients.some((ing) => blocked.has(ing.productId));
      return {
        recipe,
        current: recipe.id === current?.id,
        hasAllergy,
        disliked,
        inSeason: recipeInSeason(recipe, settings.month),
        conflict: Boolean((slot === "lunch" || slot === "dinner") && other && sharesMainIngredient(recipe, other)),
        cheaper: Boolean(current && recipeCost(recipe) < recipeCost(current) * 0.95),
      };
    })
    .sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1;
      if (a.hasAllergy !== b.hasAllergy) return a.hasAllergy ? 1 : -1;
      if (a.inSeason !== b.inSeason) return a.inSeason ? -1 : 1;
      return a.recipe.title.localeCompare(b.recipe.title, "ru");
    });
}

export function replaceMealById(week, dayIndex, slot, settings, recipeId) {
  const mealType = SLOT_TO_MEAL[slot];
  const nextRecipe = RECIPES.find((r) => r.id === recipeId && r.meal === mealType);
  if (!nextRecipe) return week;

  const days = week.days.map((day) => ({
    ...day,
    meals: { ...day.meals },
  }));
  const current = days[dayIndex].meals[slot];
  if (current?.id === nextRecipe.id) return week;

  days[dayIndex].meals[slot] = nextRecipe;
  const partner = leftoverPartner(dayIndex, settings.cookTwoDays);
  if (partner != null && (slot === "lunch" || slot === "dinner")) {
    days[partner].meals[slot] = nextRecipe;
  }

  const nextWeek = refreshWeekNutrition({
    ...week,
    days,
  });
  nextWeek.lastReplace = {
    slot,
    dayIndex,
    from: current,
    to: nextRecipe,
    saved: current ? recipeCost(current) - recipeCost(nextRecipe) : 0,
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

export function mainIngredientKeys(recipe) {
  const keys = new Set();
  if (!recipe) return keys;
  if (recipe.protein && recipe.protein !== "veg" && recipe.protein !== "dairy") {
    keys.add(recipe.protein);
  }
  for (const ing of recipe.ingredients || []) {
    const group = MAIN_PRODUCT_GROUP[ing.productId];
    if (group) keys.add(group);
  }
  return keys;
}

export function sharesMainIngredient(a, b) {
  if (!a || !b) return false;
  const left = mainIngredientKeys(a);
  for (const key of mainIngredientKeys(b)) {
    if (left.has(key)) return true;
  }
  return false;
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

function porkAlready(ctx) {
  if (porkCount(ctx.days) >= 1) return true;
  if (ctx.sameDayLunch?.protein === "pork") return true;
  if (ctx.sameDayDinner?.protein === "pork") return true;
  return false;
}

function porkCount(days) {
  let n = 0;
  for (const day of days) {
    if (day.meals.lunch?.protein === "pork" || day.meals.dinner?.protein === "pork") n += 1;
  }
  return n;
}

function pickRecipe(ctx) {
  const mealType = SLOT_TO_MEAL[ctx.slot];
  const other =
    ctx.slot === "dinner"
      ? ctx.sameDayLunch
      : ctx.slot === "lunch"
        ? ctx.sameDayDinner
        : null;
  let candidates = RECIPES.filter((r) => isEligible(r, mealType, ctx.settings, ctx.exclude));

  if ((ctx.slot === "lunch" || ctx.slot === "dinner") && other) {
    const noOverlap = candidates.filter((r) => !sharesMainIngredient(r, other));
    if (noOverlap.length) candidates = noOverlap;
  }

  if (porkAlready(ctx)) {
    const noPork = candidates.filter((r) => r.protein !== "pork");
    if (noPork.length) candidates = noPork;
  }

  if (ctx.cheaperThan != null) {
    const cheaper = candidates.filter((r) => recipeCost(r) <= ctx.cheaperThan);
    if (cheaper.length) candidates = cheaper;
  }
  if (ctx.minCost != null) {
    const pricier = candidates.filter((r) => recipeCost(r) >= ctx.minCost);
    if (pricier.length) candidates = pricier;
  }
  if (!candidates.length) {
    candidates = RECIPES.filter((r) => r.meal === mealType && r.childSafe);
    if ((ctx.slot === "lunch" || ctx.slot === "dinner") && other) {
      const noOverlap = candidates.filter((r) => !sharesMainIngredient(r, other));
      if (noOverlap.length) candidates = noOverlap;
    }
  }
  const needFish = fishCount(ctx.days) < 2;
  const needLegume = legumeCount(ctx.days) < 1;
  const localLunchShare = localLunchRatio(ctx.days);
  const wantPairSoup = Boolean(ctx.settings.cookTwoDays && (ctx.slot === "lunch" || ctx.slot === "dinner"));

  return pickBest(candidates, (recipe) => {
    let s = ctx.rng() * 0.8;
    const times = ctx.used.get(recipe.id) || 0;
    s -= times * 3;
    if (ctx.dayUsed.has(recipe.id)) s -= 8;

    if (ctx.slot === "lunch" && ctx.prevLunchProtein && recipe.protein === ctx.prevLunchProtein) {
      s -= 4;
    }

    if (other && sharesMainIngredient(recipe, other)) s -= 12;

    if (ctx.settings.preferLocal && (recipe.cuisine === "bashkir" || recipe.cuisine === "tatar")) {
      s += ctx.slot === "lunch" && localLunchShare < 0.3 ? 3.5 : 1.5;
    }

    s -= recipe.costLevel * 0.08;
    s -= Math.abs((recipe.costLevel || 2) - 2.3) * 0.2;

    const scaledKcal = recipeNutrition(recipe).kcal * (MEAL_SCALE[recipe.meal] ?? 1);
    const slotTarget = (ctx.targets.family.kcal * SLOT_KCAL_SHARE[ctx.slot]) / 2.4;
    const err = Math.abs(scaledKcal - slotTarget) / Math.max(slotTarget, 1);
    s -= err * 2.2;

    if (needFish && recipe.protein === "fish" && (ctx.slot === "lunch" || ctx.slot === "dinner")) s += 3.5;
    if (needLegume && recipe.protein === "legume") s += 3;
    if ((ctx.slot === "snackAm" || ctx.slot === "snackPm") && recipeHasDairyProduct(recipe)) s += 1.2;

    if (recipe.protein === "pork") s -= 5.5;

    if (wantPairSoup) {
      const lunch = ctx.slot === "lunch" ? recipe : ctx.sameDayLunch;
      const dinner = ctx.slot === "dinner" ? recipe : ctx.sameDayDinner;
      if (ctx.slot === "lunch" && recipe.soup) s += 3.2;
      if (lunch && dinner) {
        if (lunch.soup && dinner.soup) s -= 2.4;
        if (!lunch.soup && !dinner.soup) s -= 1.8;
        if ((lunch.soup && !dinner.soup) || (!lunch.soup && dinner.soup)) s += 2.2;
      }
    }

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

function editableDayIndexes(settings) {
  return settings.cookTwoDays ? [0, 2, 4, 6] : [0, 1, 2, 3, 4, 5, 6];
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
        minCost: null,
        sameDayLunch: day.meals.lunch,
        sameDayDinner: day.meals.dinner,
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
    const dinner = days[Math.min(2, days.length - 1)]?.meals.dinner;
    const filtered = localLunches.filter((r) => !sharesMainIngredient(r, dinner));
    const pool = filtered.length ? filtered : localLunches;
    if (pool.length) {
      const idx = Math.min(2, days.length - 1);
      days[idx].meals.lunch = pool[Math.floor(rng() * pool.length)];
      days[idx] = makeDay(idx, days[idx].meals, targets);
    }
  }
}

function forceProtein(days, protein, minCount, settings, rng, used, targets, slots) {
  let missing = minCount - (protein === "fish" ? fishCount(days) : legumeCount(days));
  const pool = RECIPES.filter((r) => r.protein === protein && r.childSafe);
  for (const i of editableDayIndexes(settings)) {
    const day = days[i];
    if (missing <= 0) break;
    for (const slot of slots) {
      if (missing <= 0) break;
      if (day.meals[slot]?.protein === protein) continue;
      const mealType = SLOT_TO_MEAL[slot];
      const other = slot === "lunch" ? day.meals.dinner : day.meals.lunch;
      const candidates = pool.filter(
        (r) =>
          isEligible(r, mealType, settings, new Set([day.meals[slot]?.id])) &&
          !sharesMainIngredient(r, other)
      );
      if (!candidates.length) continue;
      day.meals[slot] = candidates[Math.floor(rng() * candidates.length)];
      missing -= 1;
    }
  }
  for (let i = 0; i < days.length; i++) {
    days[i] = makeDay(i, days[i].meals, targets);
  }
}

function fixSameDayMains(days, settings, rng, used, targets) {
  for (const i of editableDayIndexes(settings)) {
    const lunch = days[i].meals.lunch;
    const dinner = days[i].meals.dinner;
    if (!sharesMainIngredient(lunch, dinner)) continue;
    const next = pickRecipe({
      slot: "dinner",
      settings,
      rng,
      used,
      dayUsed: new Set(MEAL_SLOTS.map((s) => days[i].meals[s]?.id).filter(Boolean)),
      prevLunchProtein: i > 0 ? days[i - 1].meals.lunch?.protein : null,
      days,
      targets,
      exclude: new Set(dinner ? [dinner.id] : []),
      cheaperThan: null,
      minCost: null,
      sameDayLunch: lunch,
      sameDayDinner: dinner,
    });
    if (next && !sharesMainIngredient(next, lunch)) {
      days[i].meals.dinner = next;
      days[i] = makeDay(i, days[i].meals, targets);
    }
  }
}

function ensurePairSoups(days, settings, rng, used, targets, preferFill = "lunch") {
  if (!settings.cookTwoDays) return;
  for (const a of [0, 2, 4]) {
    const lunch = days[a].meals.lunch;
    const dinner = days[a].meals.dinner;
    if (lunch?.soup || dinner?.soup) continue;
    const order = preferFill === "dinner" ? ["dinner", "lunch"] : ["lunch", "dinner"];
    for (const slot of order) {
      const current = days[a].meals[slot];
      const other = slot === "lunch" ? dinner : lunch;
      const pool = RECIPES.filter(
        (r) =>
          r.soup &&
          r.meal === (slot === "lunch" ? "lunch" : "dinner") &&
          isEligible(r, slot === "lunch" ? "lunch" : "dinner", settings, new Set([current?.id])) &&
          !sharesMainIngredient(r, other)
      );
      if (!pool.length) continue;
      days[a].meals[slot] = pool[Math.floor(rng() * pool.length)];
      days[a] = makeDay(a, days[a].meals, targets);
      break;
    }
  }
}

function weekShopTotal(days) {
  return buildShoppingList({ days, skipped: {} }).total;
}

function balanceWeekCost(days, settings, rng, used, targets) {
  const lo = TARGET_WEEK_COST - 500;
  const hi = TARGET_WEEK_COST + 700;
  for (let guard = 0; guard < 14; guard++) {
    const total = weekShopTotal(days);
    if (total >= lo && total <= hi) break;
    const tooLow = total < lo;
    let improved = false;
    for (const i of editableDayIndexes(settings)) {
      for (const slot of ["lunch", "dinner"]) {
        const current = days[i].meals[slot];
        if (!current) continue;
        const next = pickRecipe({
          slot,
          settings,
          rng,
          used,
          dayUsed: new Set(MEAL_SLOTS.map((s) => days[i].meals[s]?.id).filter(Boolean)),
          prevLunchProtein: i > 0 ? days[i - 1].meals.lunch?.protein : null,
          days,
          targets,
          exclude: new Set([current.id]),
          cheaperThan: tooLow ? null : recipeCost(current) * 0.92,
          minCost: tooLow ? recipeCost(current) * 1.06 : null,
          sameDayLunch: days[i].meals.lunch,
          sameDayDinner: days[i].meals.dinner,
        });
        if (!next || next.id === current.id) continue;
        const other = slot === "lunch" ? days[i].meals.dinner : days[i].meals.lunch;
        if (sharesMainIngredient(next, other)) continue;
        if (settings.cookTwoDays && leftoverPartner(i, true) != null) {
          if (current.soup && !next.soup && !other?.soup) continue;
        }
        const curC = recipeCost(current);
        const nextC = recipeCost(next);
        if (tooLow && nextC <= curC) continue;
        if (!tooLow && nextC >= curC) continue;
        days[i].meals[slot] = next;
        const partner = leftoverPartner(i, settings.cookTwoDays);
        if (partner != null && (slot === "lunch" || slot === "dinner")) {
          days[partner].meals[slot] = next;
        }
        days[i] = makeDay(i, days[i].meals, targets);
        improved = true;
        break;
      }
      if (improved) break;
    }
    if (!improved) break;
  }
}

function balanceDays(days, settings, rng, used, targets) {
  const lo = targets.family.kcal * 0.9;
  const hi = targets.family.kcal * 1.1;
  for (let i = 0; i < days.length; i++) {
    if (settings.cookTwoDays && i % 2 === 1 && i < 6) continue;
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
        minCost: null,
        sameDayLunch: days[i].meals.lunch,
        sameDayDinner: days[i].meals.dinner,
      });
      if (!next || next.id === current?.id) {
        guard += 1;
        continue;
      }
      if (protectedProtein && next.protein !== current.protein && fishCount(days) <= 2) {
        guard += 1;
        continue;
      }
      const other = slot === "lunch" ? days[i].meals.dinner : slot === "dinner" ? days[i].meals.lunch : null;
      if (other && sharesMainIngredient(next, other)) {
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
