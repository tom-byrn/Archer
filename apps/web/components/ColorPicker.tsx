"use client";

import { useEffect, useRef, useState } from "react";
import { COLORS, COLOR_HEX, isColor, isColorName, resolveColor } from "@archer/lang";
import { displayColor, useIsDark } from "@/lib/useIsDark";
import { Icon, Input, cx } from "./ui";

/** The list's first cell: no color of its own (the type's, or the default). */
const DEFAULT = "";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** "blue" → "Blue"; a hex value as written. */
export const colorLabel = (color: string): string =>
  isColorName(color) ? color[0]!.toUpperCase() + color.slice(1) : color.toLowerCase();

/** A round swatch of `hex`, lifted for a dark ground like the canvas does. */
export function ColorSwatch({ hex, size = 14, className }: { hex: string; size?: number; className?: string }) {
  const isDark = useIsDark();
  return (
    <span
      aria-hidden
      className={cx("inline-block shrink-0 rounded-full ring-1 ring-inset ring-line-2", className)}
      style={{ width: size, height: size, backgroundColor: displayColor(hex, isDark) }}
    />
  );
}

/**
 * The inspector's color control: the component's color, opening onto the
 * palette's colors and a custom `#rrggbb`. The first choice clears `color`:
 * the component then takes its type's color, or none. A value Archer doesn't
 * know selects nothing and says it isn't drawn.
 */
