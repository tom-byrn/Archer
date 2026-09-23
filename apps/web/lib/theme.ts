/**
 * The color theme. Viewers pick System, Light or Dark (a toggle in the landing
 * and docs headers, all three in the account menu). The choice is per browser,
 * in localStorage; "system" is stored as no entry at all. THEME_SCRIPT, inline
 * in app/layout.tsx, resolves it to <html data-theme="light|dark"> before the
 * first paint and keeps that current, and everything themed keys on it: the
 * tokens in globals.css, and useIsDark() for code.
 */

export type ThemeChoice = "system" | "light" | "dark";

/** localStorage key of an explicit light or dark choice. */
export const THEME_KEY = "archer.theme";

/** Window event carrying a new choice made in this tab (setThemeChoice). */
export const THEME_EVENT = "archer:theme";

/**
 * Runs in <head>, before the body paints: sets data-theme from the stored
 * choice, or from the OS scheme without one. Sets it again when the OS scheme
 * changes, when another tab changes the choice (a storage event), and on
 * THEME_EVENT. Plain ES5, as it runs unbundled.
 */
export const THEME_SCRIPT = `(function () {
  var key = ${JSON.stringify(THEME_KEY)};
  var root = document.documentElement;
  var os = window.matchMedia("(prefers-color-scheme: dark)");
  var choice = null;
  function read() {
    try { choice = localStorage.getItem(key); } catch (e) {}
  }
  function apply() {
    var dark = choice === "dark" || (choice !== "light" && os.matches);
    root.setAttribute("data-theme", dark ? "dark" : "light");
  }
  read();
  apply();
  os.addEventListener("change", apply);
  window.addEventListener("storage", function (e) {
    if (e.key === key || e.key === null) { read(); apply(); }
  });
  window.addEventListener(${JSON.stringify(THEME_EVENT)}, function (e) {
    choice = e.detail;
    apply();
  });
})();`;

/** This tab's choice, for when localStorage is blocked and can't hold it. */
let unsaved: ThemeChoice = "system";

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return unsaved;
  }
}

/** Remembers the choice and applies it, in this tab and (through storage) every other. */
export function setThemeChoice(choice: ThemeChoice): void {
  unsaved = choice;
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage blocked: the choice holds until the page reloads.
  }
  window.dispatchEvent(new CustomEvent<ThemeChoice>(THEME_EVENT, { detail: choice }));
}
