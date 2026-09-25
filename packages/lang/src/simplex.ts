/**
 * Integer network simplex (Gansner, Koutsofios, North & Vo, "A Technique for
 * Drawing Directed Graphs", 1993) — the optimiser behind Graphviz `dot`.
 *
 * Finds integers r[0..n) minimising Σ weight·(r[to] − r[from]) subject to
 * r[to] − r[from] ≥ minlen for every constraint. Auto-layout uses it to assign
 * layers (one constraint per connection) and vertical coordinates (spacing and
 * containment constraints, plus auxiliary nodes that turn "keep this edge
 * straight" terms |y_a − y_b| into this form).
 *
 * Pivots are incremental as in Graphviz: only the part of the spanning tree a
 * pivot touches gets new ranks, cut values and numbering.
 *
 * The constraint graph must be acyclic, minlen integral and weights ≥ 0.
 * Deterministic: ties resolve by node and constraint order. Every connected
 * component is shifted so its smallest value is 0.
 */

export interface Constraint {
  from: number;
  to: number;
  /** r[to] − r[from] ≥ minlen */
  minlen: number;
  /** Cost per unit of r[to] − r[from]. */
  weight: number;
}

const EPS = 1e-9;
/** Negative tree edges examined before pivoting on the most negative one. */
const SEARCH_SIZE = 30;

