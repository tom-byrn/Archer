/**
 * A component's or plane's icon as the canvas draws it (mirrors `lib/svg.ts`
 * `iconSvg`): the icon it picked, else its type's logo, else its type's
 * glyph, on a tile tinted with its color. Untyped components without an icon
 * get a plain box.
 */

import { memo } from "react";
import { GLYPHS, GLYPH_VIEWBOX, lookupType } from "@archer/catalog";
import { iconMarkup } from "@archer/catalog/icons";
import { LOGOS } from "@archer/catalog/logos";
import { resolveColor, type ComponentNode, type PlaneNode } from "@archer/lang";
import { displayColor } from "@web/svg";
import { useTheme } from "@/lib/theme";
import { ArchSvg } from "./Diagram";
import { Tile } from "./ui";

const FALLBACK = { light: "#64748b", dark: "#94a3b8" };

/** The color a component or plane is drawn in (its own, else its type's). */
export function useNodeColor(node: ComponentNode | PlaneNode): string {
  const { dark } = useTheme();
  const type = lookupType(node.type);
  const own = node.kind === "component" ? resolveColor(node.color) : undefined;
  return displayColor(own ?? type?.color ?? FALLBACK[dark ? "dark" : "light"], dark);
}

export const TypeIcon = memo(function TypeIcon({
  node,
  size = 32,
}: {
  node: ComponentNode | PlaneNode;
  size?: number;
}) {
  const { dark, palette } = useTheme();
  const color = useNodeColor(node);
  const type = lookupType(node.type);
  const own = node.kind === "component" ? iconMarkup(node.icon) : undefined;
  const logo = own === undefined && type?.logo ? LOGOS[type.logo] : undefined;
  const g = Math.round(size * 0.56);
  const nested = (viewBox: string, body: string, paint?: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${g}" height="${g}" viewBox="0 0 ${g} ${g}">` +
    `<svg x="0" y="0" width="${g}" height="${g}" viewBox="${viewBox}"${paint ? ` style="color:${paint}"` : ""}>${body}</svg></svg>`;

  if (logo?.kind === "tile") {
    // A vendor's square icon (AWS) takes the tinted tile's place, as on the canvas.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><svg x="0" y="0" width="${size}" height="${size}" viewBox="${logo.viewBox}">${logo.body}</svg></svg>`;
    return <ArchSvg svg={svg} width={size} height={size} />;
  }
  const untyped = own === undefined && node.type === undefined;
  const svg = logo
    ? nested(logo.viewBox, logo.body, logo.kind === "mono" ? displayColor(logo.color!, dark) : undefined)
    : nested(GLYPH_VIEWBOX, own ?? iconMarkup(type?.glyph ?? "box") ?? GLYPHS.box!, untyped ? palette.ink3 : color);
  return (
    <Tile color={untyped ? palette.ink3 : color} size={size}>
      <ArchSvg svg={svg} width={g} height={g} />
    </Tile>
  );
});
