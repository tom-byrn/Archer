import { describe, expect, it } from "vitest";
import { parse, validate } from "@archer/lang";
import { knownConnectionTypes, knownTypes } from "@archer/catalog";
import { TOOL_GROUPS } from "@archer/mcp/reference";
import * as S from "../src/sources";

// What the film shows is real Archer: every document on screen parses and
// validates with no errors and no warnings, types and connection types
// included (the hero diagram is the dashboard's sample, tested in apps/web).
const DOCS = [
  ["cold open", S.OPEN_SOURCE + S.OPEN_LAYOUT],
  ["editor", S.LOOP_SOURCE + S.LOOP_LAYOUT],
  ["nesting and payloads", S.NEST_SOURCE + S.NEST_LAYOUT],
  ["agents draw", S.AGENT_SOURCE + S.AGENT_LAYOUT],
  ["share embed", S.SHARE_SOURCE + S.SHARE_LAYOUT],
] as const;

describe("the film's documents", () => {
  it.each(DOCS)("%s is valid, clean Archer", (_, source) => {
    const { doc, diagnostics } = parse(source);
    const all = [
      ...diagnostics,
      ...validate(doc, { knownTypes: knownTypes(), knownConnectionTypes: knownConnectionTypes() }),
    ];
    expect(all.map((d) => `${d.code} ${d.message}`)).toEqual([]);
  });

  it("types the editor's file line by line", () => {
    expect(S.LOOP_LINES.join("\n") + "\n").toBe(S.LOOP_SOURCE);
  });

  it("lists every tool the MCP server registers", () => {
    expect(S.MCP_TOOLS).toEqual(TOOL_GROUPS.flatMap((g) => g.tools));
  });
});
