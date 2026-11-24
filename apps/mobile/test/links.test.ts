import { describe, expect, it } from "vitest";
import { shareSlugFrom } from "@/lib/links";

describe("shareSlugFrom", () => {
  it("reads a slug from the links the web hands out", () => {
    const slug = "1uC4PhN_kTVQmFom";
    for (const input of [
      slug,
      `https://tryarcher.dev/share/${slug}`,
      `https://www.tryarcher.dev/share/${slug}/image.svg?theme=dark`,
      `https://tryarcher.dev/s/${slug}`,
      `archer://share/${slug}`,
      `  ${slug}\n`,
    ])
      expect(shareSlugFrom(input)).toBe(slug);
  });

  it("rejects anything else", () => {
    expect(shareSlugFrom("")).toBeNull();
    expect(shareSlugFrom("https://tryarcher.dev/documents/abc")).toBeNull();
    expect(shareSlugFrom("not a link")).toBeNull();
  });
});
