"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { format, parse } from "@archer/lang";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useWorkspace, type WorkspaceSummary } from "@/lib/workspace";
import { AccountMenu } from "@/components/AccountMenu";
import { MembersDialog } from "@/components/MembersDialog";
import { SAMPLE } from "@/lib/sample";
import { DocPreview } from "@/lib/preview";
import { ConnectAgentDialog } from "@/components/ConnectAgentDialog";
import { SiteFrame, siteNavLinkCls } from "@/components/landing/SiteFrame";
import {
  Button,
  Chip,
  Dialog,
  Icon,
  IconButton,
  Input,
  Menu,
  type MenuItem,
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
  readOnly,
  onRename,
  onDuplicate,
  onDelete,
}: {
  doc: DocRow;
  readOnly: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  return (
    <div className="group relative">
      <Link
        href={`/documents/${doc._id}`}
        className="block overflow-hidden border border-line bg-surface transition-[border-color,box-shadow,transform] duration-[120ms] hover:-translate-y-px hover:border-line-2 hover:shadow-md"
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
          items={
            readOnly
              ? [{ label: "Open", icon: <Icon.External />, onSelect: () => router.push(`/documents/${doc._id}`) }]
              : [
                  { label: "Open", icon: <Icon.External />, onSelect: () => router.push(`/documents/${doc._id}`) },
                  { label: "Rename", icon: <Icon.Pencil />, onSelect: onRename },
                  { label: "Duplicate", icon: <Icon.Duplicate />, onSelect: onDuplicate },
                  "separator",
                  { label: "Delete", icon: <Icon.Trash />, danger: true, onSelect: onDelete },
                ]
          }
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

function NameDialog({
  title,
  initial,
  submitLabel,
  onClose,
  onSave,
}: {
  title: string;
  initial: string;
  submitLabel: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  return (
    <Dialog open onClose={onClose} title={title} width={400}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed === "" || busy) return;
          setBusy(true);
          void onSave(trimmed).then(onClose).finally(() => setBusy(false));
        }}
      >
        <Input value={name} autoFocus placeholder="Team name" onChange={(e) => setName(e.target.value)} />
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={trimmed === "" || busy}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onClose={onClose} title={title} width={420}>
      <p className="text-base text-ink-2">{body}</p>
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
            void onConfirm().then(onClose).finally(() => setBusy(false));
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

const ROLE_LABEL = { owner: "Owner", editor: "Editor", viewer: "Viewer" } as const;

type WorkspaceDialog =
  | { kind: "create" }
  | { kind: "rename" }
  | { kind: "delete" }
  | { kind: "leave" }
  | { kind: "members" }
  | null;

/** Header control: current workspace name → menu of workspaces and actions. */
function WorkspaceSwitcher({
  workspaces,
  current,
  onSelect,
}: {
  workspaces: WorkspaceSummary[];
  current: WorkspaceSummary | undefined;
  onSelect: (id: string) => void;
}) {
  const createWs = useMutation(api.workspaces.create);
  const renameWs = useMutation(api.workspaces.rename);
  const removeWs = useMutation(api.workspaces.remove);
  const leaveWs = useMutation(api.workspaces.leave);
  const [dialog, setDialog] = useState<WorkspaceDialog>(null);

  const isTeam = current?.kind === "team";
  const isOwner = current?.role === "owner";
  const teamId = current?.id as Id<"workspaces"> | undefined;

  const items: (MenuItem | "separator")[] = [
    ...workspaces.map((w) => ({
      label: w.name,
      hint: w.pending ? "Invited — open to join" : w.kind === "team" ? ROLE_LABEL[w.role] : undefined,
      icon: w.id === current?.id ? <Icon.Check /> : undefined,
      onSelect: () => onSelect(w.id),
    })),
    "separator" as const,
    { label: "New team workspace…", icon: <Icon.Plus />, onSelect: () => setDialog({ kind: "create" }) },
    ...(isTeam
      ? [
          { label: "Members…", icon: <Icon.User />, onSelect: () => setDialog({ kind: "members" }) },
          ...(isOwner
            ? [
                { label: "Rename…", icon: <Icon.Pencil />, onSelect: () => setDialog({ kind: "rename" }) },
                {
                  label: "Delete workspace…",
                  icon: <Icon.Trash />,
                  danger: true,
                  onSelect: () => setDialog({ kind: "delete" }),
                },
              ]
            : [
                {
                  label: "Leave workspace",
                  icon: <Icon.External />,
                  danger: true,
                  onSelect: () => setDialog({ kind: "leave" }),
                },
              ]),
        ]
      : []),
  ];

  return (
    <>
      <Menu
        width={260}
        align="start"
        items={items}
        trigger={({ open, toggle }) => (
          <Button onClick={toggle} aria-expanded={open} className="max-w-[240px] pr-2">
            <span className="truncate">{current?.name ?? "Workspace"}</span>
            {isTeam && current && <Chip className="ml-0.5">{ROLE_LABEL[current.role]}</Chip>}
            <Icon.ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" />
          </Button>
        )}
      />
      {dialog?.kind === "create" && (
        <NameDialog
          title="New team workspace"
          initial=""
          submitLabel="Create"
          onClose={() => setDialog(null)}
          onSave={async (name) => {
            const id = await createWs({ name });
            onSelect(id);
          }}
        />
      )}
      {dialog?.kind === "rename" && teamId && (
        <NameDialog
          title="Rename workspace"
          initial={current?.name ?? ""}
          submitLabel="Save"
          onClose={() => setDialog(null)}
          onSave={async (name) => {
            await renameWs({ workspaceId: teamId, name });
          }}
        />
      )}
      {dialog?.kind === "delete" && teamId && (
        <ConfirmDialog
          title="Delete workspace"
          body={
            <>
              Delete <span className="font-medium text-ink">{current?.name}</span> and every document,
              revision and API key in it? Members lose access immediately. This cannot be undone.
            </>
          }
          confirmLabel="Delete workspace"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await removeWs({ workspaceId: teamId });
            const personal = workspaces.find((w) => w.kind === "personal");
            if (personal) onSelect(personal.id);
          }}
        />
      )}
      {dialog?.kind === "leave" && teamId && (
        <ConfirmDialog
          title="Leave workspace"
          body={<>Leave <span className="font-medium text-ink">{current?.name}</span>? An owner can invite you back.</>}
          confirmLabel="Leave"
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await leaveWs({ workspaceId: teamId });
            const personal = workspaces.find((w) => w.kind === "personal");
            if (personal) onSelect(personal.id);
          }}
        />
      )}
      {dialog?.kind === "members" && teamId && (
        <MembersDialog open onClose={() => setDialog(null)} workspaceId={teamId} canManage={!!isOwner} />
      )}
    </>
  );
}

