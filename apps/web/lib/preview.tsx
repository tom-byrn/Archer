"use client";

/**
 * Thumbnail of an Archer document: the same SVG the share embed serves
 * (`lib/svg.ts`), rendered in the browser and shown as an <img>. No network,
 * no stored images — it is derived from the source on every change.
 */

import { useEffect, useMemo, useState } from "react";
import { renderArchSvg } from "@/lib/svg";
import { useIsDark } from "@/lib/useIsDark";

export function DocPreview({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const isDark = useIsDark();
  // The theme is only known after mount; wait for it rather than flash light.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const src = useMemo(() => {
    if (!mounted) return null;
    const svg = renderArchSvg(source, {
      theme: isDark ? "dark" : "light",
      showTitle: false,
      background: false,
    });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, [source, isDark, mounted]);

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
