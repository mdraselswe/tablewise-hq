# ADR 0007: Single container serving API and web app, deployed on Render

- Status: accepted
- Date: 2026-11-24

## Context

The brief asks for a Dockerfile, docker-compose and a deployed instance. Reviewers should be able to open one URL and use the system, and local runs should match production.

## Decision

- Build one image with a multi-stage Dockerfile: install with pnpm, build the web app (Vite) and the API (esbuild bundle), then copy only production dependencies, the bundle, the migrations and the web build into a slim Node.js runtime image.
- The API serves the built web app from `WEB_DIST_DIR` on the same origin (fingerprinted assets with long-lived immutable caching, `index.html` for client-side routes).
- On boot the process applies migrations (advisory-locked, so safe with several instances) and, when `SEED_DEMO_DATA` is set and the database is empty, seeds the demo data in the background.
- Deploy the image on Render as a web service with Render's managed PostgreSQL. `docker-compose.yml` runs the same image locally with PostgreSQL 18.

## Alternatives considered

- **Separate static hosting for the web app** (CDN plus API on another domain). Better at large scale, but needs CORS and cross-site cookies (SameSite=None), which weakens CSRF protection for no benefit at this size.
- **Kubernetes or a VM.** More control, far more operations work for a demo of this size.
- **Serverless functions.** Long-lived SSE connections, the outbox relay and the `LISTEN` connection do not fit a request-scoped runtime.

## Consequences

- One URL, one origin, no CORS, simple cookies.
- Identical image locally (`docker compose up --build`) and in production.
- Render's free PostgreSQL instance expires after 30 days; a paid instance or another managed PostgreSQL is needed for anything longer-lived. The app needs only a `DATABASE_URL` to move.
- When the web app moves to a CDN later, the API keeps working unchanged; only `WEB_DIST_DIR` is unset.
