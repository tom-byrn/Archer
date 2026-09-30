"use client";

import { useEffect } from "react";
import type { RepoLink } from "@/lib/github";
import { DocumentViewer } from "../DocumentViewer";
import { documentHref } from "./common";

/** The shared-link viewer, pointed at any document (or one version of it) for the admin. */
export function AdminCanvas({
  documentId,
  title,
  source,
  updatedAt,
  version,
  repo,
}: {
  documentId: string;
  title: string;
  source: string;
  updatedAt: number;
  version: { createdAt: number } | null;
  repo: RepoLink | null;
}) {
  const shown = version
    ? `${title} · as of ${new Date(version.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
    : title;
  useEffect(() => {
    document.title = `${shown} · Admin · Archer`;
  }, [shown]);
  return (
    <DocumentViewer
      title={shown}
      source={source}
      updatedAt={updatedAt}
      backHref={documentHref(documentId)}
      signedIn
      repo={repo}
    />
  );
}