export function ColorPicker({
  value,
  typeColor,
  onChange,
  autoOpen = false,
  onAutoOpened,
}: {
  /** The component's `color` as written (undefined: none). */
  value: string | undefined;
  /** Its type's color, to show what it falls back to (undefined: untyped). */
  typeColor?: string;
  onChange: (color: string | null) => void;
  /** Open the list as soon as it's shown ("Change color…" on the canvas). */
  autoOpen?: boolean;
  onAutoOpened?: () => void;
}) {
  const current: string | null = value === undefined ? DEFAULT : isColor(value) ? value : null;
  const currentHex = current === null ? undefined : current === DEFAULT ? typeColor : resolveColor(current);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const hexRef = useRef<HTMLInputElement>(null);
  const choices: string[] = [DEFAULT, ...COLORS];

  useEffect(() => {
    if (!autoOpen) return;
    setOpen(true);
    onAutoOpened?.();
  }, [autoOpen, onAutoOpened]);

  // Opening starts on the current color, with a custom one in the hex field.
  useEffect(() => {
    if (!open) return;
    setActive(current !== null && choices.includes(current) ? current : null);
    setCustom(current !== null && !isColorName(current) && current !== DEFAULT ? current.toLowerCase() : "");
    // A custom color has no cell: its hex field takes focus instead.
    (
      listRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]') ??
      hexRef.current ??
      listRef.current?.querySelector<HTMLElement>("[data-color]")
    )?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const choose = (color: string) => {
    if (color !== current) onChange(color === DEFAULT ? null : color);
    close(true);
  };

  const focusCell = (color: string) => {
    setActive(color);
    listRef.current?.querySelector<HTMLElement>(`[data-color="${color}"]`)?.focus();
  };

  const onGridKey = (e: React.KeyboardEvent) => {
    const i = active !== null ? choices.indexOf(active) : -1;
    // The grid's rows: the default cell sits alone on the first.
    const cols = 9;
    const step = (d: number) => {
      e.preventDefault();
      focusCell(choices[Math.min(choices.length - 1, Math.max(0, i + d))]!);
    };
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowDown") step(i === 0 ? 1 : cols);
    else if (e.key === "ArrowUp") step(i <= cols ? -i : -cols);
  };

  const customValid = HEX_RE.test(custom);
  const applyCustom = () => {
    if (customValid) choose(custom.toLowerCase());
  };

  const fallbackLabel = typeColor ? "Type's color" : "Default";
  const swatch = (color: string, size: number) =>
    color !== DEFAULT ? (
      <ColorSwatch hex={resolveColor(color)!} size={size} />
    ) : typeColor ? (
      <ColorSwatch hex={typeColor} size={size} />
    ) : (
      <span style={{ width: size, height: size }} className="flex shrink-0 text-ink-3">
        <Icon.NoIcon className="h-full w-full" />
      </span>
    );
  const cellButton = (color: string) => (
    <button
      key={color || "default"}
      type="button"
      data-color={color}
      title={color === DEFAULT ? fallbackLabel : colorLabel(color)}
      aria-label={color === DEFAULT ? fallbackLabel : colorLabel(color)}
      aria-pressed={color === current}
      onMouseEnter={() => setActive(color)}
      onFocus={() => setActive(color)}
      onClick={() => choose(color)}
      className={cx(
        "flex h-7 items-center justify-center rounded-sm transition-colors duration-75 focus:outline-none",
        color === current ? "bg-surface-3 ring-1 ring-line-2" : color === active ? "bg-surface-2" : "",
      )}
    >
      {swatch(color, 16)}
    </button>
  );

  const hint = active ?? current;
  return (
    <div>
      <div ref={rootRef} className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => (open ? close(false) : setOpen(true))}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="flex h-7 w-full items-center gap-2 rounded-md border border-line bg-surface px-2 text-left text-base transition-colors duration-100 hover:border-line-2 focus:border-ink-3 focus:outline-none"
        >
          {current !== null && swatch(current, 14)}
          <span className="min-w-0 flex-1 truncate">
            {current === null ? (
              <span className="text-ink-3">
                Unknown color <span className="mono">{value}</span>
              </span>
            ) : current === DEFAULT ? (
              <span className={typeColor ? undefined : "text-ink-3"}>{fallbackLabel}</span>
            ) : isColorName(current) ? (
              colorLabel(current)
            ) : (
              <span className="mono">{colorLabel(current)}</span>
            )}
          </span>
          <Icon.ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" />
        </button>
        {open && (
          <div
            role="dialog"
            aria-label="Colors"
            className="absolute right-0 top-[calc(100%+4px)] z-50 w-[max(100%,300px)] overflow-hidden rounded-lg border border-line bg-surface shadow-md"
          >
            <div ref={listRef} className="p-1" onKeyDown={onGridKey}>
              <div className="grid grid-cols-9 gap-0.5">{cellButton(DEFAULT)}</div>
              <div className="px-1 pb-0.5 pt-1.5 text-xs text-ink-3">Colors</div>
              <div className="grid grid-cols-9 gap-0.5">{COLORS.map(cellButton)}</div>
            </div>
            <div className="flex items-center gap-1.5 border-t border-line p-1.5">
              <label
                className="relative flex h-6.5 w-6.5 shrink-0 cursor-pointer items-center justify-center rounded-sm border border-line hover:border-line-2"
                title="Pick a custom color"
              >
                <ColorSwatch hex={customValid ? custom : (currentHex ?? COLOR_HEX.slate)} size={14} />
                <input
                  type="color"
                  aria-label="Pick a custom color"
                  value={customValid ? custom.toLowerCase() : (currentHex ?? COLOR_HEX.slate)}
                  onChange={(e) => setCustom(e.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
              <Input
                ref={hexRef}
                mono
                value={custom}
                onChange={(e) => setCustom(e.target.value.trim())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyCustom();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    close(true);
                  }
                }}
                placeholder="#rrggbb"
                aria-label="Custom color, #rrggbb"
                invalid={custom !== "" && !customValid}
                className="h-6.5 min-w-0 flex-1"
              />
              <button
                type="button"
                onClick={applyCustom}
                disabled={!customValid}
                className="h-6.5 shrink-0 rounded-sm px-2 text-sm text-ink-2 transition-colors duration-75 hover:bg-surface-2 hover:text-ink disabled:pointer-events-none disabled:text-ink-3"
              >
                Use
              </button>
            </div>
            {hint !== null && (
              <div className="truncate border-t border-line px-2 py-1 text-xs text-ink-3">
                {hint === DEFAULT ? (
                  <span className="text-ink-2">{fallbackLabel}</span>
                ) : (
                  <>
                    <span className="text-ink-2">{colorLabel(hint)}</span> ·{" "}
                    <span className="mono">color {isColorName(hint) ? hint : `"${hint}"`}</span>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <p className="truncate pt-1 text-xs text-ink-3">
        {current === null
          ? "Not a color Archer knows · not drawn"
          : current === DEFAULT
            ? typeColor
              ? "Drawn from its type"
              : "No color"
            : typeColor
              ? "Replaces its type's color"
              : "Tints the component"}
      </p>
    </div>
  );
}
