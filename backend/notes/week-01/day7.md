# Day 7: Security Hardening, Cleanup & Testing (Phase-01 Final Day)

> **Rule of the day:** koi naya feature nahi. Jo bana hai (Auth + RBAC) usse secure, clean aur tested banana. Ye Phase-01 ka integration day hai.

---

## 1. Goal

Backend ko "demo" se "production-minded" banana:

1. HTTP security headers (**Helmet**) aur **CORS** allowlist
2. **Rate limiting** (brute-force se bachav)
3. **Environment variables validation** (fail fast) + `.env.example`
4. **Safe error responses** (stack trace / internal details leak na ho)
5. **Sensitive data audit** (password return ya logging na ho)
6. **Automated tests** (Vitest) + code cleanup (Resolver -> Service -> Prisma)
7. **Manual testing matrix** (14 cases) + clean **git commits**

### Day 7 plan checklist (original plan se)

```
SECURITY
[x] CORS configuration
[x] Helmet
[x] Rate limiting foundation
[x] Environment variables properly handled
[x] Password never returned
[x] Proper error responses
[x] Sensitive data logging avoid karna

TESTING (manual): Register -> Login -> Protected query -> Invalid token -> Expired token
                  -> Wrong password -> Duplicate email -> Role restriction

CODE CLEANUP: Resolver -> Service -> Prisma (resolver me business logic ka dump nahi)
```

---

## 2. Definitions (easy language)

| Term | Meaning |
|---|---|
| **Helmet** | Express middleware jo response me security headers lagata hai (`X-Content-Type-Options: nosniff`, etc.). Browser-side attacks (clickjacking, MIME sniffing) mushkil karta hai. `X-Powered-By` header bhi hata deta hai taaki attacker ko framework pata na chale. |
| **CSP (Content-Security-Policy)** | Header jo browser ko batata hai kaun se scripts/styles load ho sakte hain. Dev me off kiya kyunki Apollo Sandbox page toot jata hai. |
| **CORS** | Browser ka rule: kaun si website tumhari API ko call kar sakti hai. Allowlist (`CORS_ORIGINS`) se sirf trusted frontends allowed. **Security tool nahi hai server ke liye**: curl/Postman ko nahi rokta, sirf browsers ko. Isliye auth, guards, validation aur rate limiting alag se zaroori. |
| **Preflight** | Browser actual request se pehle `OPTIONS` request bhejta hai. Custom header (jaise `x-organization-id`) `allowedHeaders` me na ho to preflight fail hoti hai. |
| **Rate limiting** | Ek IP se limited requests allow. Brute-force aur spam se bachata hai. |
| **Throttler** | `@nestjs/throttler` package jo Nest me rate limiting deta hai. `ttl` (time window, ms) aur `limit` (kitni requests). |
| **Fail fast** | Config galat ho to app **start hote hi** band ho jaye, baad me random request par ajeeb error na de. |
| **Mock** | Test me asli cheez (jaise Prisma/DB) ki jagah nakli (fake) object. Test fast aur DB-free rehta hai. |
| **Unit test** | Ek chhote hisse (jaise ek guard) ka isolated test. |
| **Information leak** | Error me DB table/column naam ya stack trace dikhna, jisse attacker ko system ki andar ki jaankari milti hai. |

---

## 3. Commands used today

```bash
# Install
pnpm add helmet
pnpm add @nestjs/throttler

# Files / folders create (CLI sirf file-folder ke liye)
mkdir -p src/config
touch src/config/env.validation.ts
touch .env.example
mkdir -p src/common/guards
touch src/common/guards/gql-throttler.guard.ts
touch src/auth/guards/roles.guard.spec.ts

# Secret generate (output kahin paste mat karo, seedha .env me)
node -p "require('crypto').randomBytes(32).toString('hex')"

# .gitignore check (.env ignore hona chahiye, .env.example nahi)
grep -n "^\.env" .gitignore

# Sensitive data audit (read-only search)
grep -rn "console.log" src
grep -rn "passwordHash" src
grep -rn "Logger" src
grep -rn "new PrismaClient" src
grep -rn "log:" src/prisma

# Cleanup checks
grep -rn "throw new Error" src/app
grep -rn "PrismaService" src --include=*.resolver.ts

# Tests / build
pnpm test            # vitest run
pnpm build           # nest build

# Production-mode error masking test
NODE_ENV=production pnpm start:dev
curl -s localhost:3000/graphql -H 'content-type: application/json' -d '{"query":"{ hello }"}'

# Port already in use fix
ss -ltnp | grep 3000
kill <PID>

# Git
git status
git reset --soft HEAD~1        # last commit undo (files safe)
git reset                      # unstage
git add <paths>
git commit -m "..."
git push
git log --oneline
```

