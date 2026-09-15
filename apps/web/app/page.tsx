"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { format, parse } from "@archer/lang";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getWorkspaceId } from "@/lib/workspace";
import { SAMPLE } from "@/lib/sample";
import { DocPreview } from "@/lib/preview";
import { ConnectAgentDialog } from "@/components/ConnectAgentDialog";
import {
  Button,
  Dialog,
  Icon,
  IconButton,
  Input,
  Menu,
  relativeTime,
} from "@/components/ui";

const BLANK = 'arch "Untitled" v0.1\n';

interface DocRow {
  _id: Id<"documents">;
  title: string;
  updatedAt: number;
  source: string;
}

type Pending =
  | { kind: "rename"; doc: DocRow }
  | { kind: "delete"; doc: DocRow }
  | null;

/** Rewrite the document header title, keeping the rest of the source intact. */
const withTitle = (source: string, title: string): string => {
  try {
    const { doc } = parse(source);
    return format({ ...doc, title });
  } catch {
    return source;
  }
};

function DocCard({
  doc,
  onRename,
  onDuplicate,
  onDelete,
}: {
  doc: DocRow;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  return (
    <div className="group relative">
      <Link
        href={`/d/${doc._id}`}
        className="block overflow-hidden rounded-lg border border-line bg-surface transition-[border-color,box-shadow,transform] duration-[120ms] hover:-translate-y-px hover:border-line-2 hover:shadow-sm"
      >
        <div className="aspect-[16/10] border-b border-line bg-ground p-3">
          <DocPreview source={doc.source} />
        </div>
        <div className="px-3 py-2.5">
          <div className="truncate text-base font-medium text-ink">{doc.title}</div>
          <div className="pt-0.5 text-xs text-ink-3">{relativeTime(doc.updatedAt)}</div>
        </div>
      </Link>
      <div className="absolute right-2 top-2 opacity-0 transition-opacity duration-[120ms] group-hover:opacity-100 focus-within:opacity-100">
        <Menu
          width={180}
          trigger={({ open, toggle }) => (
            <IconButton
              label="Document actions"
              size="sm"
              active={open}
              onClick={toggle}
              className="bg-surface shadow-sm hover:bg-surface-2"
            >
              <Icon.More />
            </IconButton>
          )}
          items={[
            { label: "Open", icon: <Icon.External />, onSelect: () => router.push(`/d/${doc._id}`) },
            { label: "Rename", icon: <Icon.Pencil />, onSelect: onRename },
            { label: "Duplicate", icon: <Icon.Duplicate />, onSelect: onDuplicate },
            "separator",
            { label: "Delete", icon: <Icon.Trash />, danger: true, onSelect: onDelete },
          ]}
        />
      </div>
    </div>
  );
}

function RenameDialog({
  doc,
  onClose,
  onSave,
}: {
  doc: DocRow;
  onClose: () => void;
  onSave: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(doc.title);
  const [busy, setBusy] = useState(false);
  const trimmed = title.trim();
  const submit = async () => {
    if (trimmed === "" || busy) return;
    setBusy(true);
    await onSave(trimmed);
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title="Rename document" width={400}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Input value={title} autoFocus onChange={(e) => setTitle(e.target.value)} />
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={trimmed === "" || busy}>
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function DeleteDialog({
  doc,
  onClose,
  onConfirm,
}: {
  doc: DocRow;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onClose={onClose} title="Delete document" width={400}>
      <p className="text-base text-ink-2">
        Delete <span className="font-medium text-ink">{doc.title}</span>? Agents connected to
        this workspace lose access to it too. This cannot be undone.
      </p>
      <div className="flex justify-end gap-2 pt-4">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="danger"
          className="border-danger"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onConfirm().then(onClose);
          }}
        >
          Delete
        </Button>
      </div>
    </Dialog>
  );
}

function Skeletons() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="animate-pulse overflow-hidden rounded-lg border border-line bg-surface">
          <div className="aspect-[16/10] border-b border-line bg-surface-2" />
          <div className="space-y-2 px-3 py-3">
            <div className="h-3 w-2/3 rounded-xs bg-surface-2" />
            <div className="h-2.5 w-1/3 rounded-xs bg-surface-2" />
          </div>
        </div>
      ))}
    </>
  );
}