export function networkSimplex(
  n: number,
  constraints: readonly Constraint[],
  maxIterations = 20000,
): number[] {
  if (n === 0) return [];

  // Merge parallel constraints: the tighter minlen, the summed weight.
  const from: number[] = [];
  const to: number[] = [];
  const minlen: number[] = [];
  const weight: number[] = [];
  const merged = new Map<number, number>();
  for (const c of constraints) {
    if (c.from === c.to) continue;
    const key = c.from * n + c.to;
    const i = merged.get(key);
    if (i === undefined) {
      merged.set(key, from.length);
      from.push(c.from);
      to.push(c.to);
      minlen.push(c.minlen);
      weight.push(c.weight);
    } else {
      minlen[i] = Math.max(minlen[i]!, c.minlen);
      weight[i] = weight[i]! + c.weight;
    }
  }

  // A virtual root tied to one node of every component keeps the graph
  // connected; its zero-weight, zero-length edges never change the optimum.
  const comp = components(n, from, to);
  const root = n;
  const N = n + 1;
  const seen = new Set<number>();
  for (let v = 0; v < n; v++) {
    if (seen.has(comp[v]!)) continue;
    seen.add(comp[v]!);
    from.push(root);
    to.push(v);
    minlen.push(0);
    weight.push(0);
  }
  const E = from.length;

  const outE: number[][] = Array.from({ length: N }, () => []);
  const inE: number[][] = Array.from({ length: N }, () => []);
  for (let e = 0; e < E; e++) {
    outE[from[e]!]!.push(e);
    inE[to[e]!]!.push(e);
  }

  const rank = initRank(N, from, to, minlen, outE, inE);
  if (rank === null) {
    // Cyclic input (a caller bug): give up on optimising rather than throw.
    return normalize(new Array<number>(n).fill(0), comp, n);
  }
  const slack = (e: number) => rank[to[e]!]! - rank[from[e]!]! - minlen[e]!;

  // --- Feasible spanning tree of tight edges ---------------------------------
  const inTree = new Uint8Array(N);
  const isTree = new Uint8Array(E);
  const tadj: number[][] = Array.from({ length: N }, () => []);
  const treeNodes: number[] = [];
  const treeList: number[] = [];
  const treeSlot = new Int32Array(E).fill(-1);
  const addTreeEdge = (e: number) => {
    isTree[e] = 1;
    tadj[from[e]!]!.push(e);
    tadj[to[e]!]!.push(e);
    treeSlot[e] = treeList.length;
    treeList.push(e);
  };
  const growTight = (starts: number[]) => {
    const stack = [...starts];
    while (stack.length > 0) {
      const v = stack.pop()!;
      for (const list of [outE[v]!, inE[v]!])
        for (const e of list) {
          const w = from[e] === v ? to[e]! : from[e]!;
          if (!inTree[w] && slack(e) === 0) {
            inTree[w] = 1;
            treeNodes.push(w);
            addTreeEdge(e);
            stack.push(w);
          }
        }
    }
  };
  inTree[root] = 1;
  treeNodes.push(root);
  growTight([root]);
  while (treeNodes.length < N) {
    let best = -1;
    let bestSlack = Infinity;
    for (let e = 0; e < E; e++) {
      if (inTree[from[e]!] !== inTree[to[e]!]) {
        const s = slack(e);
        if (s < bestSlack) {
          bestSlack = s;
          best = e;
        }
      }
    }
    if (best < 0) break; // unreachable: the virtual root connects everything
    const delta = inTree[from[best]!] ? bestSlack : -bestSlack;
    for (const v of treeNodes) rank[v] = rank[v]! + delta;
    growTight(treeNodes.slice());
  }

  // --- Tree numbering (low/lim), parent edges, cut values ---------------------
  const low = new Int32Array(N);
  const lim = new Int32Array(N);
  const par = new Int32Array(N).fill(-1);
  const cut = new Float64Array(E); // cut value of each tree edge
  const other = (e: number, v: number) => (from[e] === v ? to[e]! : from[e]!);

  /** Number the subtree under `v` (entered through `pe`) starting at `lo`. */
  const dfsRange = (v: number, pe: number, lo: number): number => {
    const stackV = [v];
    const stackI = [0];
    par[v] = pe;
    low[v] = lo;
    let next = lo;
    while (stackV.length > 0) {
      const top = stackV.length - 1;
      const u = stackV[top]!;
      const i = stackI[top]!;
      const adj = tadj[u]!;
      if (i < adj.length) {
        stackI[top] = i + 1;
        const e = adj[i]!;
        if (e === par[u]) continue;
        const w = other(e, u);
        par[w] = e;
        low[w] = next;
        stackV.push(w);
        stackI.push(0);
      } else {
        lim[u] = next++;
        stackV.pop();
        stackI.pop();
      }
    }
    return next;
  };

  const calcCut = (child: number): number => {
    const pe = par[child]!;
    const childIsTail = from[pe] === child;
    let value = weight[pe]!;
    for (const list of [outE[child]!, inE[child]!])
      for (const e of list) {
        if (e === pe) continue;
        const isOut = from[e] === child;
        const pointsToHead = isOut === childIsTail;
        value += pointsToHead ? weight[e]! : -weight[e]!;
        if (isTree[e]) value += pointsToHead ? -cut[e]! : cut[e]!;
      }
    return value;
  };

  dfsRange(root, -1, 1);
  // Postorder is lim order; cut values need children before parents.
  const byLim = Array.from({ length: N }, (_, v) => v).sort((a, b) => lim[a]! - lim[b]!);
  for (const v of byLim) if (v !== root) cut[par[v]!] = calcCut(v);

  const inSubtree = (v: number, of: number) => low[of]! <= lim[v]! && lim[v]! <= lim[of]!;

  /** Shift the ranks of `v`'s subtree down by `delta`. */
  const rerank = (v: number, delta: number) => {
    const stack = [v];
    while (stack.length > 0) {
      const u = stack.pop()!;
      rank[u] = rank[u]! - delta;
      for (const e of tadj[u]!) if (e !== par[u]) stack.push(other(e, u));
    }
  };

  /** Walk from `v` up to the common ancestor with `w`, adjusting cut values. */
  const treeUpdate = (v: number, w: number, value: number, dir: boolean): number => {
    while (!inSubtree(w, v)) {
      const e = par[v]!;
      const d = v === from[e] ? dir : !dir;
      cut[e] = cut[e]! + (d ? value : -value);
      v = lim[from[e]!]! > lim[to[e]!]! ? from[e]! : to[e]!;
    }
    return v;
  };

  let searchFrom = 0;
  const leaveEdge = (): number => {
    let found = -1;
    let count = 0;
    const T = treeList.length;
    for (let k = 0; k < T; k++) {
      const slot = (searchFrom + k) % T;
      const e = treeList[slot]!;
      if (cut[e]! < -EPS) {
        if (found < 0 || cut[e]! < cut[found]!) found = e;
        if (++count >= SEARCH_SIZE) {
          searchFrom = slot;
          return found;
        }
      }
    }
    return found;
  };

  /** The non-tree edge crossing `e`'s cut the other way with the least slack. */
  const enterEdge = (e: number): number => {
    // Search the component that doesn't hold the root: edges out of it when
    // it's on e's head side, into it when on the tail side.
    const tailSide = lim[from[e]!]! < lim[to[e]!]!;
    const v = tailSide ? from[e]! : to[e]!;
    const lo = low[v]!;
    const hi = lim[v]!;
    let best = -1;
    let bestSlack = Infinity;
    const stack = [v];
    while (stack.length > 0 && bestSlack > 0) {
      const u = stack.pop()!;
      for (const g of tailSide ? inE[u]! : outE[u]!) {
        if (isTree[g]) continue;
        const x = tailSide ? from[g]! : to[g]!;
        if (lim[x]! >= lo && lim[x]! <= hi) continue;
        const s = slack(g);
        if (s < bestSlack) {
          bestSlack = s;
          best = g;
        }
      }
      for (const g of tadj[u]!) if (g !== par[u]) stack.push(other(g, u));
    }
    return best;
  };

  // --- Pivot until no tree edge has a negative cut value --------------------
  for (let iter = 0; iter < maxIterations; iter++) {
    const e = leaveEdge();
    if (e < 0) break;
    const f = enterEdge(e);
    if (f < 0) break; // cannot happen for a negative cut value

    const delta = slack(f);
    if (delta > 0) {
      if (lim[from[e]!]! < lim[to[e]!]!) rerank(from[e]!, delta);
      else rerank(to[e]!, -delta);
    }
    const value = cut[e]!;
    const lca = treeUpdate(from[f]!, to[f]!, value, true);
    treeUpdate(to[f]!, from[f]!, value, false);
    cut[f] = -value;
    cut[e] = 0;

    isTree[e] = 0;
    isTree[f] = 1;
    tadj[from[e]!] = tadj[from[e]!]!.filter((g) => g !== e);
    tadj[to[e]!] = tadj[to[e]!]!.filter((g) => g !== e);
    tadj[from[f]!]!.push(f);
    tadj[to[f]!]!.push(f);
    treeList[treeSlot[e]!] = f;
    treeSlot[f] = treeSlot[e]!;
    treeSlot[e] = -1;
    dfsRange(lca, par[lca]!, low[lca]!);
  }

  return normalize(rank.slice(0, n), comp, n);
}

