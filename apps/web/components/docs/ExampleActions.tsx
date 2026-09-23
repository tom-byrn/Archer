"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { CodeDialog } from "../CodeDialog";
import { Button, Icon, buttonCls } from "../ui";

/** Copies an example's `.arch` source: the popout's "Copy code", as in the editor. */
function CopyCodeButton({ source }: { source: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      icon={copied ? <Icon.Check /> : <Icon.Copy />}
      title="Copy code"
      onClick={() =>
        void navigator.clipboard.writeText(source).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      <span className="hidden md:inline">{copied ? "Copied" : "Copy code"}</span>
    </Button>
  );
}

/** The popout's scrolling body. It takes focus, so the keyboard scrolls the code and not the page behind. */
function CodeScroller({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div
      ref={ref}
      tabIndex={0}
      className="min-h-0 flex-1 overflow-auto overscroll-contain"
      // No focus ring, like the editor's code area.
      style={{ boxShadow: "none" }}
    >
      {children}
    </div>
  );
}

/**
 * "View code": the example's source in the editor's code popout. `children` is
 * the highlighted source, rendered on the server.
 */
export function ViewCodeButton({
  title,
  source,
  children,
}: {
  title: string;
  source: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus();
  }, []);
  return (
    <>
      <Button
        size="sm"
        icon={<Icon.Code />}
        aria-haspopup="dialog"
        onClick={(e) => {
          trigger.current = e.currentTarget;
          setOpen(true);
        }}
      >
        View code
      </Button>
      <CodeDialog open={open} onClose={close} title={title} actions={<CopyCodeButton source={source} />}>
        <CodeScroller>{children}</CodeScroller>
      </CodeDialog>
    </>
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
