"use client";

/**
 * Shared UI primitives. Every control in the app is built from these so that
 * borders, radii, sizes and hover/focus states stay identical everywhere.
 * Dependency-free; styled only with the tokens in globals.css.
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ Buttons */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-ink text-bg hover:opacity-90 border border-transparent shadow-sm",
  secondary:
    "bg-surface text-ink border border-line hover:bg-surface-2 hover:border-line-2 shadow-sm",
  ghost: "bg-transparent text-ink-2 border border-transparent hover:bg-surface-2 hover:text-ink",
  danger:
    "bg-transparent text-danger border border-transparent hover:bg-danger-soft",
};
const SIZE: Record<Size, string> = {
  sm: "h-7 px-2.5 text-sm gap-1.5",
  md: "h-8 px-3 text-sm gap-2",
  // Landing page calls to action.
  lg: "h-10 px-4 text-lg gap-2",
};

/** Button styling for elements that aren't buttons (a `Link` that should look like one). */
export const buttonCls = (variant: Variant = "secondary", size: Size = "md"): string =>
  cx(
    "inline-flex select-none items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-40",
    VARIANT[variant],
    SIZE[size],
  );

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(buttonCls(variant, size), className)}
    >
      {icon && <span className="-ml-0.5 flex shrink-0 items-center [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}
      {children}
    </button>
  );
}

/** Square icon-only button. Always pass `label` (used as tooltip + a11y name). */
export function IconButton({
  label,
  size = "md",
  active,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  size?: Size;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-md text-ink-2 transition-colors duration-100 hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "h-6 w-6 [&>svg]:h-3.5 [&>svg]:w-3.5" : "h-8 w-8 [&>svg]:h-[18px] [&>svg]:w-[18px]",
        active && "bg-surface-3 text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------- Inputs */

export const inputCls =
  "w-full rounded-md border border-line bg-surface px-2.5 text-base text-ink placeholder:text-ink-3 transition-colors duration-100 hover:border-line-2 focus:border-ink-3 focus:outline-none focus:shadow-none disabled:opacity-50";

export function Input({
  className,
  mono,
  invalid,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean; invalid?: boolean }) {
  return (
    <input
      spellCheck={false}
      {...rest}
      className={cx(inputCls, "h-7", mono && "mono text-sm", invalid && "!border-danger", className)}
    />
  );
}

export function TextArea({
  className,
  mono,
  invalid,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean; invalid?: boolean }) {
  return (
    <textarea
      spellCheck={false}
      {...rest}
      className={cx(inputCls, "resize-y py-1.5 leading-snug", mono && "mono text-sm", invalid && "!border-danger", className)}
    />
  );
}

/** Two-column property row: label on the left, control on the right. */
export function PropertyRow({
  label,
  hint,
  align = "center",
  children,
}: {
  label: string;
  hint?: string;
  align?: "center" | "start";
  children: ReactNode;
}) {
  return (
    <div className={cx("grid grid-cols-[88px_1fr] gap-x-3 py-1", align === "start" ? "items-start" : "items-center")}>
      <div className={cx("min-w-0 truncate text-sm text-ink-2", align === "start" && "pt-1.5")} title={hint}>
        {label}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Panel section with an eyebrow header and optional trailing action. */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("border-b border-line px-3 py-2.5 last:border-b-0", className)}>
      <div className="flex h-6 items-center">
        <span className="eyebrow">{title}</span>
        {action && <span className="ml-auto">{action}</span>}
      </div>
      <div className="pt-1">{children}</div>
    </section>
  );
}

/** Segmented control. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  mono,
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
  mono?: boolean;
}) {
  return (
    <div className="inline-flex h-7 rounded-md border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-[4px] px-2.5 text-sm font-medium transition-colors duration-100",
            mono && "mono",
            o.value === value
              ? "bg-surface text-ink shadow-sm"
              : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- Side panel */

/**
 * Shell for the editor's side panels (inspector, activity). A right-hand
 * column from `md` up; below that a bottom sheet over the canvas, so a phone
 * keeps the whole width for the diagram. Pass the column width as a
 * `md:w-[…]` utility in `className`; `tall` sheets take more of the screen.
 */
/** localStorage key of the user's chosen editor sidebar width (shared by its panels). */
const SIDE_PANEL_WIDTH_KEY = "archer.sidePanelWidth";
const SIDE_PANEL_MIN = 300;
/** Room always left for the palette (224px) and a usable canvas. */
const SIDE_PANEL_RESERVE = 560;

const clampPanelWidth = (w: number): number =>
  Math.round(
    Math.max(
      SIDE_PANEL_MIN,
      Math.min(w, typeof window === "undefined" ? w : window.innerWidth - SIDE_PANEL_RESERVE),
    ),
  );

/** Remembered sidebar width, falling back to `fallback` until the user drags one. */
function useSidePanelWidth(fallback: number) {
  const [width, setWidth] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(SIDE_PANEL_WIDTH_KEY));
      return v > 0 ? v : fallback;
    } catch {
      return fallback;
    }
  });
  const save = (w: number) => {
    try {
      localStorage.setItem(SIDE_PANEL_WIDTH_KEY, String(w));
    } catch {
      /* private mode: the width just isn't remembered */
    }
  };
  const reset = () => {
    setWidth(fallback);
    try {
      localStorage.removeItem(SIDE_PANEL_WIDTH_KEY);
    } catch {
      /* ignore */
    }
  };
  return { width, setWidth, save, reset };
}

