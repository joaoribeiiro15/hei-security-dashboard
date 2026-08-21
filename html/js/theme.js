// ============================================================================
// Theme (dark/light) — persisted in localStorage. Dark is the default; the
// actual attribute is set as early as possible by an inline script in
// index.html's <head> so the correct theme applies before first paint.
// ============================================================================
const THEME_KEY = "hei_theme";

// Reads a CSS custom property's live, theme-resolved value. Used anywhere a
// color has to be baked into a canvas (Chart.js) or SVG (D3 map) attribute,
// since those contexts can't reference var(...) directly.
function _cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback || "";
}

function getTheme() {
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

function applyChartDefaults() {
  if (typeof Chart === "undefined") return;
  Chart.defaults.color = _cssVar("--t2", "#94a3b8");
  Chart.defaults.borderColor = _cssVar("--bdr", "#1e293b");
}

function _updateThemeToggleButton(theme) {
  const btn = document.getElementById("theme-toggle");
  if (!btn) return;
  btn.textContent = theme === "light" ? "\u{1F319} Dark" : "\u{2600}️ Light";
  btn.title =
    theme === "light" ? "Switch to dark mode" : "Switch to light mode";
}

function setTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch (e) {
    /* storage unavailable — theme still applies for this page view */
  }
  _updateThemeToggleButton(t);
  applyChartDefaults();
  // Charts/map bake resolved colors in at creation time, so redraw whatever
  // is currently on screen to pick up the new palette.
  if (typeof buildCurrent === "function") {
    try {
      buildCurrent();
    } catch (e) {
      /* nothing built yet (e.g. pre-login) — nothing to redraw */
    }
  }
}

function toggleTheme() {
  setTheme(getTheme() === "light" ? "dark" : "light");
}

_updateThemeToggleButton(getTheme());
