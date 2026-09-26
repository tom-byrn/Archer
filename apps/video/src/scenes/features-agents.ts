/**
 * Stations 5–8 of the feature montage: agents over MCP, agents drawing,
 * repo sync, and share links.
 */
import { cue } from "../cues";
import { drawEdge, hideAll, layoutDiagram, popNode, renderDiagram } from "../diagram";
import { h, svgFrom } from "../dom";
import { gsap, master } from "../engine";
import { icon } from "../icons";
import { AGENT_LAYOUT, AGENT_SOURCE, MCP_COMMAND, MCP_TOOLS, SHARE_LAYOUT, SHARE_SOURCE, SHARE_URL } from "../sources";
import { BEAT } from "../time";
import { pill, windowEl } from "../ui";
import type { Station } from "./features";

/** The landing page's "works with any MCP client" marks (components/landing/ClientLogos.tsx). */
const CLIENTS: { name: string; svg: string }[] = [
  {
    name: "Claude Code",
    svg: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"/></svg>`,
  },
  {
    name: "Cursor",
    svg: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23"/></svg>`,
  },
  {
    name: "Codex",
    svg: `<svg viewBox="90 90 431 431"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M252.794 108.802C289.191 99.0484 326.265 110.305 351.148 135.135C385.113 126.072 422.85 134.862 449.492 161.505C476.136 188.149 484.925 225.888 475.862 259.85V259.854C500.696 284.735 511.95 321.81 502.198 358.207C492.447 394.602 464.161 421.084 430.215 430.217C421.083 464.162 394.603 492.448 358.206 502.199C321.812 511.951 284.734 500.693 259.852 475.864C225.887 484.927 188.15 476.137 161.507 449.495C134.864 422.851 126.073 385.111 135.136 351.149C110.304 326.266 99.0496 289.192 108.801 252.795C118.552 216.4 146.84 189.918 180.784 180.785C189.917 146.841 216.396 118.553 252.794 108.802ZM374.292 407.145C374.292 411.271 372.092 415.086 368.517 417.148L283.723 466.102C302.487 480.585 327.555 486.459 352.217 479.852C386.997 470.532 410.068 439.312 410.555 405.006V317.717C410.555 315.08 409.125 312.621 406.843 311.303L374.292 292.509V407.145ZM251.868 415.897C248.296 417.959 243.893 417.959 240.317 415.897L155.526 366.942C152.366 390.436 159.811 415.08 177.866 433.136H177.863C203.325 458.594 241.896 462.962 271.85 446.232L347.449 402.586C349.735 401.268 351.148 398.8 351.148 396.163V358.579L251.868 415.897ZM368.602 220.628C366.319 219.309 363.474 219.318 361.191 220.637L328.641 239.431L427.921 296.749C431.496 298.811 433.697 302.627 433.697 306.752V404.661C455.622 395.654 473.244 376.881 479.851 352.218C489.169 317.442 473.668 281.85 444.201 264.274L368.602 220.628ZM177.303 206.34C155.377 215.348 137.756 234.122 131.148 258.783C121.832 293.561 137.331 329.153 166.799 346.727L242.398 390.373C244.68 391.692 247.525 391.684 249.807 390.366L282.357 371.572L183.078 314.253C179.504 312.189 177.303 308.375 177.303 304.251V206.34ZM259.849 279.145V331.858L305.5 358.213L351.15 331.858V279.145L305.5 252.789L259.849 279.145ZM327.276 144.9C308.512 130.418 283.445 124.543 258.782 131.15C224.002 140.471 200.931 171.691 200.445 205.995V293.286C200.445 295.923 201.875 298.381 204.158 299.7L236.707 318.493V203.856C236.707 199.731 238.909 195.916 242.483 193.853L327.276 144.9ZM433.137 177.867C407.675 152.407 369.103 148.038 339.149 164.769L263.55 208.415C261.265 209.734 259.852 212.202 259.852 214.838V252.423L359.132 195.105C362.703 193.041 367.108 193.041 370.682 195.105L455.473 244.06C458.635 220.567 451.189 195.922 433.135 177.867H433.137Z"/></svg>`,
  },
  {
    name: "OpenCode",
    svg: `<svg viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M18 19.5H6v-15h12zM15 7.5H9v9h6z"/></svg>`,
  },
];

/* ---------------------------------------------------------------- 5. MCP */

const MCP = { x: 10200, y: 0 };

