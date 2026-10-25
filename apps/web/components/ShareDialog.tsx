"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import type { ArchDoc, ComponentNode } from "@archer/lang";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Dialog, Icon, IconButton, SwapIcon, cx, inputCls } from "./ui";

/** README image variants: the image route paints the light palette unless `?theme=dark`. */
const EMBED_THEMES = [
  { label: "Light", theme: undefined },
  { label: "Dark", theme: "dark" },
] as const;

/**
 * Every canvas a link can open on: the top level, then each component with
 * components nested in it (depth first), labelled with the components it's in.
 */
function canvasesOf(doc: ArchDoc): { path: string; label: string }[] {
  const out = [{ path: "", label: "Top level" }];
  const walk = (nodes: ComponentNode[], path: string[], names: string[]) => {
    for (const c of nodes) {
      if (c.children.length === 0) continue;
      const here = [...path, c.id];
      const label = [...names, c.name ?? c.id];
      out.push({ path: here.join("."), label: label.join(" › ") });
      walk(c.children, here, label);
    }
  };
  walk(doc.components, [], []);
  return out;
}

/** A share URL for one canvas: `?component=` picks a component's inside, `theme` the image's colors. */
const withQuery = (url: string, component: string, theme?: string): string => {
  const q = new URLSearchParams();
  if (component) q.set("component", component);
  if (theme) q.set("theme", theme);
  const qs = q.toString();
  return qs ? `${url}?${qs}` : url;
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <IconButton
      label={done ? "Copied" : label}
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
    >
      <SwapIcon swapped={done} from={<Icon.Copy />} to={<Icon.Check />} />
    </IconButton>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cx(
        "relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-100",
        on ? "border-accent bg-accent" : "border-line-2 bg-surface-3",
      )}
    >
      <span
        className={cx(
          "absolute top-0.5 h-3.5 w-3.5 rounded-full bg-surface shadow-sm transition-[left] duration-100",
          on ? "left-[18px]" : "left-0.5",
        )}
      />
    </button>
  );
}

export function ShareDialog({
  open,
  onClose,
  documentId,
  workspaceId,
  publicSlug,
  doc,
  focus,
}: {
  open: boolean;
  onClose: () => void;
  documentId: Id<"documents">;
  workspaceId: string;
  publicSlug: string | null | undefined;
  /** The document as it stands, for the canvases a link can open on. */
  doc: ArchDoc;
  /** The canvas open in the editor (a component path, dot-joined; "" for the top level). */
  focus: string;
}) {
  const setPublic = useMutation(api.documents.setPublic);
  const [slug, setSlug] = useState<string | null>(publicSlug ?? null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setSlug(publicSlug ?? null), [publicSlug]);
  const canvases = useMemo(() => canvasesOf(doc), [doc]);
  // Each time it opens, it shares the canvas on screen.
  const [canvas, setCanvas] = useState(focus);
  useEffect(() => {
    if (open) setCanvas(focus);
  }, [open, focus]);
  const component = canvases.some((c) => c.path === canvas) ? canvas : "";

  const toggle = async (enabled: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await setPublic({ id: documentId, workspaceId, enabled });
      setSlug(next);
    } finally {
      setBusy(false);
    }
  };

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const base = slug ? `${origin}/share/${slug}` : "";
  const link = withQuery(base, component);

  return (
    <Dialog open={open} onClose={onClose} title="Share" width={520}>
      <div className="flex items-center gap-3 rounded-md border border-line px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-base font-medium text-ink">Anyone with the link can view</div>
          <div className="text-xs text-ink-3">Read-only canvas and code. No sign-in needed.</div>
        </div>
        <Switch on={slug !== null} onChange={(v) => void toggle(v)} label="Public link" />
      </div>

      {slug && (
        <>
          {canvases.length > 1 && (
            <div className="mt-4 grid grid-cols-[88px_1fr] items-center gap-x-3">
              <span className="text-sm text-ink-2">Canvas</span>
              <select
                value={component}
                onChange={(e) => setCanvas(e.target.value)}
                aria-label="Canvas to share"
                className={cx(inputCls, "h-7 pr-7")}
              >
                {canvases.map((c) => (
                  <option key={c.path} value={c.path}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-4 flex h-6 items-center">
            <span className="eyebrow">Link</span>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5">
            <code className="mono min-w-0 flex-1 truncate text-sm text-ink">{link}</code>
            <CopyButton text={link} label="Copy link" />
          </div>

          <div className="mt-4 flex h-6 items-center">
            <span className="eyebrow">Embed in a README</span>
          </div>
          <div className="divide-y divide-line rounded-md border border-line bg-surface-2">
            {EMBED_THEMES.map(({ label, theme }) => {
              const embed = `![Architecture](${withQuery(`${base}/image.svg`, component, theme)})`;
              return (
                <div key={label} className="flex items-start gap-2 px-2.5 py-1.5">
                  <span className="w-9 shrink-0 text-sm font-medium leading-relaxed text-ink-2">{label}</span>
                  <code className="mono min-w-0 flex-1 break-all text-sm leading-relaxed text-ink">{embed}</code>
                  <CopyButton text={embed} label={`Copy ${label.toLowerCase()} embed`} />
                </div>
              );
            })}
          </div>
          <p className="pt-2 text-xs text-ink-3">
            {component
              ? "The link opens on this component, and the image draws its inside. Both update on every save."
              : "The image re-renders on every save."}
          </p>
        </>
      )}
    </Dialog>
  );
}
