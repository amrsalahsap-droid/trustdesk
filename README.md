# TrustDesk

Production-oriented foundation for a **multi-tenant B2B SaaS** (Next.js App Router, TypeScript strict, Prisma, PostgreSQL, Zod, Vitest).

## Requirements

- Node.js 20+
- PostgreSQL

## Setup

1. Clone the repository and install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables and edit `DATABASE_URL`:

   ```bash
   cp .env.example .env
   ```

3. Apply database migrations (creates tables from [`prisma/schema.prisma`](prisma/schema.prisma)):

   ```bash
   npx prisma migrate dev
   ```

4. Generate the Prisma Client (also run automatically after `migrate`):

   ```bash
   npm run db:generate
   ```

5. Start the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). Sign up at [`/signup`](http://localhost:3000/signup), log in at [`/login`](http://localhost:3000/login). Health check: [`/api/health`](http://localhost:3000/api/health).

## Environment

| Variable          | Required | Description                                                                                                       |
| ----------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`    | Yes      | PostgreSQL connection string                                                                                      |
| `NODE_ENV`        | Yes\*    | `development`, `production`, or `test` (\*defaults to `development` if unset in app code paths that validate env) |
| `SESSION_SECRET`  | Yes      | At least 32 characters; used to sign the `td_session` httpOnly cookie. Use a strong random value in production.   |

### Onboarding / tailoring feature flags

These control the phased onboarding intelligence rollout (see [`src/lib/feature-flags/onboarding-flags.ts`](src/lib/feature-flags/onboarding-flags.ts)). In **production** they default to **off** unless set to `1` / `true`. In **non-production** they default **on** so local/staging exercises the new paths.

| Variable | Phase | Description |
| -------- | ----- | ----------- |
| `TRUSTDESK_FAIL_CLOSED_INFERENCE` | 1 | Weak crawl / thin evidence → no `deepProfileJson` persistence; `weak_signals` analysis status. |
| `TRUSTDESK_ROBUST_CRAWLER` | 2 | Shorter HTTP timeouts, retries, redirect trace via `getWithTrace`; nested sitemap discovery. |
| `TRUSTDESK_STRICT_INFERENCE` | 3 | Zod gate on AI JSON; strip uncited HYPOTHESIZED/DERIVED signals before capping confidence. |
| `TRUSTDESK_DOC_TYPE_TAILORING` | 4 | Per-document brief LLM calls, document-type rules, template prompt without library boilerplate, stronger quality gate. |
| `TRUSTDESK_RENDERED_FALLBACK` | SPA rescue | Optional Playwright Chromium render for thin static HTML on high-signal pages. **Off in production by default**; on in non-prod. Requires a local Chromium install (see below). |
| `TRUSTDESK_ONBOARDING_CANARY_PCT` | Rollout | When set to `1`–`99` in production, enabled flags apply only to that percentage of workspaces (hash of `workspaceId`). |

**Headless Chromium (optional):** for `TRUSTDESK_RENDERED_FALLBACK`, install browsers once per machine:

```bash
npx playwright install chromium
```

**Rollout:** enable flags in staging → run `npm run eval:tailoring` → canary with `TRUSTDESK_ONBOARDING_CANARY_PCT=10` → promote after metrics are green.

Server-side code validates env via [`src/lib/env/server.ts`](src/lib/env/server.ts) (fail-fast on missing/invalid values). [`instrumentation.ts`](instrumentation.ts) loads that module when the Node server starts.

## Auth (MVP)

- **Signup:** `POST /api/auth/signup` — body `{ name?, email, password }` (password min 8 chars). Creates user with bcrypt-hashed password, sets session cookie, returns `{ user, next }` where `next` is `/onboarding` or `/app` based on workspace membership.
- **Login:** `POST /api/auth/login` — body `{ email, password }`.
- **Current user:** `GET /api/auth/me` — returns `{ user }` or `401` if unauthenticated.

Session is a signed token in the **`td_session`** httpOnly cookie (see [`src/lib/auth/session-token.ts`](src/lib/auth/session-token.ts)). Server identity resolution: [`src/lib/auth/session.ts`](src/lib/auth/session.ts) + [`src/lib/auth/resolve-identity.ts`](src/lib/auth/resolve-identity.ts).

## Scripts

| Script             | Command                |
| ------------------ | ---------------------- |
| Dev                | `npm run dev`          |
| Build              | `npm run build`        |
| Start (production) | `npm run start`        |
| Lint               | `npm run lint`         |
| Format             | `npm run format`       |
| Format (check)     | `npm run format:check` |
| Typecheck          | `npm run typecheck`    |
| Tests              | `npm run test`         |

## Prisma

| Command               | Description                         |
| --------------------- | ----------------------------------- |
| `npm run db:generate` | `prisma generate`                   |
| `npm run db:migrate`  | `prisma migrate dev`                |
| `npm run db:push`     | `prisma db push` (prototyping only) |

Prisma client singleton: [`src/lib/db/prisma.ts`](src/lib/db/prisma.ts).

## Project structure

```text
src/
  app/                 # Next.js App Router (pages, API routes)
    api/
    signup/ login/ onboarding/ app/  # Auth & entry routes
  lib/
    db/                # Prisma client
    env/               # Zod-validated server environment
    utils/             # e.g. slugify
    logging/           # Structured logger
    auth/              # Session + workspace auth (feature layer)
    api/               # API error helpers
  modules/
    users/             # User domain (placeholder)
    workspaces/        # Workspace + onboarding creation services
    onboarding/        # Re-exports for onboarding flows
  types/               # Shared TS types
tests/                 # Vitest tests (root), plus `**/__tests__` under src
prisma/
  schema.prisma
  migrations/
```

## Stack note

This repo uses the **current** Next.js major version from `create-next-app` (see `package.json`). The App Router and strict TypeScript match a “Next 14+” style setup; to pin an older major, adjust dependencies in a dedicated change.

## License

Private / unlicensed unless you add one.
