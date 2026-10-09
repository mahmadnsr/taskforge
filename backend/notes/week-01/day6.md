Bhai, Day 6 ke notes ko hum ek proper **professional backend engineering documentation** ki tarah organize karte hain — definitions, architecture, request lifecycle, code explanations, security reasoning, testing, debugging, interview questions aur future improvements ke saath. 🔥

Main tumhare existing TaskForge implementation ko base rakhunga, taaki notes padhte waqt code aur concepts ka connection clear rahe. Kuch important security nuances bhi add karunga, jisse tum sirf code implement nahi, balki uske design decisions ko interview mein explain bhi kar sako.

# 📘 Day 6 — Authorization, Guards, Current User & Organization-Scoped RBAC

**Project:** TaskForge  
**Module:** Authentication & Authorization  
**Backend:** NestJS + GraphQL + Prisma + PostgreSQL  
**Primary concepts:** JWT verification, Guards, Custom Decorators, RBAC, Multi-tenancy, Tenant Isolation

---

## 0. Day 5 se Day 6 tak — Hum kya build kar rahe hain?

Day 5 mein humne authentication ki foundation implement ki thi:

- User registration aur login
- Password hashing aur password verification
- Access JWT generate aur verify karna
- Refresh token generation, storage aur rotation
- Logout ke waqt refresh token revoke karna

Lekin login kar lene ka matlab ye nahi ki user application ka har resource access kar sakta hai.

Maan lo TaskForge mein teen users hain:

| User | Organization | Role |
|---|---|---|
| Ahmad | Organization A | ADMIN |
| Sara | Organization A | EMPLOYEE |
| Ahmad | Organization B | EMPLOYEE |

Ab application ko kuch important questions ke answers dene honge:

1. Kya request bhejne wale user ki identity valid hai?
2. User kis organization ke context mein kaam kar raha hai?
3. Kya user us organization ka member hai?
4. Organization mein uska role kya hai?
5. Kya us role ko requested operation perform karne ki permission hai?

**Day 6 ka main objective in questions ko systematically handle karna hai.**

### Authentication vs Authorization

| Day 5 — Authentication | Day 6 — Authorization |
|---|---|
| User ki identity verify karna | User ki permissions check karna |
| Kya user authenticated hai? | Kya user ye operation kar sakta hai? |
| Login aur JWT verification | Membership aur role verification |
| `JwtAuthGuard` | `RolesGuard` |
| Identity establish hoti hai | Access decision liya jata hai |

**Real-life example:** Office ke gate par identity card verify karna authentication hai. Office ke server room mein sirf authorized employees ko entry dena authorization hai.

Ek important distinction: HTTP mein `401 Unauthorized` ka practical meaning hota hai ki authentication missing ya invalid hai. `403 Forbidden` ka matlab hai ki request samajh aa gayi, lekin access deny kar diya gaya.

---

## 1. Aaj ka goal

Day 6 ke end tak TaskForge mein ek protected GraphQL API honi chahiye jisme:

- [x] Valid access token ke bina protected operation execute na ho.
- [x] JWT se current user ki identity retrieve ho.
- [x] `@CurrentUser()` decorator resolver ko authenticated user provide kare.
- [x] `@Roles()` decorator required roles define kare.
- [x] `RolesGuard` organization membership aur role verify kare.
- [x] `x-organization-id` header se organization context select ho.
- [x] Ek organization ka non-member doosri organization ke context mein access na kar sake.
- [x] Missing, invalid aur expired credentials ko appropriately handle kiya jaye.
- [x] Cross-tenant access aur insufficient-role scenarios test kiye jayein.

Yahan `[x]` tumhare supplied notes mein reported implementation aur tests ko represent karta hai.

---

## 2. Core concepts — detailed definitions

### 2.1 Authentication kya hai?

**Definition:** Authentication ek security process hai jisme application verify karti hai ki request bhejne wala user ya system wahi hai hone ka jo woh claim kar raha hai.

TaskForge mein login ke waqt user email aur password provide karta hai. Application password ko database mein stored password hash ke against verify karti hai. Verification successful hone par access token issue kiya jata hai.

Protected request ke waqt `JwtAuthGuard` token ki validity verify karta hai.

Example:

```http
Authorization: Bearer eyJhbGciOi...
```

Yahan:
- `Authorization` HTTP header ka naam hai.
- `Bearer` authentication scheme hai.
- Uske baad aane wala token access JWT hai.

**Important:** JWT ko decode kar lena aur JWT ko verify karna do alag cheezein hain. Secure authentication ke liye token ki signature aur relevant claims verify karne chahiye.

### 2.2 Authorization kya hai?

**Definition:** Authorization woh process hai jo authenticated identity ke liye decide karta hai ki kaun-sa resource access kiya ja sakta hai aur kaun-sa action perform kiya ja sakta hai.

TaskForge mein examples:

- `ADMIN` organization members ko manage kar sakta hai.
- `MANAGER` project ya task management operations perform kar sakta hai, agar policy allow kare.
- `EMPLOYEE` assigned tasks dekh ya update kar sakta hai, agar policy allow kare.

Ye sirf illustrative policies hain. Actual permissions project ke business rules se define hongi.

Authentication successful hone ke baad bhi authorization fail ho sakta hai.

```text
Valid JWT
   │
   ▼
User authenticated hai
   │
   ▼
Required role check
   │
   ├── Required role present → Allow
   │
   └── Required role absent  → Deny
```

### 2.3 Authentication aur authorization ka request-level difference

| Situation | Expected outcome |
|---|---|
| Access token missing | `401 Unauthorized` |
| Access token invalid | `401 Unauthorized` |
| Access token expired | `401 Unauthorized` |
| User authenticated hai, lekin organization ka member nahi | `403 Forbidden` in the supplied implementation |
| User member hai, lekin required role nahi hai | `403 Forbidden` |
| User member hai aur required role bhi hai | Request allow ho sakti hai |

Ek subtle point: tumhara current `RolesGuard` missing `x-organization-id` ke liye `403` throw karta hai. Ye implementation ka behavior hai; missing ya malformed request context ko `400 Bad Request` dena bhi ek possible API design hai. Consistency maintain karna important hai.

---

### 2.4 NestJS Guard kya hota hai?

**Definition:** NestJS Guard ek class hoti hai jo `CanActivate` interface implement karti hai aur decide karti hai ki current execution context mein request ko aage execute karne dena hai ya nahi.

Guard controller ke route handler ya GraphQL resolver ke execute hone se pehle authorization-related checks perform kar sakta hai.

Typical structure:

```ts
@Injectable()
export class ExampleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}
```

`canActivate()` ka return value `boolean`, `Promise<boolean>` ya `Observable<boolean>` ho sakta hai.

- `true` return hua → execution aage badh sakta hai.
- `false` return hua → NestJS access deny karta hai, generally `403 Forbidden` ke saath.
- Exception throw hui → exception filter ke through error response generate hota hai.

Hamare implementation mein missing ya invalid JWT ke liye `UnauthorizedException` aur insufficient permissions ke liye `ForbiddenException` throw kiya jata hai.

**Real-life analogy:** Guard ek security checkpoint hai. Har checkpoint ka kaam alag ho sakta hai—pehla identity verify karega aur doosra permissions.

