/**
 * "Play traffic": where requests go, worked out from the arrows and connection
 * types a document already has. Nothing is authored or saved — the canvas
 * animates the plan (`components/nodes.tsx`) and throws it away.
 *
 * The model is deliberately simple:
 * - Requests leave the entry points (components nothing calls, preferring
 *   ones that stand for users) and move one hop at a time. A component calls
 *   everything it is connected to once a request reaches it.
 * - A call is answered once the callee's own calls have been answered.
 *   `@queue`, `@event` and `@stream` are one-way; `--` and the structural
 *   types (`@deploys`, `@contains`, `@depends`) carry no traffic.
 * - A connection on a group applies to everything inside it, and a request
 *   that reaches a group reaches everything inside it.
 *
 * So it shows everywhere a request *can* go, not one specific request.
 */

import { componentPaths, findComponent, pathToString, type ArchDoc } from "@archer/lang";

/** How long one hop takes on screen, ms. */
export const HOP_MS = 700;
/** A new request leaves the entry points this often, ms. */
export const EVERY_MS = 1600;
/** Pause at each component before it calls on, ms. */
const WORK_MS = 150;

const QUIET_TYPES = new Set(["deploys", "contains", "depends"]);
const ONE_WAY_TYPES = new Set(["queue", "event", "stream"]);
/** Types that stand for the people using the system: the preferred entry points. */
const CLIENT_TYPES = new Set(["browser", "mobile", "user", "frontend"]);

export interface TrafficHop {
  /** Index into `doc.connections`. */
  index: number;
  /** When the hop leaves, ms after its request started. */
  start: number;
  /** Travels target → source: a reply, or the far side of a `<->`. */
  reverse: boolean;
  /** The answer to an earlier hop. */
  reply: boolean;
}

export interface TrafficPlan {
  /** Where requests start (component paths). */
  sources: string[];
  hops: TrafficHop[];
  /** Components a request reaches, sources included. */
  paths: Set<string>;
  /** Indices of the connections that carry traffic. */
  connections: Set<number>;
}

/** One edge's share of a playing plan. */
export interface EdgeTraffic {
  hops: TrafficHop[];
  /** `performance.now()` when the traffic started; shared so every edge stays in step. */
  epoch: number;
}

/** One direction a request can travel along a connection. */
interface Link {
  index: number;
  from: string;
  to: string;
  reverse: boolean;
  oneWay: boolean;
}

/** `path` is `group` or sits inside it. */
const under = (path: string, group: string): boolean =>
  path === group || path.startsWith(`${group}.`);

function links(doc: ArchDoc, known: ReadonlySet<string>): Link[] {
  const out: Link[] = [];
  doc.connections.forEach((c, index) => {
    if (c.arrow === "--" || QUIET_TYPES.has(c.type ?? "")) return;
    const a = pathToString(c.source);
    const b = pathToString(c.target);
    if (!known.has(a) || !known.has(b)) return;
    const oneWay = ONE_WAY_TYPES.has(c.type ?? "");
    out.push({ index, from: a, to: b, reverse: false, oneWay });
    if (c.arrow === "<->") out.push({ index, from: b, to: a, reverse: true, oneWay });
  });
  return out;
}

/** The component, or something inside it, stands for users (browser, mobile app…). */
function isClient(doc: ArchDoc, path: string): boolean {
  const node = findComponent(doc, path.split("."));
  const walk = (c: NonNullable<typeof node>): boolean =>
    CLIENT_TYPES.has(c.type ?? "") || c.children.some(walk);
  return node !== undefined && walk(node);
}

/**
 * Where traffic starts by default: components that call out but that nothing
 * calls (neither them nor a group they sit in). When some of those stand for
 * users, only those.
 */
export function entryPoints(doc: ArchDoc): string[] {
  const known = componentPaths(doc);
  const forward = links(doc, known).filter((l) => !l.reverse);
  const callers = new Set(forward.map((l) => l.from));
  const called = [...new Set(forward.map((l) => l.to))];
  const candidates = [...known].filter((p) => callers.has(p));
  const sources = candidates.filter((p) => !called.some((c) => under(p, c)));
  // Everything is called by something (a cycle): start from the first caller.
  if (sources.length === 0) return candidates.slice(0, 1);
  const people = sources.filter((p) => isClient(doc, p));
  return people.length > 0 ? people : sources;
}