export default function Home() {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  useEffect(() => setWorkspaceId(getWorkspaceId()), []);

  const docs = useQuery(
    api.documents.list,
    workspaceId ? { workspaceId } : "skip",
  ) as DocRow[] | undefined;
  const create = useMutation(api.documents.create);
  const remove = useMutation(api.documents.remove);
  const updateSource = useMutation(api.documents.updateSource);

  const [connectOpen, setConnectOpen] = useState(false);
  const [pending, setPending] = useState<Pending>(null);

  const newDoc = async (source: string, title: string) => {
    if (!workspaceId) return;
    const id = await create({ workspaceId, title, source });
    router.push(`/d/${id}`);
  };
  const duplicate = async (doc: DocRow) => {
    if (!workspaceId) return;
    await create({ workspaceId, title: `${doc.title} copy`, source: doc.source });
  };
  const rename = async (doc: DocRow, title: string) => {
    if (!workspaceId) return;
    await updateSource({
      id: doc._id,
      workspaceId,
      title,
      source: withTitle(doc.source, title),
    });
  };
  const del = async (doc: DocRow) => {
    if (!workspaceId) return;
    await remove({ id: doc._id, workspaceId });
  };

  const createButtons = (
    <>
      <Button icon={<Icon.Duplicate />} onClick={() => void newDoc(SAMPLE, "Acme SaaS")}>
        From sample
      </Button>
      <Button variant="primary" icon={<Icon.Plus />} onClick={() => void newDoc(BLANK, "Untitled")}>
        New document
      </Button>
    </>
  );

  const loading = docs === undefined;
  const empty = docs !== undefined && docs.length === 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex items-center gap-3">
        <img src="/icon.svg" alt="" className="h-7 w-7 rounded-md" />
        <span className="font-display text-[22px] leading-none text-ink">Archer</span>
        <div className="ml-auto flex items-center gap-2">
          <Button icon={<Icon.Plug />} onClick={() => setConnectOpen(true)}>
            Connect an agent
          </Button>
          {!empty && createButtons}
        </div>
      </header>

      {empty ? (
        <section className="relative mt-16 overflow-hidden rounded-xl border border-line bg-ground px-6 py-20 text-center">
          <div className="pointer-events-none absolute inset-0 p-10 opacity-[0.18]">
            <DocPreview source={SAMPLE} />
          </div>
          <div className="relative mx-auto max-w-md">
            <h1 className="font-display text-2xl text-ink">
              Draw your architecture. Hand it to an agent.
            </h1>
            <p className="pt-3 text-base text-ink-2">
              Every box and arrow on the canvas compiles to a small text language that
              coding agents read and write, so the diagram and the code never drift.
            </p>
            <div className="flex justify-center gap-2 pt-6">{createButtons}</div>
          </div>
        </section>
      ) : (
        <>
          <div className="flex items-center pt-10 pb-3">
            <span className="eyebrow">Documents</span>
            {docs && <span className="pl-2 text-xs text-ink-3">{docs.length}</span>}
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
            {loading ? (
              <Skeletons />
            ) : (
              docs!.map((d) => (
                <DocCard
                  key={d._id}
                  doc={d}
                  onRename={() => setPending({ kind: "rename", doc: d })}
                  onDuplicate={() => void duplicate(d)}
                  onDelete={() => setPending({ kind: "delete", doc: d })}
                />
              ))
            )}
          </div>
        </>
      )}

      <ConnectAgentDialog
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        workspaceId={workspaceId}
      />
      {pending?.kind === "rename" && (
        <RenameDialog
          doc={pending.doc}
          onClose={() => setPending(null)}
          onSave={(t) => rename(pending.doc, t)}
        />
      )}
      {pending?.kind === "delete" && (
        <DeleteDialog
          doc={pending.doc}
          onClose={() => setPending(null)}
          onConfirm={() => del(pending.doc)}
        />
      )}
    </div>
  );
}
