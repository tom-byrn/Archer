import type { ArchDoc, ConnectionNode } from "@archer/lang";

/** Which way a connection runs, seen from one component. */
export type LinkDirection = "out" | "in" | "both" | "none";

/** A connection as one component sees it: which way it runs and what's at the far end. */
export interface ComponentLink {
  /** Index into `doc.connections`. */
  index: number;
  conn: ConnectionNode;
  /** `->` it starts (out) or ends (in); `<->` both; `--` none. */
  direction: LinkDirection;
  /** The end at this component: the component itself, or a part nested in it. */
  near: string[];
  /** The far end. */
  far: string[];
}

const ORDER: Record<LinkDirection, number> = { out: 0, both: 1, none: 2, in: 3 };

const within = (p: readonly string[], path: readonly string[]): boolean =>
  p.length >= path.length && path.every((s, i) => p[i] === s);

/**
 * Every connection that reaches a component: those ending on it and on its
 * nested parts, as its box draws them on the canvas. Connections between its
 * own parts stay inside it and aren't listed. Outgoing first, then two-way and
 * undirected, then incoming; document order within each.
 */
export function connectionsOf(doc: ArchDoc, path: readonly string[]): ComponentLink[] {
  const links: ComponentLink[] = [];
  doc.connections.forEach((conn, index) => {
    const fromHere = within(conn.source, path);
    const toHere = within(conn.target, path);
    if (fromHere === toHere) return;
    const direction: LinkDirection =
      conn.arrow === "<->" ? "both" : conn.arrow === "--" ? "none" : fromHere ? "out" : "in";
    links.push({
      index,
      conn,
      direction,
      near: fromHere ? conn.source : conn.target,
      far: fromHere ? conn.target : conn.source,
    });
  });
  return links.sort((a, b) => ORDER[a.direction] - ORDER[b.direction] || a.index - b.index);
}
