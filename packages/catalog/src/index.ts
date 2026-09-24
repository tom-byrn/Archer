export { GLYPHS, GLYPH_VIEWBOX } from "./glyphs";

export interface CatalogType {
  /** The `@tag` used in Archer source, without the `@`. */
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
  // Generic: your own code, its clients, and third parties
  { tag: "service", name: "Service", namespace: "generic", color: "#64748b", glyph: "box" },
  { tag: "frontend", name: "Frontend", namespace: "generic", color: "#64748b", glyph: "globe" },
  { tag: "worker", name: "Worker", namespace: "generic", color: "#64748b", glyph: "gear" },
  { tag: "external", name: "External", namespace: "generic", color: "#94a3b8", glyph: "cloud" },
  { tag: "payment_gateway", name: "Payment Gateway", namespace: "generic", color: "#64748b", glyph: "card" },
  { tag: "browser", name: "Browser", namespace: "generic", color: "#64748b", glyph: "window" },
  { tag: "mobile", name: "Mobile App", namespace: "generic", color: "#64748b", glyph: "phone" },
  { tag: "desktop", name: "Desktop App", namespace: "generic", color: "#64748b", glyph: "desktop" },
  { tag: "cli", name: "CLI", namespace: "generic", color: "#64748b", glyph: "terminal" },
  { tag: "iot_device", name: "IoT Device", namespace: "generic", color: "#64748b", glyph: "chip" },
  { tag: "user", name: "User", namespace: "generic", color: "#64748b", glyph: "user" },

  // System-design building blocks: vendor-neutral, slate like the generic types,
  // one palette group per concern (labels and order in apps/web/components/Palette.tsx).

  // Networking & traffic
  { tag: "dns", name: "DNS", namespace: "network", color: "#64748b", glyph: "signpost" },
  { tag: "cdn", name: "CDN", namespace: "network", color: "#64748b", glyph: "earth" },
  { tag: "load_balancer", name: "Load Balancer", namespace: "network", color: "#64748b", glyph: "split" },
  { tag: "reverse_proxy", name: "Reverse Proxy", namespace: "network", color: "#64748b", glyph: "proxy" },
  { tag: "forward_proxy", name: "Forward Proxy", namespace: "network", color: "#64748b", glyph: "forward" },
  { tag: "api_gateway", name: "API Gateway", namespace: "network", color: "#64748b", glyph: "gateway" },
  { tag: "rate_limiter", name: "Rate Limiter", namespace: "network", color: "#64748b", glyph: "gauge" },
  { tag: "circuit_breaker", name: "Circuit Breaker", namespace: "network", color: "#64748b", glyph: "unplug" },
  { tag: "service_mesh", name: "Service Mesh", namespace: "network", color: "#64748b", glyph: "mesh" },
  { tag: "vpn", name: "VPN", namespace: "network", color: "#64748b", glyph: "lock" },

  // Compute
  { tag: "server", name: "Server / VM", namespace: "compute", color: "#64748b", glyph: "server" },
  { tag: "container", name: "Container", namespace: "compute", color: "#64748b", glyph: "cube" },
  { tag: "function", name: "Serverless Function", namespace: "compute", color: "#64748b", glyph: "lambda" },
  { tag: "edge_function", name: "Edge Function", namespace: "compute", color: "#64748b", glyph: "lambda" },
  { tag: "cron", name: "Cron / Scheduler", namespace: "compute", color: "#64748b", glyph: "clock" },
  { tag: "workflow", name: "Workflow Engine", namespace: "compute", color: "#64748b", glyph: "flow" },

