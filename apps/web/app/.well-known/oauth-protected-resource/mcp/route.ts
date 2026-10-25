import { metadataCorsOptionsRequestHandler } from "@clerk/mcp-tools/next";
import { corsHeaders, generateClerkProtectedResourceMetadata } from "@clerk/mcp-tools/server";

// RFC 9728: tells MCP clients which authorization server protects /mcp. The
// resource is the MCP endpoint itself — clients send it back as the OAuth
// `resource` parameter, and it is the URL the MCP server is registered under
// in Clerk — so this can't use protectedResourceHandlerClerk, which says the
// bare origin.
export function GET(req: Request): Response {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) throw new Error("Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  const metadata = generateClerkProtectedResourceMetadata({
    publishableKey,
    resourceUrl: `${new URL(req.url).origin}/mcp`,
    properties: { scopes_supported: ["profile", "email"] },
  });
  return Response.json(metadata, { headers: { "Cache-Control": "max-age=3600", ...corsHeaders } });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
