import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// docs/cli.md (also the docs site's /docs/cli) documents every command and
// option the CLI's own help lists.

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const TSX = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
const DOCS = readFileSync(new URL("../../../docs/cli.md", import.meta.url), "utf8");

const help = spawnSync(TSX, [CLI, "--help"], { encoding: "utf8" }).stdout;

describe("docs/cli.md", () => {
  it("has a section for every command", () => {
    const commands = [...help.matchAll(/^ {2}archer (\w+)/gm)].map((m) => m[1]!);
    expect(commands.length).toBeGreaterThan(5);
    const missing = commands.filter((c) => !DOCS.includes(`### \`archer ${c}\``));
    expect(missing).toEqual([]);
  });

  it("documents every option", () => {
    const options = [...new Set([...help.matchAll(/(?<![\w-])--?[a-z][a-z-]*/g)].map((m) => m[0]))];
    expect(options).toContain("--drop-comments");
    const missing = options.filter((o) => !DOCS.includes(`\`${o}`));
    expect(missing).toEqual([]);
  });
});