export const mcpStation: Station = {
  kicker: "MCP",
  title: "Plug in any agent.",
  cam: { x: MCP.x, y: MCP.y, z: 1 },
  build({ view, t0 }) {
    const w = 1560;
    const term = windowEl({ x: MCP.x - w / 2, y: MCP.y - 200, w, h: 176, title: "~/acme" });
    view.world.append(term.el);
    const size = 27;
    const line = h("div", { class: "mono", style: { position: "absolute", left: 34, top: 36, fontSize: size, whiteSpace: "pre", color: "var(--ink)" } });
    const prompt = h("span", { class: "accent" }, "$ ");
    line.append(prompt);
    const chars = [...MCP_COMMAND].map((c, i) => {
      const url = i >= MCP_COMMAND.indexOf("https://");
      return h("span", url ? { style: { color: "var(--accent)", textDecoration: "underline", textDecorationColor: "rgba(35,192,136,.4)", textUnderlineOffset: "5px" } } : {}, c);
    });
    line.append(...chars);
    const caret = h("span", { style: { display: "inline-block", width: "0.6em", height: "1.05em", verticalAlign: "-0.18em", background: "var(--ink)", marginLeft: "2px" } });
    line.append(caret);
    term.body.append(line);

    gsap.set(chars, { display: "none" });
    const start = t0 + 0.02;
    const perChar = 0.62 / chars.length;
    chars.forEach((c, i) => {
      master.set(c, { display: "inline" }, start + i * perChar);
      if (i % 3 === 0) cue(start + i * perChar, "key", { gain: 0.5 });
    });
    const typed = start + chars.length * perChar;
    master.to(caret, { opacity: 0, duration: 0.01 }, typed + 0.05);
    cue(typed + 0.05, "click", { gain: 0.8 });

    // What the agent gets: every tool on the server, streaming out of the terminal.
    const grid = h("div", {
      class: "abs",
      style: { left: MCP.x - w / 2, top: MCP.y + 10, width: w, display: "flex", flexWrap: "wrap", gap: "12px 12px", justifyContent: "center" },
    });
    const chips = MCP_TOOLS.map((name) =>
      pill(name, { mono: true, size: 21, color: "var(--ink)", bg: "var(--surface-2)" }),
    );
    for (const c of chips) {
      c.style.border = "1px solid var(--line-2)";
      grid.append(c);
    }
    view.world.append(grid);
    gsap.set(chips, { opacity: 0, y: -30, scale: 0.7 });
    master.to(chips, { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: "back.out(2)", stagger: 0.022 }, typed + 0.08);
    for (let i = 0; i < 6; i++) cue(typed + 0.1 + i * 0.1, "tick", { gain: 0.5, pitch: i * 2 });

    // "Works with any MCP client", as on the landing page.
    const marks = h(
      "div",
      { class: "abs", style: { left: MCP.x, top: MCP.y + 330, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: "46px", color: "var(--ink-2)" } },
      h("span", { class: "kicker", style: { fontSize: 19, color: "var(--ink-3)" } }, "Works with any MCP client"),
      ...CLIENTS.map((c) => {
        const svg = svgFrom(c.svg);
        svg.setAttribute("width", "30");
        svg.setAttribute("height", "30");
        return h("span", { style: { display: "flex", alignItems: "center", gap: "12px", fontSize: 25, fontWeight: 600, whiteSpace: "nowrap" } }, svg, c.name);
      }),
    );
    view.world.append(marks);
    gsap.set(marks, { opacity: 0 });
    master.fromTo(marks, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: "expo.out", immediateRender: false }, typed + 0.5);
  },
};

/* ------------------------------------------------------ 6. Agents draw */

const AGENTS = { x: 13600, y: 0 };

