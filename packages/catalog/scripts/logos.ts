/**
 * Writes src/logos.ts: product logos and vendor icons for catalog types, drawn
 * instead of the type's Phosphor glyph wherever the app supplies them (the
 * editor, the document viewer, share and example images; never marketing
 * pages, and never custom types). test/catalog.test.ts fails while the file is
 * stale, and until every vendor type has a logo or a reason in NO_LOGO.
 *
 * Usage: pnpm --filter @archer/catalog logos
 *
 * A logo only ever identifies the product a component is, comes from a source
 * whose terms cover it, and is drawn unaltered:
 *   - one-colour logos are Simple Icons (CC0) or Lobe Icons (MIT) marks,
 *     painted in the brand's own color;
 *   - multicolour logos are full-colour artwork from Lobe Icons or SVG Logos
 *     (Gil Barbara, CC0), drawn as they are;
 *   - AWS services use AWS's own Architecture Icons, unchanged (vendor/aws,
 *     CC BY-ND 2.0).
 * Brands whose owners require permission for any use of their logo, or have
 * refused it, keep their glyph: see NO_LOGO.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { Logo } from "../src/index";

type Source =
  /** A Simple Icons mark, in its brand hex unless `color` is given. */
  | { simpleIcons: string; color?: string }
  /** A one-colour Lobe Icons mark (`<name>.svg`), painted in `color`. */
  | { lobe: string; color: string }
  /** A full-colour Lobe Icons logo (`<name>-color.svg`). */
  | { lobeColor: string }
  /** An SVG Logos icon: full colour, or painted as a mark in `mark` when it is one colour. */
  | { svgLogos: string; mark?: string }
  /** An AWS Architecture Icon in vendor/aws: a service's square `tile`, or `full` artwork. */
  | { aws: string; kind: "tile" | "full" };

