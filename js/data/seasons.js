/**
 * Сезонность продуктов в Республике Башкортостан.
 * Ключ — id продукта, значение — месяцы 1–12. Нет в карте = круглый год.
 */
export const PRODUCT_SEASONS = {
  tomato: [7, 8, 9],
  cucumber: [6, 7, 8, 9],
  zucchini: [6, 7, 8, 9],
  pepper: [7, 8, 9],
  pumpkin: [8, 9, 10, 11, 12, 1],
  greens: [5, 6, 7, 8, 9],
  berries: [6, 7, 8],
  apple: [8, 9, 10, 11, 12, 1],
  cabbage: [7, 8, 9, 10, 11, 12, 1, 2, 3],
  potato: [7, 8, 9, 10, 11, 12, 1, 2, 3, 4],
  carrot: [8, 9, 10, 11, 12, 1, 2, 3, 4],
  beet: [8, 9, 10, 11, 12, 1, 2, 3],
  pear: [8, 9, 10],
  mushrooms: [8, 9, 10],
};

export function isProductInSeason(productId, month) {
  const months = PRODUCT_SEASONS[productId];
  if (!months) return true;
  return months.includes(month);
}

export function recipeInSeason(recipe, month) {
  if (!recipe.seasons || recipe.seasons.length === 0) return true;
  return recipe.seasons.includes(month);
}
