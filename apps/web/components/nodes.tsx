"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GLYPHS, lookupType } from "@archer/catalog";
import type { ArchNode } from "@/lib/toFlow";
import { displayColor, useIsDark } from "@/lib/useIsDark";

export function Glyph({
  tag,
  color,
  glyph,
  size = 22,
  className,
}: {
  tag?: string;
  color?: string;
  glyph?: string;
  size?: number;
  className?: string;
}) {
  const isDark = useIsDark();
  const entry = lookupType(tag);
  const g = GLYPHS[glyph ?? entry?.glyph ?? "box"] ?? GLYPHS.box!;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ color: displayColor(color ?? entry?.color, isDark) ?? "#64748b" }}
      dangerouslySetInnerHTML={{ __html: g }}
    />
  );
}

// One source + one target handle per side, so edges attach on the side facing
// the other endpoint (ids chosen by toFlow) and users can start a connection
// from any side.
const SIDES = [
  ["t", Position.Top],
  ["r", Position.Right],
  ["b", Position.Bottom],
  ["l", Position.Left],
] as const;

const EdgeHandles = () => (
  <>
    {SIDES.map(([id, position]) => (
      <Handle key={`t${id}`} id={`t${id}`} type="target" position={position} className="arch-handle" />
    ))}
    {SIDES.map(([id, position]) => (
      <Handle key={`s${id}`} id={`s${id}`} type="source" position={position} className="arch-handle" />
    ))}
  </>
);

export function ArchComponentNode({ data, width, height }: NodeProps<ArchNode>) {
  const isDark = useIsDark();
  const entry = lookupType(data.typeTag);
  const accent = displayColor(data.accent ?? entry?.color, isDark);
  const collapsed = data.display === "icon" && data.childCount > 0;
  return (
    <div
      style={{ width, height, borderColor: accent ? `${accent}55` : undefined }}
      className="flex items-center gap-2.5 rounded-xl border-[1.5px] border-slate-300 dark:border-slate-600 bg-white dark:bg-[#12151c] px-3 shadow-sm"
    >
      <EdgeHandles />
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${accent ?? "#64748b"}14` }}
      >
        <Glyph tag={data.typeTag} color={accent} glyph={data.glyphKey} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold leading-tight">
          {data.label}
        </div>
        <div className="truncate text-[10.5px] leading-tight text-slate-500">
          {data.typeTag ? `@${data.typeTag}` : "component"}
          {collapsed ? ` · ${data.childCount} inside` : ""}
        </div>
      </div>
    </div>
  );
}

export function ArchPlaneNode({ data, width, height }: NodeProps<ArchNode>) {
  const isDark = useIsDark();
  const entry = lookupType(data.typeTag);
  const color = displayColor(data.accent ?? entry?.color, isDark) ?? "#64748b";
  return (
    <div
      style={{ width, height, borderColor: `${color}66`, backgroundColor: `${color}09` }}
      className="rounded-2xl border-[1.5px] border-dashed"
    >
      <EdgeHandles />
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-md bg-white dark:bg-[#12151c] shadow-sm"
          style={{ border: `1px solid ${color}44` }}
        >
          <Glyph tag={data.typeTag} color={data.accent} glyph={data.glyphKey} size={17} />
        </div>
        <span className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-300">
          {data.label}
        </span>
        {data.typeTag && (
          <span className="text-[10.5px] text-slate-400">@{data.typeTag}</span>
        )}
      </div>
    </div>
  );
}

export const nodeTypes = {
  archComponent: ArchComponentNode,
  archPlane: ArchPlaneNode,
};
