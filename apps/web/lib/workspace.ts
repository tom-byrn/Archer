"use client";

const KEY = "archer.workspaceId";
/** Pre-rename key — migrated on first read so existing documents stay linked. */
const LEGACY_KEY = "archlang.workspaceId";

/** Client-generated workspace identity (stand-in for real auth, post-v1). */
export function getWorkspaceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = localStorage.getItem(LEGACY_KEY) ?? crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "anonymous";
  }
}