/** Logo key (CatalogType.logo) → where it comes from. */
export const LOGO_SOURCES: Record<string, Source> = {
  // AI platforms
  anthropic: { simpleIcons: "anthropic" },
  mistral: { lobeColor: "mistral" },
  cohere: { lobeColor: "cohere" },
  xai: { lobe: "xai", color: "#000000" },
  deepseek: { simpleIcons: "deepseek", color: "#4d6bfe" },
  groq: { lobe: "groq", color: "#f55036" },
  perplexity: { simpleIcons: "perplexity" },
  huggingface: { lobeColor: "huggingface" },
  ollama: { simpleIcons: "ollama" },
  vllm: { lobeColor: "vllm" },
  elevenlabs: { simpleIcons: "elevenlabs" },
  deepgram: { simpleIcons: "deepgram" },
  langchain: { simpleIcons: "langchain", color: "#1c3c3c" },
  langgraph: { simpleIcons: "langgraph", color: "#1c3c3c" },
  langsmith: { lobe: "langsmith", color: "#1c3c3c" },
  llamaindex: { lobeColor: "llamaindex" },
  crewai: { simpleIcons: "crewai" },

  // Vercel
  vercel: { simpleIcons: "vercel" },
  nextjs: { simpleIcons: "nextdotjs" },

  // Databases
  supabase: { svgLogos: "supabase-icon" },
  convex: { simpleIcons: "convex" },
  mongodb: { simpleIcons: "mongodb", color: "#00ed64" },
  redis: { simpleIcons: "redis" },
  sqlite: { simpleIcons: "sqlite" },
  clickhouse: { simpleIcons: "clickhouse" },
  snowflake: { simpleIcons: "snowflake" },
  neon: { svgLogos: "neon-icon" },
  planetscale: { simpleIcons: "planetscale" },
  elasticsearch: { svgLogos: "elasticsearch" },
  pinecone: { svgLogos: "pinecone-icon", mark: "#201d1e" },
  qdrant: { svgLogos: "qdrant-icon" },
  chroma: { svgLogos: "chroma" },
  milvus: { simpleIcons: "milvus" },
  neo4j: { simpleIcons: "neo4j" },
  cassandra: { svgLogos: "cassandra" },
  memcached: { svgLogos: "memcached" },
  cockroachdb: { simpleIcons: "cockroachlabs" },
  influxdb: { simpleIcons: "influxdb" },
  scylladb: { simpleIcons: "scylladb" },
  hbase: { simpleIcons: "apachehbase" },
  timescale: { simpleIcons: "timescale" },
  valkey: { svgLogos: "valkey-icon", mark: "#6983ff" },

  // Infrastructure
  kafka: { simpleIcons: "apachekafka" },
  kubernetes: { simpleIcons: "kubernetes" },
  rabbitmq: { simpleIcons: "rabbitmq" },
  nginx: { simpleIcons: "nginx" },
  grafana: { svgLogos: "grafana" },
  prometheus: { simpleIcons: "prometheus" },
  temporal: { simpleIcons: "temporal" },
  envoy: { svgLogos: "envoy-icon" },
  kong: { simpleIcons: "kong" },
  istio: { simpleIcons: "istio" },
  fastly: { simpleIcons: "fastly" },
  akamai: { simpleIcons: "akamai" },
  etcd: { simpleIcons: "etcd" },
  spark: { simpleIcons: "apachespark" },
  hadoop: { svgLogos: "hadoop" },
  flink: { svgLogos: "apache-flink-icon" },
  airflow: { svgLogos: "airflow-icon" },
  opentelemetry: { svgLogos: "opentelemetry-icon" },
  traefik: { simpleIcons: "traefikproxy" },
  linkerd: { svgLogos: "linkerd" },
  minio: { simpleIcons: "minio" },
  pulsar: { simpleIcons: "apachepulsar" },
  nats: { svgLogos: "nats-icon" },
  keycloak: { simpleIcons: "keycloak" },
  logstash: { svgLogos: "logstash" },
  kibana: { svgLogos: "kibana" },
  databricks: { simpleIcons: "databricks" },

  // SaaS
  stripe: { simpleIcons: "stripe" },
  github: { simpleIcons: "github" },
  auth0: { simpleIcons: "auth0" },
  clerk: { simpleIcons: "clerk" },
  resend: { simpleIcons: "resend" },
  netlify: { svgLogos: "netlify-icon" },
  fly: { svgLogos: "fly-icon" },
  railway: { simpleIcons: "railway" },
  okta: { simpleIcons: "okta" },
  datadog: { simpleIcons: "datadog" },
  sentry: { simpleIcons: "sentry" },
  pagerduty: { simpleIcons: "pagerduty" },
  launchdarkly: { svgLogos: "launchdarkly-icon", mark: "#000000" },
  algolia: { simpleIcons: "algolia" },
  upstash: { simpleIcons: "upstash" },
  paypal: { svgLogos: "paypal" },
  pusher: { simpleIcons: "pusher" },
  mixpanel: { simpleIcons: "mixpanel" },
  posthog: { svgLogos: "posthog-icon" },
  "new-relic": { svgLogos: "new-relic-icon" },

  // AWS: the AWS Cloud group icon, then one service icon each (vendor/aws)
  "aws-cloud": { aws: "Groups/AWSCloud", kind: "tile" },
  "aws-s3": { aws: "Storage/SimpleStorageService", kind: "tile" },
  "aws-lambda": { aws: "Compute/Lambda", kind: "tile" },
  "aws-ec2": { aws: "Compute/EC2", kind: "tile" },
  "aws-rds": { aws: "Database/RDS", kind: "tile" },
  "aws-dynamodb": { aws: "Database/DynamoDB", kind: "tile" },
  "aws-sqs": { aws: "ApplicationIntegration/SimpleQueueService", kind: "tile" },
  "aws-api-gateway": { aws: "NetworkingContentDelivery/APIGateway", kind: "tile" },
  "aws-cognito": { aws: "SecurityIdentityCompliance/Cognito", kind: "tile" },
  "aws-ecs": { aws: "Containers/ElasticContainerService", kind: "tile" },
  "aws-eks": { aws: "Containers/ElasticKubernetesService", kind: "tile" },
  "aws-fargate": { aws: "Containers/Fargate", kind: "tile" },
  "aws-cloudfront": { aws: "NetworkingContentDelivery/CloudFront", kind: "tile" },
  "aws-route53": { aws: "NetworkingContentDelivery/Route53", kind: "tile" },
  "aws-sns": { aws: "ApplicationIntegration/SimpleNotificationService", kind: "tile" },
  "aws-ses": { aws: "BusinessApplications/SimpleEmailService", kind: "tile" },
  "aws-step-functions": { aws: "ApplicationIntegration/StepFunctions", kind: "tile" },
  "aws-elasticache": { aws: "Database/ElastiCache", kind: "tile" },
  "aws-vpc": { aws: "NetworkingContentDelivery/VirtualPrivateCloud", kind: "tile" },
  "aws-bedrock": { aws: "ArtificialIntelligence/Bedrock", kind: "tile" },
  "aws-sagemaker": { aws: "ArtificialIntelligence/SageMakerAI", kind: "tile" },
  "aws-elb": { aws: "NetworkingContentDelivery/ElasticLoadBalancing", kind: "tile" },
  "aws-waf": { aws: "SecurityIdentityCompliance/WAF", kind: "tile" },
  "aws-kinesis": { aws: "Analytics/Kinesis", kind: "tile" },
  "aws-msk": { aws: "Analytics/ManagedStreamingforApacheKafka", kind: "tile" },
  "aws-eventbridge": { aws: "ApplicationIntegration/EventBridge", kind: "tile" },
  "aws-cloudwatch": { aws: "ManagementGovernance/CloudWatch", kind: "tile" },
  "aws-secrets-manager": { aws: "SecurityIdentityCompliance/SecretsManager", kind: "tile" },
  "aws-kms": { aws: "SecurityIdentityCompliance/KeyManagementService", kind: "tile" },
  "aws-aurora": { aws: "Database/Aurora", kind: "tile" },
  "aws-redshift": { aws: "Analytics/Redshift", kind: "tile" },
  "aws-opensearch": { aws: "Analytics/OpenSearchService", kind: "tile" },
  "aws-efs": { aws: "Storage/EFS", kind: "tile" },
  "aws-glue": { aws: "Analytics/Glue", kind: "tile" },
  "aws-iam": { aws: "SecurityIdentityCompliance/IdentityandAccessManagement", kind: "tile" },
  "aws-shield": { aws: "SecurityIdentityCompliance/Shield", kind: "tile" },
  // A resource icon (no service icon exists): transparent, so it sits on the tile.
  "aws-nat-gateway": { aws: "NetworkingContentDelivery/VPCNATGateway", kind: "full" },
  "aws-xray": { aws: "DeveloperTools/XRay", kind: "tile" },
  "aws-athena": { aws: "Analytics/Athena", kind: "tile" },
  "aws-emr": { aws: "Analytics/EMR", kind: "tile" },
  "aws-neptune": { aws: "Database/Neptune", kind: "tile" },
  "aws-documentdb": { aws: "Database/DocumentDB", kind: "tile" },
  "aws-timestream": { aws: "Database/Timestream", kind: "tile" },
  "aws-memorydb": { aws: "Database/MemoryDB", kind: "tile" },
  "aws-glacier": { aws: "Storage/SimpleStorageServiceGlacier", kind: "tile" },
  "aws-ebs": { aws: "Storage/ElasticBlockStore", kind: "tile" },
  "aws-appsync": { aws: "ApplicationIntegration/AppSync", kind: "tile" },
  "aws-ecr": { aws: "Containers/ElasticContainerRegistry", kind: "tile" },
  "aws-iot-core": { aws: "InternetOfThings/IoTCore", kind: "tile" },
};

