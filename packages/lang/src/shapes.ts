/**
 * How a component is drawn (spec §3.3): the outline its box takes on the
 * canvas. The language owns the list so every tool agrees on it; how each
 * outline looks is up to the renderer. Add shapes freely, never rename or
 * remove one: documents store them by name.
 */
export const SHAPES = [
  "box",
  "cylinder",
  "cloud",
  "server",
  "robot",
  "person",
  "queue",
  "bucket",
  "browser",
  "phone",
  "document",
  "folder",
  "stack",
  "hexagon",
  "circle",
  "diamond",
] as const;

export type Shape = (typeof SHAPES)[number];

/** The default: a component with no `shape` is a box. */
export const DEFAULT_SHAPE: Shape = "box";

/** What each shape is called, and what it usually stands for. */
export const SHAPE_INFO: Record<Shape, { name: string; use: string }> = {
  box: { name: "Box", use: "anything (the default)" },
  cylinder: { name: "Cylinder", use: "databases and other stores" },
  cloud: { name: "Cloud", use: "cloud providers, external services, the internet" },
  server: { name: "Server", use: "servers, hosts and VMs" },
  robot: { name: "Robot", use: "AI agents, bots and automations" },
  person: { name: "Person", use: "users, customers and teams" },
  queue: { name: "Queue", use: "queues, streams and logs" },
  bucket: { name: "Bucket", use: "object storage and blobs" },
  browser: { name: "Browser", use: "web apps and sites" },
  phone: { name: "Phone", use: "mobile apps and devices" },
  document: { name: "Document", use: "files, reports and specs" },
  folder: { name: "Folder", use: "file shares and directories" },
  stack: { name: "Stack", use: "replicas, pools and fleets" },
  hexagon: { name: "Hexagon", use: "services and processing steps" },
  circle: { name: "Circle", use: "events, triggers and endpoints" },
  diamond: { name: "Diamond", use: "decisions and routing" },
};

const KNOWN = new Set<string>(SHAPES);

export const isShape = (name: string | undefined): name is Shape =>
  name !== undefined && KNOWN.has(name);

/** The shape a component is drawn with: its own when the language knows it, else a box. */
export const shapeOf = (component: { shape?: string }): Shape =>
  isShape(component.shape) ? component.shape : DEFAULT_SHAPE;