---

## 4. Step by step: code

### Step 1: Helmet + CORS

**.env me add:**
```env
CORS_ORIGINS=http://localhost:5173,https://studio.apollographql.com
```
(`5173` = future React/Vite app, `studio.apollographql.com` = Apollo Sandbox)

**src/main.ts:**
```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const isProd = config.get<string>('NODE_ENV') === 'production';

  // Security headers. CSP dev me off, warna Apollo Sandbox page toot jata hai.
  app.use(
    helmet({
      contentSecurityPolicy: isProd ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Sirf allowed origins browser se API call kar payenge.
  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-organization-id'],
    credentials: false,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```
(Observe wali commented line/import jaisa pehle tha waisa hi rehne do.)

**Test:** DevTools -> Network -> `/graphql` response headers me `x-content-type-options: nosniff`; `x-powered-by` gayab.

---

### Step 2: Rate limiting

**GraphQL ke liye custom guard** (`src/common/guards/gql-throttler.guard.ts`). Final version (error-code fix ke saath, section 6.1 dekho):

```ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';
import { GraphQLError } from 'graphql';

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  getRequestResponse(context: ExecutionContext) {
    if (context.getType<string>() === 'graphql') {
      const ctx = GqlExecutionContext.create(context).getContext();
      return { req: ctx.req, res: ctx.req.res };
    }
    return super.getRequestResponse(context); // REST route (GET /)
  }

  protected async throwThrottlingException(): Promise<void> {
    throw new GraphQLError('Too many requests, please try again later', {
      extensions: { code: 'TOO_MANY_REQUESTS' },
    });
  }
}
```

**app.module.ts me:**
```ts
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { GqlThrottlerGuard } from './common/guards/gql-throttler.guard.js';

// imports: [...]
ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),

// providers: [...]
{ provide: APP_GUARD, useClass: GqlThrottlerGuard },
```
Global default: **100 requests / 60 seconds / IP**.

**auth.resolver.ts: sensitive mutations par sakht limit (5 / 60s):**
```ts
import { Throttle } from '@nestjs/throttler';

@Throttle({ default: { limit: 5, ttl: 60_000 } })
@Mutation(() => User)
register(@Args('input') input: RegisterInput) { ... }

@Throttle({ default: { limit: 5, ttl: 60_000 } })
@Mutation(() => AuthPayload)
login(@Args('input') input: LoginInput) { ... }

@Throttle({ default: { limit: 5, ttl: 60_000 } })
@Mutation(() => AuthPayload)
refresh(@Args('input') input: RefreshTokenInput) { ... }
```
`@Throttle` **existing method ke upar** lagta hai. Naya method nahi banana (duplicate `login` wali galti ho gayi thi).

**Final `auth.resolver.ts`:**
```ts
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service.js';
import { RegisterInput } from './dto/register.input.js';
import { LoginInput } from './dto/login.input.js';
import { RefreshTokenInput } from './dto/refresh-token.input.js';
import { User } from '../users/entities/user.entity.js';
import { AuthPayload } from './entities/auth-payload.entity.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Roles } from './decorators/roles.decorator.js';

@Resolver()
export class AuthResolver {
  constructor(private authService: AuthService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Mutation(() => User)
  register(@Args('input') input: RegisterInput) {
    return this.authService.register(input);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Mutation(() => AuthPayload)
  login(@Args('input') input: LoginInput) {
    return this.authService.login(input);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Mutation(() => AuthPayload)
  refresh(@Args('input') input: RefreshTokenInput) {
    return this.authService.refresh(input.refreshToken);
  }

  @Mutation(() => Boolean)
  logout(@Args('input') input: RefreshTokenInput) {
    return this.authService.logout(input.refreshToken);
  }

  @Query(() => User)
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: { id: string }) {
    return this.authService.me(user.id);
  }

  @Query(() => String)
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  adminOnly() {
    return 'You are an ADMIN of this organization';
  }
}
```

**Test:** galat password se `login` 6 baar jaldi -> 6th par `Too many requests...`.

---

### Step 3: Environment validation

