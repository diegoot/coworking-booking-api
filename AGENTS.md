# Coworking Booking API

Backend for a coworking room booking system.

## Stack

- Node.js + Express
- TypeScript
- Prisma ORM
- PostgreSQL (running in Docker, `postgres:16` image)
- Zod for validation
- JWT for authentication (login/register)
- ESM (import/export), not CommonJS

## Data Model (Prisma schema)

```
User
- id
- name
- email (unique)
- password (hashed with bcrypt)
- role (enum: ADMIN, USER)
- createdAt

Room
- id
- name
- capacity (number of people)
- pricePerHour
- createdAt

Booking
- id
- userId → relation to User
- roomId → relation to Room
- startTime (DateTime)
- endTime (DateTime)
- status (enum: PENDING, CONFIRMED, CANCELLED)
- createdAt
```

Relations: User 1—N Booking, Room 1—N Booking.

## Business Rules

1. The coworking operates 8:00–20:00, Argentina time (America/Argentina/Buenos_Aires). A Booking must always fall within a single day and within these business hours — it can never span across midnight or fall outside 8:00–20:00.

2. When creating a Booking, reject it if there's a time overlap for the same room:

   ```
   startTime < existing.endTime AND endTime > existing.startTime
   ```

   Return a clear error when there's a conflict.

3. Cancelling a Booking (`DELETE /bookings/:id`) is a soft delete: it sets `status` to `CANCELLED`, it never deletes the row, preserving booking history. Cancelling a Booking that is already `CANCELLED` is an error (409 Conflict), not a no-op — this action is not idempotent by design.

## Endpoints

```
POST   /auth/register
POST   /auth/login
GET    /rooms                        (public)
GET    /rooms/:id                    (public)
POST   /rooms                        (admin only)
GET    /rooms/:id/availability?date= (requires auth, free/busy slots for that day)
GET    /bookings/me                  (requires auth, own bookings only)
GET    /bookings/:userId             (admin only, bookings for any user)
POST   /bookings                     (requires auth, validates overlap)
DELETE /bookings/:id                 (booking owner or admin only)
```

## Guidelines

- Feature-based folder structure (modules/auth, modules/bookings, modules/rooms, modules/users) with a shared/ folder for cross-cutting code (see backend-architect-agent for details)
- Strict TypeScript typing (tsconfig with strict mode)
- JWT authentication middleware and role-based authorization middleware
- Centralized error-handling middleware
- `docker-compose.yml` with the Postgres service
- Environment variables in `.env` (DATABASE_URL, JWT_SECRET)
- Prisma schema + initial migration
- README with instructions to run the project (docker-compose up, prisma migrate, npm run dev)