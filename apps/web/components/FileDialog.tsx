"use client";

import { useEffect, useState } from "react";
import { dirOf, mountsOf, resolveFile, type ArchDoc, type ComponentNode } from "@archer/lang";
import { Button, Dialog, Input } from "./ui";

/**
 * "Move to its own file…": where a component's inside should be kept (spec
 * §2.2). Suggests a file in the folder its `src` names, else one named after
 * it in a folder beside the file that declares it; the path is from the
 * repository's root (the root file's folder for a document kept in Archer).
 */
export function suggestFile(declaredIn: string, node: ComponentNode): string {
  const src = node.src?.find((s) => !/^[a-z]+:/i.test(s) && !/\.[a-z0-9]+$/i.test(s));
  if (src) return `${src.replace(/\/+$/, "")}/${node.id}.arch`;
  const dir = dirOf(declaredIn);
  return `${dir ? `${dir}/` : ""}${node.id}/${node.id}.arch`;
}

/** Why `file` can't hold this component's inside, or null when it can. */
export function fileProblem(doc: ArchDoc, root: string, file: string): string | null {
  const f = file.trim();
  if (!f.endsWith(".arch")) return "Name an .arch file.";
  if (f.startsWith("/") || resolveFile(root, `./${f}`) !== f) return "Use a path inside the repository, like services/billing/billing.arch.";
  if (f === root || mountsOf(doc, root).some((m) => m.file === f)) return "That file already holds part of this document.";
  return null;
}

export function FileDialog({
  open,
  onClose,
  name,
  suggested,
  check,
  onMove,
  stored,
}: {
  open: boolean;
  onClose: () => void;
  /** The component's display name. */
  name: string;
  suggested: string;
  check: (file: string) => string | null;
  onMove: (file: string) => void;
  /** Where the document lives, for the note under the field. */
  stored: "repo" | "archer";
}) {
  const [file, setFile] = useState(suggested);
  useEffect(() => {
    if (open) setFile(suggested);
  }, [open, suggested]);
  const problem = check(file);
  return (
    <Dialog open={open} onClose={onClose} title={`Keep ${name} in its own file`}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (problem === null) onMove(file.trim());
        }}
      >
        <p className="text-sm text-ink-2">
          Its parts, the connections between them and the views about them move into this file. The
          canvas doesn&apos;t change; its paths stay the same.
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-2">File</span>
          <Input
            mono
            autoFocus
            value={file}
            onChange={(e) => setFile(e.target.value)}
            invalid={problem !== null}
            aria-describedby="file-note"
          />
        </label>
        <p id="file-note" className={problem ? "text-xs text-danger" : "text-xs text-ink-3"}>
          {problem ??
            (stored === "repo"
              ? "Created in the repository on your next publish, next to the code it describes."
              : "Shown as a tab in the code view, and written as its own file when the document moves to GitHub.")}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={problem !== null}>
            Move to file
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
