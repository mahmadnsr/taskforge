# Phase 1 summary: Auth + Multi-tenant RBAC backend

**Stack:** NestJS (ESM), GraphQL code-first (Apollo), Prisma 6, Neon PostgreSQL, pnpm, Vitest

## Day-wise

| Day | Kya bana | Key cheezein |
|---|---|---|
| **1** | Project foundation | NestJS + GraphQL setup, ESM choose kiya, `ConfigModule`, global `ValidationPipe`, `.js` import rule |
| **2** | Database connection | Prisma + Neon (pooled `DATABASE_URL` aur `DATABASE_URL_UNPOOLED` as `directUrl`), `PrismaService` and `PrismaModule` |
| **3** | Schema design | `User`, `Organization`, `OrganizationMember` (role per org), `RefreshToken`, relations, migration |
| **4** | Registration | `register` mutation: User, Organization aur ADMIN membership ek `$transaction` me, bcrypt (12 rounds), duplicate email (P2002 race handling), DTO validation |
| **5** | Login + tokens | JWT access token (15m), refresh token (random, SHA-256 hash DB me), rotation, logout (revoke), timing-attack se bachav (DUMMY_HASH), generic error messages |
| **6** | Authorization | `JwtAuthGuard`, `@CurrentUser()`, `@Roles()` + `RolesGuard` (role JWT me nahi, DB se `x-organization-id` ke saath), tenant isolation |
| **7** | Security aur quality | Helmet, CORS allowlist, rate limiting (5/min login/register/refresh), env validation, safe GraphQL errors, sensitive data audit, 15 automated tests, cleanup, 14-case manual matrix |

## Design decisions jo interview me bolne layak hain

1. **Role JWT me nahi:** user ke alag orgs me alag roles ho sakte hain aur role change turant effect karta hai (stale permissions nahi).
2. **Refresh token rotation + hashed storage:** DB leak ho to bhi raw tokens nahi milte; purana token reuse nahi ho sakta.
3. **Same error message** (member na ho ya org exist hi na kare, user na ho ya password galat): user/org enumeration nahi.
4. **Transaction me register:** teeno rows ya to sab bante hain ya koi nahi.
5. **Production me asli errors client ko nahi:** server log me rehte hain.
6. **Simple layering:** Resolver, Service, Prisma. Over-engineering (repository layers) jaanbujhkar nahi kiya.

## Security checklist (ho gaya)

Password hashing, JWT expiry, refresh rotation, RBAC, tenant isolation, Helmet, CORS allowlist, rate limiting, env fail-fast, stack trace hidden, `passwordHash` kabhi response ya logs me nahi, `.env` git me nahi.

## Quality

- 8 test files, 15 tests pass (`RolesGuard` ke 7 unit tests Prisma mock karke)
- `pnpm build` clean
- GitHub par saaf commits pushed (`mahmadnsr/work-bench`)
- Notes: day1 se day7 tak (day6 aur day7 ke notes aur test matrix repo me commit karne baaki hain)

## Is Phase se jo seekha (resume/interview ke liye)

JWT aur refresh token flows, bcrypt aur timing attacks, Prisma transactions aur migrations, NestJS guards/decorators/DI, GraphQL context aur error formatting, rate limiting, CORS vs server-side security, mock-based unit testing, aur debugging (env, ports, ESM, TypeScript, Neon cold starts).

## Resume line ka draft

> Built a multi-tenant SaaS backend (NestJS, GraphQL, Prisma, PostgreSQL) with JWT auth, hashed refresh-token rotation, organization-scoped RBAC (Admin/Manager/Employee), rate limiting, Helmet/CORS hardening, and unit-tested authorization guards.

## Baaki kya hai

1. `day6.md`, `day7.md`, `day7-test-matrix.md` repo me commit aur push karna.
2. Matrix rows 12 aur 13 ka result notes me bharna.
3. Throttler fix (`TOO_MANY_REQUESTS`) ek baar test karna.
4. Phase 2 ka plan. Tumhare paas day-wise plan ho to bhejo, warna main bana dunga (pehle ye tay hoga ki projects/tasks pehle aate hain ya Redis).