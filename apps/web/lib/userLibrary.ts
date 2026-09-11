"use client";

import { useCallback, useEffect, useState } from "react";

export interface CustomType {
  tag: string;
  name: string;
  color: string;
  glyph: string;
}

const KEY = "archlang.userLibrary.v1";

const load = (): CustomType[] => {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as CustomType[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export interface UserLibrary {
  items: CustomType[];
  add: (t: CustomType) => void;
  remove: (tag: string) => void;
}

export function useUserLibrary(): UserLibrary {
  const [items, setItems] = useState<CustomType[]>([]);
  useEffect(() => setItems(load()), []);

  const persist = useCallback((next: CustomType[]) => {
    setItems(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable (private mode etc.) — library stays in-memory.
    }
  }, []);

  const add = useCallback(
    (t: CustomType) => persist([...load().filter((x) => x.tag !== t.tag), t]),
    [persist],
  );
  const remove = useCallback(
    (tag: string) => persist(load().filter((x) => x.tag !== tag)),
    [persist],
  );

  return { items, add, remove };
}
