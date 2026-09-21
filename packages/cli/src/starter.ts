import { format, parse } from "@archer/lang";

/**
 * The document `archer init` writes: small, valid, and showing each construct
 * once. No `#` comments — canonical form (fmt, push/pull) drops them.
 */
export const starterSource = (title: string): string =>
  format(
    parse(`arch ${JSON.stringify(title)} v0.1

component web "Web App" @vercel.nextjs {
  desc "What users see. Replace these components with your own."
  src "apps/web"
}

component backend "Backend" {
  desc "Nest components to group them."

  component api "API" {
    desc "Request handlers."
  }

  component db "Database" @supabase.postgres
}

web -> backend.api @http : "fetch"
backend.api -> backend.db @sql
`).doc,
  );