**src/config/env.validation.ts:**
```ts
const REQUIRED = [
  'DATABASE_URL',
  'DATABASE_URL_UNPOOLED',
  'JWT_ACCESS_SECRET',
] as const;

const NODE_ENVS = ['development', 'production', 'test'];

export function validateEnv(config: Record<string, unknown>) {
  const errors: string[] = [];

  for (const key of REQUIRED) {
    const value = config[key];
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`${key} is required`);
    }
  }

  const secret = config.JWT_ACCESS_SECRET;
  if (typeof secret === 'string' && secret.length < 32) {
    errors.push('JWT_ACCESS_SECRET must be at least 32 characters');
  }

  const port = config.PORT;
  if (port !== undefined && Number.isNaN(Number(port))) {
    errors.push('PORT must be a number');
  }

  const nodeEnv = config.NODE_ENV;
  if (nodeEnv !== undefined && !NODE_ENVS.includes(String(nodeEnv))) {
    errors.push(`NODE_ENV must be one of: ${NODE_ENVS.join(', ')}`);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
  }

  return config;
}
```
Error me sirf variable ke naam, values kabhi nahi (secrets leak nahi hote).

**app.module.ts:**
```ts
import { validateEnv } from './config/env.validation.js';

ConfigModule.forRoot({
  isGlobal: true,
  validate: validateEnv,
}),
```

**.env.example** (git me jata hai, **sirf dummy values**):
```env
# Database (Neon)
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require&connect_timeout=15"
DATABASE_URL_UNPOOLED="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"

# Auth
JWT_ACCESS_SECRET="replace-with-a-random-string-at-least-32-chars"
JWT_ACCESS_EXPIRES_IN="15m"

# App
PORT=3000
NODE_ENV=development
CORS_ORIGINS=http://localhost:5173,https://studio.apollographql.com
```

**Test:** `.env` me `JWT_ACCESS_SECRET` ke aage `#` laga ke start -> `JWT_ACCESS_SECRET is required` aur app start nahi hoti. `#` hata ke normal.
(Secret 32 chars se chhota ho to naya generate karo; secret badalne se purane tokens invalid hote hain, dobara login.)

---

### Step 4: Safe error responses + sensitive data audit

**Problem:** unexpected (500) error me DB detail / stack trace client ko ja sakti hai.

**app.module.ts me GraphQLModule config:**
```ts
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: true,
  playground: true,
  context: ({ req }: { req: unknown }) => ({ req }),
  includeStacktraceInErrorResponses: process.env.NODE_ENV !== 'production',
  formatError: (formattedError) => {
    const extensions = { ...(formattedError.extensions ?? {}) } as Record<string, unknown>;
    delete extensions.stacktrace;

    // Production me unexpected (500) errors ka asli message client ko nahi dikhana
    if (
      process.env.NODE_ENV === 'production' &&
      extensions.code === 'INTERNAL_SERVER_ERROR'
    ) {
      return {
        message: 'Internal server error',
        extensions: { code: 'INTERNAL_SERVER_ERROR' },
      };
    }

    return { ...formattedError, extensions };
  },
}),
```
- Stack trace kabhi client ko nahi.
- Production me 500 errors generic. Validation / auth / forbidden errors waise hi (client ke kaam ke).
- Dev me asli message dikhta hai; asli error server log me hamesha.

**Audit result (grep):**

| Check | Result |
|---|---|
| `console.log` | Koi nahi (debug log hata diya) |
| `passwordHash` | Sirf `auth.service` (hash/compare) aur `users.service` (DB save). `user.entity.ts` me nahi |
| `Logger` | Koi custom logging nahi |
| `new PrismaClient` / `log:` | Kuch nahi, default (sirf warn/error). Query logs me params aate hain, isliye `log: ['query']` kabhi nahi |
| `.gitignore` | `.env` ignored, `.env.example` tracked |

**"Password never returned":** GraphQL code-first me client ko sirf `@ObjectType` me declare kiye fields milte hain. `User` entity me `passwordHash` nahi hai, to service Prisma object return kare tab bhi hash bahar nahi jaata.

**Production masking test (curl):** resolver me temporary `throw new Error('secret db detail ...')`, `NODE_ENV=production pnpm start:dev`, curl -> response: `Internal server error` (secret nahi). Test ke baad throw line **turant hata di**.

---

### Step 5: Automated tests (Vitest)

