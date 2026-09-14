# Coworking Booking API

Backend for a coworking room booking system.

## Stack

- Node.js + Express
- TypeScript (strict, ESM)
- Prisma ORM + PostgreSQL
- Zod for validation
- JWT for authentication
- Vitest + supertest for tests

## Prerequisites

- Node.js 22.12+ (required by Vitest; check with `node --version`)
- Docker (for PostgreSQL)

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Environment variables**

   Copy `.env.example` to `.env` and fill in the values:

   ```bash
   cp .env.example .env
   ```

   - `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`: used by `docker-compose.yml` to configure the Postgres container.
   - `DATABASE_URL`: connection string Prisma uses, must match the Postgres credentials above (e.g. `postgresql://<user>:<password>@localhost:5432/<db>?schema=public`).
   - `TEST_DATABASE_URL`: same credentials as `DATABASE_URL`, but pointing at a separate database (`coworking_booking_test`) used exclusively by the test suite (see [Testing](#testing)).
   - `JWT_SECRET`: at least 32 characters. Generate one with `openssl rand -base64 32`.
   - `ADMIN_SEED_NAME` / `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD`: used only by the seed script (see below) to create an admin user.

3. **Start PostgreSQL**

   ```bash
   docker compose up -d
   ```

4. **Run migrations**

   ```bash
   npm run prisma:migrate
   ```

   This applies the initial migration and automatically runs the seed script (configured via `"prisma": { "seed": ... }` in `package.json`), creating the admin user from `ADMIN_SEED_*`. If you ever need to re-run just the seed later, use `npm run prisma:seed`.

5. **Start the dev server**

   ```bash
   npm run dev
   ```

   The API listens on `http://localhost:3000` by default (`PORT` in `.env`). Check `GET /health`.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the dev server with auto-reload |
| `npm run build` | Compile to `dist/` (production build, excludes tests) |
| `npm run start` | Run the compiled build (`dist/server.js`) |
| `npm run typecheck` | Type-check the whole project (including tests) without emitting |
| `npm run test` | Run the test suite once |
| `npm run prisma:generate` | Regenerate the Prisma Client from `schema.prisma` |
| `npm run prisma:migrate` | Apply Prisma migrations (dev) |
| `npm run prisma:deploy` | Apply Prisma migrations (production) |
| `npm run prisma:studio` | Open Prisma Studio (visual DB browser) |
| `npm run prisma:seed` | Create/update the admin user from `ADMIN_SEED_*` env vars |
| `npm run prisma:seed:dev` | Populate sample data (users, rooms, bookings) for local manual testing — see [Sample data](#sample-data) |

## Project structure

Feature-based modules, with a `shared/` folder for cross-cutting code:

```
src/
  modules/
    auth/       # register, login, JWT middleware (authenticate, authorize)
    rooms/      # list/create rooms, availability
    bookings/   # list/create/cancel bookings
  shared/
    config/     # env validation, business-hours config
    errors/     # AppError + centralized error handler
    db/         # Prisma client singleton
    types/      # shared types (e.g. AuthenticatedRequest)
    utils/      # cross-cutting helpers (e.g. business-hours check)
  app.ts        # Express app setup
  server.ts     # entrypoint (starts the HTTP server)
prisma/
  schema.prisma
  migrations/
  seed.ts
```

Each module has its own `*.http` file (e.g. `src/modules/auth/auth.http`) with ready-to-run requests for manual testing via the [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) VS Code extension.

## Sample data

For local manual testing (e.g. via the `.http` files), there's a separate command to populate the database with sample data — a few regular users, rooms, and bookings:

```bash
npm run prisma:seed:dev
```

This is **strictly a local development tool**, completely independent from `prisma/seed.ts`:

- `prisma/seed.ts` is the only script wired to Prisma's `"prisma": { "seed": ... }` hook in `package.json`. It only ever creates the single admin user from `ADMIN_SEED_*`, so its content is safe to run in any environment, including production — but the automatic trigger only exists in local development: `prisma migrate dev` (used in dev, via `npm run prisma:migrate`) runs it automatically, while `prisma migrate deploy` (used in production, via `npm run prisma:deploy`) does not. In production, run it explicitly with `npm run prisma:seed` if/when you need to (re)create the admin user.
- `prisma/seed-dev-data.ts` (run via `npm run prisma:seed:dev`) is **never** run automatically by anything — it has to be invoked by hand. There is no code path that could trigger it in production.

It's idempotent: running it multiple times won't create duplicate users, rooms, or bookings.

Sample users created (role `USER`), all with password `password123`:

- `user1@example.com`
- `user2@example.com`
- `user3@example.com`

## Business rules

- The coworking operates 8:00–20:00, Argentina time (`America/Argentina/Buenos_Aires`). A booking must fall within a single day and within these hours.
- Creating a booking is rejected if it overlaps another (non-cancelled) booking for the same room.
- Cancelling a booking is a soft delete (`status` set to `CANCELLED`) — booking history is never deleted, and cancelling an already-cancelled booking returns an error (not idempotent).

See `AGENTS.md` for the full data model, endpoints, and business rules.

## Testing

Tests run against a real PostgreSQL instance (integration tests, not mocks), but a **separate database** from the one you use for development:

- Dev server (`npm run dev`) → `DATABASE_URL` → database `coworking_booking`.
- Tests (`npm run test`) → `TEST_DATABASE_URL` → database `coworking_booking_test`.

Same Postgres container, two different databases inside it. This means the test suite can never leave leftover data in the database you're using to try out the app manually via the `.http` files.

```bash
npm run test
```

That's the only command you need to run. Two things happen automatically before the tests start:

1. **Database creation**: `coworking_booking_test` is created by `docker/init-test-db.sh`, which Postgres runs automatically the first time the container starts with a fresh data volume (a built-in behavior of the official `postgres` Docker image).
2. **Schema migration**: a Vitest `globalSetup` step runs `prisma migrate deploy` against `coworking_booking_test`, so it's always up to date with the latest schema. You never need to migrate the test database by hand.
