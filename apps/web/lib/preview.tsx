"use client";

/**
 * Thumbnail of an Archer document: the same SVG the share embed serves
 * (`lib/svg.ts`), rendered in the browser and shown as an <img>. No network,
 * no stored images — it is derived from the source on every change.
 */

import { useMemo, useSyncExternalStore } from "react";
import { renderArchSvg } from "@/lib/svg";
import { useIsDark } from "@/lib/useIsDark";

const noSubscribe = () => () => {};

export function DocPreview({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const isDark = useIsDark();
  // The theme is only known on the client; wait for it through hydration
  // rather than flash light. A preview mounted later (a dashboard card that
  // arrives with its data) knows it already, and draws with its card.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);

  const src = useMemo(() => {
    if (!hydrated) return null;
    const svg = renderArchSvg(source, {
      theme: isDark ? "dark" : "light",
      showTitle: false,
      background: false,
    });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, [source, isDark, hydrated]);

  if (!src) return <div className={className} aria-hidden style={{ width: "100%", height: "100%" }} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      className={className}
      style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }}
    />
  );
}