`package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

**src/auth/guards/roles.guard.spec.ts** (RolesGuard ke 7 tests, Prisma mock):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

// GraphQL context ka fake version
function makeContext(req: Record<string, unknown>) {
  return {
    getType: () => 'graphql',
    getArgs: () => [null, {}, { req }, {}],
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const findUnique = vi.fn();
  const getAllAndOverride = vi.fn();
  const prisma = { organizationMember: { findUnique } } as unknown as PrismaService;
  const reflector = { getAllAndOverride } as unknown as Reflector;

  let guard: RolesGuard;

  beforeEach(() => {
    vi.resetAllMocks();
    guard = new RolesGuard(reflector, prisma);
  });

  it('rejects when there is no authenticated user', async () => {
    const ctx = makeContext({ headers: { 'x-organization-id': 'org-1' } });
    await expect(guard.canActivate(ctx)).rejects.toThrow('Authentication required');
  });

  it('rejects when x-organization-id header is missing', async () => {
    const ctx = makeContext({ user: { id: 'u1' }, headers: {} });
    await expect(guard.canActivate(ctx)).rejects.toThrow('Missing x-organization-id header');
  });

  it('rejects a user who is not a member of the organization (tenant isolation)', async () => {
    findUnique.mockResolvedValue(null);
    const ctx = makeContext({
      user: { id: 'u1' },
      headers: { 'x-organization-id': 'other-org' },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      'You are not a member of this organization',
    );
  });

  it('rejects when the member role is not allowed', async () => {
    findUnique.mockResolvedValue({ role: Role.EMPLOYEE });
    getAllAndOverride.mockReturnValue([Role.ADMIN]);
    const ctx = makeContext({
      user: { id: 'u1' },
      headers: { 'x-organization-id': 'org-1' },
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow('Insufficient role');
  });

  it('allows an ADMIN and attaches membership to the request', async () => {
    findUnique.mockResolvedValue({ role: Role.ADMIN });
    getAllAndOverride.mockReturnValue([Role.ADMIN]);
    const req: Record<string, unknown> = {
      user: { id: 'u1' },
      headers: { 'x-organization-id': 'org-1' },
    };

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(req.membership).toEqual({ organizationId: 'org-1', role: Role.ADMIN });
    expect(findUnique).toHaveBeenCalledWith({
      where: { userId_organizationId: { userId: 'u1', organizationId: 'org-1' } },
    });
  });

  it('allows any member when no @Roles() is set', async () => {
    findUnique.mockResolvedValue({ role: Role.EMPLOYEE });
    getAllAndOverride.mockReturnValue(undefined);
    const ctx = makeContext({
      user: { id: 'u1' },
      headers: { 'x-organization-id': 'org-1' },
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('throws ForbiddenException (403) not a generic error', async () => {
    findUnique.mockResolvedValue(null);
    const ctx = makeContext({
      user: { id: 'u1' },
      headers: { 'x-organization-id': 'x' },
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
```

**Purane auto-generated `should be defined` specs fix** (Nest CLI ne bina dependencies ke banaye the, isliye fail the). Pattern: dependencies ke liye `useValue: {}`.

`src/users/users.service.spec.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { UsersService } from './users.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: {} }],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```

`src/auth/auth.service.spec.ts`: providers me `AuthService` + `PrismaService`, `UsersService`, `OrganizationsService`, `TokenService` (sab `useValue: {}`).

`src/auth/auth.resolver.spec.ts` (guards ko `overrideGuard` se fake):
```ts
const moduleRef = await Test.createTestingModule({
  providers: [AuthResolver, { provide: AuthService, useValue: {} }],
})
  .overrideGuard(JwtAuthGuard).useValue({})
  .overrideGuard(RolesGuard).useValue({})
  .compile();
```

`src/app/app.resolver.spec.ts` (Prisma ab nahi chahiye, `hello` ka test):
```ts
const moduleRef = await Test.createTestingModule({ providers: [AppResolver] }).compile();
// tests: should be defined; hello returns a string
```

**Cleanup: `src/app/app.resolver.ts`:** unused `PrismaService` hata diya (resolver me Prisma nahi, Resolver -> Service -> Prisma rule):
```ts
import { Query, Resolver } from '@nestjs/graphql';

@Resolver()
export class AppResolver {
  @Query(() => String)
  hello(): string {
    return 'Hello World!';
  }
}
```

**Result:** `pnpm test` -> **8 files, 15 tests passed**. `pnpm build` clean.

---

