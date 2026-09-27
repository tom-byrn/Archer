export * from "./types";
export { SHAPES, SHAPE_INFO, SHAPE_GROUPS, DEFAULT_SHAPE, isShape, shapeOf } from "./shapes";
export type { Shape, ShapeGroup } from "./shapes";
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
export { format } from "./format";
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
  DocDiff,
  DiffSummary,
} from "./diff";
export { mergeDocs } from "./merge";
export type { MergeConflict, MergeResult } from "./merge";
