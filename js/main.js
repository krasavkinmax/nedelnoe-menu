import { initialState, saveState } from "./state.js";
import { generateWeek, replaceMeal, replaceMealById, skipMeal, restoreMeal } from "./engine/generator.js";
import { exportWeekPdf } from "./engine/pdf-export.js";
import { buildStandaloneHtml, shareReport, downloadTextFile } from "./engine/report.js";
import { recipeCost } from "./engine/nutrition.js";
import { formatRub } from "./engine/shopping.js";
import { render } from "./ui/render.js";
import { DISLIKE_OPTIONS, ALLERGY_EXCLUDE, cookSessionsCount, cookSessionsHint } from "./data/family.js";

const root = document.getElementById("app");
const state = initialState();

const actions = {
  generate() {
    state.seed = (Math.random() * 0xffffffff) >>> 0;
    state.week = generateWeek(state.settings, state.seed);
    state.shopChecked = {};
    state.tab = "menu";
    state.replaceOpen = null;
    state.reportOpen = false;
    const sessions = cookSessionsCount(state.settings);
    state.toast = sessions
      ? `Неделя собрана: обед и ужин готовим ${sessions === 2 ? "два" : "три"} раза (${cookSessionsHint(state.settings)}). В каждой сессии оба блюда — вместе, воскресенье из остатков.`
      : "Новая неделя собрана. Можно заменить любое блюдо или выбрать более дешёвый вариант.";
    persist();
  },
  replace(dayIndex, slot, mode) {
    if (!state.week) return;
    if (mode !== "cheaper") {
      state.replaceOpen = { dayIndex, slot };
      state.replaceQuery = "";
      state.replaceFocus = false;
      state.recipeOpen = null;
      state.loreOpen = false;
      paint();
      return;
    }
    const next = replaceMeal(state.week, dayIndex, slot, state.settings, mode);
    if (!next.lastReplace?.to || next.lastReplace.to.id === state.week.days[dayIndex].meals[slot]?.id) {
      state.toast = "Подходящей замены в каталоге нет — попробуйте другое блюдо или снимите ограничения в настройках.";
      paint();
      return;
    }
    applyReplace(next);
  },
  closeReplace() {
    state.replaceOpen = null;
    state.replaceQuery = "";
    state.replaceFocus = false;
    paint();
  },
  setReplaceQuery(value) {
    state.replaceQuery = value;
    state.replaceFocus = true;
    paint();
  },
  pickReplace(recipeId) {
    if (!state.week || !state.replaceOpen) return;
    const { dayIndex, slot } = state.replaceOpen;
    const currentId = state.week.days[dayIndex].meals[slot]?.id;
    if (recipeId === currentId) {
      state.replaceOpen = null;
      paint();
      return;
    }
    const next = replaceMealById(state.week, dayIndex, slot, state.settings, recipeId);
    if (!next.lastReplace?.to || next.lastReplace.to.id === currentId) {
      state.toast = "Это блюдо сюда поставить нельзя.";
      paint();
      return;
    }
    state.replaceOpen = null;
    state.replaceQuery = "";
    applyReplace(next);
  },
  openReport() {
    if (!state.week) {
      state.toast = "Сначала составьте меню.";
      paint();
      return;
    }
    state.reportOpen = true;
    state.replaceOpen = null;
    state.recipeOpen = null;
    state.loreOpen = false;
    paint();
  },
  closeReport() {
    state.reportOpen = false;
    paint();
  },
  printReport() {
    window.print();
  },
  async shareReport() {
    if (!state.week) return;
    const result = await shareReport(state.week, state.settings);
    if (result === "shared") state.toast = "Отчёт отправлен.";
    else if (result === "download") state.toast = "Файл HTML сохранён — его можно открыть и распечатать.";
    paint();
  },
  downloadReportHtml() {
    if (!state.week) return;
    downloadTextFile("Menyu-na-nedelyu.html", buildStandaloneHtml(state.week, state.settings), "text/html");
    state.toast = "Скачан файл HTML. На телефоне откройте его и нажмите «Поделиться» или «Печать».";
    paint();
  },
  async exportPdf() {
    if (!state.week) {
      state.toast = "Сначала составьте меню.";
      paint();
      return;
    }
    state.toast = "Готовим PDF…";
    paint();
    try {
      await exportWeekPdf(state.week, state.settings);
      state.toast = "Файл «Menyu-na-nedelyu.pdf» скачан. На компьютере он в загрузках; на телефоне PDF часто не создаётся — лучше печать или HTML.";
    } catch (err) {
      state.toast = "PDF на этом устройстве недоступен. Откройте отчёт и нажмите «Печать» или скачайте HTML.";
      console.error(err);
    }
    paint();
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
    state.settings.liked = (state.settings.liked || []).filter((x) => !set.has(x));
    persist();
  },
  toggleLike(id) {
    const opt = DISLIKE_OPTIONS.find((o) => o.id === id);
    if (opt?.locked || ALLERGY_EXCLUDE.includes(id)) return;
    if (state.settings.disliked.includes(id)) return;
    const set = new Set(state.settings.liked || []);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    state.settings.liked = [...set];
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
  skip(dayIndex, slot) {
    if (!state.week) return;
    state.week = skipMeal(state.week, dayIndex, slot, state.settings);
    const sessions = cookSessionsCount(state.settings) && (slot === "lunch" || slot === "dinner");
    state.toast = sessions
      ? "Блюдо убрано на все дни этой готовки. Список покупок пересчитан."
      : "Блюдо убрано из этого дня. Список покупок пересчитан.";
    persist();
  },
  restore(dayIndex, slot) {
    if (!state.week) return;
    state.week = restoreMeal(state.week, dayIndex, slot, state.settings);
    state.toast = "Блюдо возвращено, покупки обновлены.";
    persist();
  },
  setCookSessions(value) {
    const n = Number(value);
    state.settings.cookSessions = n === 2 || n === 3 ? n : 0;
    persist();
  },
};

function applyReplace(next) {
  state.week = next;
  const { from, to, saved } = next.lastReplace;
  const cheaper = saved > 5;
  state.toast = cheaper
    ? `«${to.title}» вместо «${from.title}». Экономия около ${formatRub(saved)}.`
    : `«${to.title}» вместо «${from.title}». Было ${formatRub(recipeCost(from))}, стало ${formatRub(recipeCost(to))}.`;
  persist();
}

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
