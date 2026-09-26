import { describe, expect, it } from "vitest";
import { parse } from "@archer/lang";
import { CROWDED_LEVEL, readabilityAdvice } from "../src/analysis";
import { EXAMPLES } from "../src/examples";

const doc = (body: string) => parse(`arch "X" v0.1\n${body}`).doc;
const leaves = (n: number, indent = "") =>
  Array.from({ length: n }, (_, i) => `${indent}component c${i}\n`).join("");

describe("readabilityAdvice", () => {
  it("has nothing to say about the worked examples", () => {
    for (const e of EXAMPLES) expect(readabilityAdvice(parse(e.source).doc), e.slug).toEqual([]);
  });

  it("names a crowded level, top or nested", () => {
    expect(readabilityAdvice(doc(leaves(CROWDED_LEVEL)))).toEqual([]);
    const top = readabilityAdvice(doc(leaves(CROWDED_LEVEL + 1)));
    expect(top).toHaveLength(1);
    expect(top[0]).toMatch(/^The top level has 13 components/);
    const nested = readabilityAdvice(doc(`component svc "Service" {\n${leaves(15, "  ")}}\n`));
    expect(nested[0]).toMatch(/^'svc' \(Service\) has 15 components directly inside it/);
  });

  it("calls out a code library that everything connects to", () => {
    const src =
      'component shared "@acme/shared" @library {\n  component db_client\n  component queues\n}\n' +
      "component web\ncomponent worker\ncomponent cron\ncomponent api\n" +
      "web -> shared.db_client\nworker -> shared.db_client\nworker -> shared.queues\n" +
      "cron -> shared.queues\napi -> shared.db_client\n";
    const advice = readabilityAdvice(doc(src));
    expect(advice).toHaveLength(1);
    expect(advice[0]).toMatch(/^'shared' \(@acme\/shared\) looks like a code library, and 5 connections go in or out/);
    // A real service with a library-sounding name but few connections is left alone.
    expect(readabilityAdvice(doc("component core_api\ncomponent web\nweb -> core_api\n"))).toEqual([]);
  });

  it("asks for short labels", () => {
    const advice = readabilityAdvice(
      doc('component a\ncomponent b\na -> b : "reads every trace, observation and score for the table view"\n'),
    );
    expect(advice).toHaveLength(1);
    expect(advice[0]).toMatch(/^1 connection label is over 40 characters/);
  });
});