/** Left-edge drag handle of a resizable side panel (desktop only). */
function ResizeHandle({
  width,
  onResize,
  onCommit,
  onReset,
}: {
  width: number;
  onResize: (w: number) => void;
  onCommit: (w: number) => void;
  onReset: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, width: 0, last: 0 });
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      aria-valuenow={width}
      aria-valuemin={SIDE_PANEL_MIN}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, width, last: width };
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        // The panel sits on the right, so dragging left widens it.
        const w = clampPanelWidth(start.current.width + start.current.x - e.clientX);
        start.current.last = w;
        onResize(w);
      }}
      onPointerUp={(e) => {
        if (!dragging) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        setDragging(false);
        onCommit(start.current.last);
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16;
        const delta = e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0;
        if (delta === 0) return;
        e.preventDefault();
        const w = clampPanelWidth(width + delta);
        onResize(w);
        onCommit(w);
      }}
      className="group absolute inset-y-0 -left-1.5 z-10 hidden w-3 cursor-col-resize touch-none outline-none md:block"
    >
      <span
        className={cx(
          "absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors duration-100",
          dragging ? "bg-accent" : "bg-transparent group-hover:bg-line-2 group-focus-visible:bg-accent",
        )}
      />
      {/* Keep the cursor and block text selection while the pointer is off the handle. */}
      {dragging && <div className="fixed inset-0 z-50 cursor-col-resize" />}
    </div>
  );
}

export function SidePanel({
  tall,
  resizable,
  defaultWidth = 300,
  className,
  children,
}: {
  tall?: boolean;
  /** Desktop only: drag the left edge to resize; the width is remembered. */
  resizable?: boolean;
  /** Desktop width (px) of a resizable panel until the user picks one. */
  defaultWidth?: number;
  className?: string;
  children: ReactNode;
}) {
  const { width, setWidth, save, reset } = useSidePanelWidth(defaultWidth);
  return (
    <aside
      style={resizable ? ({ "--side-panel-w": `${width}px` } as CSSProperties) : undefined}
      className={cx(
        "fixed inset-x-0 bottom-0 z-40 flex w-full flex-col rounded-t-xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-md [&_.overflow-y-auto]:overscroll-contain",
        tall ? "h-[70dvh]" : "h-[55dvh]",
        "md:relative md:inset-auto md:z-auto md:h-full md:shrink-0 md:rounded-none md:border-t-0 md:border-l md:pb-0 md:shadow-none",
        resizable &&
          "md:w-[var(--side-panel-w)] md:max-w-[calc(100vw-560px)] md:min-w-[300px]",
        className,
      )}
    >
      {resizable && (
        <ResizeHandle width={width} onResize={setWidth} onCommit={save} onReset={reset} />
      )}
      <div className="mx-auto mt-1.5 h-1 w-8 shrink-0 rounded-full bg-line-2 md:hidden" aria-hidden />
      {children}
    </aside>
  );
}

/* ------------------------------------------------------------- Status chips */

