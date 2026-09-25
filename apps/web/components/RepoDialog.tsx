"use client";

import { useEffect, useState } from "react";
import { repoKey, type RepoLink } from "@/lib/github";
import { RepoPicker, type RepoChoice } from "./RepoPicker";
import { Button, Dialog } from "./ui";

/** Pick a GitHub repository and branch to link to a document. */
export function RepoDialog({
  open,
  onClose,
  current,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  current: RepoLink | null;
  onSave: (repo: { owner: string; name: string; branch: string } | null) => Promise<unknown>;
}) {
  const [choice, setChoice] = useState<RepoChoice | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setChoice(null);
    setSaving(false);
  }, [open]);

  const save = async (repo: { owner: string; name: string; branch: string } | null) => {
    setSaving(true);
    try {
      await onSave(repo);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Link a repository" width={520}>
      <p className="pb-3 text-sm text-ink-2">
        Commits from the linked branch show up next to architecture changes in History, and
        component <span className="mono">src</span> paths open on GitHub.
      </p>
      {open && (
        <RepoPicker
          initialRepo={current ? repoKey(current) : undefined}
          initialBranch={current?.branch}
          onChange={setChoice}
        />
      )}
      <div className="flex items-center gap-1.5 pt-4">
        {current && (
          <Button variant="danger" size="sm" onClick={() => void save(null)} disabled={saving}>
            Unlink
          </Button>
        )}
        <span className="flex-1" />
        <Button variant="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!choice || saving}
          onClick={() =>
            choice &&
            void save({ owner: choice.repo.owner, name: choice.repo.name, branch: choice.branch })
          }
        >
          {saving ? "Linking…" : current ? "Update link" : "Link"}
        </Button>
      </div>
    </Dialog>
  );
}