/**
 * Plan the traffic leaving `from` (a component path), or the document's entry
 * points when `from` is unset or no longer names a component.
 */
export function planTraffic(doc: ArchDoc, from?: string | null): TrafficPlan {
  const known = componentPaths(doc);
  const all = [...known];
  const graph = links(doc, known);
  const sources = from && known.has(from) ? [from] : entryPoints(doc);

  interface Fired {
    link: Link;
    /** The component that sent it (the link may belong to a group it sits in). */
    by: string;
    start: number;
    arrive: number;
  }
  /** How a request first reached a component: along a link, or with its group. */
  interface Reach {
    time: number;
    via?: Fired;
    group?: string;
  }

  const reach = new Map<string, Reach>();
  const queue: string[] = [];
  const visit = (path: string, r: Reach) => {
    if (reach.has(path)) return;
    reach.set(path, r);
    queue.push(path);
    for (const child of all) {
      if (child.startsWith(`${path}.`) && !child.slice(path.length + 1).includes(".")) {
        visit(child, { time: r.time, group: path });
      }
    }
  };
  for (const s of sources) visit(s, { time: 0 });

  // Earliest first (ties keep document order): each component calls on once,
  // each link carries one request per direction.
  const fired: Fired[] = [];
  const used = new Set<string>();
  while (queue.length > 0) {
    let next = 0;
    for (let i = 1; i < queue.length; i++) {
      if (reach.get(queue[i]!)!.time < reach.get(queue[next]!)!.time) next = i;
    }
    const path = queue.splice(next, 1)[0]!;
    const start = reach.get(path)!.time + WORK_MS;
    for (const link of graph) {
      if (!under(path, link.from)) continue;
      const key = `${link.index}${link.reverse ? "<" : ">"}`;
      if (used.has(key)) continue;
      used.add(key);
      const f: Fired = { link, by: path, start, arrive: start + HOP_MS };
      fired.push(f);
      visit(link.to, { time: f.arrive, via: f });
    }
  }

  const sent = new Map<string, Fired[]>();
  for (const f of fired) sent.set(f.by, [...(sent.get(f.by) ?? []), f]);
  const withGroup = new Map<string, string[]>();
  for (const [path, r] of reach) {
    if (r.group !== undefined) withGroup.set(r.group, [...(withGroup.get(r.group) ?? []), path]);
  }

  // A component is done once every call it made (and everything reached with
  // it, for a group) has been answered. Recursion follows how each component
  // was first reached, which is a tree, so it terminates.
  const doneAt = new Map<string, number>();
  const done = (path: string): number => {
    const memo = doneAt.get(path);
    if (memo !== undefined) return memo;
    let end = reach.get(path)!.time + WORK_MS;
    for (const f of sent.get(path) ?? []) {
      if (!f.link.oneWay) end = Math.max(end, replyAt(f) + HOP_MS);
    }
    for (const inner of withGroup.get(path) ?? []) end = Math.max(end, done(inner));
    doneAt.set(path, end);
    return end;
  };
  /** The callee answers after its own calls if this request is what reached it, else straight away. */
  const replyAt = (f: Fired): number =>
    reach.get(f.link.to)!.via === f ? done(f.link.to) : f.arrive + WORK_MS;

  const hops: TrafficHop[] = [];
  for (const f of fired) {
    hops.push({ index: f.link.index, start: f.start, reverse: f.link.reverse, reply: false });
    if (!f.link.oneWay) {
      hops.push({ index: f.link.index, start: replyAt(f), reverse: !f.link.reverse, reply: true });
    }
  }

  return {
    sources,
    hops,
    paths: new Set(reach.keys()),
    connections: new Set(fired.map((f) => f.link.index)),
  };
}

/** "Browser", "Browser and Mobile App", "Browser, Mobile App and 2 more". */
export function describeSources(doc: ArchDoc, paths: readonly string[]): string {
  const names = paths.map((p) => {
    const c = findComponent(doc, p.split("."));
    return c?.name ?? c?.id ?? p;
  });
  if (names.length <= 1) return names[0] ?? "nowhere";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}
