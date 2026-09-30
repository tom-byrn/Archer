import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { clerkClient, currentUser, type User } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs, FunctionReference, FunctionReturnType, OptionalRestArgs } from "convex/server";
import { api } from "@/convex/_generated/api";
import { isAdmin } from "@/lib/admin";
import { DAY, computeMetrics, dayStart, type AdminUser, type Metrics } from "@/lib/adminMetrics";

/**
 * Server side of the admin dashboard (/admin-dashboard). Every page calls
 * `requireAdmin()` first: anyone else, signed in or not, gets a plain 404, so
 * the route doesn't even admit it exists. Data then comes from Convex with the
 * bare server credential (convex/adminDashboard.ts) and from Clerk's user list.
 */

/**
 * The signed-in admin, or a 404 for everyone else. Every admin page calls it
 * itself (not just the layout, which client navigations can skip).
 */
export const requireAdmin = cache(async (): Promise<User> => {
  const user = await currentUser().catch(() => null);
  if (!user || !isAdmin(user)) notFound();
  return user;
});

let client: ConvexHttpClient | null = null;
const convex = (): ConvexHttpClient => {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set.");
  return (client ??= new ConvexHttpClient(url));
};

const serverKey = (): string => {
  const secret = process.env.ARCHER_SERVICE_SECRET;
  if (!secret) throw new Error("ARCHER_SERVICE_SECRET is not set.");
  return `svc_${secret}`;
};

type AdminQuery = FunctionReference<"query", "public", { apiKey: string } & Record<string, unknown>>;

/** Run an adminDashboard query as the server. Callers must have passed `requireAdmin()`. */
export function adminQuery<Q extends AdminQuery>(
  fn: Q,
  args: Omit<FunctionArgs<Q>, "apiKey">,
): Promise<FunctionReturnType<Q>> {
  const withKey = [{ ...args, apiKey: serverKey() }] as unknown as OptionalRestArgs<Q>;
  return convex().query(fn, ...withKey);
}

export type Overview = FunctionReturnType<typeof api.adminDashboard.overview>;
export type AdminDocument = NonNullable<FunctionReturnType<typeof api.adminDashboard.document>>;
export type UserActivity = FunctionReturnType<typeof api.adminDashboard.userActivity>;

/** Clerk's user → the fields the dashboard shows. */
export function toAdminUser(u: User): AdminUser {
  const primary = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) ?? u.emailAddresses[0];
  const github = u.externalAccounts.find((a) => /github/.test(a.provider));
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || null;
  return {
    id: u.id,
    name,
    email: primary?.emailAddress ?? null,
    github: github?.username ?? null,
    imageUrl: u.imageUrl || null,
    createdAt: u.createdAt,
    lastSignInAt: u.lastSignInAt,
    lastActiveAt: u.lastActiveAt,
    banned: u.banned,
  };
}

/** Every Clerk user, newest first (paged through Clerk's 500-per-call limit). */
export async function listUsers(): Promise<AdminUser[]> {
  const clerk = await clerkClient();
  const users: AdminUser[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, totalCount } = await clerk.users.getUserList({
      limit: 500,
      offset,
      orderBy: "-created_at",
    });
    users.push(...data.map(toAdminUser));
    if (data.length < 500 || users.length >= totalCount) break;
  }
  return users;
}

/** One Clerk user, or null if Clerk doesn't know the id. */
export async function getUser(userId: string): Promise<AdminUser | null> {
  try {
    return toAdminUser(await (await clerkClient()).users.getUser(userId));
  } catch {
    return null;
  }
}

/** The dashboard's window from `?range=` (7, 30 or 90 days; 30 by default). */
export const rangeDays = (range: string | string[] | undefined): number =>
  range === "7" ? 7 : range === "90" ? 90 : 30;

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Metrics for the window and filters in the page's search params. */
export async function loadMetrics(searchParams: SearchParams, admin: User): Promise<Metrics> {
  const sp = await searchParams;
  const days = rangeDays(sp.range);
  const now = Date.now();
  const since = dayStart(now) - (days - 1) * DAY;
  const [raw, users] = await Promise.all([adminQuery(api.adminDashboard.overview, { since }), listUsers()]);
  return computeMetrics(raw, users, { now, days, exclude: sp.self === "hide" ? [admin.id] : [] });
}
