import { describe, expect, it } from "vitest";
import { networkSimplex, type Constraint } from "../src/simplex";

const cost = (r: number[], cs: Constraint[]) =>
  cs.reduce((acc, c) => acc + c.weight * (r[c.to]! - r[c.from]!), 0);

const feasible = (r: number[], cs: Constraint[]) =>
  cs.every((c) => r[c.to]! - r[c.from]! >= c.minlen);

/** Exhaustive optimum over ranks in [0, bound]. */
function bruteForce(n: number, cs: Constraint[], bound: number): number {
  let best = Infinity;
  const r = new Array<number>(n).fill(0);
  const rec = (i: number) => {
    if (i === n) {
      if (feasible(r, cs)) best = Math.min(best, cost(r, cs));
      return;
    }
    for (let v = 0; v <= bound; v++) {
      r[i] = v;
      rec(i + 1);
    }
  };
  rec(0);
  return best;
}

/** Small deterministic PRNG so failures reproduce. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

describe("networkSimplex", () => {
  it("solves a chain with a shortcut optimally", () => {
    // a -> b -> c and a -> c: c must sit 2 after a; b anywhere between.
    const cs: Constraint[] = [
      { from: 0, to: 1, minlen: 1, weight: 1 },
      { from: 1, to: 2, minlen: 1, weight: 1 },
      { from: 0, to: 2, minlen: 1, weight: 1 },
    ];
    const r = networkSimplex(3, cs);
    expect(r).toEqual([0, 1, 2]);
  });

  it("pulls sources toward their targets", () => {
    // a -> c, b -> c (minlen 1), d -> c (minlen 3): a and b should sit right before c.
    const cs: Constraint[] = [
      { from: 0, to: 2, minlen: 1, weight: 1 },
      { from: 1, to: 2, minlen: 1, weight: 1 },
      { from: 3, to: 2, minlen: 3, weight: 1 },
    ];
    const r = networkSimplex(4, cs);
    expect(r[2]! - r[0]!).toBe(1);
    expect(r[2]! - r[1]!).toBe(1);
    expect(r[2]! - r[3]!).toBe(3);
  });

  it("normalises each component to start at zero", () => {
    const cs: Constraint[] = [
      { from: 0, to: 1, minlen: 2, weight: 1 },
      { from: 2, to: 3, minlen: 1, weight: 1 },
    ];
    expect(networkSimplex(5, cs)).toEqual([0, 2, 0, 1, 0]);
  });

  it("matches brute force on random small DAGs", () => {
    const rand = rng(7);
    for (let trial = 0; trial < 400; trial++) {
      const n = 2 + Math.floor(rand() * 4); // 2..5 nodes
      // Edges follow a random topological order, so they stay acyclic without
      // always pointing from low to high index.
      const perm = Array.from({ length: n }, (_, i) => i).sort(() => rand() - 0.5);
      const cs: Constraint[] = [];
      for (let a = 0; a < n; a++)
        for (let b = a + 1; b < n; b++) {
          if (rand() < 0.55) {
            cs.push({
              from: perm[a]!,
              to: perm[b]!,
              minlen: Math.floor(rand() * 3),
              weight: Math.floor(rand() * 4),
            });
          }
        }
      const r = networkSimplex(n, cs);
      expect(feasible(r, cs), JSON.stringify({ cs, r })).toBe(true);
      const bound = cs.reduce((acc, c) => acc + c.minlen, 0);
      expect(cost(r, cs), JSON.stringify({ cs, r })).toBe(bruteForce(n, cs, bound));
    }
  });

  it("handles merged parallel constraints and zero weights", () => {
    const cs: Constraint[] = [
      { from: 0, to: 1, minlen: 1, weight: 0 },
      { from: 0, to: 1, minlen: 3, weight: 2 },
      { from: 1, to: 2, minlen: 0, weight: 5 },
    ];
    const r = networkSimplex(3, cs);
    expect(r).toEqual([0, 3, 3]);
  });
});
