import { chromium, type Browser, type Page } from "playwright-core";
import { HEIGHT, WIDTH } from "../../src/time";

/**
 * Chromium to render with: $CHROMIUM_PATH if set, else Playwright's own
 * download (`npx playwright install chromium-headless-shell`), else Chrome.
 */
export async function launch(): Promise<Browser> {
  const args = ["--hide-scrollbars", "--font-render-hinting=none", "--force-color-profile=srgb"];
  const executablePath = process.env.CHROMIUM_PATH;
  if (executablePath) return chromium.launch({ executablePath, args });
  try {
    return await chromium.launch({ args });
  } catch {
    return chromium.launch({ channel: "chrome", args });
  }
}

/** A 1920×1080 page on the film, fonts loaded and timeline built. */
export async function openFilm(browser: Browser, url: string): Promise<Page> {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (err) => console.error("[page]", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") console.error(`[page ${msg.type()}]`, msg.text());
  });
  await page.goto(`${url}/index.html?render`);
  await page.waitForFunction(() => window.__video !== undefined, null, { timeout: 60_000 });
  return page;
}

/** Put the film at `t` seconds and grab the frame as PNG bytes. */
export async function frameAt(page: Page, t: number): Promise<Buffer> {
  await page.evaluate((time) => window.__video!.seek(time), t);
  const cdp = await cdpFor(page);
  const shot = (await cdp.send("Page.captureScreenshot", {
    format: "png",
    optimizeForSpeed: true,
  })) as { data: string };
  return Buffer.from(shot.data, "base64");
}

const sessions = new WeakMap<Page, import("playwright-core").CDPSession>();
async function cdpFor(page: Page) {
  let s = sessions.get(page);
  if (!s) {
    s = await page.context().newCDPSession(page);
    sessions.set(page, s);
  }
  return s;
}
