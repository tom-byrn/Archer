import { format, parse } from "@archer/lang";

/**
 * The document `archer init` writes: small, valid, and showing each construct
 * once. No `#` comments — canonical form (fmt, push/pull) drops them.
 */
export const starterSource = (title: string): string =>
  format(
    parse(`arch ${JSON.stringify(title)} v0.2

component web "Web App" @vercel.nextjs {
  desc "What users see. Replace these components with your own."
  src "apps/web"
}

plane backend "Backend" {
  desc "A plane groups components on the canvas. It isn't part of their paths."

  component api "API" {
    icon api
    desc "Request handlers. Components nest: open this one to see its parts."

    component auth "Auth" {
      icon key
      desc "Sessions and sign-in."
    }
  }

  component db "Database" @supabase.postgres {
    shape cylinder
  }
}

web -> api @http : "fetch"
api -> db @sql
api.auth -> db @sql : "sessions"
`).doc,
  );
