"use client";

import { useEffect, type ReactNode } from "react";
import { Icon, IconButton } from "./ui";

/**
 * The code popout: a document's `.arch` source in a large sheet over the page
 * (full screen on phones). The editor's code view (`CodePane`) and the docs
 * examples' "View code" both open it, so the two look the same. Escape or a
 * click outside closes it.
 */
export function CodeDialog({
  open,
  onClose,
  title,
  status,
  actions,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Document title, shown in the top bar. */
  title: string;
  /** After the title: the editor's error and warning counts. */
  status?: ReactNode;
  /** Buttons before the close button. */
  actions?: ReactNode;
  /** Everything under the top bar, laid out in a flex column. */
  children: ReactNode;
}) {
  // Escape closes it (capture, so it wins over the canvas shortcuts).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-[rgba(10,10,8,0.5)] backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal
        aria-label={`${title} — .arch source`}
        className="flex h-dvh w-screen flex-col overflow-hidden border-line shadow-md md:h-[85vh] md:w-[85vw] md:rounded-xl md:border"
        style={{ background: "var(--code-bg)" }}
      >
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface pl-3 pr-2 md:pl-4">
          <Icon.Code className="h-4 w-4 text-ink-3" />
          <span className="min-w-0 truncate text-base font-medium text-ink">{title}</span>
          <span className="mono text-xs text-ink-3">.arch</span>
          <a
            href="/language"
            target="_blank"
            rel="noreferrer"
            className="hidden h-6 select-none items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-xs font-medium text-ink-3 transition-colors duration-100 hover:bg-surface-2 hover:text-ink md:inline-flex"
          >
            Language spec
            <Icon.External className="h-3 w-3" />
          </a>
          {status}
          <div className="ml-auto flex items-center gap-1.5">
            {actions}
            {actions && <span className="mx-1 h-4 w-px bg-line" />}
            <IconButton label="Close (esc)" onClick={onClose}>
              <Icon.Close />
            </IconButton>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
