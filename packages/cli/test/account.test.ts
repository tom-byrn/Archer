import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TEAM, USER, startHost, type Host } from "./host";

// End to end: the real CLI (spawned) signs in to a stand-in app (./host.ts)
// whose /mcp runs the real hosted tools, and works on projects through them.

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));

let host: Host;
let home: string;
let dir: string;

beforeAll(async () => {
  host = await startHost();
});
afterAll(async () => {
  await host?.close();
});
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "archer-home-"));
  dir = mkdtempSync(join(tmpdir(), "archer-cwd-"));
  host.convex.prefs.clear();
});

const env = () => ({ ...process.env, HOME: home, USERPROFILE: home, ARCHER_APP_URL: host.appUrl });
const write = (name: string, text: string) => writeFileSync(join(dir, name), text);
const read = (name: string) => readFileSync(join(dir, name), "utf8");
const storePath = () => join(home, ".archer", "auth.json");
const session = () => JSON.parse(readFileSync(storePath(), "utf8")).servers[`${host.appUrl}/mcp`] ?? {};

// Async on purpose: the stand-in app runs in this process and must keep serving.
function run(args: string[]) {
  return new Promise<{ code: number | null; out: string; err: string }>((resolve) => {
    const child = spawn(TSX, [CLI, ...args], { cwd: dir, env: env() });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => resolve({ code, out, err }));
    child.stdin.end();
  });
}

/** `archer login --no-browser`, with this test playing the browser. */
async function login() {
  const child = spawn(TSX, [CLI, "login", "--no-browser"], { cwd: dir, env: env() });
  const exited = new Promise<number | null>((r) => child.on("close", r));
  let out = "";
  let err = "";
  child.stdout.on("data", (d) => (out += d));
  const authorizeUrl = await new Promise<string>((resolve, reject) => {
    child.stderr.on("data", (d) => {
      err += d;
      const m = /(http:\/\/127\.0\.0\.1:\d+\/oauth\/authorize\S+)/.exec(err);
      if (m) resolve(m[1]!);
    });
    void exited.then(() => reject(new Error(`login exited before printing a URL:\n${err}`)));
  });
  // The authorization server answers at once with a redirect back to the CLI.
  const consent = await fetch(authorizeUrl, { redirect: "manual" });
  const callback = consent.headers.get("location") ?? "";
  // A request that didn't come from this sign-in (wrong state) is ignored.
  const forged = new URL(callback);
  forged.searchParams.set("state", "forged");
  const forgedStatus = (await fetch(forged)).status;
  const page = await (await fetch(callback)).text();
  return { code: await exited, out, err, callback, page, forgedStatus };
}

const SHOP = `arch "Shop" v0.2

component web "Web" @vercel.nextjs
component db "DB" @postgres

web -> db @sql
`;

describe("archer login", () => {
  it("signs in through the browser with PKCE and stores the session privately", async () => {
    const r = await login();
    expect(r.code).toBe(0);
    expect(r.callback).toMatch(/^http:\/\/localhost:\d+\/callback\?/);
    expect(r.forgedStatus).toBe(404);
    expect(r.page).toContain("Signed in to Archer");
    expect(r.out).toContain(`Signed in to ${new URL(host.appUrl).host} — workspace Personal (owner)`);

    expect(statSync(storePath()).mode & 0o777).toBe(0o600);
    const s = session();
    expect(s.tokens.access_token).toMatch(/^at_/);
    expect(s.tokens.refresh_token).toMatch(/^rt_/);
    expect(s.client.client_name).toBe("Archer CLI");
    expect(s.client.redirect_uris[0]).toMatch(/^http:\/\/localhost:\d+\/callback$/);
  });

  it("reuses its client registration on the next sign-in", async () => {
    await login();
    const registered = host.as.clients.size;
    expect((await login()).code).toBe(0);
    expect(host.as.clients.size).toBe(registered);
  });

  it("stores nothing when the user denies access", async () => {
    host.as.denyNext = true;
    const r = await login();
    expect(r.code).toBe(2);
    expect(r.err).toContain("access_denied");
    expect(r.page).toContain("Sign-in failed");
    expect(session().tokens).toBeUndefined();
  });
});

