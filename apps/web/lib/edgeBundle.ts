/**
 * Summary lines, shared by the canvas (`toFlow`) and the SVG renderer
 * (`svg.ts`). A connection to a part nested in a component is drawn to that
 * component, so at the top of a canvas many connections between the parts of
 * two components land on the same two boxes: eight lines from Services to
 * Storage that, at this level, all say one thing, "these two talk". Those are
 * drawn as one line per direction, labelled with how many it stands for;
 * opening a component shows them one by one. Connections drawn between the
 * very components they name stay separate lines.
 */

import type { Arrow } from "@archer/lang";

export interface Drawable {
  /** The boxes it is drawn between. */
  source: string;
  target: string;
  arrow: Arrow;
  /** An end is nested deeper than the box it is drawn to. */
  summary: boolean;
}

/**
 * The lines to draw, each the connections it stands for (in document order,
 * the first one first). Summary connections between the same two boxes
 * share a line when they point the same way: `->` by direction, `<->` and
 * `--` whichever way they were written.
 */
export function bundle<T extends Drawable>(items: readonly T[]): T[][] {
  const lines: T[][] = [];
  const byKey = new Map<string, T[]>();
  for (const item of items) {
    if (!item.summary) {
      lines.push([item]);
      continue;
    }
    const [a, b] =
      item.arrow === "->" || item.source < item.target
        ? [item.source, item.target]
        : [item.target, item.source];
    const key = `${item.arrow}\n${a}\n${b}`;
    const line = byKey.get(key);
    if (line) line.push(item);
    else {
      const fresh = [item];
      byKey.set(key, fresh);
      lines.push(fresh);
    }
  }
  return lines;
}

/** What a line's chip says: the connection's own, or a count (and the protocol they all share). */
export function bundleChip(
  connections: readonly { type?: string; label?: string; payloads: readonly unknown[] }[],
): { protocol?: string; label?: string; payloads: number } {
  if (connections.length === 1) {
    const c = connections[0]!;
    return {
      ...(c.type !== undefined ? { protocol: c.type } : {}),
      ...(c.label !== undefined ? { label: c.label } : {}),
      payloads: c.payloads.length,
    };
  }
  const types = new Set(connections.map((c) => c.type));
  const shared = types.size === 1 ? [...types][0] : undefined;
  return {
    ...(shared !== undefined ? { protocol: shared } : {}),
    label: `${connections.length} connections`,
    payloads: 0,
  };
}
