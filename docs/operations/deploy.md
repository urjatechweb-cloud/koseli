---
title: CI and deployment
type: operation
created: 2026-11-04
updated: 2026-11-04
sources:
  - code: .github/workflows/ci.yml
  - code: vercel.json
  - code: next.config.mjs
  - code: Dockerfile
  - code: docker-compose.yml
  - code: .dockerignore
verified_at: 9699a57
---

# CI and deployment

The pipeline is a single workflow, `.github/workflows/ci.yml`. It has two jobs:

| Job | Runs on | What it does |
|---|---|---|
| `test` | every push and every pull request | Starts a fresh Postgres 16, applies migrations, checks schema drift, seeds, type-checks, runs the tests (including the database test), lints the docs and builds |
| `deploy` | push to `main`, only after `test` passes | Applies migrations to the production database, then builds and deploys to Vercel with the CLI |

## One-time setup

1. **Supabase.** Create a project and copy two connection strings: the pooled one
   (port 6543, add `?pgbouncer=true`) becomes `DATABASE_URL`; the direct one (port 5432)
   becomes `DIRECT_URL`.
2. **Vercel.** Import the GitHub repo.
   - Under Settings, Environment Variables, add the runtime variables. The full list is
     in `.env.example`; for a team preview you need at least `DATABASE_URL`,
     `DIRECT_URL`, `SESSION_SECRET`, `APP_URL`, `CRON_SECRET` and `DEMO_PAYMENTS`.
   - Create a token under Account, Tokens.
   - Run `npx vercel link` locally once. `.vercel/project.json` then holds the org id and
     project id.
3. **GitHub.** Under Settings, Environments, create an environment called `production`
   and add these secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`,
   `DATABASE_URL` and `DIRECT_URL`.
4. Seed the production database once: `npx prisma db seed`, with the production URLs in
   your shell.

Until those secrets exist, `deploy` prints a warning and skips itself; `test` still runs.

> ⚠️ `vercel.json` sets `git.deploymentEnabled: false` so that only the workflow deploys.
> If Vercel's own Git integration also deployed, it could publish a commit whose tests
> failed, or deploy code before its migration has run. Exactly how Vercel applies this
> setting is unverified.

> ⚠️ The schema-drift check compares the freshly migrated CI database with
> `schema.prisma` (`migrate diff --from-url … --exit-code`). It fails with exit code 2
> when someone edits the schema without adding a migration. Do not point
> `--shadow-database-url` at `DATABASE_URL`: Prisma wipes the shadow database.

> ⚠️ Adding values to an enum requires `migrate dev`, which refuses to run
> non-interactively. Generate the SQL with `migrate diff --from-migrations` and a
> **separate, throwaway** shadow database instead (see [[pricing-and-fx]]).

> ⚠️ The deploy job never cancels a run that is in progress
> (`cancel-in-progress: false`). Killing `prisma migrate deploy` halfway can leave a
> migration marked as failed in production.

> ⚠️ Migrations run before the new code goes live, so the old code briefly runs against
> the new schema. Keep migrations additive: add columns or tables first, and remove old
> ones in a later deploy.

> ⚠️ `DEMO_PAYMENTS=true` is acceptable on a team-only preview. Remove it before the site
> is public: it lets anyone mark an order paid without paying (see [[payments]]).

## Self-hosting (Docker)

- `Dockerfile` builds Next.js in standalone mode (`NEXT_OUTPUT=standalone`; see
  `next.config.mjs`) into a slim image that runs as a non-root user.
- Run `prisma migrate deploy` as a separate release step, not when the container
  starts.
- `docker compose up --build` starts Postgres, runs the migrations and seed, then serves
  the app on port 3000 with demo payments on.

> ⚠️ The image has not been built here because the build sandbox has no Docker daemon.
> The standalone server it runs was built and served pages from Postgres.
