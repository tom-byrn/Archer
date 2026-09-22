import { EXAMPLES, findExample } from "@/lib/examples";
import { renderArchSvg } from "@/lib/svg";

/**
 * The docs examples' diagrams, drawn by the same renderer as share embeds:
 *   /language/examples/<slug>/light.svg   (or dark.svg)
 * Prerendered at build time; the examples only change with a deploy.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

const THEMES = { "light.svg": "light", "dark.svg": "dark" } as const;

export function generateStaticParams() {
  return EXAMPLES.flatMap((e) => Object.keys(THEMES).map((image) => ({ slug: e.slug, image })));
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; image: string }> },
) {
  const { slug, image } = await params;
  const example = findExample(slug);
  const theme = THEMES[image as keyof typeof THEMES];
  if (!example || !theme) return new Response("Not found", { status: 404 });
  return new Response(renderArchSvg(example.source, { theme, showTitle: false }), {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8" },
  });
}
