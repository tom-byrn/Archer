import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "archerctl-"));
});

/** Run the CLI in the temp dir, signed out (HOME is the temp dir). */
const archer = (args: string[], input?: string) => {
  const r = spawnSync(TSX, [CLI, ...args], {
    cwd: dir,
    input,
    encoding: "utf8",
    env: { ...process.env, HOME: dir, USERPROFILE: dir, ARCHER_APP_URL: "https://archer.example" },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const write = (name: string, text: string) => writeFileSync(join(dir, name), text);
const read = (name: string) => readFileSync(join(dir, name), "utf8");

const BAD = `arch "Bad" v0.1
component a "A"
component a "Dup"
a -> ghost @http
`;

describe("init", () => {
  it("writes a starter that is valid and already canonical", () => {
    expect(archer(["init", "--title", "My Shop"]).code).toBe(0);
    expect(read("architecture.arch")).toContain('arch "My Shop" v0.1');
    expect(archer(["check"]).code).toBe(0);
    expect(archer(["fmt", "--check"]).code).toBe(0);
  });

  it("merges into an existing .mcp.json and never overwrites the .arch file", () => {
    write(".mcp.json", JSON.stringify({ mcpServers: { other: { command: "x" } } }));
    write("architecture.arch", BAD);
    expect(archer(["init"]).code).toBe(0);
    const config = JSON.parse(read(".mcp.json"));
    expect(config.mcpServers.other).toEqual({ command: "x" });
    // The hosted server; the agent signs in on its own. No credentials in the file.
    expect(config.mcpServers.archer).toEqual({ type: "http", url: "https://archer.example/mcp" });
    expect(read("architecture.arch")).toBe(BAD);
  });
});

describe("check", () => {
  it("reports file:line:col diagnostics and exits 1 on errors", () => {
    write("bad.arch", BAD);
    const r = archer(["check", "bad.arch"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("bad.arch:3:1: error E002:");
    expect(r.out).toContain("bad.arch:4:1: error E101:");
  });

  it("--json is parseable and carries positions", () => {
    write("bad.arch", BAD);
    const report = JSON.parse(archer(["check", "--json"]).out);
    expect(report.valid).toBe(false);
    expect(report.files[0].errors[0]).toMatchObject({ code: "E002", line: 3, col: 1 });
  });

  it("unknown types only warn, so offline checks still pass", () => {
    write("ok.arch", 'arch "T" v0.1\ncomponent a "A" @my.custom\n');
    const r = archer(["check", "--offline"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("warning W301");
  });

  it("reads stdin and treats usage problems as exit 2", () => {
    expect(archer(["check", "-"], BAD).out).toContain("<stdin>:3:1");
    expect(archer(["check", "missing.arch"]).code).toBe(2);
    expect(archer(["check"]).code).toBe(2); // no .arch files
    expect(archer(["nope"]).code).toBe(2);
  });
});

describe("fmt", () => {
  it("formats in place; --check only reports", () => {
    write("a.arch", 'arch "T" v0.1\ncomponent   x   "X"\n');
    expect(archer(["fmt", "--check"]).code).toBe(1);
    expect(archer(["fmt"]).code).toBe(0);
    expect(read("a.arch")).toBe('arch "T" v0.1\n\ncomponent x "X"\n');
    expect(archer(["fmt", "--check"]).code).toBe(0);
  });

  it("won't silently delete comments, but a # inside a string is not a comment", () => {
    const commented = 'arch "T" v0.1\n# keep me\ncomponent   x "X"\n';
    write("a.arch", commented);
    expect(archer(["fmt"]).code).toBe(1);
    expect(read("a.arch")).toBe(commented);
    expect(archer(["fmt", "--drop-comments"]).code).toBe(0);
    expect(read("a.arch")).not.toContain("keep me");

    write("b.arch", 'arch "T" v0.1\ncomponent   x "Issue #1"\n');
    expect(archer(["fmt", "b.arch"]).code).toBe(0);
    expect(read("b.arch")).toContain('"Issue #1"');
  });

  it("refuses files that don't parse", () => {
    write("a.arch", 'arch "T" v0.1\ncomponent {{{\n');
    expect(archer(["fmt"]).code).toBe(1);
    expect(read("a.arch")).toContain("{{{");
  });
});

describe("workspace commands", () => {
  it("say how to sign in instead of failing obscurely", () => {
    write("a.arch", 'arch "T" v0.1\n');
    for (const args of [["push", "a.arch"], ["list"], ["workspace"], ["pull", "a.arch", "--project", "x"]]) {
      const r = archer(args);
      expect(r.code).toBe(2);
      expect(r.err).toContain("Not signed in to https://archer.example");
      expect(r.err).toContain("archer login");
    }
  });
});
