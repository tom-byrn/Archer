/**
 * The dev preview (`pnpm dev`, then open the printed URL): the stage scaled
 * to the window, play/pause with the soundtrack (out/soundtrack.wav when it
 * exists), a scrubber and the bar:beat readout. Space plays, arrows step a
 * frame (shift: a beat), [ and ] jump a bar.
 */
import { seek } from "./engine";
import { BAR, BEAT, DURATION, FPS } from "./time";

export function mountPreview(): void {
  const viewport = document.getElementById("viewport")!;
  document.body.style.overflow = "hidden";
  const bar = document.createElement("div");
  bar.style.cssText =
    "position:fixed;left:0;right:0;bottom:0;height:44px;display:flex;align-items:center;gap:12px;padding:0 14px;background:#111;color:#ddd;font:13px ui-monospace,monospace;z-index:10";
  const play = document.createElement("button");
  play.textContent = "▶";
  play.style.cssText = "width:36px;height:28px;background:#222;color:#ddd;border:1px solid #444;border-radius:6px";
  const range = document.createElement("input");
  range.type = "range";
  range.min = "0";
  range.max = String(DURATION);
  range.step = String(1 / FPS);
  range.style.flex = "1";
  const readout = document.createElement("span");
  bar.append(play, range, readout);
  document.body.append(bar);

  const audio = new Audio("/soundtrack.wav");
  audio.preload = "auto";
  let t = Number(new URLSearchParams(location.search).get("t") ?? 0);
  let playing = false;
  let startedAt = 0;

  const fit = () => {
    const k = Math.min(innerWidth / 1920, (innerHeight - 44) / 1080);
    viewport.style.transform = `scale(${k})`;
  };
  const show = () => {
    seek(t);
    range.value = String(t);
    const b = Math.floor(t / BAR);
    const beat = (t - b * BAR) / BEAT;
    readout.textContent = `${t.toFixed(3)}s  bar ${b}:${beat.toFixed(2)}`;
  };
  const tick = () => {
    if (!playing) return;
    t = audio.readyState >= 2 && !audio.paused ? audio.currentTime : (performance.now() - startedAt) / 1000;
    if (t >= DURATION) {
      t = DURATION;
      toggle();
    }
    show();
    requestAnimationFrame(tick);
  };
  const toggle = () => {
    playing = !playing;
    play.textContent = playing ? "❚❚" : "▶";
    if (playing) {
      if (t >= DURATION) t = 0;
      startedAt = performance.now() - t * 1000;
      audio.currentTime = t;
      void audio.play().catch(() => {});
      requestAnimationFrame(tick);
    } else audio.pause();
  };
  play.onclick = toggle;
  range.oninput = () => {
    t = Number(range.value);
    audio.currentTime = t;
    startedAt = performance.now() - t * 1000;
    show();
  };
  addEventListener("keydown", (e) => {
    if (e.key === " ") {
      e.preventDefault();
      toggle();
    }
    const step = e.shiftKey ? BEAT : 1 / FPS;
    if (e.key === "ArrowRight") t = Math.min(DURATION, t + step);
    if (e.key === "ArrowLeft") t = Math.max(0, t - step);
    if (e.key === "]") t = Math.min(DURATION, (Math.floor(t / BAR + 1e-6) + 1) * BAR);
    if (e.key === "[") t = Math.max(0, (Math.ceil(t / BAR - 1e-6) - 1) * BAR);
    if (!playing) show();
  });
  addEventListener("resize", fit);
  fit();
  show();
}
