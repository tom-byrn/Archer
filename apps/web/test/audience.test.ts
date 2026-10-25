import { describe, expect, it } from "vitest";
import { audienceIncludes } from "../lib/server/audience";

const RESOURCE = "https://www.tryarcher.dev/mcp";
const jwt = (payload: unknown) =>
  `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

// The /mcp route refuses Clerk tokens that weren't issued for it.
describe("audienceIncludes", () => {
  it("accepts a token for this server, as a string or in a list", () => {
    expect(audienceIncludes(jwt({ aud: RESOURCE }), RESOURCE)).toBe(true);
    expect(audienceIncludes(jwt({ aud: [`${RESOURCE}/`, "other"] }), RESOURCE)).toBe(true);
  });

  it("refuses a token for another resource, or with no audience", () => {
    expect(audienceIncludes(jwt({ aud: "https://www.tryarcher.dev" }), RESOURCE)).toBe(false);
    expect(audienceIncludes(jwt({ aud: "https://elsewhere.dev/mcp" }), RESOURCE)).toBe(false);
    expect(audienceIncludes(jwt({ sub: "user_1" }), RESOURCE)).toBe(false);
  });

  it("refuses something that isn't a JWT", () => {
    expect(audienceIncludes("opaque-token", RESOURCE)).toBe(false);
    expect(audienceIncludes("a.%%%.c", RESOURCE)).toBe(false);
  });
});
