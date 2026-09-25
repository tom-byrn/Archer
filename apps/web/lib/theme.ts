/**
 * The color theme. Viewers pick System, Light or Dark (a toggle in the landing
 * and docs headers, all three in the account menu). The choice is per browser,
 * in localStorage; "system" is stored as no entry at all. THEME_SCRIPT, inline
 * in app/layout.tsx, resolves it to <html data-theme="light|dark"> before the
 * first paint and keeps that current, and everything themed keys on it: the
 * tokens in globals.css, and useIsDark() for code. A switch made with one of
 * those controls is animated (switchTheme).
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

/** The switch in progress, which cleans up after itself unless a newer one skipped it. */
let switching: ViewTransition | null = null;

/**
 * setThemeChoice for a theme control, `from` being the button the viewer
 * used. When the page's theme changes, the new one spreads over the old in a
 * circle from that button, out to the viewport's farthest corner: a view
 * transition, animated in globals.css from the data-theme-switch attribute
 * and the circle's --theme-switch-* properties set here. Browsers without view
 * transitions, and viewers who prefer reduced motion, just switch.
 */
export function switchTheme(choice: ThemeChoice, from: Element): void {
  const root = document.documentElement;
  // Resolved as THEME_SCRIPT does.
  const dark =
    choice === "dark" ||
    (choice !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (
    dark === (root.getAttribute("data-theme") === "dark") ||
    typeof document.startViewTransition !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    setThemeChoice(choice);
    return;
  }

  const box = from.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  root.style.setProperty("--theme-switch-x", `${x}px`);
  root.style.setProperty("--theme-switch-y", `${y}px`);
  root.style.setProperty("--theme-switch-r", `${r}px`);
  root.setAttribute("data-theme-switch", "");

  const transition = document.startViewTransition(() => setThemeChoice(choice));
  switching = transition;
  const done = () => {
    if (switching !== transition) return;
    switching = null;
    root.removeAttribute("data-theme-switch");
    for (const p of ["x", "y", "r"]) root.style.removeProperty(`--theme-switch-${p}`);
  };
  transition.finished.then(done, done);
}
