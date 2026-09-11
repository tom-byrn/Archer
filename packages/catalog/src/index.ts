export { GLYPHS } from "./glyphs";

export interface CatalogType {
  /** The `@tag` used in Archlang source, without the `@`. */
  tag: string;
  /** Short display name. */
  name: string;
  /** Grouping in the palette. */
  namespace: string;
  /** Accent color (hex). */
  color: string;
  /** Key into GLYPHS. */
  glyph: string;
}

export const CATALOG: readonly CatalogType[] = [
  // Generic / logical
  { tag: "service", name: "Service", namespace: "generic", color: "#64748b", glyph: "box" },
  { tag: "frontend", name: "Frontend", namespace: "generic", color: "#64748b", glyph: "globe" },
  { tag: "worker", name: "Worker", namespace: "generic", color: "#64748b", glyph: "bolt" },
  { tag: "external", name: "External", namespace: "generic", color: "#94a3b8", glyph: "cloud" },

  // AWS
  { tag: "aws", name: "AWS", namespace: "aws", color: "#ff9900", glyph: "cloud" },
  { tag: "aws.s3", name: "S3", namespace: "aws", color: "#7aa116", glyph: "bucket" },
  { tag: "aws.lambda", name: "Lambda", namespace: "aws", color: "#ed7100", glyph: "lambda" },
  { tag: "aws.ec2", name: "EC2", namespace: "aws", color: "#ed7100", glyph: "server" },
  { tag: "aws.rds", name: "RDS", namespace: "aws", color: "#527fff", glyph: "database" },
  { tag: "aws.dynamodb", name: "DynamoDB", namespace: "aws", color: "#527fff", glyph: "table" },
  { tag: "aws.sqs", name: "SQS", namespace: "aws", color: "#e7157b", glyph: "queue" },
  { tag: "aws.api_gateway", name: "API Gateway", namespace: "aws", color: "#e7157b", glyph: "gateway" },
  { tag: "aws.cognito", name: "Cognito", namespace: "aws", color: "#dd344c", glyph: "shield" },

  // Vercel
  { tag: "vercel", name: "Vercel", namespace: "vercel", color: "#171717", glyph: "triangle" },
  { tag: "vercel.nextjs", name: "Next.js", namespace: "vercel", color: "#171717", glyph: "globe" },
  { tag: "vercel.functions", name: "Functions", namespace: "vercel", color: "#171717", glyph: "lambda" },

  // Databases & infra
  { tag: "postgres", name: "Postgres", namespace: "databases", color: "#336791", glyph: "database" },
  { tag: "postgres.table", name: "Table", namespace: "databases", color: "#336791", glyph: "table" },
  { tag: "supabase.postgres", name: "Supabase", namespace: "databases", color: "#3ecf8e", glyph: "database" },
  { tag: "convex", name: "Convex", namespace: "databases", color: "#f3b01c", glyph: "database" },
  { tag: "mongodb", name: "MongoDB", namespace: "databases", color: "#00ed64", glyph: "leaf" },
  { tag: "redis", name: "Redis", namespace: "databases", color: "#ff4438", glyph: "bolt" },
  { tag: "kafka", name: "Kafka", namespace: "infra", color: "#1f2937", glyph: "queue" },
  { tag: "docker", name: "Docker", namespace: "infra", color: "#1d63ed", glyph: "cube" },
  { tag: "kubernetes", name: "Kubernetes", namespace: "infra", color: "#326ce5", glyph: "cube" },
  { tag: "cloudflare", name: "Cloudflare", namespace: "infra", color: "#f38020", glyph: "cloud" },

  // SaaS
  { tag: "stripe", name: "Stripe", namespace: "saas", color: "#635bff", glyph: "card" },
  { tag: "github", name: "GitHub", namespace: "saas", color: "#1f2328", glyph: "branch" },
  { tag: "openai", name: "OpenAI", namespace: "saas", color: "#10a37f", glyph: "spark" },
  { tag: "anthropic", name: "Anthropic", namespace: "saas", color: "#d97757", glyph: "spark" },
] as const;

export const CONNECTION_TYPES: readonly string[] = [
  "http",
  "grpc",
  "ws",
  "sql",
  "queue",
  "event",
  "stream",
  "auth",
  "reads",
  "writes",
  "deploys",
  "contains",
  "depends",
];

const byTag = new Map(CATALOG.map((t) => [t.tag, t]));

export const lookupType = (tag: string | undefined): CatalogType | undefined =>
  tag === undefined ? undefined : byTag.get(tag);

export const knownTypes = (): Set<string> => new Set(CATALOG.map((t) => t.tag));

export const knownConnectionTypes = (): Set<string> => new Set(CONNECTION_TYPES);
