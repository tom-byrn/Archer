import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Everything is private except the sign-in flow, the language reference
// (which users hand to agents as a docs link), and shared-link views.
const isPublic = createRouteMatcher(["/sign-in(.*)", "/language(.*)", "/s(.*)"]);

const configured =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !!process.env.CLERK_SECRET_KEY;

const withClerk = clerkMiddleware(async (auth, request) => {
  if (!isPublic(request)) await auth.protect();
});

// Without Clerk keys, let requests through so the app can render its
// "not configured" panel instead of the middleware throwing.
export default function middleware(request: NextRequest, event: Parameters<typeof withClerk>[1]) {
  return configured ? withClerk(request, event) : NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