### 2.5 Guards kyun use karte hain?

Agar har resolver mein manually token verify aur role check karna pade, to:

- Code repeat hoga.
- Security logic inconsistent ho sakti hai.
- Kisi resolver mein check bhoolne ka risk badhega.
- Testing aur maintenance difficult hogi.

Guards common access-control logic ko centralize karte hain.

Lekin ek important rule yaad rakho:

> Guard mein authorization check karne ke baad bhi database operations ko correct organization ke scope mein execute karna zaroori hai.

Sirf guard pass kar lena har database record ko access karne ki permission nahi deta.

---

### 2.6 `ExecutionContext` aur `GqlExecutionContext`

Ye dono NestJS ke request-processing model ke important parts hain.

**`ExecutionContext`:** NestJS ko batata hai ki current handler aur class kya hain aur kis execution context mein code chal raha hai.

**`GqlExecutionContext`:** GraphQL request ke context, arguments, information aur resolver-related data ko access karne ka interface provide karta hai.

GraphQL guard mein:

```ts
const gqlContext = GqlExecutionContext.create(context);
const req = gqlContext.getContext().req;
```

Is code ka meaning:

1. Current NestJS execution context ko GraphQL context mein convert karo.
2. GraphQL context retrieve karo.
3. Us context se HTTP request object nikalo.

Is request object mein normally HTTP headers available hote hain, provided tumne GraphQL context configuration mein `req` expose kiya ho.

---

### 2.7 `req.user` kya hai?

`req.user` authenticated user ki identity ko request ke saath attach karne ka common pattern hai.

Hamare `JwtAuthGuard` mein:

```ts
req.user = { id: payload.sub };
```

JWT verify hone ke baad user ID request object par attach kar di jati hai.

Iske baad resolver ya doosra guard authenticated identity ko access kar sakta hai.

Example:

```ts
const userId = req.user?.id;
```

**Important distinction:** `req.user` client ke JSON body se directly trust karke set nahi karna chahiye. Hamare design mein ise verified JWT payload se populate kiya jata hai.

`req.user` khud database record nahi hai. Ye request ke liye authenticated identity ka server-side representation hai.

---

### 2.8 JWT payload mein `sub` kya hota hai?

JWT payload mein `sub` ka standard meaning **subject** hai—yaani token kis identity ke baare mein hai.

Hamare access token ka conceptual payload:

```json
{
  "sub": "user-uuid",
  "iat": 1790000000,
  "exp": 1790000900
}
```

Ye example values illustrative hain.

- `sub`: User ki identity.
- `iat`: Token kab issue hua.
- `exp`: Token kab expire hoga.

JWT payload ko generally encode kiya jata hai, encrypt nahi. Isliye token mein passwords, refresh tokens, secrets ya sensitive personal data nahi rakhna chahiye.

**TaskForge design decision:** Access token mein user identity rakho; organization-specific role ko authoritative database membership se resolve karo.

---

### 2.9 RBAC kya hai?

**RBAC ka full form:** Role-Based Access Control.

**Definition:** RBAC ek access-control model hai jisme permissions individual users ko directly assign karne ke bajaye roles ke through organize ki jati hain.

Example:

```text
ADMIN
 ├── View organization
 ├── Manage members
 ├── Manage projects
 └── Manage tasks

MANAGER
 ├── View projects
 ├── Manage permitted tasks
 └── View team activity

EMPLOYEE
 ├── View assigned tasks
 └── Update permitted task fields
```

Ye sample permission matrix hai, TaskForge ki final policy nahi.

RBAC ka advantage ye hai ki har user ke liye alag permission rules maintain karne ki jagah role ke through policy manage kar sakte ho.

Lekin **role aur permission same cheez nahi hain**:

- Role ek named category hai, jaise `ADMIN`.
- Permission ek specific allowed action hai, jaise `member:delete`.

Role ko permissions se map kiya jata hai.

Tumhare current Day 6 implementation mein `@Roles(Role.ADMIN)` ek role-based gate lagata hai. Future mein more granular authorization chahiye to permissions ya resource ownership bhi check karna hoga.

---

### 2.10 Multi-tenancy kya hai?

**Definition:** Multi-tenancy ek software architecture hai jisme ek application multiple independent customers, teams ya organizations ko serve karti hai.

TaskForge mein har organization apne members, projects aur tasks rakh sakti hai.

```text
TaskForge
   │
   ├── Organization A
   │      ├── Ahmad — ADMIN
   │      ├── Sara  — EMPLOYEE
   │      └── Projects and Tasks
   │
   └── Organization B
          ├── Ahmad — EMPLOYEE
          ├── Ali   — MANAGER
          └── Projects and Tasks
```

Yahan Ahmad dono organizations ka member hai, lekin uska role alag hai.

Isliye user identity aur organization membership ko alag concepts ke roop mein model karna zaroori hai.

### 2.11 Tenant isolation kya hai?

**Definition:** Tenant isolation ka matlab hai ki ek tenant ka user doosre tenant ke unauthorized resources ko access na kar sake.

Maan lo Organization A mein project ID `P123` hai.

Agar Organization B ka employee directly `P123` request karta hai, to application ko verify karna chahiye ki woh project uske active organization context se belong karta hai aur user ko us resource ka access hai.

Sirf ye check karna ki user logged in hai, sufficient nahi hai.

**Important:** `x-organization-id` header select karta hai ki request kis organization ke context mein hai. Ye khud permission prove nahi karta. Permission server-side membership aur resource-level checks se establish hoti hai.

---

### 2.12 `@CurrentUser()` custom parameter decorator

**Definition:** Parameter decorator kisi method ke specific parameter ke liye metadata ya custom value retrieval behavior define karta hai.

NestJS mein `createParamDecorator()` ka use karke request context se custom value extract kar sakte hain.

Hamare case mein:

```ts
@CurrentUser() user: { id: string }
```

Iska benefit ye hai ki har resolver mein manually ye code nahi likhna padta:

```ts
const req = GqlExecutionContext.create(context).getContext().req;
const user = req.user;
```

Isse resolver ka code readable aur consistent rehta hai.

---

### 2.13 `@Roles()` decorator aur metadata

**Definition:** Metadata aisi additional information hai jo class ya method ke saath attach ki ja sakti hai aur runtime par read ki ja sakti hai.

Hamare example mein:

```ts
@Roles(Role.ADMIN)
```

Resolver method par required role ka metadata attach karta hai.

Lekin decorator khud authorization enforce nahi karta.

Actual sequence:

```text
@Roles(Role.ADMIN)
       │
       ▼
Required role metadata attach hota hai
       │
       ▼
RolesGuard Reflector se metadata read karta hai
       │
       ▼
Database membership ka role check hota hai
       │
       ▼
Allow ya deny
```

**Interview point:** Decorator policy declare karta hai; guard policy enforce karta hai.

---

## 3. TaskForge ka authorization architecture

Hamare design mein teen important components hain:

| Component | Responsibility |
|---|---|
| `JwtAuthGuard` | Access token verify karke authenticated identity establish karna |
| `RolesGuard` | Organization membership aur required role verify karna |
| `@CurrentUser()` / `@Roles()` | Resolver code aur access-control policy ko clean rakhna |