/** Longest-path ranks (a feasible start); null when the graph has a cycle. */
function initRank(
  N: number,
  from: number[],
  to: number[],
  minlen: number[],
  outE: number[][],
  inE: number[][],
): number[] | null {
  const indeg = inE.map((l) => l.length);
  const rank = new Array<number>(N).fill(0);
  const queue: number[] = [];
  for (let v = 0; v < N; v++) if (indeg[v] === 0) queue.push(v);
  for (let q = 0; q < queue.length; q++) {
    const v = queue[q]!;
    for (const e of outE[v]!) {
      const w = to[e]!;
      rank[w] = Math.max(rank[w]!, rank[v]! + minlen[e]!);
      indeg[w] = indeg[w]! - 1;
      if (indeg[w] === 0) queue.push(w);
    }
  }
  return queue.length === N ? rank : null;
}

/** Connected-component id per node (union-find over constraints). */
function components(n: number, from: number[], to: number[]): number[] {
  const up = Array.from({ length: n }, (_, i) => i);
  const find = (v: number): number => {
    while (up[v] !== v) {
      up[v] = up[up[v]!]!;
      v = up[v]!;
    }
    return v;
  };
  for (let e = 0; e < from.length; e++) {
    const a = find(from[e]!);
    const b = find(to[e]!);
    if (a !== b) up[Math.max(a, b)] = Math.min(a, b);
  }
  return up.map((_, v) => find(v));
}

function normalize(rank: number[], comp: number[], n: number): number[] {
  const min = new Map<number, number>();
  for (let v = 0; v < n; v++) {
    const c = comp[v]!;
    min.set(c, Math.min(min.get(c) ?? Infinity, rank[v]!));
  }
  return rank.map((r, v) => r - min.get(comp[v]!)!);
}
