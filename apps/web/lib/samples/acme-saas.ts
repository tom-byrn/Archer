const FENCE = "```";

export const ACME_SAAS = `arch "Acme SaaS" v0.1

component web "Next.js App" @vercel.nextjs {
  desc "App shell + marketing. RSC, deployed on Vercel."
}

component backend "Backend" @vercel {
  desc "Everything server-side lives on Vercel."
  component api "API" @vercel.functions {
    desc "Route handlers. Auth via session cookie."
    endpoints table ${FENCE}
    | method | path            | purpose            |
    | ------ | --------------- | ------------------ |
    | POST   | /api/checkout   | create session     |
    | GET    | /api/projects   | list projects      |
    ${FENCE}
  }
  component db "Postgres" @supabase.postgres {
    desc "Primary datastore."
    schema json ${FENCE}
    {
      "users":    { "id": "uuid pk", "email": "text unique" },
      "projects": { "id": "uuid pk", "owner_id": "uuid fk users.id" }
    }
    ${FENCE}
  }
}

component auth "Auth Service" {
  desc "Our own thin wrapper over Cognito — issues sessions."
}

component cognito "Cognito" @aws.cognito

component stripe "Stripe" @stripe

auth -> cognito @http
backend.api -> backend.db @sql

backend.api -> stripe @http : "checkout sessions" {
  request json ${FENCE}
  {
    "price_id": "string",
    "success_url": "url",
    "cancel_url": "url"
  }
  ${FENCE}
}

web -> auth @http : "login"
web -> backend.api @http

layout {
  auth: { at: [0, 8], size: [4, 3] }
  backend: { at: [6, 0], size: [13, 6], display: plane }
  backend.api: { at: [1, 2], size: [4, 3] }
  backend.db: { at: [8, 2], size: [4, 3] }
  cognito: { at: [0, 13], size: [4, 3] }
  stripe: { at: [7, 9], size: [4, 3] }
  web: { at: [0, 3], size: [4, 3] }
}
`;
