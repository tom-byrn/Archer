import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { IMAGE_LINK_TTL_MS, signImageLink, verifyImageLink } from "../lib/server/imageLink";

/*
 * Diagram links for the MCP's render_diagram: lib/server/imageLink.ts signs
 * them, app/api/render/[token] serves them against Convex (in memory here).
 */

const SECRET = "test-secret-0123456789abcdefghijklmnop";
const CLAIM = { userId: "user_me", workspaceId: "user_me", documentId: "doc_1", theme: "dark" as const };
const NOW = Date.parse("2026-09-01T10:00:00Z");

describe("image link tokens", () => {
  it("carry the claim until they expire", () => {
    const { token, expiresAt } = signImageLink(CLAIM, { secret: SECRET, now: NOW });
    expect(expiresAt).toBe(NOW + IMAGE_LINK_TTL_MS);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(verifyImageLink(token, { secret: SECRET, now: NOW + 1000 })).toEqual({ ...CLAIM, expiresAt });
    expect(verifyImageLink(token, { secret: SECRET, now: expiresAt })).toBe("expired");
  });

  it("are refused when tampered with, signed with another secret, or malformed", () => {
    const { token } = signImageLink(CLAIM, { secret: SECRET, now: NOW });
    const [payload, sig] = token.split(".") as [string, string];
    const forged = Buffer.from(JSON.stringify({ u: "user_other", w: "user_other", d: "doc_1", t: "dark", e: NOW + 60_000 })).toString("base64url");
    for (const bad of [
      `${forged}.${sig}`,
      `${payload}.${sig.slice(0, -2)}AA`,
      `${payload}.`,
      payload,
      "",
      "not.a.token",
    ])
      expect(verifyImageLink(bad, { secret: SECRET, now: NOW }), bad).toBeNull();
    expect(verifyImageLink(token, { secret: `${SECRET}x`, now: NOW })).toBeNull();
  });

  it("are refused when a validly signed payload has the wrong shape", () => {
    const key = createHmac("sha256", SECRET).update("archer:image-link:v1").digest();
    const signed = (claim: unknown) => {
      const payload = Buffer.from(JSON.stringify(claim)).toString("base64url");
      return `${payload}.${createHmac("sha256", key).update(payload).digest("base64url")}`;
    };
    expect(verifyImageLink(signed({ u: "user_me", w: "user_me", d: "doc_1", t: "sepia", e: NOW + 1 }), { secret: SECRET, now: NOW })).toBeNull();
    expect(verifyImageLink(signed({ u: "user_me", w: "user_me", d: 1, t: "dark", e: NOW + 1 }), { secret: SECRET, now: NOW })).toBeNull();
    expect(verifyImageLink(signed({ u: "user_me", w: "user_me", d: "doc_1", t: "dark", e: NOW + 1 }), { secret: SECRET, now: NOW })).toMatchObject({ documentId: "doc_1" });
  });
});

// ------------------------------------------------------------------ the route

const convex = vi.hoisted(() => {
  const state = {
    docs: new Map<string, { _id: string; workspaceId: string; title: string; source: string }>(),
    types: [] as { tag: string; name: string; color: string; glyph: string }[],
    /** Users who can read `user_me`'s workspace. */
    members: new Set<string>(["user_me"]),
    calls: [] as { name: string; apiKey: unknown }[],
  };
  const call = async (name: string, a: Record<string, unknown>) => {
    state.calls.push({ name, apiKey: a.apiKey });
    const user = /^svc_test-secret-0123456789abcdefghijklmnop\.(user_\w+)$/.exec(String(a.apiKey))?.[1];
    if (!user || !state.members.has(user) || a.workspaceId !== "user_me") throw new Error("Not authorized for this workspace.");
    if (name === "documents:get") {
      const doc = state.docs.get(String(a.id));
      return doc && doc.workspaceId === a.workspaceId ? { ...doc, role: "owner" } : null;
    }
    if (name === "library:list") return state.types;
    throw new Error(`no function ${name}`);
  };
  return { state, call };
});

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    query(ref: never, args: Record<string, unknown>) {
      return convex.call(getFunctionName(ref), args);
    }
  },
}));

process.env.ARCHER_SERVICE_SECRET = SECRET;
process.env.NEXT_PUBLIC_CONVEX_URL = "https://convex.test";
const { GET } = await import("../app/api/render/[token]/route");

const get = (token: string) => GET(new Request(`https://archer.test/api/render/${token}`), { params: Promise.resolve({ token }) });

const DOC = `arch "Order Flow" v0.1

component api "API" @custom.gateway

component db "Orders" @postgres

api -> db @sql
`;

describe("GET /api/render/<token>.svg", () => {
  beforeEach(() => {
    convex.state.docs = new Map([["doc_1", { _id: "doc_1", workspaceId: "user_me", title: "Order Flow", source: DOC }]]);
    convex.state.types = [{ tag: "custom.gateway", name: "Gateway", color: "#c026d3", glyph: "shield" }];
    convex.state.members = new Set(["user_me"]);
    convex.state.calls = [];
  });

  it("draws the project as the user the link was made for, custom types included", async () => {
    const { token } = signImageLink(CLAIM, { secret: SECRET });
    const res = await get(`${token}.svg`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("content-disposition")).toBe('inline; filename="order-flow.svg"');
    const svg = await res.text();
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('aria-label="Order Flow"');
    expect(svg.toLowerCase()).toContain("#c026d3");
    expect(convex.state.calls.map((c) => c.apiKey)).toEqual([`svc_${SECRET}.user_me`, `svc_${SECRET}.user_me`]);
  });

  it("draws the project as it is when the link is opened", async () => {
    const { token } = signImageLink(CLAIM, { secret: SECRET });
    convex.state.docs.get("doc_1")!.source = DOC.replace('"Orders"', '"Order History"');
    expect(await (await get(token)).text()).toContain("Order History");
  });

  it("refuses expired, forged and dead links without reading anything", async () => {
    const old = signImageLink(CLAIM, { secret: SECRET, now: Date.now() - IMAGE_LINK_TTL_MS - 1 });
    const expired = await get(`${old.token}.svg`);
    expect(expired.status).toBe(410);
    expect(await expired.text()).toContain("expired");
    const forged = signImageLink(CLAIM, { secret: "another-secret-0123456789abcdefghijkl" });
    expect((await get(forged.token)).status).toBe(404);
    expect((await get("nonsense.svg")).status).toBe(404);
    expect(convex.state.calls).toEqual([]);
  });

  it("stops working when the project is gone or the user lost access", async () => {
    const { token } = signImageLink(CLAIM, { secret: SECRET });
    convex.state.docs.clear();
    expect((await get(token)).status).toBe(404);
    const other = signImageLink({ ...CLAIM, userId: "user_gone" }, { secret: SECRET });
    const res = await get(other.token);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("That project isn't available.");
  });
});
