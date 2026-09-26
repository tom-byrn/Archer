/** The document the landing-page sandbox starts from: small enough to read at a glance. */
const BODY = `arch "Acme" v0.2

component web "Web app" @vercel.nextjs
component auth "Auth" @clerk

plane backend "Backend" {
  component api "API" @vercel.functions
  component db "Postgres" @supabase.postgres
}

component billing "Billing" @stripe

web -> api @http
web -> auth @http : "sign in"
api -> db @sql
api -> billing @http : "checkout"
`;

// API and Postgres sit on the Backend plane, so their `at` is relative to it.
const WIDE = `layout {
  web: { at: [0, 3], size: [4, 3] }
  auth: { at: [0, 9], size: [4, 3] }
  backend: { at: [6, 1], size: [12, 6] }
  api: { at: [1, 2], size: [4, 3] }
  db: { at: [7, 2], size: [4, 3] }
  billing: { at: [7, 9], size: [4, 3] }
}
`;

// Two columns, so the boxes stay a readable size on a phone.
const NARROW = `layout {
  web: { at: [1, 0], size: [4, 3] }
  auth: { at: [8, 0], size: [4, 3] }
  backend: { at: [0, 5], size: [6, 11] }
  api: { at: [1, 2], size: [4, 3] }
  db: { at: [1, 7], size: [4, 3] }
  billing: { at: [8, 7], size: [4, 3] }
}
`;

export const LANDING_SAMPLE = `${BODY}\n${WIDE}`;
export const LANDING_SAMPLE_NARROW = `${BODY}\n${NARROW}`;