  // Storage
  { tag: "database", name: "Database", namespace: "storage", color: "#64748b", glyph: "database" },
  { tag: "kv_store", name: "Key-Value Store", namespace: "storage", color: "#64748b", glyph: "hash" },
  { tag: "document_store", name: "Document Store", namespace: "storage", color: "#64748b", glyph: "files" },
  { tag: "wide_column_store", name: "Wide-Column Store", namespace: "storage", color: "#64748b", glyph: "columns" },
  { tag: "graph_db", name: "Graph Database", namespace: "storage", color: "#64748b", glyph: "graph" },
  { tag: "time_series_db", name: "Time-Series Database", namespace: "storage", color: "#64748b", glyph: "plot" },
  { tag: "vector_db", name: "Vector Database", namespace: "storage", color: "#64748b", glyph: "vector" },
  { tag: "search_index", name: "Search Index", namespace: "storage", color: "#64748b", glyph: "search" },
  { tag: "cache", name: "Cache", namespace: "storage", color: "#64748b", glyph: "bolt" },
  { tag: "object_storage", name: "Object Storage", namespace: "storage", color: "#64748b", glyph: "bucket" },
  { tag: "file_storage", name: "File Storage", namespace: "storage", color: "#64748b", glyph: "folder" },
  { tag: "block_storage", name: "Block Storage", namespace: "storage", color: "#64748b", glyph: "disk" },

  // Messaging
  { tag: "queue", name: "Queue", namespace: "messaging", color: "#64748b", glyph: "queue" },
  { tag: "pubsub", name: "Pub/Sub", namespace: "messaging", color: "#64748b", glyph: "broadcast" },
  { tag: "event_bus", name: "Event Bus", namespace: "messaging", color: "#64748b", glyph: "hub" },
  { tag: "stream", name: "Event Stream", namespace: "messaging", color: "#64748b", glyph: "waves" },
  { tag: "email", name: "Email", namespace: "messaging", color: "#64748b", glyph: "mail" },
  { tag: "sms", name: "SMS", namespace: "messaging", color: "#64748b", glyph: "chat" },
  { tag: "push", name: "Push Notifications", namespace: "messaging", color: "#64748b", glyph: "bell" },

  // Data & AI
  { tag: "data_warehouse", name: "Data Warehouse", namespace: "data", color: "#64748b", glyph: "warehouse" },
  { tag: "data_lake", name: "Data Lake", namespace: "data", color: "#64748b", glyph: "drop" },
  { tag: "etl", name: "ETL Pipeline", namespace: "data", color: "#64748b", glyph: "merge" },
  { tag: "stream_processor", name: "Stream Processor", namespace: "data", color: "#64748b", glyph: "signal" },
  { tag: "batch_processor", name: "Batch Processor", namespace: "data", color: "#64748b", glyph: "stack" },
  { tag: "analytics", name: "Analytics", namespace: "data", color: "#64748b", glyph: "chart" },
  { tag: "ml_model", name: "ML Model", namespace: "data", color: "#64748b", glyph: "brain" },
  { tag: "llm", name: "LLM", namespace: "data", color: "#64748b", glyph: "sparkle" },
  { tag: "agent", name: "AI Agent", namespace: "data", color: "#64748b", glyph: "robot" },
  { tag: "mcp_server", name: "MCP Server", namespace: "data", color: "#64748b", glyph: "plug" },

  // Observability
  { tag: "metrics", name: "Metrics / Monitoring", namespace: "observability", color: "#64748b", glyph: "pulse" },
  { tag: "logging", name: "Logging", namespace: "observability", color: "#64748b", glyph: "scroll" },
  { tag: "tracing", name: "Tracing", namespace: "observability", color: "#64748b", glyph: "path" },
  { tag: "alerting", name: "Alerting", namespace: "observability", color: "#64748b", glyph: "siren" },

  // Security
  { tag: "auth", name: "Auth Service", namespace: "security", color: "#64748b", glyph: "shield" },
  { tag: "secrets_manager", name: "Secrets Manager", namespace: "security", color: "#64748b", glyph: "vault" },
  { tag: "kms", name: "Key Management", namespace: "security", color: "#64748b", glyph: "key" },
  { tag: "waf", name: "Web App Firewall", namespace: "security", color: "#64748b", glyph: "funnel" },
  { tag: "firewall", name: "Firewall", namespace: "security", color: "#64748b", glyph: "wall" },

