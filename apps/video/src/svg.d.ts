declare module "*.svg" {
  const markup: string;
  export default markup;
}
declare module "*.css";
declare module "*.woff" {
  const url: string;
  export default url;
}
declare module "*.ttf" {
  const url: string;
  export default url;
}
declare module "opentype.js" {
  export interface PathCommand {
    type: "M" | "L" | "Q" | "C" | "Z";
    x: number;
    y: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }
  export interface Path {
    commands: PathCommand[];
  }
  export interface Glyph {
    advanceWidth: number;
  }
  export interface Font {
    unitsPerEm: number;
    getPath(text: string, x: number, y: number, fontSize: number, options?: { kerning?: boolean }): Path;
    getAdvanceWidth(text: string, fontSize: number): number;
    charToGlyph(ch: string): Glyph;
    getKerningValue(left: Glyph, right: Glyph): number;
  }
  export function parse(buffer: ArrayBuffer): Font;
  const opentype: { parse: typeof parse };
  export default opentype;
}
