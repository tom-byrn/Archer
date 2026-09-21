"use client";

import { useMemo, useState } from "react";
import { addConnection, autoLayout, format, moveComponent, parse } from "@archer/lang";
import { lookupType } from "@archer/catalog";
import { ArchCanvas, type CanvasCallbacks } from "../ArchCanvas";
import { Button, Icon } from "../ui";
import { LANDING_SAMPLE, LANDING_SAMPLE_NARROW } from "@/lib/landingSample";
import { resolveDropTarget } from "@/lib/dropTarget";
import { toFlow } from "@/lib/toFlow";
import { deriveDoc, useArchDoc } from "@/lib/useArchDoc";
import { useIsDark } from "@/lib/useIsDark";
import { SourcePane } from "./SourcePane";

// Canonical form up front, so the first drag changes one line instead of reflowing the file.
const canonical = (source: string) => {
  try {
    return format(autoLayout(parse(source).doc));
  } catch {
    return source;
  }
};

const resolveType = (tag: string) => {
  const entry = lookupType(tag);
  return entry ? { color: entry.color, glyph: entry.glyph } : undefined;
};

/** The real canvas on a local document: no account, nothing saved. */
export default function Sandbox() {
  // Client-only component (loaded with ssr: false), so the viewport is known at first render.
  const [initial] = useState(() =>
    canonical(
      window.matchMedia("(max-width: 639px)").matches ? LANDING_SAMPLE_NARROW : LANDING_SAMPLE,
    ),
  );
  const { source, setSource, mutate } = useArchDoc(initial);
  const isDark = useIsDark();
  const [selected, setSelected] = useState<string | null>(null);
  // Bumped on reset so the canvas remounts and fits the view again.
  const [epoch, setEpoch] = useState(0);

  const derived = useMemo(() => deriveDoc(source), [source]);
  const flow = useMemo(
    () => toFlow(derived.laidOut, { resolveType, isDark }),
    [derived, isDark],
  );

  const callbacks: CanvasCallbacks = useMemo(
    () => ({
      onNodeDragEnd: (path, info) =>
        mutate((d) => {
          const segs = path.split(".");
          const target = resolveDropTarget(d, info.center, {
            exclude: segs,
            topLeft: info.topLeft,
            sizeGrid: info.sizeGrid,
          });
          return moveComponent(d, segs, target.at);
        }),
      onConnect: (s, t) => mutate((d) => addConnection(d, s.split("."), t.split("."))),
      onSelectNode: setSelected,
      onClearSelection: () => setSelected(null),
      onDrillIn: () => {},
      onSelectEdge: () => {},
      onDeleteNodes: () => {},
      onDeleteEdges: () => {},
      onDropType: () => {},
    }),
    [mutate],
  );

  return (
    <div className="overflow-hidden border border-line-2 bg-surface shadow-md">
      <div className="flex h-11 items-center border-b border-line pl-4 pr-2">
        <span className="mono text-sm text-ink-2">architecture.arch</span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          icon={<Icon.Reset />}
          disabled={source === initial}
          onClick={() => {
            setSource(initial);
            setSelected(null);
            setEpoch((e) => e + 1);
          }}
        >
          Reset
        </Button>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="landing-canvas h-[440px] bg-ground sm:h-[528px]">
          <ArchCanvas
            key={epoch}
            nodes={flow.nodes}
            edges={flow.edges}
            title="Acme"
            callbacks={callbacks}
            isDark={isDark}
            selectedPath={selected}
            embedded
          />
        </div>
        <SourcePane
          source={source}
          className="max-h-[220px] overflow-auto border-t border-line lg:max-h-[528px] lg:border-l lg:border-t-0"
        />
      </div>
    </div>
  );
}