export const agentsStation: Station = {
  kicker: "Agents",
  title: "Agents draw, too.",
  cam: { x: AGENTS.x + 360, y: AGENTS.y + 150, z: 1.42 },
  build({ view, overlay, t0 }) {
    const dg = renderDiagram(layoutDiagram(AGENT_SOURCE + AGENT_LAYOUT));
    dg.root.style.left = `${AGENTS.x}px`;
    dg.root.style.top = `${AGENTS.y}px`;
    view.world.append(dg.root);
    hideAll(dg);

    // What the user asked their agent (the landing page's prompt, shortened).
    const bubble = h(
      "div",
      {
        class: "abs",
        style: {
          left: 960,
          top: 952,
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: "16px",
          height: 70,
          padding: "0 28px 0 18px",
          borderRadius: 14,
          border: "1px solid var(--line-2)",
          background: "var(--surface)",
          boxShadow: "0 24px 60px rgba(0,0,0,.55)",
          fontSize: 27,
          color: "var(--ink)",
          whiteSpace: "nowrap",
        },
      },
      h("span", { style: { display: "flex", width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", background: "var(--accent)", color: "var(--accent-ink)" } }, icon("caretRight", 22)),
      "Map this repo's architecture as an Archer document.",
    );
    overlay.append(bubble);
    gsap.set(bubble, { opacity: 0 });
    master.fromTo(bubble, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.4, ease: "expo.out", immediateRender: false }, t0 - 0.1);
    master.to(bubble, { opacity: 0, y: 30, duration: 0.25, ease: "power2.in" }, t0 + 4 * BEAT - 0.3);

    // The agent writes the document; each component lands with its agent badge.
    const order = ["web", "api", "search", "pay", "db", "mail"];
    order.forEach((path, i) => {
      const t = t0 + 0.18 + i * (BEAT / 4);
      popNode(dg, path, t, 0.42);
      cue(t, "pop", { pitch: [0, 2, 4, 7, 9, 12][i], gain: 0.75 });
      const badge = h("span", { class: "badge" }, icon("robot"));
      dg.nodes.get(path)!.append(badge);
      gsap.set(badge, { scale: 0 });
      master.to(badge, { scale: 1, duration: 0.3, ease: "back.out(3)" }, t + 0.18);
    });
    const edges = ["web->api", "web->search", "api->pay", "api->db", "api->mail"];
    edges.forEach((key, i) => {
      const t = t0 + 0.18 + 6 * (BEAT / 4) + i * 0.07;
      drawEdge(dg, key, t, 0.3);
      if (i % 2 === 0) cue(t, "draw", { gain: 0.6 });
    });
    master.fromTo(view.cam, { z: 1.42 }, { z: 1.5, duration: 1.6, ease: "none", immediateRender: false }, t0 + 0.2);
  },
};

/* --------------------------------------------------------- 7. Repo sync */

const REPO = { x: 17200, y: 0 };

export const repoStation: Station = {
  kicker: "Repo sync",
  title: "Lives in your repo.",
  cam: { x: REPO.x, y: REPO.y, z: 1 },
  build({ view, t0 }) {
    const w = 1400;
    const card = h("div", {
      class: "abs",
      style: {
        left: REPO.x - w / 2,
        top: REPO.y - 220,
        width: w,
        boxSizing: "border-box",
        borderRadius: 16,
        border: "1px solid var(--line-2)",
        background: "var(--surface)",
        boxShadow: "0 40px 110px rgba(0,0,0,.6)",
        overflow: "hidden",
      },
    });
    const head = h(
      "div",
      { style: { padding: "28px 36px 24px", borderBottom: "1px solid var(--line)" } },
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "16px" } },
        h("span", { style: { display: "flex", color: "var(--accent)" } }, icon("gitPullRequest", 34)),
        h("span", { style: { fontSize: 34, fontWeight: 650, color: "var(--ink)" } }, "Add Redis cache layer"),
        h("span", { style: { fontSize: 34, color: "var(--ink-3)" } }, "#42"),
        h("span", { style: { flex: "1" } }),
        pill("Open", { size: 20, color: "var(--accent-ink)", bg: "var(--accent)", icon: icon("gitPullRequest", 18) }),
      ),
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "12px", marginTop: "16px", fontSize: 21, color: "var(--ink-3)" } },
        "Published from the canvas",
        h("span", {}, "·"),
        pill("archer/cache-layer", { mono: true, size: 18, icon: icon("gitBranch", 16) }),
        h("span", { style: { display: "flex" } }, icon("arrowRight", 18)),
        pill("main", { mono: true, size: 18 }),
      ),
    );
    const fileBar = h(
      "div",
      { class: "mono", style: { display: "flex", alignItems: "center", gap: "12px", padding: "0 36px", height: 58, fontSize: 21, color: "var(--ink-2)", background: "var(--surface-2)", borderBottom: "1px solid var(--line)" } },
      icon("fileCode", 22),
      "architecture.arch",
      h("span", { style: { flex: "1" } }),
      h("span", { style: { color: "var(--accent)" } }, "+2"),
      h("span", { style: { color: "var(--danger)" } }, "−0"),
    );
    const DIFF: [string, string][] = [
      [" ", `component api "API" @aws.lambda`],
      ["+", `component cache "Cache" @redis`],
      [" ", `component db "Postgres" @neon`],
      [" ", ``],
      [" ", `api -> db @sql`],
      ["+", `api -> cache @reads`],
    ];
    const diffRows = DIFF.map(([mark, text]) =>
      h(
        "div",
        {
          class: "mono",
          style: {
            display: "flex",
            height: 44,
            alignItems: "center",
            fontSize: 24,
            whiteSpace: "pre",
            color: mark === "+" ? "var(--ink)" : "var(--ink-2)",
            background: mark === "+" ? "rgba(35,192,136,.13)" : "transparent",
            borderLeft: `3px solid ${mark === "+" ? "var(--accent)" : "transparent"}`,
          },
        },
        h("span", { style: { width: 70, textAlign: "center", color: mark === "+" ? "var(--accent)" : "var(--ink-3)" } }, mark),
        text || "​",
      ),
    );
    const diff = h("div", { style: { padding: "12px 0", background: "var(--code-bg)" } }, ...diffRows);
    const check = h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: "14px", padding: "0 36px", height: 70, fontSize: 22, color: "var(--ink-2)", borderTop: "1px solid var(--line)" } },
      h("span", { style: { display: "flex", color: "var(--accent)" } }, icon("checkCircle", 26)),
      h("span", { class: "mono", style: { color: "var(--ink)" } }, "archer check"),
      "architecture.arch is valid",
    );
    card.append(head, fileBar, diff, check);
    view.world.append(card);

    gsap.set(card, { y: 80, opacity: 0 });
    master.to(card, { y: 0, opacity: 1, duration: 0.5, ease: "expo.out" }, t0 - 0.12);
    const plus = diffRows.filter((_, i) => DIFF[i]![0] === "+");
    gsap.set(plus, { backgroundColor: "rgba(35,192,136,0)" });
    plus.forEach((row, i) => {
      const t = t0 + 0.4 + i * (BEAT / 2);
      master.fromTo(row, { backgroundColor: "rgba(35,192,136,.5)" }, { backgroundColor: "rgba(35,192,136,.13)", duration: 0.6, ease: "power2.out", immediateRender: false }, t);
      cue(t, "tick", { pitch: 7 + i * 5 });
    });
    gsap.set(check, { opacity: 0 });
    master.fromTo(check, { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.35, ease: "expo.out", immediateRender: false }, t0 + 0.95);
    cue(t0 + 0.95, "success", { gain: 0.8 });
  },
};

