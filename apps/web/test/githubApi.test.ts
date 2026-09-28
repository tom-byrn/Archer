import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { GitHubError, getFile, listArchFiles, putFile } from "../lib/githubApi";
import { verifyWebhookSignature } from "../lib/githubWebhook";

const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GITHUB_API_URL;
});

describe("GitHub client", () => {
  it("reads a file as UTF-8, and treats a missing one as null", async () => {
    const text = 'arch "Café ☕" v0.2\n';
    const fetch = vi.fn(async (url: string) =>
      url.includes("missing")
        ? respond(404, { message: "Not Found" })
        : respond(200, { type: "file", path: "a.arch", sha: "b1", encoding: "base64", content: Buffer.from(text).toString("base64").replace(/(.{20})/g, "$1\n") }),
    );
    vi.stubGlobal("fetch", fetch);
    process.env.GITHUB_API_URL = "https://ghe.example/api/v3/";
    expect(await getFile("t", "acme", "shop", "docs/a b.arch", "feature/x")).toEqual({ path: "a.arch", sha: "b1", content: text });
    expect(fetch.mock.calls[0]![0]).toBe("https://ghe.example/api/v3/repos/acme/shop/contents/docs/a%20b.arch?ref=feature%2Fx");
    expect(await getFile("t", "acme", "shop", "missing.arch", "main")).toBeNull();
  });

  it("writes base64 content with the blob it replaces", async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(Buffer.from(body.content, "base64").toString("utf8")).toBe("héllo\n");
      expect(body).toMatchObject({ branch: "main", sha: "old", message: "m" });
      return respond(200, { content: { sha: "new" }, commit: { sha: "c2", html_url: "u" } });
    });
    vi.stubGlobal("fetch", fetch);
    expect(await putFile("t", "acme", "shop", { path: "a.arch", branch: "main", content: "héllo\n", message: "m", sha: "old" })).toEqual({
      commit: "c2",
      blob: "new",
      url: "u",
    });
    expect(fetch.mock.calls[0]![1]?.method).toBe("PUT");
  });

  it("maps write refusals to errors that carry GitHub's reason", async () => {
    vi.stubGlobal("fetch", async () => respond(409, { message: "a.arch does not match old" }));
    await expect(putFile("t", "acme", "shop", { path: "a.arch", branch: "main", content: "x", message: "m" })).rejects.toMatchObject({
      code: "conflict",
      message: "a.arch does not match old",
    });
    vi.stubGlobal("fetch", async () =>
      respond(422, { message: "Validation Failed", errors: [{ message: "A pull request already exists for acme:x." }] }),
    );
    const e = await putFile("t", "acme", "shop", { path: "a.arch", branch: "main", content: "x", message: "m" }).catch((err: unknown) => err);
    expect(e).toBeInstanceOf(GitHubError);
    expect(e).toMatchObject({ code: "invalid", message: "Validation Failed: A pull request already exists for acme:x." });
    vi.stubGlobal("fetch", async () => respond(403, { message: "Resource not accessible by integration" }));
    await expect(getFile("t", "acme", "shop", "a.arch", "main")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("lists only .arch files", async () => {
    vi.stubGlobal("fetch", async () =>
      respond(200, {
        truncated: false,
        tree: [
          { path: "services/pay.arch", type: "blob" },
          { path: "README.md", type: "blob" },
          { path: "docs", type: "tree" },
          { path: "architecture.arch", type: "blob" },
        ],
      }),
    );
    expect(await listArchFiles(null, "acme", "shop", "main")).toEqual({
      paths: ["architecture.arch", "services/pay.arch"],
      truncated: false,
    });
  });
});

describe("webhook signatures", () => {
  const body = JSON.stringify({ ref: "refs/heads/main" });
  const sign = (secret: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  it("accepts the right secret only", () => {
    expect(verifyWebhookSignature("s3cret", body, sign("s3cret"))).toBe(true);
    expect(verifyWebhookSignature("s3cret", body, sign("other"))).toBe(false);
    expect(verifyWebhookSignature("s3cret", `${body} `, sign("s3cret"))).toBe(false);
    expect(verifyWebhookSignature("s3cret", body, null)).toBe(false);
    expect(verifyWebhookSignature("s3cret", body, "sha1=abc")).toBe(false);
  });
});
