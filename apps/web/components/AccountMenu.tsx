"use client";

import { useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { useWorkspace } from "@/lib/workspace";
import { ConnectAgentDialog } from "./ConnectAgentDialog";
import { Icon, Menu, cx } from "./ui";

const initials = (name: string | null | undefined, email: string | null | undefined): string => {
  const src = (name ?? email ?? "").trim();
  if (src === "") return "?";
  const parts = src.split(/\s+/);
  return (parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : src.slice(0, 2)).toUpperCase();
};

/** Avatar at the right end of a header: account details, connecting agents, sign out. */
export function AccountMenu({ className }: { className?: string }) {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [connectOpen, setConnectOpen] = useState(false);
  const ws = useWorkspace();
  if (!isLoaded || !user) return null;
  const current = ws.workspaces.find((w) => w.id === ws.workspaceId);

  const name = user.fullName ?? user.username ?? null;
  const email = user.primaryEmailAddress?.emailAddress ?? null;

  return (
    <>
      <Menu
        width={240}
        items={[
          {
            label: name ?? email ?? "Account",
            hint: name && email ? email : undefined,
            icon: <Icon.User />,
            disabled: true,
            onSelect: () => {},
          },
          "separator",
          {
            label: "Connect an agent",
            hint: "Claude Code, Cursor, the CLI…",
            icon: <Icon.Plug />,
            onSelect: () => setConnectOpen(true),
          },
          "separator",
          {
            label: "Sign out",
            icon: <Icon.External />,
            onSelect: () => void signOut({ redirectUrl: "/sign-in" }),
          },
        ]}
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-label="Account"
            aria-expanded={open}
            title={name ?? email ?? "Account"}
            className={cx(
              "flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-2 text-xs font-semibold text-ink-2 transition-shadow hover:shadow-[0_0_0_2px_var(--line-2)]",
              open && "shadow-[0_0_0_2px_var(--line-2)]",
              className,
            )}
          >
            {user.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initials(name, email)
            )}
          </button>
        )}
      />
      <ConnectAgentDialog
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        workspaceName={current?.name ?? "this workspace"}
      />
    </>
  );
}
