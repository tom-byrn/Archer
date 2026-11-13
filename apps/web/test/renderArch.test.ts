import { describe, expect, it } from "vitest";
import { EXAMPLES } from "@archer/mcp/examples";
import { parse } from "@archer/lang";
import { renderArch, renderArchSvg } from "../lib/svg";

// The mobile app shows the share image and hit-tests taps against the boxes
// renderArch reports, so they must be where the image draws them.
describe("renderArch", () => {
  it("is renderArchSvg plus the diagram's size and boxes", () => {
    for (const e of EXAMPLES) {
      const r = renderArch(e.source, { theme: "dark" });
      expect(r.svg).toBe(renderArchSvg(e.source, { theme: "dark" }));
      expect(r.svg).toContain(`width="${r.width}" height="${r.height}"`);
    }
  });

  it("reports a box for every top-level component and plane, inside the image", () => {
    for (const e of EXAMPLES) {
      const { doc } = parse(e.source);
      const r = renderArch(e.source);
      const paths = r.boxes.map((b) => b.path).sort();
      expect(paths).toEqual([...doc.components.map((c) => c.id), ...doc.planes.map((p) => p.id)].sort());
      for (const b of r.boxes) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(r.width);
        expect(b.y + b.h).toBeLessThanOrEqual(r.height);
        expect(b.kind).toBe(doc.planes.some((p) => p.id === b.path) ? "plane" : "component");
      }
      // Planes paint first, so a tap can prefer what's drawn on top.
      const kinds = r.boxes.map((b) => b.kind);
      if (kinds.includes("component")) expect(kinds.slice(kinds.indexOf("component"))).not.toContain("plane");
    }
  });

  it("reports no boxes for an empty or invalid document", () => {
    expect(renderArch('arch "Empty" v0.2\n').boxes).toEqual([]);
    expect(renderArch("not arch").boxes).toEqual([]);
  });
});
