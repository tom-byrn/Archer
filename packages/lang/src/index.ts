export * from "./types";
export { SHAPES, SHAPE_INFO, SHAPE_GROUPS, DEFAULT_SHAPE, isShape, shapeOf } from "./shapes";
export type { Shape, ShapeGroup } from "./shapes";
export { COLORS, COLOR_HEX, isColor, isColorName, resolveColor } from "./colors";
export type { ColorName } from "./colors";
export { parse, CURRENT_VERSION } from "./parser";
export { lex, dedent } from "./lexer";
export type { Token, TokenType } from "./lexer";
export {
  findItem,
  findPlane,
  forEachScope,
  planePaths,
  planeTree,
  scopeAt,
  scopeOf,
} from "./scope";
export type { PlaneTree, Scope } from "./scope";
export {
  validate,
  validateTable,
  checkPayload,
  componentPaths,
  findComponent,
  normalizeLayout,
  hasErrors,
} from "./validate";
export type { ValidateOptions } from "./validate";
export { format, formatSequence, formatFlow, formatMachine, formatModel, formatView } from "./format";
export {
  VIEW_KINDS,
  VIEW_LABELS,
  allViews,
  findView,
  viewsOf,
  viewName,
  viewComponents,
  viewsWith,
  remapViewPaths,
} from "./views";
export type { ViewRef } from "./views";
export {
  sequenceRows,
  sequenceMessages,
  sequenceParticipants,
  sequenceUses,
  sequencesWith,
  messageConnection,
  messageKind,
  remapSequencePaths,
  stepAt,
  stepList,
  addressKey,
  parseAddressKey,
  MESSAGE_ARROWS,
} from "./sequence";
export type { SequenceRow, StepAddress, StepSlot } from "./sequence";
export type { FormatOptions } from "./format";
export { compileForAgent } from "./agentExport";
export {
  autoLayout,
  canvasAt,
  layoutMap,
  planePathOf,
  EMPTY_PLANE_SIZE,
  LEAF_SIZE,
  PLANE_INNER_ORIGIN,
  PLANE_INNER_MARGIN,
} from "./layout";
export type { AutoLayoutOptions } from "./layout";
export {
  addComponent,
  addPlane,
  removeComponent,
  removePlane,
  renameComponent,
  renamePlane,
  setComponentMeta,
  setPlaneMeta,
  setPayload,
  removePayload,
  setConnectionPayload,
  removeConnectionPayload,
  moveComponent,
  resizeComponent,
  setPlane,
  addConnection,
  removeConnection,
  setConnectionMeta,
  reparentComponent,
  freshId,
  setConnectionEndpoints,
  extractFragment,
  insertFragment,
  groupInPlane,
  nestInComponent,
  componentToPlane,
  relayoutComponents,
  duplicateComponents,
  outermostItems,
  addSequence,
  removeSequence,
  setSequenceMeta,
  insertStep,
  removeStep,
  setMessageMeta,
  setNoteText,
  setFragmentMeta,
  moveStep,
  wrapInFragment,
  addBranch,
  removeBranch,
  unwrapFragment,
  stepsFromConnections,
  addView,
  removeView,
  setViewMeta,
  addFlowNode,
  setFlowNode,
  addState,
  setState,
  removeGraphNode,
  addGraphEdgeTo,
  setGraphEdge,
  removeGraphEdge,
  addEntity,
  setEntity,
  setEntityFields,
  removeEntity,
} from "./transform";
export type {
  AddComponentOptions,
  AddPlaneOptions,
  ComponentMeta,
  PlaneMeta,
  RemovePlaneOptions,
  ConnectionOptions,
  ConnectionMeta,
  GroupOptions,
  AddSequenceOptions,
  SequenceMeta,
  MessageMeta,
  AddViewOptions,
  ViewMeta,
  FlowNodeOptions,
  FlowNodeMeta,
  StateOptions,
  StateMeta,
} from "./transform";
export {
  diffDocs,
  summarizeDiff,
  isEmptyDiff,
  mergeForDiff,
  connectionKey,
} from "./diff";
export type {
  ChangeKind,
  ComponentChange,
  PlaneChange,
  ConnectionChange,
  ViewChange,
  DocDiff,
  DiffSummary,
} from "./diff";
export { mergeDocs } from "./merge";
export type { MergeConflict, MergeResult } from "./merge";
