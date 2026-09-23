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

/** Opens the example in the editor's sandbox: no account needed, nothing saved. */
export function OpenExampleLink({ slug }: { slug: string }) {
  return (
    <Link href={`/sandbox/${encodeURIComponent(slug)}`} className={buttonCls("primary", "sm")}>
      <Icon.Pencil className="h-3.5 w-3.5" />
      Open in sandbox
    </Link>
  );
}