/** Namespaces of real technologies: each type there has a logo or a reason it has none. */
export const VENDOR_NAMESPACES = ["ai_platforms", "aws", "gcp", "azure", "vercel", "databases", "infra", "saas"];

const permissionOnly = "requires permission for any use of its logo";
/**
 * Vendor types that keep their glyph, and why. Don't give one a logo without
 * the owner's permission (or, for the "no logo" ones, a source that qualifies).
 */
export const NO_LOGO: Record<string, string> = {
  openai: `OpenAI ${permissionOnly}; Simple Icons dropped it in v16 for that reason`,
  gemini: `Google ${permissionOnly} outside its Cloud icon library`,
  slack: "Salesforce forbids altering its marks; Simple Icons dropped Slack in v16",
  twilio: "Twilio refused permission to icon libraries (Simple Icons v16)",
  sendgrid: "Twilio refused permission to icon libraries (Simple Icons v16)",
  segment: "a Twilio brand, and Twilio refused permission to icon libraries (Simple Icons v16)",
  dbt: `dbt Labs ${permissionOnly}; Simple Icons dropped it in v16`,
  docker: "Docker's trademark guidelines allow its logos only with Docker's authorization",
  cloudflare: `Cloudflare ${permissionOnly} (beyond its web badges)`,
  "cloudflare.workers": `Cloudflare ${permissionOnly} (beyond its web badges)`,
  "cloudflare.r2": `Cloudflare ${permissionOnly} (beyond its web badges)`,
  terraform: "HashiCorp allows its logos without permission only as a link to the project's site",
  vault: "HashiCorp allows its logos without permission only as a link to the project's site",
  consul: "HashiCorp allows its logos without permission only as a link to the project's site",
  postgres: "the PostgreSQL trademark policy needs permission for this use, and bars showing the logo beside other logos",
  "postgres.table": "the PostgreSQL trademark policy needs permission for this use, and bars showing the logo beside other logos",
  pgvector: "no logo of its own (and the PostgreSQL logo needs permission)",
  mysql: "Oracle's logos, MySQL's included, need a license from Oracle",
  apns: "Apple allows its logo only under an express written trademark license",
  haproxy: "no logo in our sources",
  loki: "no logo in our sources",
  zookeeper: "no logo in our sources",
  debezium: "no logo in our sources",
  ably: "no logo in our sources",
  jaeger: "no logo in our sources that reads at icon size",
  adyen: "its logo is a wordmark, unreadable at icon size",
  splunk: "its logo is a wordmark, unreadable at icon size",
};

