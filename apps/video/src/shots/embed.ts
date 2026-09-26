/**
 * Bar 13, "Embed it anywhere.": one share link, and the same diagram turns
 * up everywhere at once: a README, a docs page, a slide, a wiki, an agent's
 * chat. The windows come spinning in from all sides and hang in the dark
 * around the link while the camera glides through them.
 */
import * as THREE from "three";
import link from "@phosphor-icons/core/assets/bold/link-bold.svg";
import robot from "@phosphor-icons/core/assets/bold/robot-bold.svg";
import { cue } from "../cues";
import { master } from "../engine";
import { SHARE_LAYOUT, SHARE_SOURCE, SHARE_URL } from "../sources";
import { caption, riseIn, riseOut } from "../text";
import { rand } from "../three/chars";
import { ACCENT, ACCENT_INK, INK, LINE_2, MONO, SANS, SERIF, SURFACE, canvas, icon, rgba, texture } from "../three/paint";
import { diagramPicture, type Theme } from "../three/picture";
import { stage } from "../three/stage";
import { SECTION, at } from "../time";
import type { Film } from "./context";
import { SET } from "./sets";

const PAGE = {
  light: { bg: "#ffffff", bar: "#f1efeb", ink: "#1c1b19", muted: "#d9d5ce", line: "#e2dfd9" },
  dark: { bg: "#131416", bar: "#1b1d20", ink: "#ecebe7", muted: "#2e3136", line: "#2c2f34" },
} as const;

type Paint = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void;

/** A window: chrome bar with its title, then `paint` fills the page. Size in world units. */
function windowMesh(o: { w: number; h: number; title: string; theme: Theme; paint: Paint }): THREE.Mesh {
  const PX = 150;
  const P = PAGE[o.theme];
  const { c, ctx } = canvas(Math.round(o.w * PX), Math.round(o.h * PX));
  const W = c.width;
  const H = c.height;
  ctx.beginPath();
  ctx.roundRect(3, 3, W - 6, H - 6, 0.14 * PX);
  ctx.fillStyle = P.bg;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = P.bar;
  ctx.fillRect(0, 0, W, 0.42 * PX);
  ["#ff5f57", "#febc2e", "#28c840"].forEach((col, i) => {
    ctx.beginPath();
    ctx.arc((0.28 + i * 0.2) * PX, 0.21 * PX, 0.06 * PX, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
  });
  ctx.fillStyle = o.theme === "light" ? "#77726a" : "#8a857d";
  ctx.font = `500 ${Math.round(0.17 * PX)}px ${SANS}`;
  ctx.textAlign = "center";
  ctx.fillText(o.title, W / 2, 0.27 * PX);
  ctx.textAlign = "left";
  o.paint(ctx, 0, 0.42 * PX, W, H - 0.42 * PX);
  ctx.restore();
  ctx.lineWidth = 4;
  ctx.strokeStyle = o.theme === "light" ? "#d9d5ce" : LINE_2;
  ctx.beginPath();
  ctx.roundRect(3, 3, W - 6, H - 6, 0.14 * PX);
  ctx.stroke();
  // Light pages dimmed a touch: white paper would blow out under the bloom.
  const tint = o.theme === "light" ? 0.8 : 1;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(o.w, o.h),
    new THREE.MeshBasicMaterial({ map: texture(c), transparent: true, color: new THREE.Color(tint, tint, tint) }),
  );
}

/** Grey text lines standing in for prose. */
function prose(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, lines: number, color: string, gap = 26) {
  ctx.fillStyle = color;
  for (let i = 0; i < lines; i++) {
    ctx.beginPath();
    ctx.roundRect(x, y + i * gap, w * (i === lines - 1 ? 0.55 : 0.8 + 0.2 * rand(i, 60)), 9, 4.5);
    ctx.fill();
  }
}

/** Draw the picture into a box, fitted and centred. */
function place(ctx: CanvasRenderingContext2D, pic: HTMLCanvasElement, x: number, y: number, w: number, h: number) {
  const k = Math.min(w / pic.width, h / pic.height);
  const pw = pic.width * k;
  const ph = pic.height * k;
  ctx.drawImage(pic, x + (w - pw) / 2, y + (h - ph) / 2, pw, ph);
}

