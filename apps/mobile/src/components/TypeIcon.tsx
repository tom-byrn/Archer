/**
 * A component's or plane's icon as the web draws it (`components/logos.tsx`
 * Glyph and GlyphSwatch): the icon it picked, else its type's logo, else its
 * type's glyph, in its color. `GlyphSwatch` puts it on the tinted square the
 * inspector's header uses.
 */

import { memo } from "react";
import { View } from "react-native";
import { GLYPHS, GLYPH_VIEWBOX, lookupType, type Logo } from "@archer/catalog";
import { iconMarkup } from "@archer/catalog/icons";
import { LOGOS } from "@archer/catalog/logos";
import { resolveColor, type ComponentNode, type PlaneNode } from "@archer/lang";
import { displayColor } from "@web/svg";
import { useTheme } from "@/lib/theme";
import { RADIUS } from "@/lib/tokens";
import { ArchSvg } from "./Diagram";
import { withAlpha } from "./ui";

const FALLBACK = { light: "#64748b", dark: "#94a3b8" };

type Node = Pick<ComponentNode, "type"> & Partial<Pick<ComponentNode, "icon" | "color">> & { kind: (ComponentNode | PlaneNode)["kind"] };

/** The color a component or plane is drawn in: its own, else its type's. */
export function useNodeColor(node: Node): string {
  const { dark } = useTheme();
  const type = lookupType(node.type);
  const own = node.kind === "component" ? resolveColor(node.color) : undefined;
  return displayColor(own ?? type?.color ?? FALLBACK[dark ? "dark" : "light"], dark);
}

function markup(node: Node, color: string, dark: boolean, size: number): { svg: string; logo?: Logo } {
  const type = lookupType(node.type);
  const own = node.kind === "component" ? iconMarkup(node.icon) : undefined;
  const logo = own === undefined && type?.logo ? LOGOS[type.logo] : undefined;
  const nested = (viewBox: string, body: string, paint?: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<svg x="0" y="0" width="${size}" height="${size}" viewBox="${viewBox}"${paint ? ` style="color:${paint}"` : ""}>${body}</svg></svg>`;
  if (logo)
    return { svg: nested(logo.viewBox, logo.body, logo.kind === "mono" ? displayColor(logo.color!, dark) : undefined), logo };
  return { svg: nested(GLYPH_VIEWBOX, own ?? iconMarkup(type?.glyph ?? "box") ?? GLYPHS.box!, color) };
}

/** Its icon alone, at `size` (the connection rows' and type row's 14px). */
export const Glyph = memo(function Glyph({ node, size = 14 }: { node: Node; size?: number }) {
  const { dark } = useTheme();
  const color = useNodeColor(node);
  const { svg } = markup(node, color, dark, size);
  return <ArchSvg svg={svg} width={size} height={size} />;
});

/** Its icon on a square tinted with its color (the inspector header's 24px swatch). */
export const GlyphSwatch = memo(function GlyphSwatch({
  node,
  box = 24,
  size = 14,
}: {
  node: Node;
  box?: number;
  size?: number;
}) {
  const { dark } = useTheme();
  const color = useNodeColor(node);
  const { svg, logo } = markup(node, color, dark, size);
  if (logo?.kind === "tile") {
    // A vendor's own square icon (AWS) takes the tile's place.
    const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}"><svg x="0" y="0" width="${box}" height="${box}" viewBox="${logo.viewBox}">${logo.body}</svg></svg>`;
    return <ArchSvg svg={tile} width={box} height={box} />;
  }
  return (
    <View
      style={{
        width: box,
        height: box,
        borderRadius: RADIUS.md,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: withAlpha(color, 0.14),
      }}
    >
      <ArchSvg svg={svg} width={size} height={size} />
    </View>
  );
});

/** Whether it shows an icon at all (an untyped component without an icon has none, as on the canvas). */
export const hasGlyph = (node: Node): boolean =>
  node.type !== undefined || (node.kind === "component" && iconMarkup(node.icon) !== undefined);