## 5. Manual testing matrix (Apollo Sandbox)

Headers (valid JSON): `{ "Authorization": "Bearer <T1>", "x-organization-id": "<ORG1>" }`
Labels: T1/R1 = matrix1 access/refresh token, T2 = matrix2 access token, ORG1/ORG2 = `organizationId` from Prisma Studio -> OrganizationMember (row ka `id` nahi).

| # | Test | Expected | Result |
|---|---|---|---|
| 1 | Register matrix1 (`name`, `email`, `password`, `organizationName`) | User created, `passwordHash` response me nahi | ✅ |
| 2 | Register same email again | Duplicate email error | ✅ |
| 3 | Register invalid input (bad email, short password) | Validation error | ✅ |
| 4 | Login (correct) | accessToken + refreshToken | ✅ |
| 5 | Login (wrong password) | Generic `Invalid credentials` | ✅ |
| 6 | `me` with valid T1 | matrix1 data | ✅ |
| 7 | `me` without token | `Missing access token` | ✅ |
| 8 | `me` tampered token | `Invalid or expired access token` | ✅ |
| 9 | `adminOnly` T1 + ORG1 (ADMIN) | `You are an ADMIN of this organization` | ✅ |
| 10 | `adminOnly` T2 + ORG2 after role -> EMPLOYEE (Studio, Save) | `Insufficient role` | ✅ |
| 11 | `adminOnly` T2 + ORG1 (other tenant) | `You are not a member of this organization` | ✅ |
| 12 | Refresh R1 (new tokens), then R1 again | Second: `Invalid or expired refresh token` (rotation) | ☐ fill |
| 13 | Logout R2, then refresh R2 | Logout `true`; refresh fails | ☐ fill |
| 14 | Wrong-password login 6x quickly | `Too many requests` (rate limit) | ✅ |

Notes:
- matrix2 + ORG2 with role still ADMIN correctly returns the ADMIN message (register makes you ADMIN of your own org).
- Role DB se har request par padha jata hai, isliye role badalne ke baad re-login nahi chahiye.
- `T1`, `R1`, etc. sirf labels hain, asli token values paste karni hoti hain (no `<` `>`, no extra quotes).

---

## 6. Bugs, errors & learnings (important)

### 6.1 Throttler error `INTERNAL_SERVER_ERROR`
`ThrottlerException: Too Many Requests` GraphQL me `INTERNAL_SERVER_ERROR` code ke saath aa raha tha. Production `formatError` ise `Internal server error` bana deta, to client ko pata hi nahi chalta ki rate limit hua. **Fix:** `throwThrottlingException` override karke `GraphQLError` with `code: 'TOO_MANY_REQUESTS'` (code section 4, Step 2).

### 6.2 Table of errors

| Problem | Reason | Fix |
|---|---|---|
| Duplicate `login` method in resolver | `@Throttle` ke saath naya method likh diya | Decorator **existing** method par lagao |
| `GET /` crash risk with global throttler | GraphQL-only `getRequestResponse` REST par `req` undefined deta | `context.getType() === 'graphql'` check, warna `super.getRequestResponse()` |
| `EADDRINUSE :::3000` | Purana server abhi chal raha tha | `Ctrl+C` / `ss -ltnp \| grep 3000` + `kill PID` (test tabhi valid jab port free) |
| `context.getType is not a function` (tests) | `GqlExecutionContext.create()` (graphql v14) fake context par `getType()` call karta hai | Mock me `getType: () => 'graphql'` |
| 4 generated specs failing | Dependencies (Prisma etc.) provide nahi the | `useValue: {}` mocks, guards ke liye `overrideGuard` |
| `RegisterInput.organizationName` required | Test me field miss ho gaya | Register me `organizationName` dena zaroori |
| `Invalid or expired refresh token` on first refresh | Literal `"R1"` paste kar diya | R1/T1 labels hain, asli token value daalo |
| `adminOnly` returned ADMIN message for matrix2 | Role abhi ADMIN tha (register par ADMIN milta hai) | Studio me role `EMPLOYEE` karke **Save** karo, phir test |
| Test `throw new Error` line resolver me reh gayi | Temporary debug cleanup bhula | `grep "throw new Error" src/app` se verify |
| All changes ek commit me chale gaye (`git add .`) | Message se mismatch | `git reset --soft HEAD~1` + `git reset`, phir path-wise add (push se pehle) |
| `git add <path>` literal paste | Placeholder `<...>` bash me redirect ban gaya | Asli path likho |

