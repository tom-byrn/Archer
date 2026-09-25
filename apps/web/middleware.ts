import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { markdownTwin, prefersMarkdown } from "@/lib/negotiate";

// Everything is private except the landing page, the sign-in flow, the docs
// under /language (which users hand to agents as a docs link) and /docs (the
// MCP server and CLI), their markdown for agents (each page's `.md`, and
// /llms.txt), the docs examples' sandbox, and shared-link views.
const isPublic = createRouteMatcher([
  "/welcome(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/language(.*)",
  "/docs(.*)",
  "/llms.txt",
  "/llms-full.txt",
  "/sandbox(.*)",
  "/share(.*)",
  // Hosted MCP server: it verifies OAuth bearer tokens itself, and its
  // discovery documents must be readable by unauthenticated clients.
  "/mcp(.*)",
  "/.well-known(.*)",
  // GitHub webhook deliveries: authenticated by their signature.
  "/api/github/webhook",
]);

const configured =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

const withClerk = clerkMiddleware(async (auth, request) => {
  // "/" is the dashboard when signed in and the landing page otherwise. The
  // rewrite keeps the landing page static and the URL clean.
  if (request.nextUrl.pathname === "/") {
    const { userId } = await auth();
    if (!userId) return NextResponse.rewrite(new URL("/welcome", request.url));
    return;
  }
  if (!isPublic(request)) await auth.protect();
});

export default function middleware(request: NextRequest, event: Parameters<typeof withClerk>[1]) {
  // An agent that asks for markdown gets a docs page's markdown at the page's
  // own address (and the landing page's summary, /llms.txt, at "/").
  const twin = markdownTwin(request.nextUrl.pathname);
  if (twin && prefersMarkdown(request.headers.get("accept"))) {
    const response = NextResponse.rewrite(new URL(twin, request.url));
    response.headers.set("Vary", "Accept");
    return response;
  }
  // Without Clerk keys, let requests through so the app can render its
  // "not configured" panel instead of the middleware throwing.
  return configured ? withClerk(request, event) : NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Clerk's auto-proxy path
    "/__clerk/:path*",
  ],
};
