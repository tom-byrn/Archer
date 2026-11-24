/**
 * The web app's Convex functions, typed from its generated API. Only the
 * types come from apps/web: at runtime `api` is Convex's `anyApi`, which is
 * all the generated module is too.
 */

import { anyApi } from "convex/server";
import type { api as generatedApi } from "../../../web/convex/_generated/api";

export const api = anyApi as unknown as typeof generatedApi;
export type { Id } from "../../../web/convex/_generated/dataModel";

export type Role = "owner" | "editor" | "viewer";

export const canEdit = (role: Role | null | undefined): boolean => role === "owner" || role === "editor";