### Complete request flow

```text
                    CLIENT
               Apollo Sandbox
                      │
                      │ Authorization: Bearer <token>
                      │ x-organization-id: <organization UUID>
                      ▼
                GRAPHQL CONTEXT
                      │
                      │ { req }
                      ▼
                JwtAuthGuard
                      │
                      ├── Token missing/invalid?
                      │       └── 401 → STOP
                      │
                      └── JWT verified
                              │
                              ▼
                     req.user = { id }
                              │
                              ▼
                       RolesGuard
                              │
                              ├── Organization header missing?
                              │       └── Deny
                              │
                              ├── Membership missing?
                              │       └── Deny
                              │
                              ├── Required role missing?
                              │       └── 403 → STOP
                              │
                              └── Access allowed
                                      │
                                      ▼
                                  RESOLVER
                                      │
                                      ▼
                               SERVICE / DB
```

Ye flow tumhare supplied guard design ko represent karta hai. Actual application mein har route ko har guard ki zaroorat nahi hoti. Public operations, authenticated-only operations aur organization-scoped operations ki requirements alag ho sakti hain.

---

## 4. Organization ke andar role kyun check karte hain, JWT mein kyun nahi?

Ye Day 6 ka sabse important architectural decision hai.

### 4.1 Problem samjho

Maan lo Ahmad do organizations ka member hai:

```text
Organization A
Ahmad → ADMIN

Organization B
Ahmad → EMPLOYEE
```

Agar hum JWT payload mein ye role store kar dein:

```json
{
  "sub": "ahmad-user-id",
  "role": "ADMIN"
}
```

To token dekhne wale authorization logic ko ye pata nahi chalega ki Ahmad `ADMIN` kis organization mein hai.

Agar same token ko Organization B ke context mein use kiya jaye, to galat role apply hone ka risk hoga—jab tak additional organization-specific validation na ho.

### 4.2 Role change hone par kya problem ho sakti hai?

Maan lo Ahmad ko Organization A se `ADMIN` se downgrade karke `EMPLOYEE` kar diya.

Agar application sirf JWT ke role par depend karti hai, to purane token mein `ADMIN` claim expiration tak valid dikh sakta hai. Isse permissions stale reh sakti hain.

JWT ki validity aur user ki current database permissions alag cheezein hain.

### 4.3 TaskForge ka solution

Access token mein sirf identity rakho:

```json
{
  "sub": "ahmad-user-id"
}
```

Request ke waqt:

1. JWT verify karo.
2. `sub` se authenticated user ID retrieve karo.
3. `x-organization-id` header se organization context lo.
4. Database mein user-organization membership retrieve karo.
5. Membership ke current role ke against required role verify karo.

Database query ka conceptual structure:

```ts
const membership = await prisma.organizationMember.findUnique({
  where: {
    userId_organizationId: {
      userId,
      organizationId,
    },
  },
});
```

Isse same user ka role organization ke hisaab se alag ho sakta hai.

**Interview-ready answer:**

> “In TaskForge, roles are scoped to organizations, so I keep the JWT focused on identity using the `sub` claim. For organization-scoped operations, I resolve the user's membership and role from the database using the authenticated user ID and the requested organization ID. This avoids treating a single global role claim as authoritative across multiple organizations and allows role changes to be reflected on subsequent authorization checks.”

**Nuance:** Database lookup se role changes next authorization check par reflect ho sakte hain, provided application kisi stale cache ya separate cached authorization result par depend nahi kar rahi ho. Pehle se authorized aur chal rahi requests automatically cancel nahi hoti.

---

## 5. Code walkthrough — file by file

Tumhare supplied implementation ke according files ka structure:

```text
src/
├── app.module.ts
└── auth/
    ├── auth.module.ts
    ├── auth.service.ts
    ├── auth.resolver.ts
    ├── guards/
    │   ├── jwt-auth.guard.ts
    │   └── roles.guard.ts
    └── decorators/
        ├── current-user.decorator.ts
        └── roles.decorator.ts
```

`PrismaService`, `Role` enum aur `OrganizationMember` model tumhare existing project structure mein defined hone chahiye.

### 5.1 `app.module.ts` — GraphQL context mein request expose karna

```ts
GraphQLModule.forRoot<ApolloDriverConfig>({
  driver: ApolloDriver,
  autoSchemaFile: true,
  playground: true,
  context: ({ req }: { req: unknown }) => ({ req }),
}),
```

**Is configuration ka purpose kya hai?**

GraphQL resolver ko HTTP request ke headers chahiye, kyunki access token aur organization ID headers mein aate hain.

`context` function GraphQL request ke liye context object banata hai. Yahan request object ko `req` property ke through expose kiya gaya hai.

Conceptually:

```ts
{
  req: {
    headers: {
      authorization: "Bearer ...",
      "x-organization-id": "..."
    }
  }
}
```

Iske baad GraphQL guards `GqlExecutionContext` se request access kar sakte hain.

**TypeScript note:** `req: unknown` ek type annotation hai, lekin ye khud runtime validation ya complete type-safety provide nahi karti. Agar TypeScript ko request ke headers ya `req.user` ke shape ke baare mein compile-time knowledge chahiye, to custom request/context type define karna behtar hai.

**Production note:** `playground: true` ya kisi interactive GraphQL IDE ki availability environment ke hisaab se configure karo. Production mein development tooling ko unnecessarily expose nahi karna chahiye.

---

### 5.2 `jwt-auth.guard.ts` — JWT authentication

Tumhare current guard ka core logic:

```ts
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = GqlExecutionContext.create(context).getContext().req;
    const header: string | undefined = req.headers?.authorization;
    const [type, token] = header?.split(' ') ?? [];

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Missing access token');
    }

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      req.user = { id: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
```

#### Line-by-line explanation

**Step 1 — GraphQL request retrieve karo**

```ts
const req = GqlExecutionContext.create(context).getContext().req;
```

GraphQL context se HTTP request retrieve hoti hai.

**Step 2 — Authorization header read karo**

```ts
const header: string | undefined = req.headers?.authorization;
```

Header missing ho sakta hai, isliye optional chaining use ki gayi hai.

**Step 3 — Bearer scheme aur token extract karo**

```ts
const [type, token] = header?.split(' ') ?? [];
```

Agar header ho:

```http
Authorization: Bearer abc123
```

To:

```ts
type = 'Bearer';
token = 'abc123';
```

Agar header missing hai, to empty array fallback milta hai.

**Step 4 — Missing credentials reject karo**

```ts
if (type !== 'Bearer' || !token) {
  throw new UnauthorizedException('Missing access token');
}
```

Expected authentication scheme `Bearer` hai aur token bhi present hona chahiye.

Is particular implementation mein malformed scheme bhi `Missing access token` message deta hai. Agar tum more precise diagnostics chahte ho, to missing aur malformed headers ko alag branches mein handle kar sakte ho.

**Step 5 — Token verify karo**

```ts
const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
```

Ye token ko verify karta hai. Valid signature ke saath expiry jaise supported claims bhi verify kiye ja sakte hain.

JWT verification ke liye configured secret ya public key issuing configuration ke saath match honi chahiye.

