"use client";

import { useCallback, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useWorkspaceId } from "./workspace";

export interface CustomType {
  tag: string;
  name: string;
  color: string;
  glyph: string;
}

export interface UserLibrary {
  items: CustomType[];
  add: (t: CustomType) => void;
  remove: (tag: string) => void;
}

/** Custom component types, stored in Convex per workspace. */
export function useUserLibrary(): UserLibrary {
  const workspaceId = useWorkspaceId();

  const items = useQuery(
    api.library.list,
    workspaceId ? { workspaceId } : "skip",
  );
  const saveMutation = useMutation(api.library.save);
  const removeMutation = useMutation(api.library.remove);

  const add = useCallback(
    (t: CustomType) => {
      if (workspaceId) void saveMutation({ workspaceId, ...t });
    },
    [workspaceId, saveMutation],
  );
  const remove = useCallback(
    (tag: string) => {
      if (workspaceId) void removeMutation({ workspaceId, tag });
    },
    [workspaceId, removeMutation],
  );

  return useMemo(
    () => ({ items: items ?? [], add, remove }),
    [items, add, remove],
  );
}
