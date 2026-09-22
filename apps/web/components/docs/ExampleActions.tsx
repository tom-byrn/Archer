"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Icon, buttonCls } from "../ui";

/** Copies an example's `.arch` source. */
export function CopySourceButton({ source }: { source: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={copied ? <Icon.Check /> : <Icon.Copy />}
      onClick={() =>
        void navigator.clipboard.writeText(source).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        })
      }
    >
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

/**
 * Opens a copy of the example as a real document in the user's workspace
 * (`/new` creates it, signing in first if needed).
 */
export function OpenExampleLink({ slug }: { slug: string }) {
  return (
    <Link
      href={`/new?example=${encodeURIComponent(slug)}`}
      // Visiting the link creates a document; never fetch it ahead of a click.
      prefetch={false}
      className={buttonCls("primary", "sm")}
    >
      <Icon.Pencil className="h-3.5 w-3.5" />
      Open in editor
    </Link>
  );
}
