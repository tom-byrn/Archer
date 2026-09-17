"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export type Role = "owner" | "editor" | "viewer";

export interface WorkspaceSummary {
  id: string;
  name: string;
  kind: "personal" | "team";
  role: Role;
  /** Invited by email; becomes a full member once they sign in. */
  pending?: boolean;
}

/** localStorage key of the pre-auth anonymous workspace id. */
export const LEGACY_KEY = "archer.workspaceId";
const OLDER_LEGACY_KEY = "archlang.workspaceId";
/** localStorage key of the last selected workspace. */
const CURRENT_KEY = "archer.currentWorkspace";

export interface WorkspaceState {
  /** The selected workspace, or null while loading / signed out. */
  workspaceId: string | null;
  /** The user's role in the selected workspace. */
  role: Role | null;
  /** Every workspace the user can open, personal first. */
  workspaces: WorkspaceSummary[];
  select: (id: string) => void;
  loaded: boolean;
}

const readCurrent = (): string | null => {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
};

/**
 * The selected workspace: the one remembered in localStorage when it is still
 * accessible, else the personal one. Pending invites bind to the account the
 * first time this hook runs in a signed-in session.
 */
export function useWorkspace(): WorkspaceState {
  const { userId, isLoaded, isSignedIn } = useAuth();
  const list = useQuery(api.workspaces.list, isSignedIn ? {} : "skip");
  const acceptInvites = useMutation(api.workspaces.acceptInvites);
  const accepted = useRef(false);
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => setChosen(readCurrent()), []);

  useEffect(() => {
    if (!isSignedIn || accepted.current) return;
    accepted.current = true;
    acceptInvites({}).catch(() => {
      accepted.current = false;
    });
  }, [isSignedIn, acceptInvites]);

  const workspaces = useMemo<WorkspaceSummary[]>(() => list ?? [], [list]);

  const current = useMemo(() => {
    if (!isLoaded || !userId) return null;
    if (list === undefined) return null;
    const match = chosen ? workspaces.find((w) => w.id === chosen && !w.pending) : undefined;
    return match ?? workspaces.find((w) => w.kind === "personal") ?? { id: userId, name: "Personal", kind: "personal" as const, role: "owner" as const };
  }, [isLoaded, userId, list, chosen, workspaces]);

  const select = useCallback((id: string) => {
    setChosen(id);
    try {
      localStorage.setItem(CURRENT_KEY, id);
    } catch {}
  }, []);

  return {
    workspaceId: current?.id ?? null,
    role: current?.role ?? null,
    workspaces,
    select,
    loaded: isLoaded && (!isSignedIn || list !== undefined),
  };
}

/** The selected workspace id (their Clerk user id for the personal one). */
export function useWorkspaceId(): string | null {
  return useWorkspace().workspaceId;
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
