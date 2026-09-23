import { afterEach, describe, expect, it, vi } from "vitest";
import { THEME_KEY, THEME_SCRIPT, readThemeChoice, setThemeChoice } from "../lib/theme";

/**
 * A page for THEME_SCRIPT (inline in app/layout.tsx) to run on: <html>,
 * localStorage and the OS color scheme, all fake. `storage: "blocked"` throws
 * on every access, as browsers do when site data is blocked.
 */
function page({
  stored,
  osDark = false,
  storage = "ok",
}: { stored?: string; osDark?: boolean; storage?: "ok" | "blocked" } = {}) {
  const attributes = new Map<string, string>();
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
  const window = Object.assign(new EventTarget(), { matchMedia: () => os });
  const document = { documentElement: { setAttribute: (k: string, v: string) => void attributes.set(k, v) } };

  new Function("window", "document", "localStorage", THEME_SCRIPT)(window, document, localStorage);

  return {
    window,
    localStorage,
    items,
    theme: () => attributes.get("data-theme"),
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

/** Points lib/theme.ts's window and localStorage at a fake page. */
function useAsGlobals(p: ReturnType<typeof page>) {
  vi.stubGlobal("window", p.window);
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
