"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loading } from "loading-dev";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Role } from "@/lib/workspace";
import { Button, Chip, Dialog, Icon, IconButton, Input, Menu, Segmented, cx, relativeTime } from "./ui";

const ROLE_LABEL: Record<Role, string> = { owner: "Owner", editor: "Editor", viewer: "Viewer" };
const ROLES: Role[] = ["owner", "editor", "viewer"];

export function MembersDialog({
  open,
  onClose,
  workspaceId,
  canManage,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  /** Owners may invite, change roles and remove. */
  canManage: boolean;
}) {
  const members = useQuery(api.workspaces.members, open ? { workspaceId } : "skip");
  const invite = useMutation(api.workspaces.invite);
  const setRole = useMutation(api.workspaces.setRole);
  const removeMember = useMutation(api.workspaces.removeMember);
  const [email, setEmail] = useState("");
  const [role, setRoleDraft] = useState<Role>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (busy || email.trim() === "") return;
    setBusy(true);
    setError(null);
    try {
      await invite({ workspaceId: workspaceId as Id<"workspaces">, email, role });
      setEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "") : "Invite failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Members" width={520}>
      {members === undefined ? (
        <div role="status" aria-label="Loading" className="grid place-items-center py-2 text-ink-3">
          <Loading size={48} />
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {members.map((m) => (
            <li key={m._id} className="flex h-10 items-center gap-3 px-3">
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{m.email || "(no email)"}</span>
              {m.pending && <Chip>Invited</Chip>}
              <span className="text-xs text-ink-3">{relativeTime(m.createdAt)}</span>
              {canManage ? (
                <Menu
                  width={150}
                  items={ROLES.map((r) => ({
                    label: ROLE_LABEL[r],
                    icon: r === m.role ? <Icon.Check /> : undefined,
                    onSelect: () => {
                      if (r !== m.role) void setRole({ memberId: m._id, role: r }).catch(() => {});
                    },
                  }))}
                  trigger={({ open: o, toggle }) => (
                    <Button size="sm" variant="ghost" onClick={toggle} aria-expanded={o} className={cx("w-[84px] justify-between pr-1.5", o && "bg-surface-2")}>
                      {ROLE_LABEL[m.role]}
                      <Icon.ChevronDown className="h-3 w-3 text-ink-3" />
                    </Button>
                  )}
                />
              ) : (
                <span className="w-[84px] text-sm text-ink-2">{ROLE_LABEL[m.role]}</span>
              )}
              {canManage && (
                <IconButton
                  label="Remove member"
                  size="sm"
                  className="text-danger hover:bg-danger-soft hover:text-danger"
                  onClick={() => void removeMember({ memberId: m._id }).catch(() => {})}
                >
                  <Icon.Trash />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <div className="flex items-center gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="flex-1"
            />
            <Segmented
              label="Role"
              value={role}
              onChange={setRoleDraft}
              options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
            />
            <Button type="submit" variant="primary" disabled={busy || email.trim() === ""}>
              Invite
            </Button>
          </div>
          {error && <p className="pt-2 text-xs text-danger">{error}</p>}
          <p className="pt-3 text-xs text-ink-3">
            Invitees sign in with GitHub using that email address and the workspace appears in their switcher.
            Owners manage members and keys, editors change documents, viewers only read.
          </p>
        </form>
      )}
    </Dialog>
  );
}
