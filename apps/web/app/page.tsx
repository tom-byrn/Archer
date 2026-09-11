"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getWorkspaceId } from "@/lib/workspace";
import { SAMPLE } from "@/lib/sample";

const BLANK = 'arch "Untitled" v0.1\n';

export default function Home() {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  useEffect(() => setWorkspaceId(getWorkspaceId()), []);

  const docs = useQuery(
    api.documents.list,
    workspaceId ? { workspaceId } : "skip",
  );
  const create = useMutation(api.documents.create);
  const remove = useMutation(api.documents.remove);

  const newDoc = async (source: string, title: string) => {
    if (!workspaceId) return;
    const id = await create({ workspaceId, title, source });
    router.push(`/d/${id}`);
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <header className="flex items-baseline gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Archlang</h1>
        <p className="text-sm text-slate-500">
          Architecture canvas → agent-readable code
        </p>
      </header>

      <div className="flex gap-2 pt-6">
        <button
          onClick={() => void newDoc(BLANK, "Untitled")}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          New document
        </button>
        <button
          onClick={() => void newDoc(SAMPLE, "Acme SaaS")}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          New from sample
        </button>
      </div>

      <ul className="pt-8">
        {docs === undefined && workspaceId && (
          <li className="py-2 text-sm text-slate-400">Loading…</li>
        )}
        {docs?.length === 0 && (
          <li className="py-2 text-sm text-slate-400">
            No documents yet — create one above.
          </li>
        )}
        {docs?.map((d) => (
          <li
            key={d._id}
            className="group flex items-center gap-3 border-b border-slate-200 py-3"
          >
            <button
              onClick={() => router.push(`/d/${d._id}`)}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block truncate text-[15px] font-medium text-slate-800 group-hover:underline">
                {d.title}
              </span>
              <span className="text-xs text-slate-400">
                {new Date(d.updatedAt).toLocaleString()}
              </span>
            </button>
            <button
              onClick={() => {
                if (workspaceId && confirm(`Delete "${d.title}"?`))
                  void remove({ id: d._id as Id<"documents">, workspaceId });
              }}
              className="hidden rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 group-hover:block"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      <footer className="mt-14 border-t border-slate-200 pt-4 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span>Workspace</span>
          <code className="mono rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
            {workspaceId ?? "…"}
          </code>
          <button
            onClick={() => {
              if (workspaceId) void navigator.clipboard.writeText(workspaceId);
            }}
            className="rounded border border-slate-200 px-1.5 py-0.5 hover:bg-slate-50"
          >
            copy
          </button>
        </div>
        <p className="pt-1.5">
          Connect an agent: <code className="mono">claude mcp add archlang --env
          ARCHLANG_WORKSPACE_ID={workspaceId ?? "<workspace-id>"} -- pnpm --dir
          &lt;repo&gt;/packages/mcp start</code> — see docs/mcp.md.
        </p>
      </footer>
    </div>
  );
}
