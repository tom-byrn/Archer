/**
 * How a component is drawn (spec §3.3): the outline its box takes on the
 * canvas. The language owns the list so every tool agrees on it; how each
 * outline looks is up to the renderer. Add shapes freely, never rename or
 * remove one: documents store them by name.
 *
 * The list is in picker order: grouped (SHAPE_GROUPS), each group together.
 */
export const SHAPES = [
  // Basic
  "box",
  "pill",
  "circle",
  "diamond",
  "hexagon",
  "parallelogram",
  "chevron",
  "subroutine",
  "note",
  // People
  "person",
  "people",
  "robot",
  "building",
  // Apps & devices
  "browser",
  "phone",
  "desktop",
  "laptop",
  "terminal",
  "chip",
  // Network & security
  "cloud",
  "globe",
  "firewall",
  "shield",
  "lock",
  // Compute
  "server",
  "stack",
  "cube",
  "module",
  "gear",
  "clock",
  "puzzle",
  "brain",
  // Data & storage
  "cylinder",
  "bucket",
  "table",
  "memory",
  "archive",
  "document",
  "folder",
  "book",
  "search",
  "funnel",
  // Messaging & monitoring
  "queue",
  "envelope",
  "chat",
  "bell",
  "gauge",
] as const;

export type Shape = (typeof SHAPES)[number];

/** The default: a component with no `shape` is a box. */
export const DEFAULT_SHAPE: Shape = "box";

/** How pickers and the spec group the shapes, in order. */
export const SHAPE_GROUPS = [
  { id: "basic", name: "Basic" },
  { id: "people", name: "People" },
  { id: "devices", name: "Apps & devices" },
  { id: "network", name: "Network & security" },
  { id: "compute", name: "Compute" },
  { id: "data", name: "Data & storage" },
  { id: "messaging", name: "Messaging & monitoring" },
] as const;

export type ShapeGroup = (typeof SHAPE_GROUPS)[number]["id"];

/** What each shape is called, what it usually stands for, and its group. */
export const SHAPE_INFO: Record<Shape, { name: string; use: string; group: ShapeGroup }> = {
  box: { name: "Box", use: "anything (the default)", group: "basic" },
  pill: { name: "Pill", use: "starts, ends and states", group: "basic" },
  circle: { name: "Circle", use: "events, triggers and endpoints", group: "basic" },
  diamond: { name: "Diamond", use: "decisions and routing", group: "basic" },
  hexagon: { name: "Hexagon", use: "services and processing steps", group: "basic" },
  parallelogram: { name: "Parallelogram", use: "inputs, outputs and data", group: "basic" },
  chevron: { name: "Chevron", use: "steps and pipeline stages", group: "basic" },
  subroutine: { name: "Subroutine", use: "functions and subprocesses", group: "basic" },
  note: { name: "Note", use: "notes and annotations", group: "basic" },

  person: { name: "Person", use: "users, customers and roles", group: "people" },
  people: { name: "People", use: "teams, groups and audiences", group: "people" },
  robot: { name: "Robot", use: "AI agents, bots and automations", group: "people" },
  building: { name: "Building", use: "companies, partners and on-prem sites", group: "people" },

  browser: { name: "Browser", use: "web apps and sites", group: "devices" },
  phone: { name: "Phone", use: "mobile apps, tablets and devices", group: "devices" },
  desktop: { name: "Desktop", use: "desktop apps, consoles and workstations", group: "devices" },
  laptop: { name: "Laptop", use: "laptops and developer machines", group: "devices" },
  terminal: { name: "Terminal", use: "CLIs, shells and scripts", group: "devices" },
  chip: { name: "Chip", use: "hardware, IoT and embedded devices", group: "devices" },

  cloud: { name: "Cloud", use: "cloud providers, external services, the internet", group: "network" },
  globe: { name: "Globe", use: "the web, DNS, CDNs and regions", group: "network" },
  firewall: { name: "Firewall", use: "firewalls, WAFs and network boundaries", group: "network" },
  shield: { name: "Shield", use: "security, guardrails and policies", group: "network" },
  lock: { name: "Lock", use: "auth, secrets and encryption", group: "network" },

  server: { name: "Server", use: "servers, hosts and VMs", group: "compute" },
  stack: { name: "Stack", use: "replicas, pools and fleets", group: "compute" },
  cube: { name: "Cube", use: "containers, pods and build artifacts", group: "compute" },
  module: { name: "Module", use: "modules, libraries and packages", group: "compute" },
  gear: { name: "Gear", use: "workers, jobs and background tasks", group: "compute" },
  clock: { name: "Clock", use: "schedulers, cron jobs and timers", group: "compute" },
  puzzle: { name: "Puzzle", use: "plugins, extensions and integrations", group: "compute" },
  brain: { name: "Brain", use: "AI models, LLMs and ML", group: "compute" },

  cylinder: { name: "Cylinder", use: "databases and other stores", group: "data" },
  bucket: { name: "Bucket", use: "object storage and blobs", group: "data" },
  table: { name: "Table", use: "tables, datasets and spreadsheets", group: "data" },
  memory: { name: "Memory", use: "caches and in-memory stores", group: "data" },
  archive: { name: "Archive", use: "backups, archives and cold storage", group: "data" },
  document: { name: "Document", use: "files, reports and specs", group: "data" },
  folder: { name: "Folder", use: "file shares and directories", group: "data" },
  book: { name: "Book", use: "docs, wikis and knowledge bases", group: "data" },
  search: { name: "Search", use: "search engines and indexes", group: "data" },
  funnel: { name: "Funnel", use: "filters, pipelines and ETL", group: "data" },

  queue: { name: "Queue", use: "queues, streams and logs", group: "messaging" },
  envelope: { name: "Envelope", use: "email, inboxes and messages", group: "messaging" },
  chat: { name: "Chat", use: "chat, SMS and conversations", group: "messaging" },
  bell: { name: "Bell", use: "alerts, notifications and on-call", group: "messaging" },
  gauge: { name: "Gauge", use: "metrics, monitoring and SLOs", group: "messaging" },
};

const KNOWN = new Set<string>(SHAPES);

export const isShape = (name: string | undefined): name is Shape =>
  name !== undefined && KNOWN.has(name);

/** The shape a component is drawn with: its own when the language knows it, else a box. */
export const shapeOf = (component: { shape?: string }): Shape =>
  isShape(component.shape) ? component.shape : DEFAULT_SHAPE;
