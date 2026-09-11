export const SAMPLE = `arch "Acme SaaS" v0.1

component web "Next.js App" @vercel.nextjs {
  desc "App shell + marketing. RSC, deployed on Vercel."
}

component backend "Backend" @vercel {
  desc "Everything server-side lives on Vercel."

  component api "API" @vercel.functions {
    desc "Route handlers. Auth via session cookie."
    endpoints table \`\`\`
    | method | path            | purpose            |
    | ------ | --------------- | ------------------ |
    | POST   | /api/checkout   | create session     |
    | GET    | /api/projects   | list projects      |
    \`\`\`
  }

  component db "Postgres" @supabase.postgres {
    desc "Primary datastore."
    schema json \`\`\`
    {
      "users":    { "id": "uuid pk", "email": "text unique" },
      "projects": { "id": "uuid pk", "owner_id": "uuid fk users.id" }
    }
    \`\`\`
  }
}

component auth "Auth Service" {
  desc "Our own thin wrapper over Cognito — issues sessions."
}

component cognito "Cognito" @aws.cognito
component stripe "Stripe" @stripe

web -> auth @http : "login"
web -> backend.api @http
auth -> cognito @http
backend.api -> backend.db @sql
backend.api -> stripe @http : "checkout sessions"

layout {
  web: { at: [0, 3], size: [4, 3] }
  auth: { at: [0, 8], size: [4, 3] }
  backend: { at: [6, 0], size: [13, 10], display: plane }
  backend.api: { at: [1, 2], size: [4, 3] }
  backend.db: { at: [8, 2], size: [4, 3] }
  cognito: { at: [0, 13], size: [4, 3] }
  stripe: { at: [21, 3], size: [4, 3] }
}
`;
