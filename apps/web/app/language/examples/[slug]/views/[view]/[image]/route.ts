import { allViews, parse } from "@archer/lang";
import { LOGOS } from "@archer/catalog/logos";
import { EXAMPLES, findExample } from "@archer/mcp/examples";
import { renderViewSvg } from "@/lib/viewSvg";

/**
 * The docs examples' views (sequences, flows, state machines, data models),
 * drawn by the same renderer as `/share/<slug>/image.svg?view=<id>`:
 *   /language/examples/<slug>/views/<view>/light.svg   (or dark.svg)
 * Prerendered at build time, like the architecture images beside it.
 */
export const dynamic = "force-static";
export const dynamicParams = false;

const THEMES = { "light.svg": "light", "dark.svg": "dark" } as const;

export function generateStaticParams() {
  return EXAMPLES.flatMap((e) =>
    allViews(parse(e.source).doc).flatMap((v) =>
      Object.keys(THEMES).map((image) => ({ slug: e.slug, view: v.node.id, image })),
    ),
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; view: string; image: string }> },
) {
  const { slug, view, image } = await params;
  const example = findExample(slug);
  const theme = THEMES[image as keyof typeof THEMES];
  if (!example || !theme || !allViews(parse(example.source).doc).some((v) => v.node.id === view)) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(renderViewSvg(example.source, view, { theme, showTitle: false, logos: LOGOS }), {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8" },
  });
}