/* ------------------------------------------------------------- 8. Share */

const SHARE = { x: 20800, y: 0 };
export const shareStation: Station = {
  kicker: "Share",
  title: "Embed it anywhere.",
  cam: { x: SHARE.x, y: SHARE.y, z: 1 },
  build({ view, t0 }) {
    const w = 1240;
    const doc = windowEl({ x: SHARE.x - w / 2, y: SHARE.y - 250, w, h: 700, title: "README.md" });
    view.world.append(doc.el);
    const md = h(
      "div",
      { class: "mono", style: { position: "absolute", left: 40, top: 30, fontSize: 22, whiteSpace: "pre", color: "var(--ink-2)" } },
      "![Architecture](",
      h("span", { style: { color: "var(--tok-string)" } }, SHARE_URL.replace("https://", "")),
      ")",
    );
    doc.body.append(md);
    // The embed as a README shows it: the live SVG with its title and the ARCHER tag.
    const frame = h("div", {
      style: {
        position: "absolute",
        left: 40,
        top: 90,
        width: w - 80,
        height: 520,
        borderRadius: 10,
        border: "1px solid var(--line)",
        background: "var(--ground)",
        overflow: "hidden",
      },
    });
    frame.append(
      h("div", { style: { position: "absolute", left: 28, top: 22, fontSize: 24, fontWeight: 700, color: "var(--ink)" } }, "Acme"),
      h("div", { style: { position: "absolute", right: 28, top: 26, fontSize: 16, fontWeight: 600, letterSpacing: "0.04em", color: "var(--ink-3)" } }, "ARCHER"),
    );
    const dg = renderDiagram(layoutDiagram(SHARE_SOURCE + SHARE_LAYOUT));
    const scale = 1.52;
    const inner = h("div", { class: "abs", style: { left: (w - 80 - 640 * scale) / 2, top: 80 + (440 - 240 * scale) / 2, transform: `scale(${scale})`, transformOrigin: "0 0" } });
    inner.append(dg.root);
    frame.append(inner);
    doc.body.append(frame);
    hideAll(dg);

    gsap.set(doc.el, { y: 70, opacity: 0 });
    master.to(doc.el, { y: 0, opacity: 1, duration: 0.5, ease: "expo.out" }, t0 - 0.12);
    ["web", "api", "db", "cache"].forEach((p, i) => {
      popNode(dg, p, t0 + 0.3 + i * 0.08, 0.4);
    });
    ["web->api", "api->db", "api->cache"].forEach((k, i) => drawEdge(dg, k, t0 + 0.55 + i * 0.08, 0.3));
    cue(t0 + 0.3, "pop", { pitch: 4, gain: 0.6 });
    cue(t0 + 0.46, "pop", { pitch: 9, gain: 0.6 });
    cue(t0 + 0.55, "draw", { gain: 0.6 });
  },
};
