"use client";

const KEY = "archlang.workspaceId";

/** Client-generated workspace identity (stand-in for real auth, post-v1). */
export function getWorkspaceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "anonymous";
  }
}