  // Platform services
  { tag: "service_discovery", name: "Service Discovery", namespace: "platform", color: "#64748b", glyph: "directory" },
  { tag: "coordination", name: "Coordination Service", namespace: "platform", color: "#64748b", glyph: "handshake" },
  { tag: "config_service", name: "Config Service", namespace: "platform", color: "#64748b", glyph: "sliders" },
  { tag: "feature_flags", name: "Feature Flags", namespace: "platform", color: "#64748b", glyph: "flag" },
  { tag: "id_generator", name: "ID Generator", namespace: "platform", color: "#64748b", glyph: "fingerprint" },
  { tag: "ci_cd", name: "CI/CD Pipeline", namespace: "platform", color: "#64748b", glyph: "infinity" },

  // Topology: boundaries to nest the rest in, usually shown as planes
  { tag: "region", name: "Region", namespace: "topology", color: "#64748b", glyph: "map" },
  { tag: "zone", name: "Availability Zone", namespace: "topology", color: "#64748b", glyph: "dashed" },
  { tag: "data_center", name: "Data Center", namespace: "topology", color: "#64748b", glyph: "building" },
  { tag: "network", name: "Network / VPC", namespace: "topology", color: "#64748b", glyph: "network" },
  { tag: "subnet", name: "Subnet", namespace: "topology", color: "#64748b", glyph: "grid" },
  { tag: "cluster", name: "Cluster", namespace: "topology", color: "#64748b", glyph: "circles" },

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

  // More AWS
  { tag: "aws.ecs", name: "ECS", namespace: "aws", color: "#ed7100", glyph: "cube" },
  { tag: "aws.eks", name: "EKS", namespace: "aws", color: "#ed7100", glyph: "cube" },
  { tag: "aws.fargate", name: "Fargate", namespace: "aws", color: "#ed7100", glyph: "cube" },
  { tag: "aws.cloudfront", name: "CloudFront", namespace: "aws", color: "#8c4fff", glyph: "globe" },
  { tag: "aws.route53", name: "Route 53", namespace: "aws", color: "#8c4fff", glyph: "gateway" },
  { tag: "aws.sns", name: "SNS", namespace: "aws", color: "#e7157b", glyph: "mail" },
  { tag: "aws.ses", name: "SES", namespace: "aws", color: "#e7157b", glyph: "mail" },
  { tag: "aws.step_functions", name: "Step Functions", namespace: "aws", color: "#e7157b", glyph: "gear" },
  { tag: "aws.elasticache", name: "ElastiCache", namespace: "aws", color: "#527fff", glyph: "bolt" },
  { tag: "aws.vpc", name: "VPC", namespace: "aws", color: "#8c4fff", glyph: "cloud" },

  // GCP
  { tag: "gcp", name: "Google Cloud", namespace: "gcp", color: "#4285f4", glyph: "cloud" },
  { tag: "gcp.cloud_run", name: "Cloud Run", namespace: "gcp", color: "#4285f4", glyph: "lambda" },
  { tag: "gcp.gcs", name: "Cloud Storage", namespace: "gcp", color: "#4285f4", glyph: "bucket" },
  { tag: "gcp.bigquery", name: "BigQuery", namespace: "gcp", color: "#669df6", glyph: "chart" },
  { tag: "gcp.pubsub", name: "Pub/Sub", namespace: "gcp", color: "#669df6", glyph: "queue" },
  { tag: "gcp.firestore", name: "Firestore", namespace: "gcp", color: "#ffa000", glyph: "database" },
  { tag: "firebase", name: "Firebase", namespace: "gcp", color: "#ffa000", glyph: "flame" },

  // Azure
  { tag: "azure", name: "Azure", namespace: "azure", color: "#0078d4", glyph: "cloud" },
  { tag: "azure.functions", name: "Az Functions", namespace: "azure", color: "#0078d4", glyph: "lambda" },
  { tag: "azure.cosmos", name: "Cosmos DB", namespace: "azure", color: "#0078d4", glyph: "database" },

