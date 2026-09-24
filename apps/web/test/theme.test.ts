import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  THEME_ICONS,
  THEME_KEY,
  THEME_SCRIPT,
  readThemeChoice,
  setThemeChoice,
  switchTheme,
} from "../lib/theme";

/**
 * A page for THEME_SCRIPT (inline in app/layout.tsx) to run on: <html>, its
 * <head>, localStorage and the OS color scheme, all fake. `storage:
 * "blocked"` throws on every access, as browsers do when site data is
 * blocked. The viewport is 1000x800; `viewTransitions` gives it
 * document.startViewTransition, which records each transition for the test
 * to run the way a browser would.
 */
function page({
  stored,
  osDark = false,
  storage = "ok",
  viewTransitions = false,
  reducedMotion = false,
}: {
  stored?: string;
  osDark?: boolean;
  storage?: "ok" | "blocked";
  viewTransitions?: boolean;
  reducedMotion?: boolean;
} = {}) {
  const attributes = new Map<string, string>();
  const style = new Map<string, string>();
  const items = new Map<string, string>(stored === undefined ? [] : [[THEME_KEY, stored]]);
  const blocked = () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  const localStorage =
    storage === "ok"
      ? {
          getItem: (k: string) => items.get(k) ?? null,
          setItem: (k: string, v: string) => void items.set(k, v),
          removeItem: (k: string) => void items.delete(k),
        }
      : { getItem: blocked, setItem: blocked, removeItem: blocked };
  const osListeners: (() => void)[] = [];
  const os = {
    matches: osDark,
    addEventListener: (_type: string, listener: () => void) => void osListeners.push(listener),
  };
  const window = Object.assign(new EventTarget(), {
    matchMedia: (query: string) => (query.includes("reduced-motion") ? { matches: reducedMotion } : os),
    innerWidth: 1000,
    innerHeight: 800,
  });
  const transitions: { update: () => void; finish: () => Promise<void> }[] = [];
  const head: { tag: string; attributes: Map<string, string> }[] = [];
  const document = {
    createElement(tag: string) {
      const element = { tag, attributes: new Map<string, string>() };
      return {
        setAttribute: (k: string, v: string) => void element.attributes.set(k, v),
        get isConnected() {
          return head.includes(element);
        },
        element,
      };
    },
    head: {
      appendChild: (child: { element: (typeof head)[number] }) => void head.push(child.element),
    },
    documentElement: {
      getAttribute: (k: string) => attributes.get(k) ?? null,
      setAttribute: (k: string, v: string) => void attributes.set(k, v),
      removeAttribute: (k: string) => void attributes.delete(k),
      style: {
        setProperty: (k: string, v: string) => void style.set(k, v),
        removeProperty: (k: string) => void style.delete(k),
      },
    },
    ...(viewTransitions && {
      startViewTransition(update: () => void) {
        let resolve!: () => void;
        const finished = new Promise<void>((r) => (resolve = r));
        // Resolves `finished` (as the animation ending, or a newer transition
        // skipping this one, does) and waits until its reactions have run.
        const finish = async () => {
          resolve();
          await finished;
        };
        transitions.push({ update, finish });
        return { finished };
      },
    }),
  };

  new Function("window", "document", "localStorage", THEME_SCRIPT)(window, document, localStorage);

  return {
    window,
    document,
    localStorage,
    items,
    attributes,
    style,
    /** View transitions started, in order: run `update` as the browser would, then `finish`. */
    transitions,
    theme: () => attributes.get("data-theme"),
    /** What the page has in <head>, as tag names and attributes. */
    head: () => head.map(({ tag, attributes }) => ({ tag, ...Object.fromEntries(attributes) })),
    /** The href of the tab icon the script linked. */
    icon: () => head[0]?.attributes.get("href"),
    setOsDark(dark: boolean) {
      os.matches = dark;
      for (const listener of osListeners) listener();
    },
    /** Another tab setting (or, with null, removing) the stored choice. */
    otherTab(value: string | null, key: string | null = THEME_KEY) {
      if (value === null) items.delete(THEME_KEY);
      else items.set(THEME_KEY, value);
      window.dispatchEvent(Object.assign(new Event("storage"), { key }));
    },
  };
}

