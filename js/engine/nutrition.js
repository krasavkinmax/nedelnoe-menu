import { PRODUCTS } from "../data/products.js";
import { portionsFor } from "../data/family.js";

export function emptyNutrition() {
  return { kcal: 0, p: 0, f: 0, c: 0 };
}

export function addNutrition(a, b, factor = 1) {
  return {
    kcal: a.kcal + b.kcal * factor,
    p: a.p + b.p * factor,
    f: a.f + b.f * factor,
    c: a.c + b.c * factor,
  };
}

export function scaleNutrition(n, factor) {
  return {
    kcal: n.kcal * factor,
    p: n.p * factor,
    f: n.f * factor,
    c: n.c * factor,
  };
}

export function roundNutrition(n) {
  return {
    kcal: Math.round(n.kcal),
    p: Math.round(n.p),
    f: Math.round(n.f),
    c: Math.round(n.c),
  };
}

export function recipeNutrition(recipe) {
  const n = emptyNutrition();
  for (const ing of recipe.ingredients) {
    const prod = PRODUCTS[ing.productId];
    if (!prod) continue;
    const k = ing.grams / 100;
    n.kcal += prod.kcal * k;
    n.p += prod.p * k;
    n.f += prod.f * k;
    n.c += prod.c * k;
  }
  return n;
}

export function familyMealNutrition(recipe) {
  return scaleNutrition(recipeNutrition(recipe), portionsFor(recipe));
}

export function recipeCost(recipe, portions = portionsFor(recipe)) {
  let sum = 0;
  for (const ing of recipe.ingredients) {
    const prod = PRODUCTS[ing.productId];
    if (!prod) continue;
    sum += ((ing.grams * portions) / 1000) * prod.pricePerKg;
  }
  return sum;
}

export function hasDairy(recipe) {
  return recipe.ingredients.some((ing) => {
    const prod = PRODUCTS[ing.productId];
    return prod && prod.category === "dairy";
  });
}

export function hasVeg(recipe) {
  return recipe.ingredients.some((ing) => {
    const prod = PRODUCTS[ing.productId];
    return prod && (prod.category === "veg" || prod.category === "fruit");
  });
}

export function ratio(actual, target) {
  if (!target) return 1;
  return actual / target;
}