function Skeletons() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="animate-pulse overflow-hidden border border-line bg-surface">
          <div className="aspect-[16/10] border-b border-line bg-surface-2" />
          <div className="space-y-2 px-3 py-3">
            <div className="h-3 w-2/3 bg-surface-2" />
            <div className="h-2.5 w-1/3 bg-surface-2" />
          </div>
        </div>
      ))}
    </>
  );
}

export default function Home() {
  const router = useRouter();
  const { workspaceId, role, workspaces, select } = useWorkspace();
  const current = workspaces.find((w) => w.id === workspaceId);
  const canEdit = role === "owner" || role === "editor";

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
    router.push(`/documents/${id}`);
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
    <SiteFrame
      header={
        <>
          <span className="font-display text-[19px] leading-none text-ink">Archer</span>
          <span className="h-4 w-px bg-line" />
          <WorkspaceSwitcher workspaces={workspaces} current={current} onSelect={select} />
          <div className="ml-auto flex items-center gap-2">
            {canEdit && (
              <Button icon={<Icon.Plug />} onClick={() => setConnectOpen(true)}>
                Connect an agent
              </Button>
            )}
            {!empty && canEdit && createButtons}
            <span className="mx-1 h-4 w-px bg-line" />
            <AccountMenu />
          </div>
        </>
      }
      footerLinks={
        <Link href="/language" className={siteNavLinkCls}>
          Docs
        </Link>
      }
    >
      {empty ? (
        <section className="landing-joints border-b border-line">
          <div className="relative overflow-hidden bg-ground px-6 py-20 text-center">
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
              {canEdit ? (
                <div className="flex justify-center gap-2 pt-6">{createButtons}</div>
              ) : (
                <p className="pt-6 text-sm text-ink-3">You have view access. Ask an owner to add documents.</p>
              )}
            </div>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4 px-5 py-8 sm:px-10">
          {loading ? (
            <Skeletons />
          ) : (
            docs!.map((d) => (
              <DocCard
                key={d._id}
                doc={d}
                readOnly={!canEdit}
                onRename={() => setPending({ kind: "rename", doc: d })}
                onDuplicate={() => void duplicate(d)}
                onDelete={() => setPending({ kind: "delete", doc: d })}
              />
            ))
          )}
        </div>
      )}

      <ConnectAgentDialog
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        workspaceId={workspaceId}
        workspaceName={current?.name ?? "this workspace"}
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
    </SiteFrame>
  );
}