/** Vendor groups without logos yet, and why. */
export const NO_LOGO_NAMESPACES: Record<string, string> = {
  gcp: "Google allows its logos without permission only from its own Cloud icon library (for architecture diagrams), which isn't vendored yet",
  azure: "Microsoft allows its icons only unedited from its official Azure icon set, which isn't vendored yet",
};

const require = createRequire(import.meta.url);
const read = (spec: string): string => readFileSync(require.resolve(spec), "utf8");
const r = (n: number) => Math.round(n * 1000) / 1000;

/** A square viewBox around a drawing with 10% padding, so logos sit like Phosphor's glyphs. */
const padded = (x: number, y: number, w: number, h: number): string => {
  const side = Math.max(w, h) * 1.25;
  return `${r(x - (side - w) / 2)} ${r(y - (side - h) / 2)} ${r(side)} ${r(side)}`;
};

/** Prefix the artwork's ids with its key, so two logos on one page never share a gradient. */
const scopeIds = (key: string, body: string): string => {
  let out = body;
  for (const [, id] of body.matchAll(/\bid="([^"]+)"/g)) {
    const esc = id!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out
      .replace(new RegExp(`\\bid="${esc}"`, "g"), `id="${key}-${id}"`)
      .replace(new RegExp(`url\\(#${esc}\\)`, "g"), `url(#${key}-${id})`)
      .replace(new RegExp(`href="#${esc}"`, "g"), `href="#${key}-${id}"`);
  }
  return out;
};

const hex = (c: string): string => {
  const h = c.startsWith("#") ? c.slice(1) : c;
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Not a #rrggbb color: ${c}`);
  return `#${h.toLowerCase()}`;
};

