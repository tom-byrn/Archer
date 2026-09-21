/** The document the landing-page sandbox starts from: small enough to read at a glance. */
const BODY = `arch "Acme" v0.1

component web "Web app" @vercel.nextjs
component api "API" @vercel.functions
component auth "Auth" @clerk
component db "Postgres" @supabase.postgres
component billing "Billing" @stripe

web -> api @http
web -> auth @http : "sign in"
api -> db @sql
api -> billing @http : "checkout"
`;

const WIDE = `layout {
  web: { at: [0, 3], size: [4, 3] }
  auth: { at: [0, 9], size: [4, 3] }
  api: { at: [7, 3], size: [4, 3] }
  db: { at: [14, 0], size: [4, 3] }
  billing: { at: [14, 6], size: [4, 3] }
}
`;

// Two columns, so the boxes stay a readable size on a phone.
const NARROW = `layout {
  web: { at: [0, 0], size: [4, 3] }
  auth: { at: [7, 0], size: [4, 3] }
  api: { at: [0, 5], size: [4, 3] }
  billing: { at: [7, 5], size: [4, 3] }
  db: { at: [0, 10], size: [4, 3] }
}
`;

export const LANDING_SAMPLE = `${BODY}\n${WIDE}`;
export const LANDING_SAMPLE_NARROW = `${BODY}\n${NARROW}`;