`<{ sub: string }>` TypeScript generic hai. Ye compiler ko expected payload shape batata hai; ye independently guarantee nahi karta ki token ke andar `sub` valid UUID ya existing user ID hai.

**Step 6 — Authenticated identity attach karo**

```ts
req.user = { id: payload.sub };
```

Verified JWT ka subject request ke user identity object mein store hota hai.

**Step 7 — Request allow karo**

```ts
return true;
```

Ab next guard ya resolver execute ho sakta hai.

**Step 8 — Verification error handle karo**

```ts
catch {
  throw new UnauthorizedException('Invalid or expired access token');
}
```

Invalid signature, expired token aur verification failures ke liye consistent authentication error diya jata hai.

#### Security improvement: `sub` validate karo

Verification successful hone ke baad bhi application-level payload validation useful hai.

Conceptually:

```ts
if (typeof payload.sub !== 'string' || !payload.sub) {
  throw new UnauthorizedException('Invalid access token payload');
}
```

Agar tum UUID IDs use karte ho, to UUID format bhi validate kiya ja sakta hai. Ye validation verified token payload par apply hoti hai.

#### Security improvement: token configuration consistent rakho

Day 5 ke setup ke according token signing aur verification ko same intended configuration use karni chahiye:

```text
JWT_ACCESS_SECRET
JWT_ACCESS_EXPIRES_IN=15m
```

Signing secret aur verification secret mismatch hone par otherwise genuine token bhi verify nahi hoga.

Production mein strong secret use karo aur use Git repository mein commit mat karo.

---

### 5.3 `current-user.decorator.ts` — user ko resolver mein inject karna

```ts
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    GqlExecutionContext.create(context).getContext().req.user,
);
```

**Is code ka purpose:** Resolver ke method parameter mein authenticated user automatically provide karna.

Example:

```ts
@Query(() => User)
@UseGuards(JwtAuthGuard)
me(@CurrentUser() user: { id: string }) {
  return this.authService.me(user.id);
}
```

Yahan:

1. `JwtAuthGuard` token verify karta hai.
2. Guard `req.user` set karta hai.
3. `@CurrentUser()` request se user retrieve karta hai.
4. Resolver `user.id` service ko pass karta hai.
5. Service database se user ki information retrieve karti hai.

**Important:** `@CurrentUser()` khud token verify nahi karta. Ye guard ke authenticated request context par depend karta hai. Isliye is decorator ko use karne wale protected resolver par appropriate authentication guard hona chahiye.

---

### 5.4 `roles.decorator.ts` — required roles declare karna

```ts
export const ROLES_KEY = 'roles';

export const Roles = (...roles: Role[]) =>
  SetMetadata(ROLES_KEY, roles);
```

#### `Role` kya hai?

`Role` project ka role enum hai. Conceptually:

```ts
enum Role {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  EMPLOYEE = 'EMPLOYEE',
}
```

Apne actual Prisma-generated `Role` type ya existing enum ko use karo; duplicate enum banane ki zaroorat nahi agar woh pehle se defined hai.

#### `ROLES_KEY` kya karta hai?

```ts
export const ROLES_KEY = 'roles';
```

Ye metadata ke liye ek key hai. Guard isi key se required roles retrieve karega.

#### `...roles` kyun use kiya?

```ts
Roles(Role.ADMIN, Role.MANAGER)
```

Rest parameter multiple roles accept karta hai.

Conceptually, decorator metadata mein ye array store karega:

```ts
[Role.ADMIN, Role.MANAGER]
```

Tumhara guard `includes()` use karta hai, isliye listed roles mein se koi bhi ek matching role ho to role check pass ho sakta hai.

**Important:** Ye decorator metadata set karta hai; database membership retrieve ya role enforce nahi karta. Woh responsibility `RolesGuard` ki hai.

---

### 5.5 `roles.guard.ts` — membership aur role authorization

Ye Day 6 ka main authorization component hai.

```ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = GqlExecutionContext.create(context).getContext().req;

    const userId: string | undefined = req.user?.id;
    if (!userId) throw new ForbiddenException('Authentication required');

    const organizationId = req.headers?.['x-organization-id'];
    if (typeof organizationId !== 'string' || !organizationId) {
      throw new ForbiddenException('Missing x-organization-id header');
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredRoles?.length && !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException('Insufficient role');
    }

    req.membership = { organizationId, role: membership.role };
    return true;
  }
}
```

#### Step 1 — Request context retrieve karo

```ts
const req = GqlExecutionContext.create(context).getContext().req;
```

Guard ko authenticated identity aur organization header dono chahiye.

#### Step 2 — User ID retrieve karo

```ts
const userId: string | undefined = req.user?.id;
```

Ye `JwtAuthGuard` ke through set ki gayi identity hai.

```ts
if (!userId) {
  throw new ForbiddenException('Authentication required');
}
```

Ye tumhare current implementation ka behavior hai. Kyunki authentication failure ko `401` represent karna chahiye, production-quality design mein is condition ko `UnauthorizedException` banana ya ensure karna behtar hai ki `RolesGuard` se pehle authentication guard har protected request par execute ho.

#### Step 3 — Organization ID read karo

```ts
const organizationId = req.headers?.['x-organization-id'];
```

HTTP header names case-insensitive hote hain, aur Node.js aam taur par header keys ko lowercase form mein expose karta hai.

Expected header:

```http
x-organization-id: 2d3a8f10-...
```

Is header ka purpose organization context select karna hai.

**Ye trust boundary hai:** Client jo organization ID bhejta hai, woh untrusted input hai. Use directly permission proof nahi maana ja sakta.

#### Step 4 — Header validate karo

```ts
if (typeof organizationId !== 'string' || !organizationId) {
  throw new ForbiddenException('Missing x-organization-id header');
}
```

Isse missing header ya unexpected value reject hoti hai.

Agar organization ID UUID hai, to format validation bhi kar sakte ho. Dhyan rahe, syntactically valid UUID ka matlab ye nahi ki organization exist karti hai ya user uska member hai.

#### Step 5 — Database se membership retrieve karo

```ts
const membership = await this.prisma.organizationMember.findUnique({
  where: {
    userId_organizationId: {
      userId,
      organizationId,
    },
  },
});
```

Ye query user ID aur organization ID ke combination se membership record dhoondhti hai.

Database model conceptually:

```text
OrganizationMember
─────────────────────────────────
id
userId
organizationId
role
createdAt
```

Maan lo records:

| userId | organizationId | role |
|---|---|---|
| user-101 | org-A | ADMIN |
| user-101 | org-B | EMPLOYEE |
| user-202 | org-A | EMPLOYEE |

Ab `user-101` aur `org-B` ke combination se lookup karne par `EMPLOYEE` membership milni chahiye.

Isliye user ID akela role decide karne ke liye sufficient nahi hai.

#### Step 6 — Membership missing ho to deny karo

```ts
if (!membership) {
  throw new ForbiddenException(
    'You are not a member of this organization',
  );
}
```

Agar matching membership nahi milti, to user ko us organization ke context mein access nahi milta.

Tumhare notes ke according, organization ke exist karne ya na karne ke baare mein unnecessary information disclose na karne ke liye same message return kiya jata hai.