export function embedShot(film: Film): void {
  const { scene, rig, live, cut } = stage();
  const t0 = at(SECTION.features + 6);
  const t1 = at(SECTION.build);
  const E = SET.embed;
  const root = new THREE.Group();
  root.position.copy(E);
  scene.add(root);
  live(root, t0 - 0.05, t1 + 0.05);
  const pics = { light: diagramPicture(SHARE_SOURCE + SHARE_LAYOUT, "light"), dark: diagramPicture(SHARE_SOURCE + SHARE_LAYOUT, "dark") };

  const windows: { mesh: THREE.Mesh; at: THREE.Vector3; turn: number }[] = [
    {
      at: new THREE.Vector3(-6.2, 4.4, -2.5),
      turn: 0.32,
      mesh: windowMesh({
        w: 6,
        h: 4.4,
        title: "README.md",
        theme: "light",
        paint: (ctx, x, y, w, h) => {
          ctx.fillStyle = PAGE.light.ink;
          ctx.font = `600 44px ${SANS}`;
          ctx.fillText("Acme", x + 40, y + 70);
          ctx.fillStyle = PAGE.light.line;
          ctx.fillRect(x + 40, y + 88, w - 80, 2);
          prose(ctx, x + 40, y + 112, w - 80, 2, PAGE.light.muted);
          place(ctx, pics.light, x + 30, y + 170, w - 60, h - 190);
        },
      }),
    },
    {
      at: new THREE.Vector3(0.6, 5.6, -5.5),
      turn: 0,
      mesh: windowMesh({
        w: 7.2,
        h: 4.2,
        title: "Platform review",
        theme: "dark",
        paint: (ctx, x, y, w, h) => {
          ctx.fillStyle = PAGE.dark.ink;
          ctx.font = `500 52px ${SERIF}`;
          ctx.fillText("How Acme runs", x + 50, y + 84);
          place(ctx, pics.dark, x + 40, y + 110, w - 80, h - 130);
        },
      }),
    },
    {
      at: new THREE.Vector3(6.6, 3.9, -2),
      turn: -0.36,
      mesh: windowMesh({
        w: 5.6,
        h: 4.6,
        title: "docs / architecture",
        theme: "dark",
        paint: (ctx, x, y, w, h) => {
          ctx.fillStyle = PAGE.dark.bar;
          ctx.fillRect(x, y, 150, h);
          prose(ctx, x + 22, y + 34, 100, 6, PAGE.dark.muted, 30);
          ctx.fillStyle = PAGE.dark.ink;
          ctx.font = `600 34px ${SANS}`;
          ctx.fillText("Architecture", x + 180, y + 62);
          prose(ctx, x + 180, y + 86, w - 220, 2, PAGE.dark.muted);
          place(ctx, pics.dark, x + 170, y + 140, w - 200, h - 160);
        },
      }),
    },
    {
      at: new THREE.Vector3(-3.4, 1.2, 1.6),
      turn: 0.2,
      mesh: windowMesh({
        w: 4.6,
        h: 3.2,
        title: "Wiki",
        theme: "light",
        paint: (ctx, x, y, w, h) => {
          ctx.fillStyle = PAGE.light.ink;
          ctx.font = `700 30px ${SANS}`;
          ctx.fillText("Systems overview", x + 30, y + 52);
          place(ctx, pics.light, x + 20, y + 70, w - 40, h - 84);
        },
      }),
    },
    {
      at: new THREE.Vector3(3.8, 1.1, 1.9),
      turn: -0.22,
      mesh: windowMesh({
        w: 4.4,
        h: 3.3,
        title: "Agent",
        theme: "dark",
        paint: (ctx, x, y, w, h) => {
          ctx.beginPath();
          ctx.arc(x + 44, y + 44, 22, 0, Math.PI * 2);
          ctx.fillStyle = ACCENT;
          ctx.fill();
          icon(ctx, robot, x + 30, y + 30, 28, ACCENT_INK);
          ctx.fillStyle = PAGE.dark.ink;
          ctx.font = `500 22px ${SANS}`;
          ctx.fillText("Here's how it fits together:", x + 80, y + 52);
          ctx.beginPath();
          ctx.roundRect(x + 76, y + 76, w - 100, h - 96, 14);
          ctx.fillStyle = PAGE.dark.bar;
          ctx.fill();
          place(ctx, pics.dark, x + 84, y + 84, w - 116, h - 112);
        },
      }),
    },
  ];
  windows.forEach((win, i) => {
    const m = win.mesh;
    root.add(m);
    const land = t0 + 0.08 + i * 0.08;
    const from = win.at.clone().add(new THREE.Vector3((rand(i, 61) - 0.5) * 30, (rand(i, 62) - 0.3) * 14, -18 - rand(i, 63) * 10));
    master.fromTo(m.position, { x: from.x, y: from.y, z: from.z }, { x: win.at.x, y: win.at.y, z: win.at.z, duration: 0.55, ease: "expo.out", immediateRender: false }, land - 0.1);
    master.fromTo(
      m.rotation,
      { x: (rand(i, 64) - 0.5) * 2.4, y: win.turn + (rand(i, 65) - 0.5) * 5, z: (rand(i, 66) - 0.5) * 1.6 },
      { x: 0, y: win.turn, z: 0, duration: 0.7, ease: "expo.out", immediateRender: false },
      land - 0.1,
    );
    m.position.copy(from);
    // Afterwards, a slow drift so nothing is ever quite still.
    master.to(m.position, { y: win.at.y + (rand(i, 67) - 0.5) * 0.5, duration: t1 - land, ease: "sine.inOut" }, land + 0.45);
    cue(land, "whoosh", { dur: 0.25, gain: 0.35 });
  });

  // The link they all come from.
  const PX = 120;
  const text = SHARE_URL.replace("https://", "").replace("/image.svg", "");
  const measure = canvas(10, 10).ctx;
  measure.font = `500 ${0.3 * PX}px ${MONO}`;
  const cw = measure.measureText(text).width + 1.05 * PX;
  const { c, ctx } = canvas(Math.round(cw), Math.round(0.72 * PX));
  ctx.beginPath();
  ctx.roundRect(3, 3, c.width - 6, c.height - 6, 0.36 * PX);
  ctx.fillStyle = SURFACE;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = rgba(ACCENT, 0.6);
  ctx.stroke();
  icon(ctx, link, 0.24 * PX, 0.16 * PX, 0.4 * PX, ACCENT);
  ctx.font = measure.font;
  ctx.fillStyle = INK;
  ctx.fillText(text, 0.8 * PX, 0.47 * PX);
  const chip = new THREE.Mesh(new THREE.PlaneGeometry(c.width / PX, c.height / PX), new THREE.MeshBasicMaterial({ map: texture(c), transparent: true, depthWrite: false }));
  chip.position.set(0.2, 2.6, 3.4);
  chip.renderOrder = 10;
  root.add(chip);
  live(chip, t0 + 0.02, t1 + 0.05);
  master.fromTo(chip.scale, { x: 0.2, y: 0.2 }, { x: 1, y: 1, duration: 0.45, ease: "back.out(2.5)", immediateRender: false }, t0 + 0.02);
  cue(t0 + 0.02, "pop", { pitch: 7 });

  const title = caption(film.overlay, "Embed it anywhere.", { x: 124, y: 110, size: 150 });
  riseIn(title.words, t0 + 0.04, { stagger: 0.06 });
  riseOut(title.words, t1 - 0.2);

  /* Camera: a glide through the constellation */
  cut(t0);
  const P = (x: number, y: number, z: number) => ({ x: E.x + x, y, z: E.z + z });
  const T = (x: number, y: number, z: number) => ({ tx: E.x + x, ty: y, tz: E.z + z });
  master.set(rig, { ...P(-4.5, 3.8, 10), ...T(-14, 3.4, -2), fov: 48, roll: 3, shake: 0 }, t0);
  master.to(rig, { ...T(-1, 3.4, -2), roll: 0, duration: 0.32, ease: "expo.out" }, t0);
  master.to(rig, { ...P(3, 3.3, 8.6), ...T(1, 3.2, -2), duration: t1 - t0 - 0.62, ease: "sine.inOut" }, t0 + 0.32);
  // Out: the camera rushes into the link.
  master.to(rig, { ...P(0.4, 2.7, 4.6), ...T(0.2, 2.6, 3.4), fov: 60, duration: 0.3, ease: "power3.in" }, t1 - 0.3);
  master.to(stage().grade, { fade: 1, duration: 0.12, ease: "power1.in" }, t1 - 0.12);
  cue(t1 - 0.3, "whoosh", { dur: 0.4 });
}
