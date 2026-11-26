import { ConvexHttpClient } from "convex/browser";
import { LOGOS } from "@archer/catalog/logos";
import { api } from "@/convex/_generated/api";
import { renderArchSvg } from "@/lib/svg";
import { renderViewSvg } from "@/lib/viewSvg";

/**
 * Public embed image for a shared document:
 *   <img src="https://<app>/s/<slug>/image.svg?theme=dark">
 *   <img src="https://<app>/s/<slug>/image.svg?view=checkout">  (one view)
 * Works in GitHub READMEs and docs. Only documents with "anyone with the
 * link can view" enabled resolve; everything else is a 404.
 */
export const dynamic = "force-dynamic";

const NOT_SHARED =
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="60" viewBox="0 0 240 60"><rect width="240" height="60" rx="8" fill="#f7f5f1" stroke="#e7e3dc"/><text x="120" y="35" text-anchor="middle" font-family="-apple-system, Inter, sans-serif" font-size="13" fill="#5f5a52">Not shared</text></svg>`;

const svgResponse = (body: string, status = 200, cache = true) =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": cache
        ? "public, max-age=60, s-maxage=60, stale-while-revalidate=300"
        : "no-store",
    },
  });

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return svgResponse(NOT_SHARED, 503, false);
  const client = new ConvexHttpClient(url);
  const doc = await client.query(api.documents.getPublic, { slug });
  if (!doc) return svgResponse(NOT_SHARED, 404, false);
  const params2 = new URL(req.url).searchParams;
  const theme = params2.get("theme") === "dark" ? "dark" : "light";
  // ?view=<id>: one of the document's views (a sequence, flow, state machine or data model).
  const view = params2.get("view");
  return svgResponse(
    view ? renderViewSvg(doc.source, view, { theme, logos: LOGOS }) : renderArchSvg(doc.source, { theme, logos: LOGOS }),
  );
}
