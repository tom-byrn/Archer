import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { verifyImageLink } from "@/lib/server/imageLink";
import { renderArchSvg } from "@/lib/svg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const plain = (message: string, status: number) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/** A file name for "save as": the project's title, safe for a header. */
const fileName = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "architecture";

/**
 * GET /api/render/<token>.svg — a project's diagram, from a link the MCP's
 * render_diagram handed out (lib/server/imageLink.ts). Public in
 * middleware.ts: the signature is the authentication. The project is read as
 * the user the link was made for, so it stops working when they lose access,
 * and it shows the project as it is now, custom types included.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const secret = process.env.ARCHER_SERVICE_SECRET;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!secret || !url) return plain("Image links aren't set up on this server.", 503);
  const claim = verifyImageLink(token.replace(/\.svg$/, ""), { secret });
  if (claim === "expired") return plain("This image link has expired. Ask the agent for a new one.", 410);
  if (!claim) return plain("Not an image link.", 404);

  const apiKey = `svc_${secret}.${claim.userId}`;
  const client = new ConvexHttpClient(url);
  try {
    const [doc, customTypes] = await Promise.all([
      client.query(api.documents.get, { id: claim.documentId as Id<"documents">, workspaceId: claim.workspaceId, apiKey }),
      client.query(api.library.list, { workspaceId: claim.workspaceId, apiKey }),
    ]);
    if (!doc) return plain("That project doesn't exist any more.", 404);
    return new Response(renderArchSvg(doc.source, { theme: claim.theme, customTypes }), {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Content-Disposition": `inline; filename="${fileName(doc.title)}.svg"`,
        // Per-user content behind a bearer link: never in a shared cache.
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    // Access lost (removed from the workspace, workspace deleted) or a bad id.
    return plain("That project isn't available.", 404);
  }
}
