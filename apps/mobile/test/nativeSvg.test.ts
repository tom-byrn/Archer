import { describe, expect, it } from "vitest";
import { EXAMPLES } from "@archer/mcp/examples";
import { LOGOS } from "@archer/catalog/logos";
import { renderArch } from "@web/svg";
import { adaptSvgTree, decodeEntities, viewBoxTransform, type SvgNode } from "@/lib/nativeSvg";

// A tiny stand-in for react-native-svg's parser: elements with camelCased
// props (numbers converted, style parsed) and text children, as `parse` builds.
function parseXml(xml: string): SvgNode {
  const camel = (s: string) => s.replace(/[-:]([a-z])/g, (_, c: string) => c.toUpperCase());
  const root: SvgNode = { tag: "#root", props: {}, children: [] };
  const stack = [root];
  const re = /<\/?([a-zA-Z][\w:-]*)((?:\s+[\w:-]+=(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  for (const m of xml.matchAll(re)) {
    const top = stack[stack.length - 1]!;
    if (m[4] !== undefined) {
      if (/\S/.test(m[4])) top.children.push(m[4]);
      continue;
    }
    if (m[0].startsWith("</")) {
      stack.pop();
      continue;
    }
    const props: Record<string, unknown> = {};
    for (const a of m[2]!.matchAll(/([\w:-]+)=(?:"([^"]*)"|'([^']*)')/g)) {
      const v = a[2] ?? a[3] ?? "";
      if (a[1] === "style") {
        props.style = Object.fromEntries(v.split(";").filter(Boolean).map((d) => d.split(":").map((x) => x.trim())));
      } else props[camel(a[1]!)] = v.trim() !== "" && !isNaN(+v) ? +v : v;
    }
    const node: SvgNode = { tag: m[1]!, props, children: [] };
    top.children.push(node);
    if (m[3] !== "/") stack.push(node);
  }
  return root.children[0] as SvgNode;
}

const walk = (n: SvgNode, fn: (n: SvgNode) => void) => {
  fn(n);
  for (const c of n.children) if (typeof c !== "string") walk(c, fn);
};

describe("adaptSvgTree", () => {
  const opts = { mono: "Menlo" };

  it("leaves no nested svg, title or currentColor in any example's diagram", () => {
    for (const e of EXAMPLES) {
      for (const theme of ["light", "dark"] as const) {
        const tree = adaptSvgTree(parseXml(renderArch(e.source, { theme, logos: LOGOS }).svg), opts);
        expect(tree.tag).toBe("svg");
        walk(tree, (n) => {
          if (n !== tree) expect(n.tag).not.toBe("svg");
          expect(n.tag).not.toBe("title");
          for (const v of Object.values(n.props)) expect(String(v).toLowerCase()).not.toBe("currentcolor");
          if (typeof n.props.fontFamily === "string") expect(["Menlo"]).toContain(n.props.fontFamily);
          expect(n.props.orient).not.toBe("auto-start-reverse");
        });
      }
    }
  });

  it("turns an icon's nested svg into a group placed where it was, painted in its color", () => {
    const tree = adaptSvgTree(
      parseXml(
        `<svg width="100" height="100" role="img" aria-label="x"><svg x="10" y="20" width="16" height="16" viewBox="0 0 256 256" style="color:#ff0000"><path d="M0 0" fill="currentColor"/></svg></svg>`,
      ),
      opts,
    );
    expect(tree.props.role).toBeUndefined();
    expect(tree.props.ariaLabel).toBeUndefined();
    const g = tree.children[0] as SvgNode;
    expect(g.tag).toBe("g");
    expect(g.props.transform).toBe("translate(10 20) scale(0.0625)");
    expect((g.children[0] as SvgNode).props.fill).toBe("#ff0000");
  });

  it("decodes character references in text, and keeps the platform's sans font", () => {
    const tree = adaptSvgTree(
      parseXml(`<svg><text font-family='-apple-system, "Inter", sans-serif' letter-spacing="0.5em" font-size="10">A &amp; B &lt;C&gt;</text></svg>`),
      opts,
    );
    const text = tree.children[0] as SvgNode;
    expect(text.children).toEqual(["A & B <C>"]);
    expect(text.props.fontFamily).toBeUndefined();
    expect(text.props.letterSpacing).toBe(5);
  });
});

describe("viewBoxTransform", () => {
  it("centers a viewBox that isn't the box's shape (xMidYMid meet)", () => {
    expect(viewBoxTransform({ x: 0, y: 0, width: 20, height: 10, viewBox: "0 0 10 10" })).toBe("translate(5 0) scale(1)");
    expect(viewBoxTransform({ x: 0, y: 0, width: 30, height: 30, viewBox: "-3 -3 30 30" })).toBe("translate(3 3) scale(1)");
  });
});

describe("decodeEntities", () => {
  it("decodes named and numeric references, and leaves unknown ones", () => {
    expect(decodeEntities("&quot;a&quot; &#8594; &#x2192; &bogus;")).toBe('"a" → → &bogus;');
  });
});
