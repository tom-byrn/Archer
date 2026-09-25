"use client";

import dynamic from "next/dynamic";
import { Loading } from "loading-dev";
import { useLocalLibrary } from "@/lib/userLibrary";

// Browser-only, like the editor on a document page: React Flow and CodeMirror
// load after the page shell.
const Editor = dynamic(() => import("./Editor").then((m) => m.Editor), {
  ssr: false,
  loading: () => (
    <div role="status" aria-label="Loading sandbox" className="grid h-dvh place-items-center bg-bg text-ink-3">
      <Loading size={48} />
    </div>
  ),
});

/**
 * The real editor on an in-memory copy of `source`, for anyone, signed in or
 * not. It keeps nothing: no autosave, no custom types in the workspace, no
 * sharing or export, and leaving the page discards every edit.
 */
export function SandboxEditor({
  source,
  back,
}: {
  source: string;
  /** Where the header's back link goes. */
  back: { href: string; label: string };
}) {
  const library = useLocalLibrary();
  return <Editor initialSource={source} library={library} session={{ kind: "sandbox", back }} />;
}