**Security nuance:** Same error message information disclosure ko reduce karta hai, lekin response timing, status codes ya doosre observable behaviors se har possible existence leak automatically eliminate nahi hota.

#### Step 7 — Required roles retrieve karo

```ts
const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
  ROLES_KEY,
  [context.getHandler(), context.getClass()],
);
```

`Reflector` NestJS ka utility hai jo decorators ke through attach ki gayi metadata read karne mein help karta hai.

Yahan metadata do places par check ki ja sakti hai:

1. Current method/handler.
2. Current class.

`getAllAndOverride()` supplied targets mein se pehli defined metadata value ko prefer karta hai.

Is order mein handler pehle hai, isliye method-level roles class-level roles ko override kar sakte hain.

Ye flexibility useful hai, lekin class-level restrictions aur method-level overrides design karte waqt carefully decide karo ki overriding expected security policy hai ya nahi.

#### Step 8 — User ke role ko required roles se compare karo

```ts
if (requiredRoles?.length && !requiredRoles.includes(membership.role)) {
  throw new ForbiddenException('Insufficient role');
}
```

Agar resolver par required roles defined hain, to membership ka role unmein se ek hona chahiye.

Example:

```ts
@Roles(Role.ADMIN)
```

Agar membership role `EMPLOYEE` hai, to request reject ho jayegi.

Agar `requiredRoles` undefined ya empty hai, to supplied implementation membership check ke baad role restriction skip karti hai.

**Design warning:** Ye behavior intentional hona chahiye. Agar tumhara default rule “deny unless explicitly allowed” hai, to sensitive organization operations par required role metadata missing hone ko bhi deny karna chahiye.

#### Step 9 — Membership context store karo

```ts
req.membership = {
  organizationId,
  role: membership.role,
};
```

Ab downstream resolver ya service ko current organization aur verified membership role mil sakta hai.

Isse same membership ko dobara retrieve karne ki zaroorat kuch operations mein nahi padti.

Lekin ye request-scoped context hai, permanent authorization grant nahi. Har nayi request par relevant checks repeat hone chahiye.

#### Step 10 — Request allow karo

```ts
return true;
```

Ab resolver execute ho sakta hai.

### Compound unique key kyun important hai?

Tumhare Prisma schema mein membership combination kuch is tarah uniquely defined hona chahiye:

```prisma
model OrganizationMember {
  id             String   @id @default(uuid())
  userId         String
  organizationId  String
  role           Role

  @@unique([userId, organizationId])
}
```

Ye ek illustrative partial model hai. Existing relations aur model fields ko apne actual schema ke according preserve karna.

`@@unique([userId, organizationId])` ka matlab hai ki ek user ke liye same organization mein duplicate membership pair allowed nahi hai.

Prisma is compound unique constraint ko `findUnique()` mein use karne ke liye generated selector provide karta hai.

**Database-level constraint important hai:** Sirf application code mein duplicate check karna sufficient nahi; unique constraint concurrent requests ke against bhi integrity enforce karta hai.

---

### 5.6 `auth.resolver.ts` — protected queries

#### `me` query

```ts
@Query(() => User)
@UseGuards(JwtAuthGuard)
me(@CurrentUser() user: { id: string }) {
  return this.authService.me(user.id);
}
```

**Purpose:** Currently authenticated user ki information return karna.

Flow:

```text
Client
  │
  ▼
JWT verification
  │
  ▼
req.user.id
  │
  ▼
@CurrentUser()
  │
  ▼
authService.me(user.id)
  │
  ▼
User data
```

`me` query ko sirf authentication chahiye, organization-specific role check zaroori nahi—jab tak tumhari product policy kuch aur require na kare.

Service ko response mein password hash ya internal sensitive fields return nahi karne chahiye. Best practice hai ki user response ko explicitly select ya map karo.

#### `adminOnly` demo query

```ts
@Query(() => String)
@Roles(Role.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
adminOnly() {
  return 'You are an ADMIN of this organization';
}
```

Ye demo query hai jo verify karti hai ki organization-scoped role authorization work kar raha hai.

Is operation ko pass karne ke liye:

1. Valid access token chahiye.
2. `x-organization-id` header chahiye.
3. Authenticated user us organization ka member hona chahiye.
4. Us membership ka role `ADMIN` hona chahiye.

Real projects aur tasks ke resolvers mein bhi isi tarah appropriate guards aur business-level checks lagaye ja sakte hain.

---

### 5.7 Guard order kyun matter karta hai?

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
```

NestJS guards ko supplied order mein execute karta hai.

```text
JwtAuthGuard
     │
     ▼
RolesGuard
     │
     ▼
Resolver
```

Pehla guard identity establish karta hai. Doosra guard us identity ka organization membership aur role verify karta hai.

Agar `RolesGuard` ko `req.user` chahiye aur usse pehle identity establish nahi hui, to role guard ke paas required data nahi hoga.

**Lekin ek subtle distinction:** Guard order security ka sirf ek part hai. Agar kisi resolver par `RolesGuard` laga hi nahi, to us operation par organization membership check automatically apply nahi hoga.

Isliye har protected resolver ke liye clear access policy define karna zaroori hai.

---

## 6. Testing — Apollo Sandbox mein verify kaise kiya?

Sirf code compile hona security feature ke complete hone ka proof nahi hai. Har access-control rule ko positive aur negative tests se verify karna chahiye.

### 6.1 Headers ka correct format

Apollo Sandbox ke HTTP Headers section mein valid JSON provide karo:

```json
{
  "Authorization": "Bearer YOUR_ACCESS_TOKEN",
  "x-organization-id": "YOUR_ORGANIZATION_UUID"
}
```

Yahan:

- `YOUR_ACCESS_TOKEN` ko fresh login se mile access token se replace karo.
- `YOUR_ORGANIZATION_UUID` ko actual organization ID se replace karo.
- `Bearer` ke baad ek space hona chahiye.
- `<` aur `>` placeholders ko actual value mein include mat karo.

**Common mistake:** `userId` ko `organizationId` samajh lena.

Dono different entities hain:

```text
User.id
   │
   └── OrganizationMember.userId

Organization.id
   │
   └── OrganizationMember.organizationId
