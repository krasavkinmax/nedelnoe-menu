import { DEFAULT_SETTINGS } from "./data/family.js";

const KEY = "bashkir-week-menu-v1";

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
  };
  localStorage.setItem(KEY, JSON.stringify(snapshot));
}

export function initialState() {
  const saved = loadState();
  return {
    settings: { ...DEFAULT_SETTINGS, ...(saved?.settings || {}) },
    seed: saved?.seed ?? Date.now() >>> 0,
    week: saved?.week ?? null,
    shopChecked: saved?.shopChecked ?? {},
    tab: saved?.tab ?? "menu",
    toast: null,
  };
}
