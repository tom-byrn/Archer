import {
  metadataCorsOptionsRequestHandler,
  protectedResourceHandlerClerk,
} from "@clerk/mcp-tools/next";

// RFC 9728: tells MCP clients which authorization server protects /mcp.
const handler = protectedResourceHandlerClerk({ scopes_supported: ["profile", "email"] });
const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