```

Organization header mein `Organization.id` ki value deni hai, `User.id` ki nahi.

### 6.2 Test matrix

Tumhare supplied notes mein ye tests successful report kiye gaye hain:

| # | Test scenario | Expected behavior |
|---:|---|---|
| 1 | `me` + valid access token | Current user return ho |
| 2 | `me` without access token | `401`, missing token |
| 3 | Tampered access token | `401`, invalid token |
| 4 | Expired access token | `401`, expired/invalid token |
| 5 | `adminOnly` + valid ADMIN membership | Query successful |
| 6 | `adminOnly` without organization header | Request reject ho |
| 7 | User membership ke bina organization ID bheje | Membership check fail ho |
| 8 | User A ka token + Organization B, jahan woh member nahi | Cross-tenant access deny ho |
| 9 | EMPLOYEE membership se `adminOnly` call ho | `403`, insufficient role |

Ye results tumhare provided notes ke according hain; inhe current codebase mein dobara run karna useful hoga, especially agar guard ya schema mein changes hue hain.

### 6.3 Test 1 — Valid user

Query:

```graphql
query {
  me {
    id
    name
    email
  }
}
```

Valid access token ke saath authenticated user ki allowed fields return honi chahiye.

### 6.4 Test 2 — Token missing

Authorization header remove karke query execute karo.

Expected behavior: `JwtAuthGuard` request reject kare.

```text
Missing access token
```

HTTP status `401` hona chahiye, assuming exception handling status ko preserve kar rahi hai.

### 6.5 Test 3 — Tampered token

Access token ke characters modify karke request bhejo.

Expected behavior:

```text
Invalid or expired access token
```

JWT signature invalid hone par verification fail honi chahiye.

### 6.6 Test 4 — Expired token

Temporary testing environment mein short access-token expiry configure karke token issue karo, expiry ke baad request bhejo aur verify karo ki access deny hota hai.

Test ke baad intended configuration restore karna:

```env
JWT_ACCESS_EXPIRES_IN="15m"
```

**Important:** Environment variable change karne se already issued token ki expiry retroactively change nahi hoti. Token ko test configuration ke under issue karna aur application configuration ko properly reload karna zaroori hai.

### 6.7 Test 5 — ADMIN membership

Valid ADMIN membership ke saath:

```graphql
query {
  adminOnly
}
```

Expected response:

```json
{
  "data": {
    "adminOnly": "You are an ADMIN of this organization"
  }
}
```

Actual GraphQL response mein server ke according additional metadata ho sakta hai.

### 6.8 Test 6 — Organization header missing

`x-organization-id` header remove karo aur `adminOnly` execute karo.

Expected behavior: organization-scoped guard request reject kare.

### 6.9 Test 7 — Non-member organization

Ek valid user ka token use karo, lekin aisi organization ID bhejo jahan uski membership nahi hai.

Expected behavior:

```text
You are not a member of this organization
```

Yahan sirf valid organization ID hona sufficient nahi. Authenticated user ka membership record bhi hona chahiye.

### 6.10 Test 8 — Cross-tenant access

Maan lo:

```text
User A → Organization A ka member
User B → Organization B ka member
```

Ab User A ke token ke saath Organization B ka ID bhejo.

Agar User A Organization B ka member nahi hai, to access deny hona chahiye.

Ye test multi-tenant application ki fundamental security property verify karta hai.

### 6.11 Test 9 — Insufficient role

EMPLOYEE membership wale user ke token ke saath `adminOnly` query execute karo.

Expected behavior:

```text
Insufficient role
```

Membership check pass ho sakta hai, lekin required role check fail ho jayega.

**Yaad rakho:** Membership aur role authorization do separate checks hain.

---

## 7. Debugging notes — jo mistakes future mein time bachayengi

### 7.1 `Invalid or expired access token`

**Possible reasons:**

- Token expire ho gaya.
- Token tampered hai.
- Signing aur verification secrets mismatch hain.
- Header mein refresh token use ho raha hai.
- `Bearer` prefix missing ya malformed hai.
- Apollo Sandbox mein stale token set hai.
- Application wrong environment configuration use kar rahi hai.

**Debugging steps:**

1. Fresh login karke naya access token lo.
2. `Authorization` header update karo.
3. Ensure karo ki access token use ho raha hai, refresh token nahi.
4. JWT signing aur verification configuration compare karo.
5. Verify karo ki expected GraphQL endpoint hit ho raha hai.

Token ko console ya logs mein print mat karo.

### 7.2 `Headers are invalid JSON`

Apollo Sandbox ke headers section mein JavaScript object nahi, valid JSON chahiye.

Correct:

```json
{
  "Authorization": "Bearer abc123",
  "x-organization-id": "organization-uuid"
}
```

Invalid JSON:

```js
{
  Authorization: Bearer abc123
}
```

Is example mein quotes aur string values missing hain.

### 7.3 `NetworkError when attempting to fetch resource`

Ye message apne aap mein authentication error prove nahi karta.

Possible causes:

- NestJS server stop ya crash ho gaya.
- Wrong URL ya port use ho raha hai.
- Database connectivity issue hai.
- Browser request CORS ya network layer par fail ho rahi hai.

Debugging:

1. Check karo ki NestJS server running hai.
2. Terminal mein actual server error dekho.
3. GraphQL endpoint aur port verify karo.
4. Agar database error hai, to database connectivity check karo.
5. CORS tab investigate karo jab browser console ya network details us direction mein indicate karein.

Tumhare previous notes mein Neon `P1001` connection issue bhi report hua tha. Aise case mein GraphQL query failure ko automatically guard bug nahi samajhna chahiye.

### 7.4 GraphQL parse error: `Expected {, found <EOF>`

Aksar iska matlab GraphQL operation incomplete hai.

Example of incomplete query:

```graphql
query {
  me {
```

Complete query:

```graphql
query {
  me {
    id
    email
  }
}
```

Apollo Sandbox editor mein complete operation run karo.

### 7.5 `You are not a member of this organization`

Common mistakes:

- User ID ko organization ID ki jagah bhej diya.
- Placeholder ke `<` aur `>` characters actual header value mein reh gaye.
- Current token kisi doosre user ka hai.
- Organization membership database mein create nahi hui.
- Request ke header mein unexpected organization ID hai.

Useful debugging technique:

```ts
console.log({
  userId,
  organizationId,
  organizationIdLength: organizationId?.length,
});
```

Ye sirf temporary local debugging example hai. Kaam complete hone ke baad logs remove karo.

**Never log:**
- Access tokens
- Refresh tokens
- Passwords
- JWT secrets
- Complete sensitive authentication headers

UUID ka length check ek clue de sakta hai, lekin valid length ka matlab correct organization ID nahi hota.

### 7.6 `403 Forbidden` vs GraphQL `errors`

GraphQL mein resolver ya guard error hone par HTTP response aur GraphQL response ka behavior REST se different ho sakta hai.

Apollo/GraphQL clients mein authorization failure aise dikh sakta hai:

```json
{
  "errors": [
    {
      "message": "Insufficient role",
      "path": ["adminOnly"]
    }
  ],
  "data": null
}
```

Isliye sirf GraphQL response body dekhkar HTTP status assume mat karo. Browser Network tab ya API client mein actual HTTP status bhi check karo.

---

## 8. Important security improvements — production mindset

Tumhara Day 6 implementation authorization ki foundation banata hai. Lekin resume-worthy backend mein in design details ko bhi samajhna important hai.

### 8.1 Har database query ko organization scope mein rakho

Maan lo `RolesGuard` verify karta hai ki user Organization A ka ADMIN hai.

Ab resolver mein:

```ts
return this.prisma.project.findUnique({
  where: { id: projectId },
});
```

Ye query sirf project ID ke basis par record retrieve karti hai. Agar application mein project IDs global hain, tab bhi query organization ownership validate nahi karti.

Safer design mein project ko requested organization ke context mein retrieve aur authorize kiya jata hai.

Conceptually:

```text
Authenticated user
       │
       ▼
Verified organization membership
       │
       ▼
Project belongs to active organization?
       │
       ├── No  → Deny
       │
       └── Yes → Continue with resource policy
```

Prisma schema aur query structure ke according `organizationId` ko filter mein include karo ya relation-based ownership check karo.

**Core rule:** Organization membership ka matlab us organization ke har resource par unrestricted access nahi hota. Resource ownership aur business permissions alag se enforce karne pad sakte hain.

### 8.2 `RolesGuard` ka default behavior consciously choose karo

Tumhara current guard unprotected role metadata ke case mein membership check karke allow kar sakta hai.

Ye kuch operations ke liye intentional ho sakta hai, lekin sensitive operations mein dangerous ho sakta hai agar developer `@Roles()` lagana bhool jaye.

Do possible policies:

**Policy A — Membership required, role optional**

- Membership verify karo.
- Role metadata present ho to role verify karo.
- Metadata absent ho to kisi bhi member ko allow karo.

Ye tumhare supplied implementation ka behavior hai.

**Policy B — Deny by default**

- Organization membership verify karo.
- Protected operation ke liye required role ya explicit policy mandatory ho.
- Policy missing ho to request reject karo.

Security-sensitive applications mein default-deny design often safer hota hai. Lekin implementation tumhari intended product policy ke according honi chahiye.

### 8.3 Authentication failure ke liye consistent exception

`RolesGuard` mein:

```ts
if (!userId) {
  throw new ForbiddenException('Authentication required');
}
```

Tumhare current code mein ye `403` generate karega.

Semantically better behavior:

```ts
if (!userId) {
  throw new UnauthorizedException('Authentication required');
}
```

Agar guard order correctly configured hai, to ye fallback condition normally hit nahi honi chahiye. Phir bhi consistent exception semantics debugging aur API clients ke liye useful hain.

### 8.4 Request context ko strongly type karo

Abhi request object se `req.user` aur `req.membership` read/write kiya ja raha hai.

TypeScript mein custom request type define karne se accidental property mistakes aur implicit `any` issues reduce ho sakte hain.

Conceptually:

```ts
type AuthenticatedUser = {
  id: string;
};

type OrganizationMembershipContext = {
  organizationId: string;
  role: Role;
};
```

Phir apne actual NestJS/GraphQL context types ko in structures ke according define karo.

Ye runtime authorization ka replacement nahi hai. Types compile-time code correctness improve karte hain; membership aur permissions ko phir bhi runtime par verify karna hota hai.

### 8.5 Authorization caching baad mein consider karo

Har organization-scoped request par membership database lookup hota hai.

Agar traffic bahut badh jaye, to membership/role caching useful ho sakti hai.

Lekin cache mein stale role store ho sakta hai. Isliye cache use karne se pehle decide karo:

- Role change ke baad cache kaise invalidate hoga?
- Membership revoke hone par cached access kaise remove hoga?
- Cache unavailable hone par fail-open ya fail-closed behavior kya hoga?
- Kya sensitive operations ke liye fresh database verification chahiye?

Redis future optimization ho sakta hai, lekin Day 6 ke initial authorization flow mein database-backed membership check simpler aur easier to reason about hai.

### 8.6 Guard authorization ko service layer mein bhi carefully enforce karo

Resolvers ke guards API entry point par access control provide karte hain.

Lekin agar wahi service future mein kisi doosre resolver, scheduled job ya internal operation se call hoti hai, to resolver guard automatically har invocation par run nahi hota.

Sensitive business operations mein service ko bhi relevant ownership aur authorization invariants enforce karne chahiye.

Iska matlab har check ko blindly duplicate karna nahi; responsibility ko clearly separate karna hai:

- Guard: request-level authentication aur access policy.
- Service: business rules aur resource-level authorization, jahan required ho.
- Database: unique constraints, foreign keys aur data integrity.

---

## 9. Interview Q&A — Day 6

### Q1. Authentication aur authorization mein kya difference hai?

**Answer:** Authentication identity verify karta hai, jabki authorization decide karta hai ki verified identity ko requested resource ya operation ka access milna chahiye ya nahi. TaskForge mein `JwtAuthGuard` JWT verify karta hai aur `RolesGuard` organization membership aur required role check karta hai.

### Q2. NestJS Guard kya hota hai?

**Answer:** Guard ek class hai jo `CanActivate` implement karti hai. Iska `canActivate()` method decide karta hai ki current request execution aage badh sakta hai ya nahi. Hum guards ko centralized authentication aur authorization logic ke liye use karte hain.

### Q3. `JwtAuthGuard` aur `RolesGuard` alag kyun hain?

**Answer:** Dono ki responsibilities different hain. `JwtAuthGuard` access token verify karke identity establish karta hai. `RolesGuard` authenticated user ki organization membership aur role verify karta hai. Is separation se code modular aur maintainable rehta hai.

### Q4. JWT payload mein role kyun nahi store kiya?

**Answer:** TaskForge mein user multiple organizations ka member ho sakta hai aur har organization mein uska role alag ho sakta hai. Isliye JWT ko identity tak limited rakha hai aur organization-scoped role database membership se resolve kiya hai. Isse role changes subsequent authorization checks par reflect ho sakte hain.

### Q5. `sub` claim kya hota hai?

**Answer:** `sub` JWT ka subject claim hai. TaskForge mein ismein authenticated user ki identity rakhi jati hai. Guard verified payload se `sub` read karke `req.user.id` set karta hai.

### Q6. `@CurrentUser()` kya karta hai?

**Answer:** Ye custom parameter decorator hai jo GraphQL request context se authenticated user retrieve karta hai. Ye resolver ko `req.user` directly access karne ki zaroorat se bachata hai. Token verification decorator nahi, `JwtAuthGuard` karta hai.

### Q7. `@Roles()` aur `RolesGuard` mein kya difference hai?

**Answer:** `@Roles()` handler par required roles ka metadata attach karta hai. `RolesGuard` `Reflector` se metadata read karta hai aur actual database membership role ke saath compare karke access enforce karta hai.

### Q8. `Reflector.getAllAndOverride()` kya karta hai?

**Answer:** Ye specified targets, jaise handler aur class, par metadata retrieve karta hai. Agar multiple targets par metadata ho, to supplied order mein pehli defined value return hoti hai. Hum handler ko pehle rakhte hain, isliye method-level roles class-level roles ko override kar sakte hain.

### Q9. Multi-tenancy aur tenant isolation mein kya difference hai?

**Answer:** Multi-tenancy architecture multiple organizations ko ek application mein serve karti hai. Tenant isolation ensure karta hai ki ek organization ka user doosri organization ke unauthorized data ko access na kar sake.

### Q10. `x-organization-id` header spoof ho sakta hai. Isse secure kaise banaya?

**Answer:** Header ko sirf organization context select karne ke liye use kiya hai. Ye permission prove nahi karta. `RolesGuard` authenticated user ID aur organization ID ke combination se `OrganizationMember` database record retrieve karta hai. Membership nahi milne par request reject hoti hai.

### Q11. `401` aur `403` mein kya difference hai?

**Answer:** `401` missing ya invalid authentication credentials ko indicate karta hai. `403` ka matlab hai ki request ko access nahi diya gaya, jaise authenticated user ke paas required role nahi hai. TaskForge mein invalid JWT par `401` aur insufficient role par `403` use kiya gaya hai.

### Q12. `findUnique()` yahan kyun use kiya?

**Answer:** Kyunki `userId` aur `organizationId` ka combination Prisma schema mein compound unique constraint se define hai. Isliye membership ko us unique pair se retrieve kar sakte hain.

### Q13. Kya organization ka member hone se uske saare projects ka access mil jata hai?

**Answer:** Nahi. Organization membership ek initial authorization condition hai. Resource-level ownership, project membership aur business permissions bhi check karni pad sakti hain. Har database query ko appropriate organization scope mein execute karna chahiye.

### Q14. Har request par database membership query performance issue nahi banegi?

**Answer:** Initial implementation mein indexed compound unique lookup simple aur predictable approach hai. Agar future traffic mein ye bottleneck bane, to Redis caching consider kar sakte hain, lekin role changes aur membership revocation ke baad cache invalidation carefully design karna hoga.

### Q15. Kya `@CurrentUser()` ko guard ke bina use kar sakte hain?

**Answer:** Technically decorator execute ho sakta hai, lekin woh khud authentication verify nahi karta. Agar request context mein authenticated user set nahi hai, to result missing ya undefined ho sakta hai. Protected resolver par appropriate authentication guard lagana chahiye.

### Q16. Agar user ko ADMIN se EMPLOYEE downgrade kar diya, to kya hoga?

**Answer:** Agar role har request par database se retrieve ho raha hai aur stale authorization cache use nahi ho raha, to next authorization check mein updated role use hoga. Purana JWT identity establish karega, lekin old role ko authoritative permission nahi maana jayega.

---

## 10. Day 6 — Final checklist

### Implementation

- [x] GraphQL context mein HTTP `req` expose kiya.
- [x] `JwtAuthGuard` implement kiya.
- [x] Bearer access token parse aur verify kiya.
- [x] Verified JWT se `req.user` populate kiya.
- [x] `@CurrentUser()` custom parameter decorator banaya.
- [x] `me` query ko protect kiya.
- [x] `@Roles()` decorator aur metadata define kiya.
- [x] `RolesGuard` mein organization membership verify ki.
- [x] `Reflector` se required role metadata retrieve kiya.
- [x] `adminOnly` demo query implement ki.

### Security testing

- [x] Missing access token test kiya.
- [x] Tampered access token test kiya.
- [x] Expired token test kiya.
- [x] Missing organization header test kiya.
- [x] Non-member organization access test kiya.
- [x] Cross-tenant access test kiya.
- [x] Insufficient-role test kiya.
- [x] Temporary expiry configuration restore ki.
- [x] Debug logs remove kiye.

### Review before moving forward

- [ ] Verify karo ki protected resolvers par appropriate guards lage hain.
- [ ] Confirm karo ki signing aur verification secrets consistent hain.
- [ ] Check karo ki API responses mein password hashes expose nahi ho rahe.
- [ ] Confirm karo ki organization-scoped database queries tenant isolation maintain karti hain.
- [ ] Review karo ki missing role metadata ka behavior intended security policy ke according hai.
- [ ] Ensure karo ki secrets aur authentication tokens Git mein commit nahi hue.

**Note:** Pehle do sections tumhare supplied notes mein completed hain. Review checklist ke last items ko current codebase ke against verify karna hai; inhe automatically completed assume mat karna.

---

## 11. Git commit — Day 6 changes save karo

Agar Day 6 ke changes abhi commit nahi hue hain, to backend directory mein jao:

```bash
cd ~/Documents/TaskForge/work-bench/backend
```

### Step 1 — Current changes check karo

```bash
git status
```

Confirm karo ki expected files modified ya untracked dikh rahi hain.

### Step 2 — Sensitive files check karo

Commit karne se pehle ensure karo ki `.env`, real secrets, access tokens ya refresh tokens stage nahi ho rahe.

```bash
git status --short
```

Agar `.env` stage ho gaya hai, to usse staging area se remove kar sakte ho:

```bash
git restore --staged .env
```

Ye command file ko staging se remove karti hai; local file delete nahi karti.

### Step 3 — Changes stage karo

```bash
git add src/
```

Agar Day 6 mein additional tracked configuration ya documentation files bhi change hui hain, to unhe review karke separately stage karo.

### Step 4 — Commit banao

```bash
git commit -m "feat(auth): add organization-scoped RBAC"
```

Ye message Day 6 ke main feature ko describe karta hai.

### Step 5 — Verify karo

```bash
git status
```

Agar repository mein pehle se remote configured hai aur branch par push karna hai, to pehle branch aur remote verify karo:

```bash
git branch --show-current
git remote -v
```

Uske baad correct remote aur branch par push kar sakte ho.

**Important:** Agar Day 4 aur Day 5 ke changes pehle hi commit ho chuke hain, to unhe dobara commit karne ki zaroorat nahi. Git status dekhkar sirf new Day 6 changes commit karo.

---

## 12. Day 7 preview — Security hardening

Day 6 mein humne establish kiya ki **kaun request kar raha hai aur uske paas kya permissions hain**.

Day 7 mein focus hoga application ki overall security aur configuration ko strengthen karna.

### Planned topics

| Topic | Purpose |
|---|---|
| CORS | Browser-based cross-origin requests ko control karna |
| Helmet | Common HTTP security headers configure karna |
| Rate limiting | Repeated requests aur login abuse ko limit karna |
| Environment variables | Secrets aur environment-specific configuration manage karna |
| Input validation | Invalid request data reject karna |
| Error handling | Safe aur consistent error responses |
| Logging hygiene | Passwords, tokens aur secrets ko logs se door rakhna |
| Security testing | Important negative scenarios dobara verify karna |

### Day 7 ke baad target architecture

```text
Incoming Request
       │
       ▼
CORS / HTTP Security Configuration
       │
       ▼
Rate Limiting
       │
       ▼
GraphQL Request
       │
       ▼
JwtAuthGuard
       │
       ▼
RolesGuard
       │
       ▼
Resolver
       │
       ▼
Service-Level Business Rules
       │
       ▼
Organization-Scoped Database Queries
```

Ye conceptual architecture hai; actual NestJS middleware, guards aur GraphQL pipeline ka exact execution order configuration ke according verify karna hoga.

---

## 13. Day 6 ka final mental model

Bhai, is poore implementation ko bas is sequence mein yaad rakhna:

**Identity → Membership → Role → Resource Permission**

```text
1. JWT valid hai?
       │
       ▼
2. User kaun hai?
       │
       ▼
3. User kis organization ka member hai?
       │
       ▼
4. Organization mein uska role kya hai?
       │
       ▼
5. Kya woh requested resource par ye action kar sakta hai?
       │
       ▼
     ALLOW / DENY
```

Har step ka apna purpose hai:

- **JWT verification** identity establish karti hai.
- **Membership lookup** organization ke saath relationship establish karta hai.
- **RBAC** role ke basis par access control karta hai.
- **Resource-level authorization** verify karti hai ki user specific project, task ya doosre resource par requested operation kar sakta hai.
- **Database constraints** data integrity maintain karte hain.

Ek professional backend developer ko sirf guards likhna nahi, balki ye bhi samajhna chahiye ki **kis layer par kaun-si security responsibility honi chahiye**.

TaskForge ke liye Day 6 isi architecture ki foundation hai. Aage jab hum Projects, Tasks aur Organization Members ke real GraphQL operations banayenge, tab ye concepts actual business logic mein apply honge.