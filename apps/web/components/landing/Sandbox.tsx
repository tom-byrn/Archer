"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  addConnection,
  autoLayout,
  findComponent,
  format,
  moveComponent,
  parse,
  pathToString,
  removeConnection,
  setComponentMeta,
  setConnectionMeta,
} from "@archer/lang";
import { lookupType } from "@archer/catalog";
import { ArchCanvas, type CanvasCallbacks } from "../ArchCanvas";
import { Button, Icon, buttonCls } from "../ui";
import { LANDING_SAMPLE, LANDING_SAMPLE_NARROW } from "@/lib/landingSample";
import { resolveDropTarget } from "@/lib/dropTarget";
import { toFlow } from "@/lib/toFlow";
import { deriveDoc, useArchDoc } from "@/lib/useArchDoc";
import { useIsDark } from "@/lib/useIsDark";
import { SandboxInspector, type SandboxSelection } from "./SandboxInspector";
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
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  // Bumped on reset so the canvas remounts and fits the view again.
  const [epoch, setEpoch] = useState(0);

  const derived = useMemo(() => deriveDoc(source), [source]);
  const flow = useMemo(() => {
    const f = toFlow(derived.laidOut, { resolveType, isDark });
    // Keep the clicked arrow highlighted across edits (edges are re-derived each time).
    const edges = f.edges.map((e) =>
      (e.data as { index?: number } | undefined)?.index === selectedEdge
        ? { ...e, selected: true }
        : e,
    );
    return { nodes: f.nodes, edges };
  }, [derived, isDark, selectedEdge]);

  // What the inspector edits; null once the selection no longer resolves.
  const selection: SandboxSelection | null = useMemo(() => {
    if (selected !== null) {
      const node = findComponent(derived.doc, selected.split("."));
      return node ? { kind: "node", name: node.name ?? node.id, type: node.type } : null;
    }
    if (selectedEdge !== null) {
      const conn = derived.doc.connections[selectedEdge];
      return conn
        ? {
            kind: "edge",
            name: `${pathToString(conn.source)} ${conn.arrow} ${pathToString(conn.target)}`,
            type: conn.type,
          }
        : null;
    }
    return null;
  }, [derived, selected, selectedEdge]);

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
      onSelectNode: (path) => {
        setSelected(path);
        setSelectedEdge(null);
      },
      onClearSelection: () => {
        setSelected(null);
        setSelectedEdge(null);
      },
      onDrillIn: () => {},
      onSelectEdge: (index) => {
        setSelectedEdge(index);
        setSelected(null);
      },
      onDeleteNodes: () => {},
      onDeleteEdges: () => {},
      onDropType: () => {},
    }),
    [mutate],
  );

  return (
    <div className="overflow-hidden border border-line-2 bg-surface shadow-md">
      <div className="flex h-11 items-center gap-1 border-b border-line pl-4 pr-2">
        <span className="mono min-w-0 truncate text-sm text-ink-2">architecture.arch</span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          icon={<Icon.Reset />}
          disabled={source === initial}
          onClick={() => {
            setSource(initial);
            setSelected(null);
            setSelectedEdge(null);
            setEpoch((e) => e + 1);
          }}
        >
          Reset
        </Button>
        <Link href="/language/examples" className={buttonCls("ghost", "sm")}>
          See more
          <Icon.ArrowRight className="size-3.5" />
        </Link>
      </div>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="landing-canvas relative h-[440px] bg-ground sm:h-[528px]">
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
          {selection && (
            <SandboxInspector
              selection={selection}
              onSetType={(type) =>
                mutate((d) =>
                  selected !== null
                    ? setComponentMeta(d, selected.split("."), { type })
                    : selectedEdge !== null
                      ? setConnectionMeta(d, selectedEdge, { type })
                      : d,
                )
              }
              onDelete={
                selectedEdge !== null
                  ? () => {
                      mutate((d) => removeConnection(d, selectedEdge));
                      setSelectedEdge(null);
                    }
                  : undefined
              }
            />
          )}
        </div>
        <SourcePane
          source={source}
          className="max-h-[220px] overflow-auto border-t border-line lg:max-h-[528px] lg:border-l lg:border-t-0"
        />
      </div>
    </div>
  );
}