/** Points lib/theme.ts's window, document and localStorage at a fake page. */
function useAsGlobals(p: ReturnType<typeof page>) {
  vi.stubGlobal("window", p.window);
  vi.stubGlobal("document", p.document);
  vi.stubGlobal("localStorage", p.localStorage);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("theme script", () => {
  it("follows the OS scheme until a choice is made", () => {
    expect(page({ osDark: false }).theme()).toBe("light");
    expect(page({ osDark: true }).theme()).toBe("dark");
  });

  it("applies a stored choice over the OS scheme", () => {
    expect(page({ stored: "light", osDark: true }).theme()).toBe("light");
    expect(page({ stored: "dark", osDark: false }).theme()).toBe("dark");
  });

  it("follows the OS scheme when the stored value is unknown or storage is blocked", () => {
    expect(page({ stored: "sepia", osDark: true }).theme()).toBe("dark");
    expect(page({ storage: "blocked", osDark: true }).theme()).toBe("dark");
  });

  it("tracks OS scheme changes only while following the OS", () => {
    const system = page();
    system.setOsDark(true);
    expect(system.theme()).toBe("dark");
    system.setOsDark(false);
    expect(system.theme()).toBe("light");

    const light = page({ stored: "light" });
    light.setOsDark(true);
    expect(light.theme()).toBe("light");
  });

  it("picks up a choice made in another tab", () => {
    const p = page({ osDark: false });
    p.otherTab("dark");
    expect(p.theme()).toBe("dark");
    p.otherTab(null);
    expect(p.theme()).toBe("light");
    p.otherTab("dark", "archer.somethingElse");
    expect(p.theme()).toBe("light");
    // localStorage.clear() elsewhere reports no key.
    p.items.set(THEME_KEY, "dark");
    p.otherTab(null, null);
    expect(p.theme()).toBe("light");
  });

  it("links the theme's tab icon", () => {
    const light = page({ osDark: false });
    expect(light.head()).toEqual([
      { tag: "link", rel: "icon", type: "image/svg+xml", sizes: "any", href: THEME_ICONS.light },
    ]);
    expect(page({ stored: "dark" }).icon()).toBe(THEME_ICONS.dark);
  });

  it("keeps the tab icon on the theme through every change, in one <link>", () => {
    const p = page({ osDark: false });
    p.setOsDark(true);
    expect(p.icon()).toBe(THEME_ICONS.dark);
    p.otherTab("light");
    expect(p.icon()).toBe(THEME_ICONS.light);
    useAsGlobals(p);
    setThemeChoice("dark");
    expect(p.icon()).toBe(THEME_ICONS.dark);
    expect(p.head()).toHaveLength(1);
  });

  it("links icons that exist", () => {
    for (const href of Object.values(THEME_ICONS)) {
      expect(existsSync(new URL(`../public${href}`, import.meta.url))).toBe(true);
    }
  });
});

describe("setThemeChoice", () => {
  it("stores the choice and applies it", () => {
    const p = page({ osDark: false });
    useAsGlobals(p);

    setThemeChoice("dark");
    expect(p.theme()).toBe("dark");
    expect(p.items.get(THEME_KEY)).toBe("dark");
    expect(readThemeChoice()).toBe("dark");

    // "system" is stored as no entry, and goes back to following the OS.
    setThemeChoice("system");
    expect(p.items.has(THEME_KEY)).toBe(false);
    expect(p.theme()).toBe("light");
    expect(readThemeChoice()).toBe("system");
    p.setOsDark(true);
    expect(p.theme()).toBe("dark");
  });

  it("still applies the choice when storage is blocked", () => {
    const p = page({ storage: "blocked", osDark: true });
    useAsGlobals(p);

    setThemeChoice("light");
    expect(p.theme()).toBe("light");
    expect(readThemeChoice()).toBe("light");
    p.setOsDark(false);
    p.setOsDark(true);
    expect(p.theme()).toBe("light");
  });
});

/** A control, `size` px square with its top left at (left, top). */
const control = (left: number, top: number, size = 32) =>
  ({ getBoundingClientRect: () => ({ left, top, width: size, height: size }) }) as Element;

describe("switchTheme", () => {
  it("spreads a new theme from the control, in a view transition", async () => {
    const p = page({ viewTransitions: true });
    useAsGlobals(p);

    switchTheme("dark", control(100, 20));
    // A circle centered on the control, reaching the far corner (884, 764 away).
    expect(p.attributes.has("data-theme-switch")).toBe(true);
    expect(Object.fromEntries(p.style)).toEqual({
      "--theme-switch-x": "116px",
      "--theme-switch-y": "36px",
      "--theme-switch-r": `${Math.hypot(884, 764)}px`,
    });
    // The switch itself waits for the browser to take its still of the old page.
    expect(p.transitions).toHaveLength(1);
    expect(p.theme()).toBe("light");
    p.transitions[0]!.update();
    expect(p.theme()).toBe("dark");
    expect(p.items.get(THEME_KEY)).toBe("dark");

    await p.transitions[0]!.finish();
    expect(p.attributes.has("data-theme-switch")).toBe(false);
    expect(p.style.size).toBe(0);
  });

  it("just switches without view transitions, or for reduced motion", () => {
    for (const p of [page(), page({ viewTransitions: true, reducedMotion: true })]) {
      useAsGlobals(p);
      switchTheme("dark", control(100, 20));
      expect(p.theme()).toBe("dark");
      expect(p.transitions).toHaveLength(0);
      expect(p.attributes.has("data-theme-switch")).toBe(false);
      expect(p.style.size).toBe(0);
    }
  });

  it("only animates a choice that changes the theme", () => {
    const p = page({ viewTransitions: true, stored: "dark", osDark: true });
    useAsGlobals(p);

    // Back to following the OS, which is dark too.
    switchTheme("system", control(100, 20));
    expect(readThemeChoice()).toBe("system");
    expect(p.transitions).toHaveLength(0);

    switchTheme("light", control(100, 20));
    expect(p.transitions).toHaveLength(1);
  });

  it("leaves cleaning up to a newer switch that cut it short", async () => {
    const p = page({ viewTransitions: true });
    useAsGlobals(p);

    switchTheme("dark", control(100, 20));
    p.transitions[0]!.update();
    // A second switch skips the first transition, which finishes early.
    switchTheme("light", control(500, 400, 20));
    await p.transitions[0]!.finish();
    expect(p.attributes.has("data-theme-switch")).toBe(true);
    expect(p.style.get("--theme-switch-x")).toBe("510px");

    p.transitions[1]!.update();
    expect(p.theme()).toBe("light");
    await p.transitions[1]!.finish();
    expect(p.attributes.has("data-theme-switch")).toBe(false);
    expect(p.style.size).toBe(0);
  });
});
