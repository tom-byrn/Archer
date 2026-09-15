"use client";

import { useAuth } from "@clerk/nextjs";

/** localStorage key of the pre-auth anonymous workspace id. */
export const LEGACY_KEY = "archer.workspaceId";
const OLDER_LEGACY_KEY = "archlang.workspaceId";

/**
 * The signed-in user's workspace id (their Clerk user id), or null while
 * Clerk is loading or the user is signed out.
 */
export function useWorkspaceId(): string | null {
  const { userId, isLoaded } = useAuth();
  return isLoaded ? (userId ?? null) : null;
}

/**
 * Read — and remove — the anonymous workspace id this browser used before
 * sign-in existed, so it can be claimed into the user's account once.
 */
export function takeLegacyWorkspaceId(): string | null {
  try {
    const id = localStorage.getItem(LEGACY_KEY) ?? localStorage.getItem(OLDER_LEGACY_KEY);
    localStorage.removeItem(LEGACY_KEY);
    localStorage.removeItem(OLDER_LEGACY_KEY);
    return id && id.trim() !== "" ? id : null;
  } catch {
    return null;
  }
}
