/**
 * Bars 3–6: the editor, canvas left and file right, both ways round. A box
 * dragged in from the palette and an arrow pulled between two boxes land in
 * the file; a component and a connection typed into the file land on the
 * canvas.
 */
import { canvasView } from "../camera";
import { flashLine } from "../code";
import { codePane } from "../codepane";
import { cue } from "../cues";
import { drawEdge, glyph, hideAll, layoutDiagram, popNode, renderDiagram } from "../diagram";
import { h, layer } from "../dom";
import { gsap, master, showBetween } from "../engine";
import { icon } from "../icons";
import { pointer } from "../pointer";
import { caption, riseIn, riseOut } from "../text";
import { LOOP_LAYOUT, LOOP_LINES, LOOP_SOURCE } from "../sources";
import { SECTION, at } from "../time";
import { lookupType } from "@archer/catalog";
import { displayColor } from "../../../web/lib/svg";

const PANEL = 1100;
const Z = 1.5;

export function loopScene(stage: HTMLElement): void {
  const t0 = at(SECTION.loop);
  const tEnd = at(SECTION.features);
  const bar = (n: number, beat = 0) => at(SECTION.loop + n, beat);

  const root = layer(stage);
  root.style.background = "var(--ground)";
  showBetween(root, t0 - 0.2, tEnd);

  /* ------------------------------------------------ Canvas (left) */
  const left = h("div", { class: "abs", style: { width: PANEL, height: 1080, overflow: "hidden" } });
  root.append(left);
  const view = canvasView(left, { w: PANEL, h: 1080, cam: { x: 320, y: 96, z: Z } });
  const dg = renderDiagram(layoutDiagram(LOOP_SOURCE + LOOP_LAYOUT));
  view.world.append(dg.root);
  hideAll(dg);
  // Already on the canvas from the start: the cold open's three boxes.
  for (const p of ["web", "api", "db"]) gsap.set(dg.nodes.get(p)!, { opacity: 1, scale: 1 });
  for (const k of ["web->api", "api->db"]) {
    const e = dg.edges.get(k)!;
    gsap.set(e.path, { drawSVG: "0% 100%" });
    gsap.set([e.head, e.chip], { opacity: 1, scale: 1 });
  }
  // Drift, so the held moments breathe.
  master.fromTo(view.cam, { z: Z * 0.97 }, { z: Z * 1.03, duration: tEnd - t0, ease: "none", immediateRender: false }, t0);

  /* ------------------------------------------------ File (right) */
  const right = h("div", {
    class: "abs",
    style: { left: PANEL, width: 1920 - PANEL, height: 1080, background: "var(--code-bg)", borderLeft: "1px solid var(--line-2)", boxSizing: "border-box", overflow: "hidden" },
  });
  root.append(right);

  const tDrop = bar(0, 2.1);
  const tConnect = bar(1, 1.6);
  const tType1 = bar(2, 0.55);
  const tType2 = bar(3, 0.1);
  const pane = codePane(
    LOOP_LINES.map((text, i) => ({
      text,
      at: i === 5 ? tDrop + 0.1 : i === 10 ? tConnect + 0.08 : i === 6 ? tType1 : i === 11 ? tType2 : undefined,
      typed: i === 6 || i === 11,
    })),
    { size: 27, lineHeight: 1.62, cps: 34 },
  );
  pane.el.style.position = "absolute";
  pane.el.style.left = "44px";
  pane.el.style.top = "300px";
  right.append(pane.el);

  const status = h(
    "div",
    {
      class: "abs mono",
      style: {
        left: 0,
        top: 1080 - 64,
        width: 1920 - PANEL,
        height: 64,
        display: "flex",
        alignItems: "center",
        gap: "14px",
        padding: "0 44px",
        boxSizing: "border-box",
        borderTop: "1px solid var(--line)",
        background: "var(--surface)",
        fontSize: 20,
        color: "var(--ink-2)",
      },
    },
    icon("fileCode", 24),
    "architecture.arch",
    h("span", { style: { flex: "1" } }),
    h("span", { style: { display: "flex", alignItems: "center", gap: "8px", color: "var(--accent)" } }, icon("checkCircle", 22), "valid"),
  );
  right.append(status);

  /* ------------------------------------------------ Palette dock */
  const DOCK = ["redis", "aws.sqs", "aws.s3", "stripe", "clerk", "anthropic"];
  const dock = h("div", {
    class: "abs",
    style: {
      left: 70,
      top: 948,
      height: 84,
      display: "flex",
      alignItems: "center",
      gap: "10px",
      padding: "0 14px",
      borderRadius: 12,
      border: "1px solid var(--line-2)",
      background: "var(--surface)",
      boxShadow: "0 20px 50px rgba(0,0,0,.5)",
    },
  });
  const tiles = DOCK.map((tag) => {
    const t = lookupType(tag)!;
    const color = displayColor(t.color, true);
    const tile = h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: "10px", height: 60, padding: "0 12px 0 8px", borderRadius: 8 } },
      h("div", { style: { width: 42, height: 42, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: `${color}24` } }, sized(glyph(t.glyph, color), 24)),
      h("span", { style: { fontSize: 19, fontWeight: 600, color: "var(--ink)" } }, t.name),
    );
    dock.append(tile);
    return tile;
  });
  // Under the world, so a box dragged out of it rides over it.
  view.el.insertBefore(dock, view.world);
  gsap.set(dock, { y: 150 });
  master.to(dock, { y: 0, duration: 0.45, ease: "expo.out" }, t0 + 0.1);
  master.to(dock, { y: 150, duration: 0.4, ease: "power3.in" }, bar(1, 0.2));

  /* ------------------------------------------------ Drag Redis in */
  const cacheEl = dg.nodes.get("cache")!;
  const cacheBox = dg.diagram.boxes.find((b) => b.path === "cache")!;
  const redisTile = tiles[0]!;
  // Where the Redis tile sits, in world coordinates (the camera is near-still here).
  const tileScreen = { x: 70 + 14 + 8 + 21, y: 948 + 42 };
  const grabWorld = view.unproject(tileScreen.x, tileScreen.y);
  const grabOffset = { x: 30, y: 44 };
  const p = pointer(view, { x: grabWorld.x + 40, y: grabWorld.y + 70 });
  const tGrab = t0 + 0.55;
  master.to(p.pos, { o: 1, duration: 0.15 }, t0 + 0.3);
  p.move(t0 + 0.3, grabWorld.x, grabWorld.y, 0.3, "power2.out");
  master.to(redisTile, { background: "var(--surface-3)", duration: 0.1 }, t0 + 0.5);
  p.click(tGrab - 0.05);
  master.set(cacheEl, {
    opacity: 0.9,
    scale: 0.55,
    x: grabWorld.x - (cacheBox.x + grabOffset.x),
    y: grabWorld.y - (cacheBox.y + grabOffset.y),
    boxShadow: "0 18px 40px rgba(0,0,0,.55)",
    transformOrigin: `${grabOffset.x}px ${grabOffset.y}px`,
  }, tGrab);
  master.to(cacheEl, { x: 0, y: 0, scale: 1.04, opacity: 1, duration: tDrop - tGrab, ease: "power3.inOut" }, tGrab);
  p.move(tGrab, cacheBox.x + grabOffset.x, cacheBox.y + grabOffset.y, tDrop - tGrab, "power3.inOut");
  master.to(cacheEl, { scale: 1, boxShadow: "0 0 0 rgba(0,0,0,0)", duration: 0.25, ease: "back.out(3)" }, tDrop);
  master.to(redisTile, { background: "rgba(0,0,0,0)", duration: 0.2 }, tDrop);
  cue(tGrab, "click", { gain: 0.8 });
  cue(tDrop, "pop", { pitch: 9 });

  /* ------------------------------------------------ Connect api → cache */
  const edge = dg.edges.get("api->cache")!;
  const start = edge.edge.points[0]!;
  const tPress = bar(1, 0.55);
  p.move(tDrop + 0.2, start.x, start.y, tPress - (tDrop + 0.2), "power3.inOut");
  master.to(dg.nodes.get("api")!, { boxShadow: "0 0 0 2px var(--ground), 0 0 0 4px var(--accent)", duration: 0.12 }, tPress - 0.1);
  master.to(dg.nodes.get("api")!, { boxShadow: "0 0 0 0px var(--ground), 0 0 0 0px var(--accent)", duration: 0.3 }, tConnect + 0.3);
  p.click(tPress);
  const pullDur = tConnect - (tPress + 0.06);
  drawEdge(dg, "api->cache", tPress + 0.06, pullDur);
  master.to(p.pos, { motionPath: { path: edge.edge.d }, duration: pullDur, ease: "power2.inOut" }, tPress + 0.06);
  cue(tPress + 0.06, "draw");
  p.click(tConnect);
  p.move(tConnect + 0.15, 900, 420, 0.7, "power2.inOut");
  master.to(p.pos, { o: 0, duration: 0.25 }, tConnect + 0.6);

  /* ------------------------------------------------ Typed in, drawn out */
  const jobsEnd = pane.typedEnd.get(6)!;
  const edgeEnd = pane.typedEnd.get(11)!;
  flashLine(pane.lines[6]!, jobsEnd + 0.05);
  flashLine(pane.lines[11]!, edgeEnd + 0.05);
  popNode(dg, "jobs", jobsEnd + 0.1);
  cue(jobsEnd + 0.1, "pop", { pitch: 12 });
  drawEdge(dg, "api->jobs", edgeEnd + 0.1, 0.32);
  cue(edgeEnd + 0.1, "draw");
  // The camera eases down to make room for the new row.
  master.to(view.cam, { y: 150, duration: 0.8, ease: "power3.inOut" }, jobsEnd - 0.2);

  /* ------------------------------------------------ Captions */
  const L = { x: 80, y: 88, size: 118 };
  const R = { x: PANEL + 64, y: 88, size: 104 };
  const drag = caption(left, "Drag it in.", L);
  const connect = caption(left, "Connect it.", L);
  const follows = caption(left, "The canvas follows.", { ...L, size: 104 });
  const updates = caption(right, "The file updates.", { ...R, x: 64, size: 90 });
  const type = caption(right, "Or type it.", { ...R, x: 64 });
  riseIn(drag.words, t0 + 0.08);
  riseIn(updates.words, tDrop + 0.18);
  riseOut(drag.words, bar(1) - 0.12);
  riseIn(connect.words, bar(1) + 0.02);
  riseOut(connect.words, bar(2) - 0.1);
  riseOut(updates.words, bar(2) - 0.12);
  riseIn(type.words, bar(2) + 0.02);
  riseIn(follows.words, jobsEnd + 0.16);

  const sync = caption(root, "Always in sync.", { x: 960, y: 88, size: 118, anchor: "center" });
  const tSync = edgeEnd + 0.34;
  riseOut(follows.words, tSync - 0.3);
  riseOut(type.words, tSync - 0.3);
  riseIn(sync.words, tSync);
  // Clear the band under it, over the divider.
  const band = h("div", { class: "abs", style: { left: 0, top: 0, width: 1920, height: 250, background: "linear-gradient(var(--ground) 70%, transparent)", opacity: 0 } });
  root.insertBefore(band, sync.el);
  master.to(band, { opacity: 1, duration: 0.3 }, tSync - 0.1);

  /* ------------------------------------------------ Out: pushed off left by the features */
  master.to(root, { x: -1920, duration: 0.5, ease: "power3.inOut" }, tEnd - 0.32);
  const blur = { b: 0 };
  master.to(blur, {
    b: 1,
    duration: 0.3,
    ease: "power2.in",
    onUpdate: () => (root.style.filter = blur.b > 0.01 ? `blur(${(blur.b * 8).toFixed(2)}px)` : ""),
  }, tEnd - 0.3);
  cue(tEnd - 0.32, "whoosh", { dur: 0.5 });

  /* ------------------------------------------------ In: rise from the title */
  gsap.set(root, { y: 320, opacity: 0 });
  master.to(root, { y: 0, opacity: 1, duration: 0.5, ease: "expo.out" }, t0 - 0.2);
}

function sized<T extends SVGElement>(el: T, size: number): T {
  el.setAttribute("width", String(size));
  el.setAttribute("height", String(size));
  return el;
}
