"use client";

import { useMemo, useState } from "react";
import { StateSimulatorBar } from "./PlaybackBar";
import {
  addEntity,
  clearViewLayout,
  placeViewNode,
  setFlowNode,
  viewPositions,
  addFlowNode,
  addState,
  componentPaths,
  type ArchDoc,
  type FlowNode,
  type FlowNodeKind,
  type MachineNode,
  type ModelNode,
} from "@archer/lang";
import { FlowDiagram, ModelDiagram, StatesDiagram, nodeKey } from "./ViewDiagrams";
import { Button, Icon, cx } from "./ui";

type GraphView =
  | { kind: "flow"; node: FlowNode }
  | { kind: "states"; node: MachineNode }
  | { kind: "entities"; node: ModelNode };

const EMPTY: Record<GraphView["kind"], { title: string; body: string; add: string }> = {
  flow: {
    title: "has no steps yet",
    body: "A flow is a process: steps and decisions, each in the lane of the component that does it. Start with a step, and join each new one on from the one selected.",
    add: "Add a step",
  },
  states: {
    title: "has no states yet",
    body: "A state machine is what one component goes through: its states, where it starts, and the events that move it. Add a state; each new one is joined on from the one selected.",
    add: "Add a state",
  },
  entities: {
    title: "has no entities yet",
    body: "A data model is what a store holds: entities, their fields, and how they refer to each other.",
    add: "Add an entity",
  },
};

/**
 * The editor's main area while a flow, state machine or data model is open:
 * its diagram on the canvas ground and a toolbar. New nodes and states join
 * on from the selected one, so a process can be drawn by clicking along.
 */
