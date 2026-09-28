import { describe, expect, it } from "vitest";
import { parse } from "@archer/lang";
import { itemAtPath, itemPathAtOffset } from "../lib/archLanguage";

// The code pane follows the cursor to the canvas selection, planes included.
const SRC = `arch "Shop" v0.2

plane backend "Backend" {
  plane inner "Inner" {
    component api "API"
  }
  component orders "Orders" {
    component db "DB"
  }
}
`;
const doc = parse(SRC).doc;
const at = (text: string) => SRC.indexOf(text);

describe("code pane selection", () => {
  it("finds the innermost component or plane at the cursor", () => {
    expect(itemPathAtOffset(doc, at('"Backend"'))).toBe("backend");
    expect(itemPathAtOffset(doc, at('"Inner"'))).toBe("inner");
    expect(itemPathAtOffset(doc, at('"API"'))).toBe("api");
    expect(itemPathAtOffset(doc, at('"DB"'))).toBe("orders.db");
    expect(itemPathAtOffset(doc, 0)).toBeNull();
  });

  it("looks components and planes up by path", () => {
    expect(itemAtPath(doc, "inner")?.kind).toBe("plane");
    expect(itemAtPath(doc, "orders.db")?.kind).toBe("component");
    expect(itemAtPath(doc, "backend.orders")).toBeUndefined();
  });
});
