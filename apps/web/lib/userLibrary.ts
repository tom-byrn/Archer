"use client";

import { useCallback, useMemo, useState } from "react";
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

/**
 * Custom component types kept in memory, for a sandbox: they work like the
 * workspace's (same upsert by tag) and are gone when the page is.
 */
export function useLocalLibrary(): UserLibrary {
  const [items, setItems] = useState<CustomType[]>([]);

  const add = useCallback(
    (t: CustomType) =>
      setItems((xs) =>
        xs.some((x) => x.tag === t.tag) ? xs.map((x) => (x.tag === t.tag ? t : x)) : [...xs, t],
      ),
    [],
  );
  const remove = useCallback(
    (tag: string) => setItems((xs) => xs.filter((x) => x.tag !== tag)),
    [],
  );

  return useMemo(() => ({ items, add, remove }), [items, add, remove]);
}