interface SimpleIcon {
  slug: string;
  hex: string;
  license?: { type: string };
}
let simpleIconsData: Map<string, SimpleIcon> | undefined;

function simpleIcon(slug: string, color?: string): { logo: Logo; credit: string } {
  simpleIconsData ??= new Map(
    (JSON.parse(read("simple-icons/icons.json")) as SimpleIcon[]).map((i) => [i.slug, i]),
  );
  const data = simpleIconsData.get(slug);
  if (!data) throw new Error(`No Simple Icons icon '${slug}'`);
  const svg = read(`simple-icons/icons/${slug}.svg`);
  // Every Simple Icons icon is one path on a 24 grid; anything else needs a look.
  const m = /^<svg role="img" viewBox="0 0 24 24" xmlns="http:\/\/www\.w3\.org\/2000\/svg"><title>[^<]*<\/title><path d="([^"]+)"\/><\/svg>\s*$/.exec(svg);
  if (!m) throw new Error(`Unexpected markup in Simple Icons' ${slug}.svg`);
  return {
    logo: { kind: "mono", color: hex(color ?? data.hex), viewBox: padded(0, 0, 24, 24), body: `<path fill="currentColor" d="${m[1]}"/>` },
    credit: `Simple Icons "${slug}" (${data.license?.type ?? "CC0-1.0"})`,
  };
}