### 6.3 Key learnings
1. **Guards ka order** matter karta hai; **fail fast** config; **fail closed** errors.
2. Production me asli error sirf server log me, client ko generic.
3. CORS != server security; auth/guards/validation/rate-limit alag layers hain.
4. Test ke liye temporary code (throw, console.log) **turant hatao**, aur grep se verify karo.
5. Secrets (`.env`, JWT secret, DB URL, real tokens) kabhi paste/commit nahi.
6. Mock se DB-free unit tests: security-critical code (RolesGuard) ka test sabse zaroori.

---

## 7. Git history (Phase 1)

```
feat(security): add Helmet, CORS allowlist, rate limiting, env validation and safe GraphQL errors
test: add RolesGuard unit tests, fix generated specs, clean app resolver
docs: add day 6 and day 7 notes and test matrix
```
Earlier: `feat(auth): add organization-scoped RBAC`, `feat: implement login with JWT and refresh token rotation`, schema/prisma/foundation commits.

---

## 8. Interview Q&A

**Q1. Aapne API ko brute force se kaise protect kiya?**
`@nestjs/throttler` se global 100 req/min aur login/register/refresh par 5 req/min per IP. GraphQL ke liye custom `ThrottlerGuard` banaya jo GraphQL context se request nikalta hai. Limit cross hone par client ko `TOO_MANY_REQUESTS` code milta hai. Production me IP-based limit ke saath Redis store aage Phase me add hoga (multi-instance ke liye).

**Q2. CORS security hai kya?**
Nahi. CORS sirf browser enforce karta hai. Server-side protection auth, guards, validation aur rate limiting se aati hai. CORS allowlist se sirf trusted frontends browser se call kar paate hain.

**Q3. Errors me information leak kaise roka?**
Production me Apollo `formatError` me stacktrace hata deta hu aur unexpected 500 errors ka message generic kar deta hu. Asli error server logs me rehta hai. Validation/auth errors client ko dikhte hain.

**Q4. Env variables galat ho to?**
`ConfigModule` ke `validate` hook se app start par hi fail hoti hai, saaf message ke saath, bina values print kiye.

**Q5. Password response me kaise nahi aata?**
GraphQL schema code-first hai; `User` ObjectType me `passwordHash` field hi nahi hai, to client ko mil hi nahi sakta. Plus logging audit kiya (no console.log, no Prisma query logs).

**Q6. Aapne kya test kiya?**
Security-critical `RolesGuard` ke unit tests (tenant isolation, role restriction) Prisma mock karke, plus manual end-to-end matrix (register, login, token errors, RBAC, refresh rotation, logout, rate limit).

**Q7. Rate limit ka error 500 kyun aa raha tha aur kaise fix kiya?**
Throttler ka exception GraphQL me `INTERNAL_SERVER_ERROR` ban raha tha, jo production me mask ho jata. `throwThrottlingException` override karke `GraphQLError` with `TOO_MANY_REQUESTS` throw kiya.

**Q8. Multi-tenancy ka sabse bada risk kya hai aur aapne kaise handle kiya?**
Cross-tenant access. Har protected request par `x-organization-id` ke saath `(userId, organizationId)` membership DB se verify hoti hai; non-member aur non-existent org dono ka same error (enumeration nahi). Test: doosre tenant ki org id ke saath 403.

---

## 9. Phase-01 final checklist

```
BACKEND     [x] NestJS  [x] GraphQL  [x] ConfigModule  [x] Env validation  [x] Global validation
DATABASE    [x] PostgreSQL  [x] NeonDB  [x] Prisma  [x] Migrations  [x] Relations
AUTH        [x] Register  [x] Password hashing  [x] Login  [x] JWT  [x] Access/Refresh token  [x] Logout
AUTHZ       [x] Auth Guard  [x] Current User  [x] Roles  [x] Roles Guard  [x] ADMIN/MANAGER/EMPLOYEE
SECURITY    [x] CORS  [x] Helmet  [x] Rate limiting  [x] Error handling
QUALITY     [x] Clean modules  [x] Resolver->Service->Prisma  [x] Basic testing  [x] Git commits
```

## 10. Phase 2 (outline from plan, details TBD)

Redis caching and rate-limit store, search/filter/pagination; then BullMQ jobs + notifications; React dashboard; Docker/tests/deployment/docs. Projects and tasks features are not in Phase 1.