export function ViewCanvas({
  doc,
  view,
  selected,
  onSelect,
  mutateWith,
  readOnly,
  defaultLane,
  current,
  overlay,
  extraTools,
  onPlay,
}: {
  doc: ArchDoc;
  view: GraphView;
  selected: string | null;
  onSelect: (key: string | null) => void;
  mutateWith: <T>(fn: (d: ArchDoc) => { doc: ArchDoc; value: T }) => T | undefined;
  readOnly: boolean;
  /** Lane for a flow's first node: a selected component, or the first one. */
  defaultLane?: string[];
  /** A node lit by playback or simulation. */
  current?: string | null;
  /** Drawn over the diagram's bottom edge instead of the toolbar (a playback bar). */
  overlay?: React.ReactNode;
  /** More toolbar buttons. */
  extraTools?: React.ReactNode;
  /** A flow: play it on the architecture. */
  onPlay?: () => void;
}) {
  // A state machine's simulator: the states stepped through so far.
  const [sim, setSim] = useState<string[] | null>(null);
  const startSim = () => {
    if (view.kind !== "states" || view.node.states.length === 0) return;
    const first = view.node.states.find((s) => s.initial) ?? view.node.states[0]!;
    setSim([first.id]);
    onSelect(null);
  };
  const simBar =
    sim && view.kind === "states" ? <StateSimulatorBar machine={view.node} path={sim} onPath={setSim} onClose={() => setSim(null)} /> : null;
  const lit = current ?? (sim ? sim[sim.length - 1]! : null);
  const id = view.node.id;
  const placed = useMemo(() => viewPositions(doc, id), [doc, id]);
  const place = (node: string, at: [number, number], lane?: string | null) => {
    mutateWith((d) => {
      let next = placeViewNode(d, id, node, at);
      if (view.kind === "flow" && lane !== undefined) {
        const n = view.node.nodes.find((x) => x.id === node);
        const now = n?.lane ? n.lane.join(".") : null;
        if (now !== lane) next = setFlowNode(next, id, node, { lane: lane === null ? null : lane.split(".") });
      }
      return { doc: next, value: null };
    });
  };
  const tidy = () => mutateWith((d) => ({ doc: clearViewLayout(d, id), value: null }));
  const selectedId = selected?.startsWith("n:") ? selected.slice(2) : undefined;

  const addNode = (node: FlowNodeKind) => {
    if (view.kind !== "flow") return;
    const from = view.node.nodes.find((n) => n.id === selectedId);
    const lane = from?.lane ?? defaultLane ?? [...componentPaths(doc)][0]?.split(".");
    const made = mutateWith((d) => {
      const r = addFlowNode(d, id, { node, ...(node === "step" || node === "decision" ? { name: node === "step" ? "New step" : "Decision?" } : {}), ...(lane ? { lane } : {}) }, from && from.node !== "end" ? from.id : undefined);
      return { doc: r.doc, value: r.id };
    });
    if (made) onSelect(nodeKey(made));
  };
  const addStateNode = () => {
    if (view.kind !== "states") return;
    const from = view.node.states.find((s) => s.id === selectedId);
    const made = mutateWith((d) => {
      const r = addState(d, id, { name: "New state", ...(view.node.states.length === 0 ? { initial: true } : {}) }, from?.id);
      return { doc: r.doc, value: r.id };
    });
    if (made) onSelect(nodeKey(made));
  };
  const addEntityNode = () => {
    const made = mutateWith((d) => {
      const r = addEntity(d, id, { name: "New entity" });
      return { doc: r.doc, value: r.id };
    });
    if (made) onSelect(nodeKey(made));
  };

  const empty =
    view.kind === "flow" ? view.node.nodes.length === 0 : view.kind === "states" ? view.node.states.length === 0 : view.node.entities.length === 0;
  const text = EMPTY[view.kind];
  const primary = () => (view.kind === "flow" ? addNode("step") : view.kind === "states" ? addStateNode() : addEntityNode());

  return (
    <div className="relative min-h-0 flex-1 bg-ground">
      <div
        className="absolute inset-0 overflow-auto"
        style={{ backgroundImage: "radial-gradient(var(--dot) 1px, transparent 1px)", backgroundSize: "20px 20px" }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onSelect(null);
        }}
      >
        {empty ? (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-[380px] text-center">
              <p className="text-base font-medium text-ink">
                {view.node.name ?? view.node.id} {text.title}
              </p>
              <p className="pt-1 text-sm text-ink-3">{text.body}</p>
              {!readOnly && (
                <Button className="mt-3" icon={<Icon.Plus />} onClick={primary}>
                  {text.add}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div
            className="inline-block min-w-full px-6 pb-28 pt-6"
            onClick={(e) => {
              if (e.target === e.currentTarget) onSelect(null);
            }}
          >
            {view.kind === "flow" ? (
              <FlowDiagram className="mx-auto" doc={doc} flow={view.node} selected={selected} onSelect={onSelect} placed={placed} onPlace={readOnly ? undefined : place} current={lit} />
            ) : view.kind === "states" ? (
              <StatesDiagram className="mx-auto" doc={doc} machine={view.node} selected={selected} onSelect={onSelect} placed={placed} onPlace={readOnly ? undefined : place} current={lit} />
            ) : (
              <ModelDiagram className="mx-auto" doc={doc} model={view.node} selected={selected} onSelect={onSelect} placed={placed} onPlace={readOnly ? undefined : place} current={lit} />
            )}
          </div>
        )}
      </div>

      {overlay ?? simBar}
      {!overlay && !simBar && !empty && (!readOnly || view.kind === "states" || (view.kind === "flow" && onPlay)) && (
        <div
          role="toolbar"
          aria-label="Add to the view"
          className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-md"
        >
          {!readOnly && (
            <>
          {view.kind === "flow" ? (
            <>
              <ToolButton onClick={() => addNode("step")} title="Add a step after the selected node">
                <Icon.Plus className="h-3.5 w-3.5" /> Step
              </ToolButton>
              <ToolButton onClick={() => addNode("decision")} title="Add a decision after the selected node">
                <Icon.Decision className="h-3.5 w-3.5" /> Decision
              </ToolButton>
              <span className="mx-1 h-4 w-px bg-line" />
              <ToolButton onClick={() => addNode("start")} title="Add a start">
                <Icon.Circle className="h-3.5 w-3.5" /> Start
              </ToolButton>
              <ToolButton onClick={() => addNode("end")} title="Add an end after the selected node">
                <Icon.CheckCircle className="h-3.5 w-3.5" /> End
              </ToolButton>
            </>
          ) : view.kind === "states" ? (
            <ToolButton onClick={addStateNode} title="Add a state, entered from the selected one">
              <Icon.Plus className="h-3.5 w-3.5" /> State
            </ToolButton>
          ) : (
            <ToolButton onClick={addEntityNode} title="Add an entity">
              <Icon.Plus className="h-3.5 w-3.5" /> Entity
            </ToolButton>
          )}
          {placed.size > 0 && (
            <>
              <span className="mx-1 h-4 w-px bg-line" />
              <ToolButton onClick={tidy} title="Forget where nodes were dragged: lay the view out automatically">
                <Icon.Layout className="h-3.5 w-3.5" /> Tidy
              </ToolButton>
            </>
          )}
            </>
          )}
          {view.kind === "flow" && onPlay && (
            <>
              <span className="mx-1 h-4 w-px bg-line" />
              <ToolButton onClick={onPlay} title="Play this flow on the architecture">
                <Icon.Play className="h-3.5 w-3.5 text-accent" /> Play
              </ToolButton>
            </>
          )}
          {view.kind === "states" && (
            <>
              <span className="mx-1 h-4 w-px bg-line" />
              <ToolButton onClick={startSim} title="Step through the machine's transitions">
                <Icon.Play className="h-3.5 w-3.5 text-accent" /> Simulate
              </ToolButton>
            </>
          )}
          {extraTools}
        </div>
      )}
    </div>
  );
}

function ToolButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cx("flex h-7 items-center gap-1.5 rounded-md px-2 text-sm text-ink transition-colors hover:bg-surface-2")}
    >
      {children}
    </button>
  );
}