describe("signed out", () => {
  it("fails fast without registering a client", async () => {
    const registered = host.as.clients.size;
    const r = await run(["list"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("archer login");
    expect(host.as.clients.size).toBe(registered);
  });

  it("archer mcp answers with how to sign in", async () => {
    const client = new Client({ name: "relay-test", version: "0" });
    const transport = new StdioClientTransport({ command: TSX, args: [CLI, "mcp"], cwd: dir, env: env(), stderr: "pipe" });
    await expect(client.connect(transport)).rejects.toThrow(/archer login/);
    await transport.close();
  });
});

describe("signed in", () => {
  beforeEach(async () => {
    expect((await login()).code).toBe(0);
  });

  it("push creates the project, then updates the linked one — attributed to the CLI", async () => {
    write("shop.arch", SHOP);
    let r = await run(["push", "shop.arch", "-m", "First cut"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(new RegExp(`Created "Shop" — ${host.appUrl}/documents/doc\\d+`));
    const id = JSON.parse(read("archer.json")).projects["shop.arch"] as string;
    expect(host.convex.docs.get(id)?.workspaceId).toBe(USER);

    write("shop.arch", SHOP + "component cache\n");
    r = await run(["push", "shop.arch"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('Updated "Shop"');
    const stored = host.convex.docs.get(id)!.source;
    expect(stored).toContain("component cache");
    expect(stored).toContain("layout {"); // the server laid it out

    const saves = host.convex.saves.filter((s) => s.documentId === id);
    expect(saves.map((s) => s.author)).toEqual([
      { kind: "agent", name: "Archer CLI" },
      { kind: "agent", name: "Archer CLI" },
    ]);
    expect(saves[0]!.summary).toBe("First cut");
  });

  it("push rejects invalid files with file:line:col diagnostics and saves nothing", async () => {
    write("bad.arch", 'arch "Bad" v0.2\ncomponent a "A"\ncomponent a "Dup"\na -> ghost @http\n');
    const before = host.convex.docs.size;
    const r = await run(["push", "bad.arch"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("bad.arch:4:1: error E101:");
    expect(r.err).toContain("REJECTED");
    expect(host.convex.docs.size).toBe(before);
  });

  it("pull writes the saved source and won't clobber local edits", async () => {
    write("shop.arch", SHOP);
    await run(["push", "shop.arch"]);
    const id = JSON.parse(read("archer.json")).projects["shop.arch"] as string;

    let r = await run(["pull", "shop.arch"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("--force");
    r = await run(["pull", "shop.arch", "--force"]);
    expect(r.code).toBe(0);
    expect(read("shop.arch")).toBe(host.convex.docs.get(id)!.source);

    r = await run(["pull", "copy.arch", "--project", id]);
    expect(r.code).toBe(0);
    expect(read("copy.arch")).toBe(read("shop.arch"));
    expect((await run(["pull", "x.arch", "--project", "doc999"])).err).toContain("No project with id doc999");
    expect((await run(["pull", "x.arch", "--project", "not-an-id"])).err).toContain("No project with id not-an-id");
  });

  it("render draws the linked project's canvas, or a component's inside", async () => {
    write("shop.arch", 'arch "Shop" v0.2\n\ncomponent backend {\n  component api\n  component db\n}\n');
    await run(["push", "shop.arch"]);

    let r = await run(["render", "shop.arch"]);
    expect(r.code, r.err).toBe(0);
    expect(r.out).toContain('data-theme="light" data-focus=""');

    r = await run(["render", "shop.arch", "--component", "backend", "--theme", "dark", "-o", "backend.svg"]);
    expect(r.code, r.err).toBe(0);
    expect(read("backend.svg")).toContain('data-theme="dark" data-focus="backend"');
    expect(r.err).toContain("backend.svg: rendered the inside of backend");

    r = await run(["render", "shop.arch", "--component", "backend.cache"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain('No component "backend.cache"');
    expect((await run(["render", "other.arch"])).err).toContain("isn't linked to a project");
    expect((await run(["render", "shop.arch", "--theme", "blue"])).code).toBe(2);
  });

  it("lists and switches workspaces; projects follow the current one", async () => {
    write("shop.arch", SHOP);
    await run(["push", "shop.arch"]);

    let r = await run(["workspace"]);
    expect(r.out).toContain(`* ${USER}  Personal  owner`);
    expect(r.out).toContain(`  ${TEAM}  Acme  editor`);

    r = await run(["workspace", TEAM]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Now using Acme (editor)");
    expect(host.convex.prefs.get(USER)).toBe(TEAM);

    write("team.arch", 'arch "Team" v0.2\ncomponent api\n');
    expect((await run(["push", "team.arch"])).code).toBe(0);
    const listed = JSON.parse((await run(["list", "--json"])).out) as { id: string; title: string }[];
    expect(listed.map((p) => p.title)).toEqual(["Team"]);

    r = await run(["pull", "shop.arch", "--force"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("in the current workspace");

    expect((await run(["workspace", "nope"])).err).toContain("not a member");
  });

  it("check knows the workspace's custom types", async () => {
    host.convex.library.set(USER, [{ tag: "custom.billing", name: "Billing", color: "#6366f1", glyph: "box" }]);
    try {
      write("c.arch", 'arch "C" v0.2\ncomponent b "Billing" @custom.billing\n');
      expect((await run(["check", "c.arch"])).out).not.toContain("W301");
      expect((await run(["check", "--offline", "c.arch"])).out).toContain("W301");
    } finally {
      host.convex.library.delete(USER);
    }
  });

  it("refreshes an expired access token", async () => {
    const before = session().tokens;
    host.as.expireAccessTokens();
    const unauthorized = host.unauthorized;
    expect((await run(["list"])).code).toBe(0);
    expect(host.unauthorized).toBe(unauthorized + 1);
    expect(session().tokens.access_token).not.toBe(before.access_token);
    expect(session().tokens.refresh_token).not.toBe(before.refresh_token);
  });

  it("asks for a new sign-in once the refresh token is dead", async () => {
    host.as.expireAccessTokens();
    host.as.forgetRefreshTokens();
    const r = await run(["list"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("archer login");
    expect(session().tokens).toBeUndefined();
    expect(session().client).toBeDefined();
  });

  it("logout revokes the session and forgets it", async () => {
    const refresh = session().tokens.refresh_token;
    const r = await run(["logout"]);
    expect(r.out).toContain(`Signed out of ${host.appUrl}`);
    expect(host.as.revoked).toContain(refresh);
    expect(session().tokens).toBeUndefined();
    expect((await run(["list"])).code).toBe(2);
    expect((await run(["logout"])).out).toContain("Not signed in.");
  });

  it("archer mcp relays the hosted server over stdio", async () => {
    const client = new Client({ name: "relay-test", version: "0" });
    const transport = new StdioClientTransport({ command: TSX, args: [CLI, "mcp"], cwd: dir, env: env(), stderr: "pipe" });
    await client.connect(transport);
    try {
      const names = (await client.listTools()).tools.map((t) => t.name);
      expect(names).toHaveLength(27);
      expect(names).toContain("use_workspace");
      const res = await client.callTool({ name: "get_workspace_info", arguments: {} });
      const info = JSON.parse((res.content as { text: string }[])[0]!.text);
      expect(info).toMatchObject({ auth: "oauth", user_id: USER, agent_name: "Archer CLI" });
    } finally {
      await client.close();
    }
  });
});
