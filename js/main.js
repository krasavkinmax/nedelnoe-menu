import { initialState, saveState } from "./state.js";
import { generateWeek, replaceMeal } from "./engine/generator.js";
import { recipeCost } from "./engine/nutrition.js";
import { formatRub } from "./engine/shopping.js";
import { render } from "./ui/render.js";
import { DISLIKE_OPTIONS, ALLERGY_EXCLUDE } from "./data/family.js";

const root = document.getElementById("app");
const state = initialState();

const actions = {
  generate() {
    state.seed = (Math.random() * 0xffffffff) >>> 0;
    state.week = generateWeek(state.settings, state.seed);
    state.shopChecked = {};
    state.tab = "menu";
    state.toast = "Новая неделя собрана. Можно заменить любое блюдо или выбрать более дешёвый вариант.";
    persist();
  },
  replace(dayIndex, slot, mode) {
    if (!state.week) return;
    const next = replaceMeal(state.week, dayIndex, slot, state.settings, mode);
    if (!next.lastReplace?.to || next.lastReplace.to.id === state.week.days[dayIndex].meals[slot]?.id) {
      state.toast = "Подходящей замены в каталоге нет — попробуйте другое блюдо или снимите ограничения в настройках.";
      paint();
      return;
    }
    state.week = next;
    const { from, to, saved } = next.lastReplace;
    const cheaper = saved > 5;
    state.toast = cheaper
      ? `«${to.title}» вместо «${from.title}». Экономия около ${formatRub(saved)}.`
      : `«${to.title}» вместо «${from.title}». Было ${formatRub(recipeCost(from))}, стало ${formatRub(recipeCost(to))}.`;
    persist();
  },
  setTab(tab) {
    state.tab = tab;
    persist();
  },
  toggleShop(id) {
    state.shopChecked[id] = !state.shopChecked[id];
    persist();
  },
  setActivity(activity) {
    state.settings.activity = activity;
    persist();
  },
  setPreferLocal(value) {
    state.settings.preferLocal = value;
    persist();
  },
  setMonth(month) {
    state.settings.month = month;
    persist();
  },
  toggleDislike(id) {
    const opt = DISLIKE_OPTIONS.find((o) => o.id === id);
    if (opt?.locked) return;
    const set = new Set(state.settings.disliked);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    for (const allergy of ALLERGY_EXCLUDE) set.add(allergy);
    state.settings.disliked = [...set];
    persist();
  },
  setDay(index) {
    state.selectedDay = index;
    persist();
  },
  openRecipe(dayIndex, slot) {
    state.recipeOpen = { dayIndex, slot };
    state.loreOpen = false;
    paint();
  },
  closeRecipe() {
    state.recipeOpen = null;
    state.loreOpen = false;
    paint();
  },
  openLore() {
    if (!state.recipeOpen) return;
    state.loreOpen = true;
    paint();
  },
  closeLore() {
    state.loreOpen = false;
    paint();
  },
};

function persist() {
  saveState(state);
  paint();
}

function paint() {
  try {
    render(root, state, actions);
  } catch (err) {
    root.innerHTML = `<section class="empty"><h2>Не удалось открыть меню</h2><p>${String(err)}</p></section>`;
    console.error(err);
  }
}

paint();