/** Presentation attributes worth keeping from an <svg> root, moved onto a <g>. */
const INHERITED = ["fill", "fill-rule", "clip-rule", "fill-opacity", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"];

function lobeFile(key: string, file: string): { viewBox: [number, number, number, number]; body: string } {
  const svg = read(`@lobehub/icons-static-svg/icons/${file}.svg`).trim();
  const m = /^<svg([^>]*)>([\s\S]*)<\/svg>$/.exec(svg);
  if (!m) throw new Error(`Unexpected markup in Lobe Icons' ${file}.svg`);
  const attrs = Object.fromEntries([...m[1]!.matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [a[1]!, a[2]!]));
  const vb = (attrs.viewBox ?? "").split(/\s+/).map(Number);
  if (vb.length !== 4 || vb.some((n) => Number.isNaN(n))) throw new Error(`No viewBox in Lobe Icons' ${file}.svg`);
  const inner = m[2]!.replace(/<title>[^<]*<\/title>/g, "").replace(/\s*\n\s*/g, " ").trim();
  const keep = INHERITED.filter((a) => attrs[a] !== undefined).map((a) => ` ${a}="${attrs[a]}"`).join("");
  return { viewBox: vb as [number, number, number, number], body: scopeIds(key, keep ? `<g${keep}>${inner}</g>` : inner) };
}

interface IconifySet {
  width?: number;
  height?: number;
  icons: Record<string, { body: string; width?: number; height?: number; left?: number; top?: number }>;
}
let svgLogosData: IconifySet | undefined;

function svgLogos(key: string, name: string, mark?: string): Logo {
  svgLogosData ??= JSON.parse(read("@iconify-json/logos/icons.json")) as IconifySet;
  const icon = svgLogosData.icons[name];
  if (!icon) throw new Error(`No SVG Logos icon '${name}'`);
  const w = icon.width ?? svgLogosData.width ?? 16;
  const h = icon.height ?? svgLogosData.height ?? 16;
  const viewBox = padded(icon.left ?? 0, icon.top ?? 0, w, h);
  if (mark === undefined) return { kind: "full", viewBox, body: scopeIds(key, icon.body) };
  // One-colour artwork: paint it with currentColor, in that same colour.
  const colours = new Set([...icon.body.matchAll(/fill="([^"]+)"/g)].map((f) => f[1]!.toLowerCase()));
  if (colours.size > 1) throw new Error(`SVG Logos' ${name} has more than one colour: ${[...colours].join(", ")}`);
  const body = icon.body.replace(/fill="[^"]+"/g, 'fill="currentColor"');
  return { kind: "mono", color: hex(mark), viewBox, body: `<g fill="currentColor">${body}</g>` };
}

function awsIcon(file: string, kind: "tile" | "full"): Logo {
  const png = readFileSync(new URL(`../vendor/aws/${file}.png`, import.meta.url));
  // Width and height from the IHDR chunk; awslabs renders most at 64px, a few smaller.
  const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
  if (w !== h) throw new Error(`vendor/aws/${file}.png isn't square`);
  return {
    kind,
    viewBox: `0 0 ${w} ${h}`,
    body: `<image href="data:image/png;base64,${png.toString("base64")}" width="${w}" height="${h}"/>`,
  };
}

function build(key: string, source: Source): { logo: Logo; credit: string } {
  if ("simpleIcons" in source) return simpleIcon(source.simpleIcons, source.color);
  if ("lobe" in source) {
    const { viewBox: [x, y, w, h], body } = lobeFile(key, source.lobe);
    return { logo: { kind: "mono", color: hex(source.color), viewBox: padded(x, y, w, h), body }, credit: `Lobe Icons "${source.lobe}" (MIT)` };
  }
  if ("lobeColor" in source) {
    const { viewBox: [x, y, w, h], body } = lobeFile(key, `${source.lobeColor}-color`);
    return { logo: { kind: "full", viewBox: padded(x, y, w, h), body }, credit: `Lobe Icons "${source.lobeColor}-color" (MIT)` };
  }
  if ("svgLogos" in source) return { logo: svgLogos(key, source.svgLogos, source.mark), credit: `SVG Logos "${source.svgLogos}" (CC0-1.0)` };
  return { logo: awsIcon(source.aws, source.kind), credit: `AWS Architecture Icons "${source.aws}" (CC-BY-ND-2.0)` };
}

const built = (): [string, { logo: Logo; credit: string }][] =>
  Object.entries(LOGO_SOURCES).map(([key, source]) => [key, build(key, source)]);

export const buildLogos = (): Record<string, Logo> =>
  Object.fromEntries(built().map(([key, { logo }]) => [key, logo]));

const quote = (s: string): string => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

/** The source of src/logos.ts. */
export function logosModule(): string {
  const entries = built()
    .map(([key, { logo, credit }]) => {
      const fields = [
        `kind: "${logo.kind}"`,
        ...(logo.color ? [`color: "${logo.color}"`] : []),
        `viewBox: "${logo.viewBox}"`,
        `body: ${quote(logo.body)}`,
      ];
      return `  // ${credit}\n  ${/^[a-z]\w*$/.test(key) ? key : `"${key}"`}: { ${fields.join(", ")} },\n`;
    })
    .join("");
  return `// Generated by scripts/logos.ts. Don't edit by hand: change LOGO_SOURCES there,
// then run \`pnpm --filter @archer/catalog logos\`.

/**
 * Product logos and vendor icons for catalog types (CatalogType.logo), each
 * noted with its source. Logos are trademarks of their owners, used only to
 * identify their products. Sources:
 * - Simple Icons (https://simpleicons.org): CC0-1.0, except where an icon
 *   notes its own license (Apache-2.0 for Apache project logos; Keycloak's
 *   follows the Linux Foundation's trademark usage guidelines).
 * - Lobe Icons (https://github.com/lobehub/lobe-icons): MIT, Copyright (c)
 *   2023 LobeHub.
 * - SVG Logos by Gil Barbara (https://github.com/gilbarbara/logos): CC0-1.0.
 * - AWS Architecture Icons (vendor/aws): © Amazon Web Services, Inc. or its
 *   affiliates, CC BY-ND 2.0, from awslabs/aws-icons-for-plantuml, unchanged.
 */
import type { Logo } from "./index";

export const LOGOS: Readonly<Record<string, Logo>> = {
${entries}};
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = new URL("../src/logos.ts", import.meta.url);
  writeFileSync(out, logosModule());
  console.log(`wrote ${fileURLToPath(out)}`);
}