export function Chip({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "neutral" | "accent" | "danger" | "warn";
  className?: string;
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-surface-2 text-ink-2",
    accent: "bg-accent-soft text-accent",
    danger: "bg-danger-soft text-danger",
    warn: "bg-warn-soft text-warn",
  };
  return (
    <span
      className={cx(
        "inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-xs font-semibold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line bg-surface px-1.5 font-sans text-[11px] font-medium leading-none tracking-wide text-ink-2 shadow-[inset_0_-1px_0_var(--line)]">
      {children}
    </kbd>
  );
}

/* --------------------------------------------------------------------- Menu */

export interface MenuItem {
  label: string;
  hint?: string;
  shortcut?: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/**
 * Dropdown menu anchored to its trigger. `trigger` receives the open state and
 * a toggle handler. Closes on outside click, Escape, or selection.
 */
export function Menu({
  trigger,
  items,
  align = "end",
  width = 220,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  items: (MenuItem | "separator")[];
  align?: "start" | "end";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          role="menu"
          style={{ width }}
          className={cx(
            "absolute top-[calc(100%+4px)] z-50 rounded-lg border border-line bg-surface p-1 shadow-md",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.map((item, i) =>
            item === "separator" ? (
              <div key={i} className="my-1 h-px bg-line" />
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={cx(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-75 disabled:opacity-40",
                  item.danger
                    ? "text-danger hover:bg-danger-soft"
                    : "text-ink hover:bg-surface-2",
                )}
              >
                {item.icon && (
                  <span className="flex w-4 shrink-0 items-center justify-center text-ink-2 [&>svg]:h-3.5 [&>svg]:w-3.5">
                    {item.icon}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.label}</span>
                  {item.hint && (
                    <span className="block truncate text-xs text-ink-3">{item.hint}</span>
                  )}
                </span>
                {item.shortcut && <Kbd>{item.shortcut}</Kbd>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- Dialog */

export function Dialog({
  open,
  onClose,
  title,
  width = 480,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: number;
  children: ReactNode;
}) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(10,10,8,0.45)] p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby={id}
        style={{ width, maxWidth: "100%" }}
        className="rounded-xl border border-line bg-surface shadow-md"
      >
        <div className="flex items-center border-b border-line px-4 py-3">
          <h2 id={id} className="text-lg font-semibold">
            {title}
          </h2>
          <IconButton label="Close" onClick={onClose} className="ml-auto">
            <Icon.Close />
          </IconButton>
        </div>
        <div className="px-4 py-3">{children}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- Icons */
/* 16px, 1.5px stroke, currentColor. Keep this set small and consistent. */

const I = ({ children, ...rest }: { children: ReactNode; className?: string }) => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    {...rest}
  >
    {children}
  </svg>
);

export const Icon = {
  Close: (p: { className?: string }) => (
    <I {...p}><path d="M4 4l8 8M12 4l-8 8" /></I>
  ),
  Plus: (p: { className?: string }) => (
    <I {...p}><path d="M8 3v10M3 8h10" /></I>
  ),
  Check: (p: { className?: string }) => (
    <I {...p}><path d="M3 8.5l3 3 7-7" /></I>
  ),
  ChevronDown: (p: { className?: string }) => (
    <I {...p}><path d="M4 6l4 4 4-4" /></I>
  ),
  ChevronRight: (p: { className?: string }) => (
    <I {...p}><path d="M6 4l4 4-4 4" /></I>
  ),
  ChevronLeft: (p: { className?: string }) => (
    <I {...p}><path d="M10 4L6 8l4 4" /></I>
  ),
  ArrowRight: (p: { className?: string }) => (
    <I {...p}><path d="M3 8h10M9 4l4 4-4 4" /></I>
  ),
  ArrowDown: (p: { className?: string }) => (
    <I {...p}><path d="M8 3v10M4 9l4 4 4-4" /></I>
  ),
  Undo: (p: { className?: string }) => (
    <I {...p}><path d="M6 4L3 7l3 3" /><path d="M3 7h6.5a3.5 3.5 0 010 7H8" /></I>
  ),
  Redo: (p: { className?: string }) => (
    <I {...p}><path d="M10 4l3 3-3 3" /><path d="M13 7H6.5a3.5 3.5 0 000 7H8" /></I>
  ),
  Layout: (p: { className?: string }) => (
    <I {...p}><rect x="2" y="2.5" width="5" height="5" rx="1" /><rect x="9" y="2.5" width="5" height="5" rx="1" /><rect x="2" y="9.5" width="5" height="4" rx="1" /><rect x="9" y="9.5" width="5" height="4" rx="1" /></I>
  ),
  Code: (p: { className?: string }) => (
    <I {...p}><path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5" /></I>
  ),
  Copy: (p: { className?: string }) => (
    <I {...p}><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5v-2a1 1 0 00-1-1h-6a1 1 0 00-1 1v6a1 1 0 001 1h2" /></I>
  ),
  Download: (p: { className?: string }) => (
    <I {...p}><path d="M8 2.5v8M4.5 7L8 10.5 11.5 7" /><path d="M2.5 12.5v1h11v-1" /></I>
  ),
  Sparkle: (p: { className?: string }) => (
    <I {...p}><path d="M8 2l1.4 3.6L13 7l-3.6 1.4L8 12l-1.4-3.6L3 7l3.6-1.4z" /></I>
  ),
  Search: (p: { className?: string }) => (
    <I {...p}><circle cx="7" cy="7" r="4" /><path d="M10 10l3.5 3.5" /></I>
  ),
  More: (p: { className?: string }) => (
    <I {...p}><circle cx="3.5" cy="8" r="0.9" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" /><circle cx="12.5" cy="8" r="0.9" fill="currentColor" stroke="none" /></I>
  ),
  Trash: (p: { className?: string }) => (
    <I {...p}><path d="M3 4.5h10M6.5 4.5v-1a1 1 0 011-1h1a1 1 0 011 1v1" /><path d="M4.5 4.5l.6 8a1 1 0 001 .9h3.8a1 1 0 001-.9l.6-8" /></I>
  ),
  Warning: (p: { className?: string }) => (
    <I {...p}><path d="M8 2.5l6 11H2z" /><path d="M8 6.5v3M8 11.5v.01" /></I>
  ),
  CheckCircle: (p: { className?: string }) => (
    <I {...p}><circle cx="8" cy="8" r="5.75" /><path d="M5.5 8.2l1.8 1.8 3.4-3.6" /></I>
  ),
  External: (p: { className?: string }) => (
    <I {...p}><path d="M7 3.5H4a1 1 0 00-1 1V12a1 1 0 001 1h7.5a1 1 0 001-1V9" /><path d="M9.5 2.5H13.5V6.5M13.5 2.5L7.5 8.5" /></I>
  ),
  Plug: (p: { className?: string }) => (
    <I {...p}><path d="M5.5 2v3M10.5 2v3M4 5h8v2.5a4 4 0 01-8 0z" /><path d="M8 11.5V14" /></I>
  ),
  Duplicate: (p: { className?: string }) => (
    <I {...p}><rect x="2.5" y="2.5" width="8" height="8" rx="1.5" /><path d="M13.5 6v6a1.5 1.5 0 01-1.5 1.5H6" /></I>
  ),
  Pencil: (p: { className?: string }) => (
    <I {...p}><path d="M10.5 2.5l3 3-8 8H2.5v-3z" /><path d="M9 4l3 3" /></I>
  ),
  History: (p: { className?: string }) => (
    <I {...p}><path d="M2.5 8a5.5 5.5 0 105.5-5.5A5.6 5.6 0 003.6 5.2" /><path d="M2.5 2.5v3h3" /><path d="M8 5.5V8l2 1.5" /></I>
  ),
  Bot: (p: { className?: string }) => (
    <I {...p}><rect x="3" y="5.5" width="10" height="7.5" rx="2" /><path d="M8 3v2.5M6 9v.01M10 9v.01" /><path d="M1.5 9.5v1M14.5 9.5v1" /></I>
  ),
  User: (p: { className?: string }) => (
    <I {...p}><circle cx="8" cy="5.5" r="2.75" /><path d="M2.75 14a5.25 5.25 0 0110.5 0" /></I>
  ),
  Link: (p: { className?: string }) => (
    <I {...p}><path d="M6.5 9.5l3-3" /><path d="M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1" /><path d="M9 11.5l-1 1a2.5 2.5 0 01-3.5-3.5l1-1" /></I>
  ),
  Alert: (p: { className?: string }) => (
    <I {...p}><circle cx="8" cy="8" r="5.75" /><path d="M8 5v3.5M8 11v.01" /></I>
  ),
  Restore: (p: { className?: string }) => (
    <I {...p}><path d="M3 8a5 5 0 109.5-2.2" /><path d="M3 3.5V7h3.5" /></I>
  ),
  Reset: (p: { className?: string }) => (
    <I {...p}><path d="M2.5 8A5.5 5.5 0 108 2.5a6 6 0 00-4.1 1.7L2.5 5.6" /><path d="M2.5 2.5v3.1h3.1" /></I>
  ),
  Diff: (p: { className?: string }) => (
    <I {...p}><path d="M5 2.5v5M2.5 5h5" /><path d="M2.5 11.5h5" /><path d="M11 2.5v11" /></I>
  ),
  Send: (p: { className?: string }) => (
    <I {...p}><path d="M13.5 2.5L2.5 6.75l5 1.75 1.75 5z" /><path d="M13.5 2.5L7.5 8.5" /></I>
  ),
  Play: (p: { className?: string }) => (
    <I {...p}><path d="M5 3.25v9.5L12.75 8z" /></I>
  ),
  Stop: (p: { className?: string }) => (
    <I {...p}><rect x="4" y="4" width="8" height="8" rx="1.5" /></I>
  ),
  Command: (p: { className?: string }) => (
    <I {...p}><path d="M6 6H4.5a1.5 1.5 0 110-3A1.5 1.5 0 016 4.5V6zm0 4H4.5a1.5 1.5 0 100 3A1.5 1.5 0 006 11.5V10zm4-4h1.5a1.5 1.5 0 100-3A1.5 1.5 0 0010 4.5V6zm0 4h1.5a1.5 1.5 0 110 3 1.5 1.5 0 01-1.5-1.5V10zM6 6h4v4H6z" /></I>
  ),
};

/** GitHub's mark (filled, unlike the stroked set above): marks a linked repository. */
export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M8 .2a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.08-2.7-1.08-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.71 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.88.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 .2Z" />
    </svg>
  );
}

/** Relative time, e.g. "just now", "3 min ago", "2 days ago", "Mar 4". */
export function relativeTime(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