  // More databases
  { tag: "mysql", name: "MySQL", namespace: "databases", color: "#00758f", glyph: "database" },
  { tag: "sqlite", name: "SQLite", namespace: "databases", color: "#003b57", glyph: "database" },
  { tag: "clickhouse", name: "ClickHouse", namespace: "databases", color: "#faff69", glyph: "chart" },
  { tag: "snowflake", name: "Snowflake", namespace: "databases", color: "#29b5e8", glyph: "spark" },
  { tag: "neon", name: "Neon", namespace: "databases", color: "#00e599", glyph: "database" },
  { tag: "planetscale", name: "PlanetScale", namespace: "databases", color: "#f35815", glyph: "database" },
  { tag: "elasticsearch", name: "Elasticsearch", namespace: "databases", color: "#fec514", glyph: "search" },
  { tag: "pinecone", name: "Pinecone", namespace: "databases", color: "#1c17ff", glyph: "search" },

  // More infra
  { tag: "rabbitmq", name: "RabbitMQ", namespace: "infra", color: "#ff6600", glyph: "queue" },
  { tag: "nginx", name: "NGINX", namespace: "infra", color: "#009639", glyph: "gateway" },
  { tag: "terraform", name: "Terraform", namespace: "infra", color: "#7b42bc", glyph: "cube" },
  { tag: "grafana", name: "Grafana", namespace: "infra", color: "#f46800", glyph: "chart" },
  { tag: "prometheus", name: "Prometheus", namespace: "infra", color: "#e6522c", glyph: "flame" },
  { tag: "temporal", name: "Temporal", namespace: "infra", color: "#444ce7", glyph: "clock" },

  // SaaS
  { tag: "stripe", name: "Stripe", namespace: "saas", color: "#635bff", glyph: "card" },
  { tag: "github", name: "GitHub", namespace: "saas", color: "#1f2328", glyph: "branch" },
  { tag: "openai", name: "OpenAI", namespace: "saas", color: "#10a37f", glyph: "spark" },
  { tag: "anthropic", name: "Anthropic", namespace: "saas", color: "#d97757", glyph: "spark" },
  { tag: "auth0", name: "Auth0", namespace: "saas", color: "#eb5424", glyph: "shield" },
  { tag: "clerk", name: "Clerk", namespace: "saas", color: "#6c47ff", glyph: "shield" },
  { tag: "twilio", name: "Twilio", namespace: "saas", color: "#f22f46", glyph: "chat" },
  { tag: "resend", name: "Resend", namespace: "saas", color: "#1f2328", glyph: "mail" },
  { tag: "sendgrid", name: "SendGrid", namespace: "saas", color: "#1a82e2", glyph: "mail" },
  { tag: "slack", name: "Slack", namespace: "saas", color: "#611f69", glyph: "chat" },
  { tag: "supabase", name: "Supabase", namespace: "saas", color: "#3ecf8e", glyph: "bolt" },
  { tag: "netlify", name: "Netlify", namespace: "saas", color: "#00c7b7", glyph: "globe" },
  { tag: "fly", name: "Fly.io", namespace: "saas", color: "#7b3ff2", glyph: "cloud" },
  { tag: "railway", name: "Railway", namespace: "saas", color: "#13111c", glyph: "cloud" },
] as const;

export const CONNECTION_TYPES: readonly string[] = [
  "http",
  "grpc",
  "graphql",
  "ws",
  "sse",
  "webrtc",
  "tcp",
  "udp",
  "sql",
  "queue",
  "event",
  "stream",
  "mqtt",
  "webhook",
  "cdc",
  "auth",
  "reads",
  "writes",
  "replicates",
  "triggers",
  "deploys",
  "contains",
  "depends",
];

const byTag = new Map(CATALOG.map((t) => [t.tag, t]));

export const lookupType = (tag: string | undefined): CatalogType | undefined =>
  tag === undefined ? undefined : byTag.get(tag);

export const knownTypes = (): Set<string> => new Set(CATALOG.map((t) => t.tag));

export const knownConnectionTypes = (): Set<string> => new Set(CONNECTION_TYPES);
