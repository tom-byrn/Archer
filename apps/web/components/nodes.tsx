"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GLYPHS, lookupType } from "@archlang/catalog";
import type { ArchNode } from "@/lib/toFlow";

export function Glyph({
  tag,
  size = 22,
  className,
}: {
  tag?: string;
  size?: number;
  className?: string;
}) {
  const entry = lookupType(tag);
  const glyph = GLYPHS[entry?.glyph ?? "box"] ?? GLYPHS.box!;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ color: entry?.color ?? "#64748b" }}
      dangerouslySetInnerHTML={{ __html: glyph }}
    />
  );
}

const EdgeHandles = () => (
  <>
    <Handle type="target" position={Position.Left} className="arch-handle" />
    <Handle type="source" position={Position.Right} className="arch-handle" />
  </>
);

export function ArchComponentNode({ data, width, height }: NodeProps<ArchNode>) {
  const entry = lookupType(data.typeTag);
  const collapsed = data.display === "icon" && data.childCount > 0;
  return (
    <div
      style={{ width, height, borderColor: entry ? `${entry.color}55` : "#cbd5e1" }}
      className="flex items-center gap-2.5 rounded-xl border-[1.5px] bg-white px-3 shadow-sm"
    >
      <EdgeHandles />
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${entry?.color ?? "#64748b"}14` }}
      >
        <Glyph tag={data.typeTag} />
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
  const entry = lookupType(data.typeTag);
  const color = entry?.color ?? "#64748b";
  return (
    <div
      style={{ width, height, borderColor: `${color}66`, backgroundColor: `${color}09` }}
      className="rounded-2xl border-[1.5px] border-dashed"
    >
      <EdgeHandles />
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-md bg-white shadow-sm"
          style={{ border: `1px solid ${color}44` }}
        >
          <Glyph tag={data.typeTag} size={17} />
        </div>
        <span className="text-[12.5px] font-semibold text-slate-700">
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
