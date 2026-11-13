/**
 * The selected workspace (mirrors the web's `lib/workspace.ts`): the one last
 * chosen on this device while it's still open to the user, else the personal
 * one. Pending invites bind to the account the first time it's signed in.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Role } from "./convex";
import { useAccount } from "./auth";
import { getPref, setPref } from "./storage";

export interface WorkspaceSummary {
  id: string;
  name: string;
  kind: "personal" | "team";
  role: Role;
  pending?: boolean;
}

export interface WorkspaceState {
  workspaceId: string | null;
  current: WorkspaceSummary | null;
  role: Role | null;
  workspaces: WorkspaceSummary[];
  select: (id: string) => void;
  loaded: boolean;
}

const KEY = "archer.workspace";

const EMPTY: WorkspaceState = {
  workspaceId: null,
  current: null,
  role: null,
  workspaces: [],
  select: () => {},
  loaded: true,
};

const WorkspaceContext = createContext<WorkspaceState>(EMPTY);

/** Inside the Convex provider. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded, userId } = useAccount();
  const list = useQuery(api.workspaces.list, isSignedIn ? {} : "skip");
  const acceptInvites = useMutation(api.workspaces.acceptInvites);
  const accepted = useRef(false);
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    void getPref(KEY).then(setChosen);
  }, []);

  useEffect(() => {
    if (!isSignedIn || accepted.current) return;
    accepted.current = true;
    acceptInvites({}).catch(() => {
      accepted.current = false;
    });
  }, [isSignedIn, acceptInvites]);

  const select = useCallback((id: string) => {
    setChosen(id);
    void setPref(KEY, id);
  }, []);

  const value = useMemo<WorkspaceState>(() => {
    const workspaces = list ?? [];
    let current: WorkspaceSummary | null = null;
    if (isLoaded && userId && list !== undefined) {
      const match = chosen ? workspaces.find((w) => w.id === chosen && !w.pending) : undefined;
      current =
        match ??
        workspaces.find((w) => w.kind === "personal") ?? { id: userId, name: "Personal", kind: "personal", role: "owner" };
    }
    return {
      workspaceId: current?.id ?? null,
      current,
      role: current?.role ?? null,
      workspaces,
      select,
      loaded: isLoaded && (!isSignedIn || list !== undefined),
    };
  }, [list, isLoaded, isSignedIn, userId, chosen, select]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export const useWorkspace = (): WorkspaceState => useContext(WorkspaceContext);
