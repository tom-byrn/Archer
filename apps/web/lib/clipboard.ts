import { autoLayout, layoutMap, parse, type ArchDoc } from "@archer/lang";

/**
 * Components on the clipboard travel as plain `.arch` text (from
 * `extractFragment`), so a copy pastes into another document, the code pane,
 * or straight into an agent. Reading it back accepts any Archer text with at
 * least one component, header or not.
 */
export function parseFragment(text: string): ArchDoc | null {
  const t = text.trim();
  if (t === "") return null;
  const attempt = (src: string): ArchDoc | null => {
    const r = parse(src);
    if (r.diagnostics.some((d) => d.code === "E001")) return null;
    return r.doc.components.length > 0 ? r.doc : null;
  };
  return attempt(t) ?? (/^arch\s/.test(t) ? null : attempt(`arch "Pasted" v0.1\n${t}`));
}

/** Grid size of a fragment's top-level components, for centering a paste on the pointer. */
export function fragmentSize(fragment: ArchDoc): [number, number] {
  const laid = autoLayout(fragment);
  const layout = layoutMap(laid);
  const rects = laid.components
    .map((c) => layout.get(c.id))
    .filter((e) => e?.at && e.size)
    .map((e) => ({ at: e!.at!, size: e!.size! }));
  if (rects.length === 0) return [4, 3];
  const minX = Math.min(...rects.map((r) => r.at[0]));
  const minY = Math.min(...rects.map((r) => r.at[1]));
  const maxX = Math.max(...rects.map((r) => r.at[0] + r.size[0]));
  const maxY = Math.max(...rects.map((r) => r.at[1] + r.size[1]));
  return [maxX - minX, maxY - minY];
}
