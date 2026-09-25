"use client";

/**
 * Shared UI primitives. Every control in the app is built from these so that
 * borders, radii, sizes and hover/focus states stay identical everywhere.
 * Styled only with the tokens in globals.css; icons are Phosphor.
 */

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import {
  ArrowCounterClockwiseIcon,
  ArrowDownIcon,
  ArrowElbowDownRightIcon,
  ArrowRightIcon,
  ArrowsLeftRightIcon,
  ArrowSquareOutIcon,
  ArrowUUpLeftIcon,
  ArrowUUpRightIcon,
  BoundingBoxIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CheckIcon,
  CircleHalfIcon,
  ClipboardTextIcon,
  ClockCounterClockwiseIcon,
  CodeIcon,
  CommandIcon,
  CopyIcon,
  CopySimpleIcon,
  DotsThreeIcon,
  DownloadSimpleIcon,
  FrameCornersIcon,
  GitBranchIcon,
  GitDiffIcon,
  LinkSimpleIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  MonitorIcon,
  MoonIcon,
  NetworkIcon,
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
  PlugIcon,
  PlusIcon,
  RobotIcon,
  ScissorsIcon,
  SelectionAllIcon,
  SidebarSimpleIcon,
  SparkleIcon,
  SquaresFourIcon,
  SunIcon,
  TrashSimpleIcon,
  UserIcon,
  WarningCircleIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";

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
      {icon && <span className="-ml-0.5 flex shrink-0 items-center [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>}
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
        size === "sm" ? "h-6 w-6 [&_svg]:h-3.5 [&_svg]:w-3.5" : "h-8 w-8 [&_svg]:h-[18px] [&_svg]:w-[18px]",
        active && "bg-surface-3 text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * A primary button with a menu on its caret, sized like Button size="sm": one
 * dark shape split by a hairline. The main part runs `onClick`; the caret
 * takes a Menu trigger's `open` and `toggle`, plus a name of its own.
 */
export function SplitButton({
  icon,
  title,
  onClick,
  menu,
  children,
}: {
  icon?: ReactNode;
  title?: string;
  onClick: () => void;
  menu: { open: boolean; toggle: () => void; label: string; title?: string };
  children: ReactNode;
}) {
  const half = "flex items-center transition-colors duration-100 hover:bg-bg/10";
  return (
    <div className="flex h-7 shrink-0 select-none rounded-md bg-ink text-sm font-medium text-bg shadow-sm">
      <button
        type="button"
        title={title}
        onClick={onClick}
        className={cx(half, "gap-1.5 whitespace-nowrap rounded-l-md pl-2.5 pr-2")}
      >
        {icon && <span className="-ml-0.5 flex shrink-0 items-center [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>}
        {children}
      </button>
      <span aria-hidden className="my-1.5 w-px bg-bg/25" />
      <button
        type="button"
        aria-label={menu.label}
        aria-expanded={menu.open}
        title={menu.title ?? menu.label}
        onClick={menu.toggle}
        className={cx(half, "w-6 justify-center rounded-r-md aria-expanded:bg-bg/15")}
      >
        <Icon.ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </button>
    </div>
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

/**
 * Segmented control. An option with an `icon` shows just the icon, named by its
 * label. `onChange` also gets the option's button, for effects that start from it.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  mono,
  label,
}: {
  value: T;
  options: { value: T; label: string; title?: string; icon?: ReactNode }[];
  onChange: (v: T, button: HTMLButtonElement) => void;
  mono?: boolean;
  /** Names the control for assistive tech. */
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex h-7 rounded-md border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          aria-label={o.icon ? o.label : undefined}
          title={o.title ?? (o.icon ? o.label : undefined)}
          onClick={(e) => onChange(o.value, e.currentTarget)}
          className={cx(
            "rounded-[4px] text-sm font-medium transition-colors duration-100",
            o.icon ? "flex w-6 items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5" : "px-2.5",
            mono && "mono",
            o.value === value
              ? "bg-surface text-ink shadow-sm"
              : "text-ink-2 hover:text-ink",
          )}
        >
          {o.icon ?? o.label}
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

/** A row with a control of its own (the account menu's theme switcher), used without closing the menu. */
export interface MenuControl {
  label: string;
  icon?: ReactNode;
  control: ReactNode;
}

const menuIcon = (icon: ReactNode) =>
  icon && (
    <span className="flex w-4 shrink-0 items-center justify-center text-ink-2 [&>svg]:h-3.5 [&>svg]:w-3.5">
      {icon}
    </span>
  );

/**
 * Dropdown menu anchored to its trigger. `trigger` receives the open state and
 * a toggle handler. Closes on outside click, Escape, or selection. `header`
 * sits above the items, ruled off from them: what the menu is about.
 */
export function Menu({
  trigger,
  items,
  header,
  align = "end",
  width = 220,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  items: (MenuItem | MenuControl | "separator")[];
  header?: ReactNode;
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
          {header && (
            <>
              {header}
              <div className="my-1 h-px bg-line" />
            </>
          )}
          <MenuRows items={items} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

/** The rows shared by Menu and ContextMenu; choosing one closes the menu first. */
function MenuRows({
  items,
  onClose,
}: {
  items: (MenuItem | MenuControl | "separator")[];
  onClose: () => void;
}) {
  return (
    <>
      {items.map((item, i) =>
        item === "separator" ? (
          <div key={i} className="my-1 h-px bg-line" />
        ) : "control" in item ? (
          <div key={i} className="flex items-center gap-2 px-2 py-0.5 text-sm text-ink">
            {menuIcon(item.icon)}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.control}
          </div>
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={cx(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-75 disabled:opacity-40",
              item.danger ? "text-danger hover:bg-danger-soft" : "text-ink hover:bg-surface-2",
            )}
          >
            {menuIcon(item.icon)}
            <span className="min-w-0 flex-1">
              <span className="block truncate">{item.label}</span>
              {item.hint && <span className="block truncate text-xs text-ink-3">{item.hint}</span>}
            </span>
            {item.shortcut && <Kbd>{item.shortcut}</Kbd>}
          </button>
        ),
      )}
    </>
  );
}

/**
 * A menu opened at a point (right-click), kept inside the viewport. Closes on
 * a click outside, Escape, resize, the window losing focus, or a choice.
 */
export function ContextMenu({
  at,
  items,
  onClose,
  width = 240,
}: {
  /** Viewport coordinates; null = closed. */
  at: { x: number; y: number } | null;
  items: (MenuItem | "separator")[];
  onClose: () => void;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!at || !el) return;
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.max(4, Math.min(at.x, window.innerWidth - r.width - 4))}px`;
    el.style.top = `${Math.max(4, Math.min(at.y, window.innerHeight - r.height - 4))}px`;
  }, [at]);
  useEffect(() => {
    if (!at) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [at, onClose]);
  if (!at) return null;
  return (
    <div
      ref={ref}
      role="menu"
      style={{ position: "fixed", left: at.x, top: at.y, width }}
      className="z-[90] rounded-lg border border-line bg-surface p-1 shadow-md"
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuRows items={items} onClose={onClose} />
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
  // The column is the screen's width. An auto column would grow to the
  // dialog's own width, and then maxWidth could not keep it on a phone.
  return (
    <div
      className="fixed inset-0 z-[100] grid grid-cols-[minmax(0,1fr)] place-items-center bg-[rgba(10,10,8,0.45)] p-4 backdrop-blur-[2px]"
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
/*
 * Phosphor (phosphoricons.com) at bold weight, which draws a 1.5px stroke at
 * 16px. No size prop: CSS sizes them (a className, or the parent's
 * [&>svg]:…), and they take currentColor. Reach Phosphor through this set, not
 * directly, and keep it small and consistent.
 */

const UI = { weight: "bold", "aria-hidden": true } as const;
type IconProps = { className?: string };

export const Icon = {
  Close: (p: IconProps) => <XIcon {...UI} {...p} />,
  Plus: (p: IconProps) => <PlusIcon {...UI} {...p} />,
  Minus: (p: IconProps) => <MinusIcon {...UI} {...p} />,
  Check: (p: IconProps) => <CheckIcon {...UI} {...p} />,
  ChevronDown: (p: IconProps) => <CaretDownIcon {...UI} {...p} />,
  ChevronRight: (p: IconProps) => <CaretRightIcon {...UI} {...p} />,
  ChevronLeft: (p: IconProps) => <CaretLeftIcon {...UI} {...p} />,
  ArrowRight: (p: IconProps) => <ArrowRightIcon {...UI} {...p} />,
  ArrowDown: (p: IconProps) => <ArrowDownIcon {...UI} {...p} />,
  Undo: (p: IconProps) => <ArrowUUpLeftIcon {...UI} {...p} />,
  Redo: (p: IconProps) => <ArrowUUpRightIcon {...UI} {...p} />,
  Layout: (p: IconProps) => <SquaresFourIcon {...UI} {...p} />,
  Diagram: (p: IconProps) => <NetworkIcon {...UI} {...p} />,
  FitView: (p: IconProps) => <FrameCornersIcon {...UI} {...p} />,
  Code: (p: IconProps) => <CodeIcon {...UI} {...p} />,
  Copy: (p: IconProps) => <CopyIcon {...UI} {...p} />,
  Download: (p: IconProps) => <DownloadSimpleIcon {...UI} {...p} />,
  Sparkle: (p: IconProps) => <SparkleIcon {...UI} {...p} />,
  Search: (p: IconProps) => <MagnifyingGlassIcon {...UI} {...p} />,
  More: (p: IconProps) => <DotsThreeIcon {...UI} {...p} />,
  Trash: (p: IconProps) => <TrashSimpleIcon {...UI} {...p} />,
  Warning: (p: IconProps) => <WarningIcon {...UI} {...p} />,
  CheckCircle: (p: IconProps) => <CheckCircleIcon {...UI} {...p} />,
  External: (p: IconProps) => <ArrowSquareOutIcon {...UI} {...p} />,
  Plug: (p: IconProps) => <PlugIcon {...UI} {...p} />,
  Duplicate: (p: IconProps) => <CopySimpleIcon {...UI} {...p} />,
  Pencil: (p: IconProps) => <PencilSimpleIcon {...UI} {...p} />,
  History: (p: IconProps) => <ClockCounterClockwiseIcon {...UI} {...p} />,
  Bot: (p: IconProps) => <RobotIcon {...UI} {...p} />,
  User: (p: IconProps) => <UserIcon {...UI} {...p} />,
  Sun: (p: IconProps) => <SunIcon {...UI} {...p} />,
  Moon: (p: IconProps) => <MoonIcon {...UI} {...p} />,
  Monitor: (p: IconProps) => <MonitorIcon {...UI} {...p} />,
  // Fill weight: a solid half reads better than bold's hatching at 14px.
  Contrast: (p: IconProps) => <CircleHalfIcon {...UI} weight="fill" {...p} />,
  Link: (p: IconProps) => <LinkSimpleIcon {...UI} {...p} />,
  Alert: (p: IconProps) => <WarningCircleIcon {...UI} {...p} />,
  Restore: (p: IconProps) => <ArrowCounterClockwiseIcon {...UI} {...p} />,
  Reset: (p: IconProps) => <ArrowCounterClockwiseIcon {...UI} {...p} />,
  Diff: (p: IconProps) => <GitDiffIcon {...UI} {...p} />,
  Branch: (p: IconProps) => <GitBranchIcon {...UI} {...p} />,
  Send: (p: IconProps) => <PaperPlaneTiltIcon {...UI} {...p} />,
  Command: (p: IconProps) => <CommandIcon {...UI} {...p} />,
  Group: (p: IconProps) => <BoundingBoxIcon {...UI} {...p} />,
  AddChild: (p: IconProps) => <ArrowElbowDownRightIcon {...UI} {...p} />,
  Cut: (p: IconProps) => <ScissorsIcon {...UI} {...p} />,
  Paste: (p: IconProps) => <ClipboardTextIcon {...UI} {...p} />,
  SelectAll: (p: IconProps) => <SelectionAllIcon {...UI} {...p} />,
  Swap: (p: IconProps) => <ArrowsLeftRightIcon {...UI} {...p} />,
  Sidebar: (p: IconProps) => <SidebarSimpleIcon {...UI} {...p} />,
};

/**
 * Two icons in one spot that trade places when `swapped` flips, like a copy
 * button's copy → check. The old one shrinks and blurs away as the new one
 * grows in (a plain fade with reduced motion; `.icon-swap` in globals.css).
 * Sized like a lone icon by Button's and IconButton's icon rules, or by a
 * className on each icon.
 */
export function SwapIcon({ swapped, from, to }: { swapped: boolean; from: ReactNode; to: ReactNode }) {
  return (
    <span className="icon-swap" data-swapped={swapped || undefined}>
      {from}
      {to}
    </span>
  );
}

/**
 * GitHub's own mark, deliberately not Phosphor's (filled, unlike the set
 * above): marks a linked repository.
 */
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
