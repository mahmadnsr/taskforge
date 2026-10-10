Bhai, tera existing Day 1 documentation already achha hai. Lekin agar tu ise **future revision, actual development, debugging aur interview preparation** ke liye use karna chahta hai, toh har code block ke saath ye bhi samajhna chahiye:

- Har import kyun kiya hai?
- `@ObjectType()`, `@Field()`, `@Query()` aur `@Args()` kya karte hain?
- `findMany()` aur `findUnique()` mein kya difference hai?
- `where`, `include`, `map()` aur `async/await` ka exact role kya hai?
- `JwtAuthGuard` aur `@CurrentUser()` milkar authentication kaise karte hain?
- `PrismaModule` import kyun karna padta hai?
- `global: true` ka actual effect kya hai?
- Prisma mocks se tests kaise execute hote hain?
- Production application mein kaun-se security points important hain?

Neeche tera **Phase 2, Day 1 ka expanded documentation** hai. Existing implementation ko base rakha hai, aur important concepts ko code ke saath explain kiya hai.

---

# Phase 2 — Day 1: Organization Queries & Membership Authorization

**Project:** TaskForge  
**Phase:** 2 — Core Business Features  
**Day:** 1  
**Primary objective:** Authenticated organization queries + tenant isolation  
**Architecture:** NestJS + GraphQL + Prisma + PostgreSQL + JWT + Vitest

## 1. Day 1 ka objective

Phase 1 mein humne authentication aur database foundation implement kiya tha.

Database mein already ye models hain:

- `User`
- `Organization`
- `OrganizationMember`
- `RefreshToken`

Ab Phase 2 mein hum in models ke upar actual business functionality implement karenge.

Day 1 par hum do GraphQL queries banayenge:

1. `myOrganizations` — logged-in user kin organizations ka member hai?
2. `organization(id)` — kya logged-in user kisi particular organization ki details dekh sakta hai?

Lekin sirf database se organization fetch karna enough nahi hai.

Suppose TaskForge mein do organizations hain:

```text
Organization A
├── Ahmed
└── Rahul

Organization B
├── Priya
└── Sana
```

Agar Ahmed Organization A ka member hai aur use Organization B ki ID pata chal jaati hai, toh kya woh Organization B ka data access kar sakta hai?

**Nahi.**

Application ko database mein verify karna hoga ki Ahmed requested organization ka member hai ya nahi.

Is process ko membership authorization kehte hain.

### Day 1 ka final result

```text
Authenticated User
       |
       v
Organization Queries
       |
       v
Membership Verification
       |
       +------ Membership found ------> Return Organization
       |
       +------ Membership missing ----> Reject with 403
```

Important distinction:

- **Authentication:** User kaun hai?
- **Authorization:** Kya user ko requested resource access karne ki permission hai?

JWT authentication establish karta hai ki request kis authenticated user ki hai. Membership check decide karta hai ki woh user organization access kar sakta hai ya nahi.

---

# 2. Important terminology

Is section ko achhe se samajh lena. Aage ke projects, backend interviews aur system design mein ye concepts repeatedly use honge.

| Term | Meaning | TaskForge mein use |
|---|---|---|
| Tenant | Ek logically isolated customer, company ya workspace | Ek organization |
| Multi-tenancy | Ek application mein multiple tenants ko support karna | Multiple organizations TaskForge use kar sakti hain |
| Tenant isolation | Ek tenant ka private data doosre tenant se inaccessible rakhna | Organization B ka data Organization A ke members ko automatically accessible nahi hoga |
| Membership | User aur organization ke beech relationship | `OrganizationMember` |
| Authentication | User ki identity verify karna | JWT verification |
| Authorization | User ki permission verify karna | Membership check |
| JWT | Signed token format jisme claims carry kiye ja sakte hain | Access token se authenticated user identify karna |
| Guard | Request ko resolver tak pahunchne se pehle allow ya reject karne wala NestJS mechanism | `JwtAuthGuard` |
| Decorator | Class, method ya parameter ko metadata ya additional behavior dene wala TypeScript mechanism | `@Query()`, `@Args()`, `@CurrentUser()` |
| Resolver | GraphQL operations handle karne wali class/methods | `OrganizationsResolver` |
| Service layer | Business logic implement karne wali layer | `OrganizationsService` |
| ORM | Objects aur database records ke beech mapping provide karne wala tool | Prisma |
| Prisma Client | Generated API jo database queries execute karti hai | `this.prisma.organizationMember.findMany()` |
| Dependency Injection | Required dependency ko manually construct karne ke bajay framework se receive karna | `PrismaService` constructor mein inject hota hai |
| Compound unique key | Multiple columns ko mila kar banayi gayi unique constraint | `userId + organizationId` |
| IDOR | Object ki ID manipulate karke unauthorized access lene ki vulnerability | Kisi doosri organization ki ID se uska data mangna |
| Unit test | Ek component ki functionality ko isolated environment mein test karna | `OrganizationsService` tests |
| Mock | Real dependency ka controlled substitute | Mocked Prisma methods |
| Dependency Injection wiring | Application mein providers aur modules ka correctly connected hona | NestJS startup verification |

## 2.1 Tenant aur membership ka relationship

Database ko conceptually aise samajh:

```text
User
 |
 | 1
 |
 | N
OrganizationMember
 |
 | N
 |
 | 1
Organization
```

Actually, `User` aur `Organization` ka relationship many-to-many hai:

- Ek user multiple organizations ka member ho sakta hai.
- Ek organization mein multiple users ho sakte hain.

`OrganizationMember` junction model hai jo is relationship ko represent karta hai.

Example:

| userId | organizationId | role |
|---|---|---|
| u1 | o1 | ADMIN |
| u2 | o1 | EMPLOYEE |
| u1 | o2 | MANAGER |

Is table ke according, `u1` dono organizations ka member hai.

`u2` sirf `o1` ka member hai.

Isliye authorization check karte waqt sirf user ID ya organization ID check karna enough nahi hai.

**Humein dono IDs ka relationship verify karna hai.**

---

# 3. Architecture: Request kaise process hoti hai?

Day 1 ka architecture samajhna bahut important hai, kyunki isi pattern ko Day 2 mein team members, Day 3 mein role-based authorization aur aage projects ke liye reuse karenge.

```text
                  CLIENT
                    |
                    | GraphQL Query
                    | Authorization: Bearer <token>
                    v
             GRAPHQL SERVER
                    |
                    v
              JwtAuthGuard
                    |
                    | JWT verification
                    | Attach authenticated identity
                    v
          OrganizationsResolver
                    |
                    | @CurrentUser()
                    | Extract user ID
                    v
          OrganizationsService
                    |
                    | Business authorization
                    v
              PrismaService
                    |
                    | Database query
                    v
           PostgreSQL / NeonDB
                    |
                    v
          Membership Verification
                    |
           +--------+--------+
           |                 |
           v                 v
       Authorized         Unauthorized
           |                 |
           v                 v
     Return organization   Reject request
```

### Har layer ki responsibility

| Layer | Responsibility |
|---|---|
| GraphQL | Client ki query receive karna aur response format karna |
| Guard | Request ki authentication verify karna |
| Resolver | GraphQL arguments aur authenticated identity service ko dena |
| Service | Business rules aur authorization checks implement karna |
| Prisma | Database operations execute karna |
| PostgreSQL | Persistent records store karna |

Ek important baat: `JwtAuthGuard` authentication karta hai, lekin apne aap organization membership verify nahi karta.

Membership check `OrganizationsService` mein implement kiya gaya hai.

Is separation se authentication aur business authorization ki responsibilities alag rehti hain.

---

# 4. GraphQL entity: `organization.entity.ts`

**File:** `src/organizations/entities/organization.entity.ts`

```ts
import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class Organization {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field()
  slug!: string;
}
```

Ab har important term ko samajhte hain.

## 4.1 `import { Field, ID, ObjectType }`

```ts
import { Field, ID, ObjectType } from '@nestjs/graphql';
```

Ye NestJS GraphQL package se teen decorators/types import karta hai.

### `ObjectType`

```ts
@ObjectType()
export class Organization
```

`@ObjectType()` GraphQL ko batata hai ki ye class GraphQL object type represent karti hai.

Iske bina class automatically GraphQL output type nahi ban jaati.

GraphQL schema mein iska conceptual representation hoga:

```graphql
type Organization {
  id: ID!
  name: String!
  slug: String!
}
```

Yahan:

- `type Organization` ek GraphQL object type hai.
- `id` organization ki identity represent karta hai.
- `name` organization ka naam hai.
- `slug` organization ka readable identifier hai.

### `Field`

```ts
@Field()
name!: string;
```

`@Field()` property ko GraphQL schema mein expose karta hai.

Agar class mein koi property hai lekin use GraphQL field ke roop mein expose nahi kiya gaya, toh woh property automatically client ke liye queryable nahi ho jaati.

For example:

```ts
@ObjectType()
export class Organization {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  internalCode!: string;
}
```

Is example mein `internalCode` par `@Field()` nahi hai.

Isliye woh generated GraphQL schema ka field nahi hoga.

Ye security ke liye ek useful principle hai: **GraphQL entity mein sirf wahi fields expose karo jo client ko genuinely chahiye.**

Lekin yaad rakhna, GraphQL mein field expose na karna aur database access authorize karna do alag responsibilities hain.

### `ID`

```ts
@Field(() => ID)
id!: string;
```

GraphQL ka `ID` scalar unique identifiers represent karne ke liye use hota hai.

Yahan:

```ts
@Field(() => ID)
```

GraphQL ko explicit batata hai ki `id` ka type `ID` hai.

`ID` aur `String` dono serialized form mein string jaise dikh sakte hain, lekin `ID` ka semantic purpose identity represent karna hai.

### `!` ka kya meaning hai?

```ts
id!: string;
```

Yahan do alag cheezein hain:

- TypeScript ka `!` definite assignment assertion hai.
- GraphQL schema ka `!` non-null marker hai.

TypeScript mein `id!: string` compiler ko batata hai ki property initialization ko lekar compiler error suppress kiya ja sakta hai, kyunki initialization ka responsibility kisi doosre mechanism ke paas ho sakta hai.

GraphQL mein generated schema ka `ID!` batata hai ki field null nahi hona chahiye.

**Dono exclamation marks ka purpose same nahi hai.**

---

# 5. Service layer: `organizations.service.ts`

**File:** `src/organizations/organizations.service.ts`

Ye Day 1 ki sabse important file hai.

Resolver request receive karega, lekin actual business rules service mein rahenge.

Service mein teen important methods hain:

1. `createWithAdmin()`
2. `findAllForUser()`
3. `findOneForMember()`

Pehla method Phase 1 ki organization creation functionality ko support karta hai. Doosre do Day 1 ki queries implement karte hain.

## 5.1 Imports ka purpose

```ts
import { Prisma, Role } from '@prisma/client';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { generateSlug } from '../common/utils/slug.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
```

| Import | Purpose |
|---|---|
| `Prisma` | Prisma ke generated types, including transaction client type |
| `Role` | Database mein defined role values ko reference karna |
| `ForbiddenException` | Unauthorized resource access ke liye HTTP 403 exception throw karna |
| `Injectable` | Class ko NestJS dependency injection mein provider ke roop mein use karne dena |
| `generateSlug` | Organization name se slug generate karna |
| `PrismaService` | Database operations execute karna |

### `Role` kyun import kiya?

```ts
members: {
  create: {
    userId: adminUserId,
    role: Role.ADMIN,
  },
}
```

Role ko manually string ke roop mein likhne ke bajay generated enum value use ki gayi hai.

Isse TypeScript ko pata rehta hai ki role defined values mein se hona chahiye.

For example, agar enum mein `ADMIN`, `MANAGER` aur `EMPLOYEE` defined hain, toh `Role.ADMIN` unmein se valid value reference karta hai.

Actual accepted values tumhare Prisma schema aur generated client par depend karte hain.

### `Injectable()` kya karta hai?

```ts
@Injectable()
export class OrganizationsService
```

`@Injectable()` NestJS ko indicate karta hai ki class dependency injection system ke through manage ki ja sakti hai.

Ab constructor mein dependency receive kar sakte hain:

```ts
constructor(private prisma: PrismaService) {}
```

NestJS registered provider `PrismaService` ko resolve karke service ko deta hai.

Har jagah manually ye karne ki zarurat nahi:

```ts
const prisma = new PrismaService();
```

Isse dependency management centralized rehta hai aur testing mein mock dependency dena aasan hota hai.

---

## 5.2 `createWithAdmin()` — Existing creation logic

```ts
createWithAdmin(
  tx: Prisma.TransactionClient,
  name: string,
  adminUserId: string,
) {
  return tx.organization.create({
    data: {
      name,
      slug: generateSlug(name),
      members: {
        create: {
          userId: adminUserId,
          role: Role.ADMIN,
        },
      },
    },
  });
}
```

Ye method organization create karne ke saath creator ko `ADMIN` membership deta hai.

### Parameters ka role

| Parameter | Meaning |
|---|---|
| `tx` | Active Prisma transaction client |
| `name` | Organization ka naam |
| `adminUserId` | Us user ki ID jo organization ka admin banega |

### `Prisma.TransactionClient`

```ts
tx: Prisma.TransactionClient
```

Ye TypeScript type batata hai ki `tx` ek Prisma transaction client hai.

Transaction tab useful hoti hai jab multiple related database operations ko ek atomic unit mein execute karna ho.

For example:

```text
Create Organization
        |
        v
Create Admin Membership
```

Agar dono operations ek transaction ka part hain aur doosra operation fail ho jaata hai, toh transaction ko rollback kiya ja sakta hai.

Isse partially created data ka risk kam hota hai.

Dhyan rahe: method khud transaction start nahi kar raha. Ye transaction client receive karta hai. Transaction start karne ka responsibility caller ka hai.

### `tx.organization.create()`

```ts
tx.organization.create({
  data: {
    name,
    slug: generateSlug(name),
  },
});
```

Ye Prisma Client ki create operation hai.

Conceptually:

```sql
INSERT INTO "Organization" (...)
VALUES (...);
```

Actual SQL database schema, relation handling aur Prisma configuration par depend karega.

### Nested write

```ts
members: {
  create: {
    userId: adminUserId,
    role: Role.ADMIN,
  },
},
```

Ye Prisma nested write hai.

Iska purpose organization create karte waqt usse related membership record bhi create karna hai.

Agar organization ka naam `TaskForge India` hai, toh generated slug example ke liye `taskforge-india` ho sakta hai.

Result conceptually:

```text
Organization
-------------
id: org1
name: TaskForge India
slug: taskforge-india

OrganizationMember
------------------
userId: user1
organizationId: org1
role: ADMIN
```

Is code ka ek important benefit hai: organization aur uski admin membership related operation ke roop mein create ho sakte hain.

---

## 5.3 `findAllForUser()` — User ki saari organizations

```ts
async findAllForUser(userId: string) {
  const memberships = await this.prisma.organizationMember.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: 'asc' },
  });

  return memberships.map((m) => m.organization);
}
```

Ye method logged-in user ki memberships fetch karta hai aur un memberships se organizations return karta hai.

### Step 1: `async`

```ts
async findAllForUser(userId: string)
```

Database operation asynchronous hai.

`async` function ke andar `await` use kar sakte hain.

Asynchronous operation complete hone par method apna result Promise ke through return karta hai.

### Step 2: `userId: string`

```ts
userId: string
```

Ye TypeScript parameter annotation hai.

Ye batata hai ki method ko string user ID chahiye.

Is method ko call karne wala resolver authenticated user ki ID pass karega.

Important: TypeScript type runtime authorization nahi hai. Authorization is baat par depend karti hai ki ID trusted source se aayi hai aur query sahi tarah scoped hai.

### Step 3: `findMany()`

```ts
this.prisma.organizationMember.findMany(...)
```

`findMany()` database mein matching multiple records fetch karta hai.

Hum `OrganizationMember` table query kar rahe hain, kyunki user aur organization ke beech membership isi model mein stored hai.

### Step 4: `where`

```ts
where: { userId }
```

Ye condition ka shorthand form hai:

```ts
where: {
  userId: userId,
}
```

JavaScript object property shorthand tab use hota hai jab property name aur variable name same ho.

Database query ka logical meaning:

```sql
SELECT *
FROM "OrganizationMember"
WHERE "userId" = 'u1';
```

SQL sirf conceptual example hai. Prisma relation fields aur configured database naming ke hisaab se actual query generate karta hai.

Agar user ID `u1` hai, toh sirf us user ki membership rows match karengi.

### Step 5: `include`

```ts
include: {
  organization: true,
}
```

Ye related organization record bhi fetch karne ke liye use hota hai.

Suppose membership table mein ye record hai:

```text
userId = u1
organizationId = o1
role = ADMIN
```

Sirf membership fetch karne par organization ka naam automatically available nahi hoga, jab tak usse separately query na kiya jaaye.

`include: { organization: true }` related organization ko query result mein include karta hai.

Conceptual result:

```ts
[
  {
    userId: 'u1',
    organizationId: 'o1',
    role: 'ADMIN',
    organization: {
      id: 'o1',
      name: 'Organization A',
      slug: 'organization-a',
    },
  },
]
```

Ye example simplified hai. Actual returned record mein Prisma model ke according aur bhi fields ho sakte hain.

### `include` aur `select` mein difference

`include` related records ko result mein include karne ke liye use hota hai.

`select` specific fields choose karne ke liye use hota hai.

For example:

```ts
include: {
  organization: true,
}
```

Related organization ke selected relation fields ke bajay generally us relation ke saare scalar fields aur configured nested selections return kar sakta hai.

Agar sirf organization ka `id`, `name` aur `slug` chahiye, toh explicit `select` use karna data minimization ke liye better ho sakta hai.

```ts
const memberships = await this.prisma.organizationMember.findMany({
  where: { userId },
  select: {
    organization: {
      select: {
        id: true,
        name: true,
        slug: true,
      },
    },
  },
  orderBy: { createdAt: 'asc' },
});
```

Is alternative ke saath returned structure mein `organization` hi select hua hai, membership ke baaki fields nahi.

Day 1 ke existing implementation mein `include` use kiya gaya hai, isliye documentation original code ke behavior ko explain kar rahi hai.

### Step 6: `orderBy`

```ts
orderBy: {
  createdAt: 'asc',
}
```

Ye records ko ascending order mein sort karta hai.

`asc` ka meaning ascending hai.

Dates ke context mein older timestamps pehle aayenge aur newer timestamps baad mein.

Yahan sorting membership ke `createdAt` field par hai.

### Step 7: `map()`

```ts
return memberships.map((m) => m.organization);
```

`map()` array ke har element ko transform karke ek naya array return karta hai.

Input:

```ts
[
  {
    userId: 'u1',
    role: 'ADMIN',
    organization: {
      id: 'o1',
      name: 'Organization A',
      slug: 'organization-a',
    },
  },
  {
    userId: 'u1',
    role: 'EMPLOYEE',
    organization: {
      id: 'o2',
      name: 'Organization B',
      slug: 'organization-b',
    },
  },
]
```

Output:

```ts
[
  {
    id: 'o1',
    name: 'Organization A',
    slug: 'organization-a',
  },
  {
    id: 'o2',
    name: 'Organization B',
    slug: 'organization-b',
  },
]
```

`m` current membership object hai.

`m.organization` us membership se related organization hai.

Isliye final result mein membership objects ki jagah organization objects return hote hain.

### Complete execution flow

```text
findAllForUser('u1')
        |
        v
organizationMember.findMany()
        |
        | where userId = 'u1'
        v
Matching Membership Records
        |
        | include organization
        v
Membership + Organization Objects
        |
        | map(m => m.organization)
        v
Organization Array
```

### Agar user kisi organization ka member nahi hai?

`findMany()` matching records na milne par empty array return karta hai.

Isliye:

```ts
return memberships.map((m) => m.organization);
```

ka result bhi empty array hoga.

GraphQL response:

```json
{
  "data": {
    "myOrganizations": []
  }
}
```

Ye valid response hai. Empty organization list ko error banana zaroori nahi hai.

---

## 5.4 `findOneForMember()` — Membership authorization

```ts
async findOneForMember(userId: string, organizationId: string) {
  const membership = await this.prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
    include: {
      organization: true,
    },
  });

  if (!membership) {
    throw new ForbiddenException(
      'You are not a member of this organization',
    );
  }

  return membership.organization;
}
```

Ye Day 1 ka main authorization method hai.

Iska kaam sirf organization fetch karna nahi hai.

Iska kaam pehle verify karna hai ki authenticated user requested organization ka member hai.

### Step 1: Dono IDs receive karna

```ts
userId: string,
organizationId: string
```

- `userId`: authenticated user ki identity.
- `organizationId`: client jis organization ko access karna chahta hai.

Example:

```text
Authenticated user: u1
Requested organization: o2
```

Ab database se verify karna hai ki membership `(u1, o2)` exist karti hai ya nahi.

### Step 2: `findUnique()`

```ts
this.prisma.organizationMember.findUnique(...)
```

`findUnique()` unique identifier ya unique constraint ke basis par ek record fetch karta hai.

Yahan hum compound unique key use kar rahe hain.

### Step 3: Compound unique key

```ts
where: {
  userId_organizationId: {
    userId,
    organizationId,
  },
}
```

Ye syntax tab available hota hai jab Prisma schema mein corresponding compound unique constraint define ki gayi ho.

For example:

```prisma
model OrganizationMember {
  userId         String
  organizationId String
  role           Role

  user         User         @relation(fields: [userId], references: [id])
  organization Organization @relation(fields: [organizationId], references: [id])

  @@unique([userId, organizationId])
}
```

Ye model snippet illustrative hai. Apne existing schema mein additional fields, IDs aur relation configuration ko preserve karna hai.

### `@@unique([userId, organizationId])` kya karta hai?

Ye database ko batata hai ki ek hi user-organization pair ki duplicate membership rows allowed nahi honi chahiye.

Valid:

```text
u1 + o1
u1 + o2
u2 + o1
```

Invalid duplicate:

```text
u1 + o1
u1 + o1
```

Dono columns ka combination unique hai.

Prisma isi compound constraint ke liye generated unique selector provide karta hai:

```ts
userId_organizationId
```

Isliye hum directly ye query kar sakte hain:

```ts
where: {
  userId_organizationId: {
    userId: 'u1',
    organizationId: 'o1',
  },
}
```

**Important:** `userId_organizationId` apne aap magic string nahi hai. Iska naam Prisma ke generated unique selector se aata hai. Agar schema mein constraint ka naam explicitly customize kiya gaya hai, toh generated selector ka naam different ho sakta hai.

### Compound unique key ke do benefits

**1. Correctness**

Database ek user ko ek hi organization mein duplicate memberships assign hone se rok sakta hai.

**2. Efficient lookup**

Application ko exact user-organization pair se membership lookup karne ke liye suitable unique index milta hai.

Exact query plan database aur index configuration par depend karta hai, lekin unique lookup ka purpose ek specific record efficiently identify karna hai.

### Step 4: `include: { organization: true }`

```ts
include: {
  organization: true,
}
```

Membership milne par associated organization ko bhi fetch karta hai.

Result conceptually:

```ts
{
  userId: 'u1',
  organizationId: 'o1',
  role: 'ADMIN',
  organization: {
    id: 'o1',
    name: 'Organization A',
    slug: 'organization-a',
  },
}
```

### Step 5: `if (!membership)`

```ts
if (!membership) {
  throw new ForbiddenException(
    'You are not a member of this organization',
  );
}
```

Agar `findUnique()` ko matching membership nahi milti, toh result `null` hota hai.

`!membership` condition us missing result ko detect karti hai.

Us case mein `ForbiddenException` throw hota hai.

NestJS ise HTTP `403 Forbidden` response mein map karta hai. GraphQL requests mein exception ka exact response envelope HTTP adapter aur GraphQL driver ki configuration par depend karega.

### Step 6: `return membership.organization`

```ts
return membership.organization;
```

Agar membership mil gayi, toh method organization return karta hai.

Dhyan do: hum poora membership object return nahi kar rahe.

Isse service ka return value organization hai, jise resolver GraphQL output ke roop mein use karta hai.

### Complete authorization flow

```text
findOneForMember('u1', 'o2')
              |
              v
Find membership for (u1, o2)
              |
        +-----+-----+
        |           |
        v           v
    Found          Not found
        |           |
        v           v
 Organization    Throw 403
 returned        ForbiddenException
```

### Case A: User is a member

```text
User ID: u1
Organization ID: o1

Membership:
u1 + o1 = ADMIN
```

Result:

```json
{
  "id": "o1",
  "name": "Organization A",
  "slug": "organization-a"
}
```

### Case B: User is not a member

```text
User ID: u1
Organization ID: o2

Membership:
u1 + o2 = Not found
```

Result: authorization exception.

### Case C: Organization does not exist

Agar organization ID invalid hai, toh matching membership bhi nahi milegi.

Result: wahi authorization exception.

Ye behavior non-member aur nonexistent organization ko alag errors se expose karne se bachata hai.

---

# 6. Resolver: `organizations.resolver.ts`

**File:** `src/organizations/organizations.resolver.ts`

```ts
import { Args, ID, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { OrganizationsService } from './organizations.service.js';
import { Organization } from './entities/organization.entity.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Resolver(() => Organization)
export class OrganizationsResolver {
  constructor(private organizationsService: OrganizationsService) {}

  @Query(() => [Organization])
  @UseGuards(JwtAuthGuard)
  myOrganizations(@CurrentUser() user: { id: string }) {
    return this.organizationsService.findAllForUser(user.id);
  }

  @Query(() => Organization)
  @UseGuards(JwtAuthGuard)
  organization(
    @CurrentUser() user: { id: string },
    @Args('id', { type: () => ID }) id: string,
  ) {
    return this.organizationsService.findOneForMember(user.id, id);
  }
}
```

Resolver GraphQL aur service layer ke beech ka bridge hai.

Client GraphQL query bhejta hai. Resolver us query ko handle karke required arguments aur authenticated user ki identity service ko deta hai.

## 6.1 `@Resolver(() => Organization)`

```ts
@Resolver(() => Organization)
```

Ye class ko GraphQL resolver ke roop mein register karne ke liye metadata provide karta hai.

`Organization` return type ke context mein use ho raha hai.

Isse NestJS GraphQL integration ko resolver ka object type samajhne mein help milti hai.

## 6.2 `constructor(private organizationsService: OrganizationsService)`

```ts
constructor(private organizationsService: OrganizationsService) {}
```

Ye TypeScript ka parameter property syntax hai.

Is single declaration se:

1. Constructor parameter declare hota hai.
2. `organizationsService` naam ki class property create hoti hai.
3. Passed dependency us property mein assign hoti hai.

NestJS dependency injection se `OrganizationsService` provide karta hai.

Ab resolver mein hum likh sakte hain:

```ts
this.organizationsService.findAllForUser(user.id);
```

Resolver ko database ki direct query likhne ki zarurat nahi.

Ye separation business logic ko service mein rakhta hai.

---

## 6.3 `@Query(() => [Organization])`

```ts
@Query(() => [Organization])
myOrganizations(...)
```

`@Query()` GraphQL query field register karta hai.

`() => [Organization]` batata hai ki query organization objects ki list return karti hai.

Generated schema mein iska conceptual representation:

```graphql
myOrganizations: [Organization!]!
```

Exact nullability decorator configuration aur GraphQL code-first defaults par depend karti hai.

### `Organization` versus `[Organization]`

```ts
@Query(() => Organization)
```

Ek organization return karne ke liye.

```ts
@Query(() => [Organization])
```

Organizations ki list return karne ke liye.

Isliye:

| Query | Expected return |
|---|---|
| `myOrganizations` | Organization array |
| `organization(id)` | Ek organization |

## 6.4 `@UseGuards(JwtAuthGuard)`

```ts
@UseGuards(JwtAuthGuard)
```

Ye query resolver par guard apply karta hai.

Guard ka purpose request ko allow ya reject karna hai.

Is case mein `JwtAuthGuard` access token ko verify karta hai, configured JWT strategy ke through.

Conceptual flow:

```text
Request
   |
   v
Access token present?
   |
   v
Token valid?
   |
   +---- No ----> Reject request
   |
   +---- Yes ---> Continue to resolver
```

Actual implementation mein token extraction aur verification ka behavior tumhare existing guard aur JWT strategy par depend karega.

Ek important distinction: guard token ki validity check karta hai. Organization membership service check karti hai.

## 6.5 `@CurrentUser()`

```ts
@CurrentUser() user: { id: string }
```

`@CurrentUser()` project ka custom parameter decorator hai.

Iska intended purpose authenticated request se current user ki identity nikalna hai.

For example, valid access token se authenticated user ka ID `u1` hai:

```ts
user = {
  id: 'u1',
};
```

Tab:

```ts
user.id
```

se `u1` milta hai.

**Ye value client se directly receive nahi hoti.** Ye authenticated request context se extract ki jaati hai.

Isliye client ko apni query mein arbitrary `userId` bhejne ki permission dene ke bajay server authenticated identity use karta hai.

Ye security ke liye bahut important hai.

### Type annotation kya karti hai?

```ts
user: { id: string }
```

Ye TypeScript ko batata hai ki `user` object mein string `id` expected hai.

Lekin ye annotation runtime par JWT validate nahi karti.

Runtime verification guard aur authentication strategy ki responsibility hai.

Aage project grow hone par authenticated user ke liye reusable type/interface banana useful ho sakta hai.

## 6.6 `@Args('id', { type: () => ID })`

```ts
@Args('id', { type: () => ID }) id: string
```

Ye decorator GraphQL query se `id` argument extract karta hai.

Client query:

```graphql
query {
  organization(id: "o1") {
    id
    name
    slug
  }
}
```

Yahan:

```graphql
id: "o1"
```

resolver ke `id` parameter mein receive hota hai.

Decorator ka first argument:

```ts
' id '
```

nahi, balki exact string `'id'` hai.

Iska meaning hai ki GraphQL argument ka naam `id` hai.

Second argument:

```ts
{ type: () => ID }
```

GraphQL argument ka type `ID` specify karta hai.

TypeScript annotation:

```ts
id: string
```

application code mein is value ko string ke roop mein treat karti hai.

### `user.id` aur `id` mein difference

Ye distinction yaad rakhna:

```ts
user.id
```

Authenticated user ki ID hai.

```ts
id
```

Requested organization ki ID hai.

Example:

```ts
return this.organizationsService.findOneForMember(user.id, id);
```

Equivalent conceptual call:

```ts
return this.organizationsService.findOneForMember(
  'u1',
  'o2',
);
```

Is call mein service verify karegi ki `u1` organization `o2` ka member hai ya nahi.

## 6.7 Resolver ka complete responsibility

```ts
myOrganizations(@CurrentUser() user: { id: string }) {
  return this.organizationsService.findAllForUser(user.id);
}
```

Resolver:

1. Guard ke through protected query ko secure karta hai.
2. Authenticated user ki ID obtain karta hai.
3. Service method call karta hai.
4. Service ka result return karta hai.

Isi tarah:

```ts
organization(
  @CurrentUser() user: { id: string },
  @Args('id', { type: () => ID }) id: string,
) {
  return this.organizationsService.findOneForMember(user.id, id);
}
```

Resolver requested organization ki ID aur authenticated user ki ID service ko deta hai.

**Resolver ko membership ka business rule khud implement karne ki zarurat nahi hai.**

---

# 7. Module system aur Dependency Injection

**File:** `src/organizations/organizations.module.ts`

```ts
import { Module } from '@nestjs/common';
import { OrganizationsService } from './organizations.service.js';
import { OrganizationsResolver } from './organizations.resolver.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  providers: [OrganizationsService, OrganizationsResolver],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
```

NestJS application ko modules mein organize kiya jaata hai.

Har module related functionality, providers aur dependencies ko group karta hai.

## 7.1 `@Module()`

```ts
@Module({
  imports: [PrismaModule],
  providers: [OrganizationsService, OrganizationsResolver],
  exports: [OrganizationsService],
})
```

`@Module()` NestJS ko module configuration provide karta hai.

Is configuration mein teen important properties hain.

### `imports`

```ts
imports: [PrismaModule]
```

Is module ko `PrismaModule` ke exported providers use karne ki zarurat hai.

`OrganizationsService` ko `PrismaService` chahiye:

```ts
constructor(private prisma: PrismaService) {}
```

Agar `PrismaService` global provider nahi hai, toh uski availability module configuration ke through establish karni hogi.

Agar `PrismaModule` `PrismaService` ko export karta hai, toh use import karne se service dependency resolve ho sakti hai.

### `providers`

```ts
providers: [
  OrganizationsService,
  OrganizationsResolver,
]
```

Providers woh classes hain jinhe NestJS dependency injection system manage kar sakta hai.

Yahan:

- `OrganizationsService` business logic provide karta hai.
- `OrganizationsResolver` GraphQL operations handle karta hai.

Agar resolver register nahi hoga, toh uski query expected GraphQL schema ka part nahi banegi.

### `exports`

```ts
exports: [OrganizationsService]
```

Iska matlab hai ki doosre modules, agar `OrganizationsModule` import karte hain, toh exported `OrganizationsService` ko use kar sakte hain.

For example, future mein kisi doosre module ko organization-related business logic reuse karna ho, toh service export useful ho sakta hai.

Dhyan do: `exports` ka matlab service ko automatically har module mein globally available banana nahi hai.

---

# 8. `JwtModule` ko global kyun banaya?

Existing `AuthModule` mein:

```ts
JwtModule.registerAsync({
  global: true,
  // ... existing inject and useFactory configuration
}),
```

Is change ko samajhne ke liye teen concepts important hain:

1. NestJS modules
2. Provider visibility
3. Circular dependency

## 8.1 `JwtModule` aur `JwtService`

`JwtModule`, NestJS JWT integration provide karta hai.

`JwtService` JWT-related operations ke liye use hota hai, jaise token sign aur verify karna.

Tumhara `JwtAuthGuard` existing authentication setup ke through token verification karta hai.

Agar guard ko `JwtService` chahiye, toh NestJS ko ye dependency resolve karne ka valid path chahiye.

## 8.2 `global: true`

```ts
JwtModule.registerAsync({
  global: true,
  // ...
})
```

Is configuration ka purpose registered JWT module ko global banana hai.

Isse JWT module ke exported providers ko har consuming module mein explicitly `JwtModule` import kiye bina use kiya ja sakta hai.

Lekin ek subtle point:

**Global `JwtModule` ka matlab ye nahi hai ki har guard, strategy aur provider automatically register ho jaata hai.**

Unki registration aur dependency requirements phir bhi sahi honi chahiye.

## 8.3 Circular dependency kya hoti hai?

Suppose:

```text
AuthModule
    |
    v
OrganizationsModule
    |
    v
AuthModule
```

Agar `AuthModule`, `OrganizationsModule` ko import karta hai aur `OrganizationsModule`, `AuthModule` ko import karne lagta hai, toh circular module dependency create ho sakti hai.

Circular dependencies kabhi-kabhi `forwardRef()` se handle ki ja sakti hain, lekin har case mein ye best architecture nahi hota.

Agar sirf shared JWT providers ki visibility ki problem hai, toh global module configuration ek possible solution hai.

Isliye tumhare current design mein `global: true` ka purpose repeated module imports aur circular dependency risk ko avoid karna hai.

**Important architectural note:** Global modules ko har jagah use karna automatically best practice nahi hai. Unhe un dependencies ke liye use karna chahiye jinki global availability genuinely required hai. Explicit imports dependency relationships ko zyada visible banate hain.

---

# 9. Authentication aur authorization ka complete difference

Ye Day 1 ka interview ke liye important topic hai.

Suppose user `u1` valid access token ke saath request bhejta hai.

## Authentication

Guard verify karta hai:

```text
Kya token valid hai?
Kya request authenticated user se associated hai?
```

Agar token invalid ya missing hai, toh request reject ho jaati hai.

## Authorization

Token valid hone ke baad service verify karti hai:

```text
Kya user u1 organization o1 ka member hai?
```

Agar membership milti hai, organization return hoti hai.

Agar membership nahi milti, request reject hoti hai.

| Situation | Authentication | Authorization |
|---|---|---|
| Access token missing | Fail | Business authorization tak nahi pahunchte |
| Invalid access token | Fail | Business authorization tak nahi pahunchte |
| Valid token, organization membership exists | Pass | Pass |
| Valid token, membership missing | Pass | Fail |
| Valid token, nonexistent organization | Pass | Fail |

Ye separation application security ka fundamental part hai.

---

# 10. Tenant isolation aur IDOR prevention

Day 1 ka security objective sirf JWT lagana nahi tha.

Actual objective ye tha ki user apni identity ke through sirf authorized organization access kar sake.

## 10.1 IDOR kya hai?

IDOR ka full form hai **Insecure Direct Object Reference**.

Suppose client request bhejta hai:

```graphql
query {
  organization(id: "org-A") {
    id
    name
  }
}
```

Phir client ID change kar deta hai:

```graphql
query {
  organization(id: "org-B") {
    id
    name
  }
}
```

Agar server sirf ID ke basis par organization fetch kar de, toh unauthorized access possible ho sakta hai.

Ye especially dangerous hai jab IDs guessable, leaked ya logs se accessible hon.

Random UUID use karna ID guessing ko difficult bana sakta hai, lekin **UUID khud authorization mechanism nahi hai.**

## 10.2 Day 1 implementation ka protection

Current code:

```ts
const membership = await this.prisma.organizationMember.findUnique({
  where: {
    userId_organizationId: {
      userId,
      organizationId,
    },
  },
  include: {
    organization: true,
  },
});
```

Organization return karne se pehle server dono values check karta hai:

```text
Authenticated User ID
          +
Requested Organization ID
          |
          v
Database Membership Check
```

Isliye doosre organization ki ID bhejna enough nahi hai.

### Security principle

**Resource ki ID batana aur resource ko access karne ki permission hona do alag baatein hain.**

Ye principle Day 2 mein organization members fetch karte waqt aur aage projects, tasks, comments aur attachments implement karte waqt bhi apply karna hai.

---

# 11. Same error aur existence leakage

Current implementation:

```ts
if (!membership) {
  throw new ForbiddenException(
    'You are not a member of this organization',
  );
}
```

Iska purpose non-member aur nonexistent organization ke liye same error dena hai.

Example:

**Case A:** Organization exist karti hai, lekin user uska member nahi hai.

```text
Membership lookup -> null
Response -> Forbidden
```

**Case B:** Organization exist hi nahi karti.

```text
Membership lookup -> null
Response -> Forbidden
```

Client ko dono cases mein same application-level error milta hai.

Isse organization existence discover karne ka ek possible signal remove ho jaata hai.

### Kya isse har tarah ki information leakage eliminate ho jaati hai?

Nahi.

Identical error messages useful hain, lekin timing differences, logs, other endpoints aur different authorization paths se information leak ho sakti hai.

Isliye ise existence leakage reduce karne ka measure samajhna chahiye, complete guarantee nahi.

---

# 12. Unit testing: `organizations.service.spec.ts`

**File:** `src/organizations/organizations.service.spec.ts`

Tum Vitest use kar rahe ho, isliye tests mein Vitest APIs use hongi.

Testing ka objective hai verify karna ki service expected conditions mein sahi result deti hai.

Hum actual Neon PostgreSQL database hit kiye bina service ke behavior ko test kar sakte hain.

Iske liye Prisma methods mock ki jaati hain.

## 12.1 Important testing imports

```ts
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest';

import { ForbiddenException } from '@nestjs/common';

import { OrganizationsService } from './organizations.service.js';

import type { PrismaService } from '../prisma/prisma.service.js';
```

| Function/type | Purpose |
|---|---|
| `describe()` | Related tests ko group karta hai |
| `it()` | Ek individual test define karta hai |
| `expect()` | Actual result ko expected behavior ke against verify karta hai |
| `vi.fn()` | Mock function create karta hai |
| `vi.resetAllMocks()` | Existing mock state aur implementations reset karta hai |
| `beforeEach()` | Har test se pehle setup execute karta hai |
| `ForbiddenException` | Authorization failure ka expected exception |
| `PrismaService` | Service ki dependency ka TypeScript type |

## 12.2 Prisma mocks

```ts
const findMany = vi.fn();
const findUnique = vi.fn();

const prisma = {
  organizationMember: {
    findMany,
    findUnique,
  },
} as unknown as PrismaService;
```

Ye code ek fake Prisma dependency create karta hai.

Normally:

```ts
this.prisma.organizationMember.findMany(...)
```

actual database query execute karega.

Test mein:

```ts
findMany
```

mock function hai.

Isse hum control kar sakte hain ki database query ka result kya hoga.

Example:

```ts
findMany.mockResolvedValue([]);
```

Iska meaning hai ki jab mocked `findMany()` execute hoga, toh uska returned Promise empty array se resolve hoga.

### `as unknown as PrismaService`

Ye TypeScript type assertion hai.

Mock object complete `PrismaService` implementation nahi hai, isliye directly `PrismaService` type assign karne par TypeScript complaint kar sakta hai.

Is assertion se compiler ko mock ko `PrismaService` type ke roop mein treat karne ko kaha gaya hai.

Lekin yaad rakho:

**Type assertion actual implementation create nahi karti.**

Ye sirf compiler ke type checking ko affect karti hai.

Agar service test ke dauraan mocked object ka koi missing method call karegi, toh runtime error aa sakta hai.

## 12.3 Service instance

```ts
let service: OrganizationsService;

beforeEach(() => {
  vi.resetAllMocks();
  service = new OrganizationsService(prisma);
});
```

Har test se pehle:

1. Mock functions reset hoti hain.
2. Fresh service instance create hota hai.
3. Service ko mocked Prisma dependency di jaati hai.

Is approach mein hum NestJS application bootstrap nahi kar rahe.

Direct constructor call se service unit test ho rahi hai.

Ye unit testing ke liye acceptable hai, kyunki target business logic hai.

Application-level dependency injection verify karne ke liye alag integration/startup verification bhi chahiye.

---

# 13. Day 1 ke six unit tests

## Test 1: User ki organizations return hoti hain

```ts
it('returns only organizations the user belongs to', async () => {
  findMany.mockResolvedValue([
    { organization: orgA },
    { organization: orgB },
  ]);

  const result = await service.findAllForUser('u1');

  expect(findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { userId: 'u1' },
    }),
  );

  expect(result).toEqual([orgA, orgB]);
});
```

Ye test do cheezein verify karta hai:

1. Service query ko user ID se scope karti hai.
2. Membership objects se organizations ka array return karti hai.

`expect.objectContaining()` partial object matching karta hai.

Iska benefit hai ki hum relevant `where` condition verify kar sakte hain, bina query configuration ke har field ko assertion mein likhe.

## Test 2: Memberships nahi hain

```ts
it('returns an empty list when the user has no memberships', async () => {
  findMany.mockResolvedValue([]);

  await expect(
    service.findAllForUser('u1'),
  ).resolves.toEqual([]);
});
```

Ye verify karta hai ki user ke paas koi membership nahi hone par service empty array return karti hai.

Yahan:

- `resolves` Promise ke successful resolution ko check karta hai.
- `toEqual([])` expected empty array verify karta hai.

## Test 3: ADMIN organization read kar sakta hai

```ts
it('lets an ADMIN member read the organization', async () => {
  findUnique.mockResolvedValue({
    role: 'ADMIN',
    organization: orgA,
  });

  await expect(
    service.findOneForMember('u1', 'o1'),
  ).resolves.toEqual(orgA);
});
```

Ye verify karta hai ki membership present hone par organization return hoti hai.

Dhyan do: current implementation `role` inspect nahi karti.

Isliye ye test ADMIN-specific authorization rule test nahi karta; ye sirf ADMIN role wale membership record ke saath successful access test karta hai.

## Test 4: EMPLOYEE organization read kar sakta hai

```ts
it('lets an EMPLOYEE member read their own organization', async () => {
  findUnique.mockResolvedValue({
    role: 'EMPLOYEE',
    organization: orgA,
  });

  await expect(
    service.findOneForMember('u1', 'o1'),
  ).resolves.toEqual(orgA);
});
```

Ye test bhi confirm karta hai ki current method organization read karne ke liye kisi specific role ko require nahi karti.

ADMIN aur EMPLOYEE dono membership hone par organization read kar sakte hain.

Ye Day 1 ka intentional behavior hai.

## Test 5: Non-member reject hota hai

```ts
it('rejects a non-member (cross-tenant access)', async () => {
  findUnique.mockResolvedValue(null);

  await expect(
    service.findOneForMember('u1', 'o2'),
  ).rejects.toBeInstanceOf(ForbiddenException);
});
```

Ye security ke liye sabse important tests mein se ek hai.

Mock membership lookup ko `null` return karata hai.

Expected result: service `ForbiddenException` throw kare.

Yahan:

- `rejects` Promise rejection ko check karta hai.
- `toBeInstanceOf()` verify karta hai ki error expected class ka instance hai.

## Test 6: Dono IDs se lookup hota hai

```ts
it('scopes the lookup by both userId and organizationId', async () => {
  findUnique.mockResolvedValue({
    role: 'ADMIN',
    organization: orgA,
  });

  await service.findOneForMember('u1', 'o1');

  expect(findUnique).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        userId_organizationId: {
          userId: 'u1',
          organizationId: 'o1',
        },
      },
    }),
  );
});
```

Ye test verify karta hai ki service membership lookup mein dono IDs use karti hai.

Isse regression ke against protection milti hai.

For example, future refactoring ke dauraan agar galti se lookup organization ID se hi hone lage, toh test fail ho sakta hai.

### Unit tests ki limitation

Mock-based unit tests actual database constraints verify nahi karte.

Ye test karte hain ki service expected Prisma method aur arguments use karti hai aur returned result ko correctly handle karti hai.

Database schema, compound unique constraint aur actual relation behavior verify karne ke liye integration tests ya database-level checks useful honge.

---

# 14. Testing commands aur unka purpose

Project root mein commands run karna.

### Build

```bash
pnpm build
```

Build ka purpose project ko compile karna aur relevant TypeScript/build errors detect karna hai.

Successful build ka matlab ye nahi hai ki application ki har dependency runtime par correctly resolve ho rahi hai.

### Unit tests

```bash
pnpm test
```

Vitest configuration ke according tests execute hote hain.

Expected result tumhare provided logs ke according:

```text
8 test files passed
20 tests passed
```

Ye tumhare recorded result hain, current execution ka independently verified output nahi.

### Development server

```bash
pnpm start:dev
```

Ye development mode mein NestJS application start karta hai.

Is step se runtime initialization aur dependency injection configuration verify karne mein help milti hai.

### Ye teen checks alag kyun hain?

| Check | Kya verify karta hai? |
|---|---|
| `pnpm build` | Compilation/build |
| `pnpm test` | Automated test cases ka behavior |
| `pnpm start:dev` | Application initialization aur runtime dependency wiring |

Ek build pass ho sakta hai, lekin startup par missing provider ki wajah se application fail kar sakti hai.

Isi tarah unit tests pass hone ka matlab ye nahi ki actual GraphQL request end-to-end successfully execute ho rahi hai.

---

# 15. Apollo Sandbox: Manual testing

Automated unit tests ke baad actual GraphQL requests test karni hain.

Pehle application start karo:

```bash
pnpm start:dev
```

Phir Apollo Sandbox mein GraphQL operations run karo.

## 15.1 Authorization header

Valid access token ke saath:

```json
{
  "Authorization": "Bearer YOUR_ACCESS_TOKEN"
}
```

`YOUR_ACCESS_TOKEN` ko actual token se replace karna.

Access token expired ho jaaye toh login karke naya token lena.

## 15.2 Query: `myOrganizations`

```graphql
query {
  myOrganizations {
    id
    name
    slug
  }
}
```

Expected behavior:

- Sirf authenticated user ki memberships se related organizations return hon.
- User ki memberships nahi hain toh empty list return ho.

## 15.3 Query: `organization`

```graphql
query {
  organization(id: "YOUR_ORGANIZATION_ID") {
    id
    name
    slug
  }
}
```

Expected behavior:

- Membership hai toh organization return ho.
- Membership nahi hai toh authorization error aaye.

## 15.4 Security test matrix

| Test | Request | Expected result |
|---|---|---|
| 1 | User A + `myOrganizations` | User A ki organizations |
| 2 | User B + `myOrganizations` | User B ki organizations |
| 3 | User A + Organization A | Organization A return |
| 4 | User B + Organization A, jab B member nahi hai | Authorization error |
| 5 | User A + nonexistent organization ID | Wahi membership authorization error |
| 6 | Access token missing | Authentication error |
| 7 | Invalid access token | Authentication error |
| 8 | User A + Organization B, jab A member nahi hai | Authorization error |

Test 4 aur Test 8 ka purpose same hai: cross-tenant access reject hona chahiye.

### Expected error kaise verify karein?

Application-level message:

```text
You are not a member of this organization
```

GraphQL error ka exact JSON structure tumhari configuration ke according different ho sakta hai.

Isliye sirf HTTP status code dekhne ke bajay GraphQL response ke error message aur actual access behavior ko bhi verify karo.

GraphQL servers errors ko kabhi HTTP 200 response ke andar bhi return kar sakte hain, depending on error handling aur transport behavior.

---

# 16. Common errors aur debugging

## Error 1: `Nest can't resolve dependencies of the OrganizationsService`

Example:

```text
Nest can't resolve dependencies of the OrganizationsService (?).
Please make sure that the argument PrismaService at index [0]
is available in the OrganizationsModule context.
```

### Reason

Service constructor mein dependency hai:

```ts
constructor(private prisma: PrismaService) {}
```

Lekin `PrismaService` current module ke dependency injection context mein available nahi hai.

### Fix

```ts
@Module({
  imports: [PrismaModule],
  providers: [OrganizationsService, OrganizationsResolver],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
```

Saath hi verify karo ki `PrismaModule` `PrismaService` ko correctly provide aur export karta hai.

---

## Error 2: `has no exported member 'OrganizationsResolver'`

### Reason

File create kar di gayi, lekin usmein class export nahi hui ya file ka code missing hai.

For example:

```bash
touch src/organizations/organizations.resolver.ts
```

`touch` sirf file create karta hai. TypeScript implementation generate nahi karta.

### Fix

File mein actual implementation add karo:

```ts
export class OrganizationsResolver {
  // ...
}
```

Aur import path ko verify karo.

---

## Error 3: `organization` query membership ke bina bhi data return kar rahi hai

### Possible reason

Service mein membership verification missing hai ya query direct organization ID se execute ho rahi hai.

Unsafe pattern:

```ts
return this.prisma.organization.findUnique({
  where: { id: organizationId },
});
```

Ye query organization fetch karti hai, lekin apne aap verify nahi karti ki authenticated user uska member hai.

### Fix

Membership-based lookup use karo:

```ts
const membership = await this.prisma.organizationMember.findUnique({
  where: {
    userId_organizationId: {
      userId,
      organizationId,
    },
  },
  include: {
    organization: true,
  },
});

if (!membership) {
  throw new ForbiddenException(
    'You are not a member of this organization',
  );
}

return membership.organization;
```

---

## Error 4: `pnpm build` successful hai, lekin server start fail hota hai

### Reason

Compilation aur dependency injection runtime checks different hain.

Build ke successful hone se ye guarantee nahi milti ki NestJS runtime mein har provider resolve ho jayega.

### Fix

Teen checks run karo:

```bash
pnpm build
pnpm test
pnpm start:dev
```

Uske baad actual GraphQL queries run karo.

---

# 17. Day 1 mein LLD ka use

Bhai, haan — tu apne TaskForge project mein Low-Level Design ke concepts apply kar raha hai.

Abhi hum unnecessarily complex design patterns add nahi kar rahe. Lekin architecture ko responsibilities ke basis par separate kar rahe hain.

## 17.1 Separation of concerns

```text
OrganizationsResolver
        |
        v
OrganizationsService
        |
        v
PrismaService
        |
        v
Database
```

Har component ki separate responsibility hai.

| Component | Responsibility |
|---|---|
| Resolver | GraphQL request handle karna |
| Service | Business logic aur membership authorization |
| PrismaService | Database access |
| GraphQL entity | Public GraphQL output structure define karna |

Ye separation future maintenance aur testing ko easier banati hai.

## 17.2 Dependency Injection

```ts
constructor(private prisma: PrismaService) {}
```

Service apne andar manually database client create nahi karti.

Dependency inject ki jaati hai.

Isse implementation ko test mein mock se replace karna easier hota hai.

## 17.3 Encapsulation

Membership verification ek method mein centralized hai:

```ts
findOneForMember(userId, organizationId)
```

Resolver ko authorization ka internal implementation detail pata hone ki zarurat nahi hai.

Future mein service ke andar logging, additional validation ya database query optimization add kar sakte hain, bina resolver ka public interface badle — jab tak method ka contract same rahe.

## 17.4 Abhi kaun-se patterns apply nahi kiye?

Day 1 mein humne intentionally Factory Pattern, Strategy Pattern ya Repository Pattern force nahi kiya.

Har class ya method ke liye design pattern introduce karna zaroori nahi hota.

**Good LLD ka matlab appropriate abstraction hai, maximum abstraction nahi.**

Current service-based architecture TaskForge ke is stage ke liye reasonable starting point hai.

---

# 18. Production-level observations

Current implementation Day 1 ke objectives cover karti hai. Lekin future production hardening ke liye kuch additional points dhyan mein rakhne chahiye.

### 18.1 GraphQL output fields

Entity mein:

```ts
@Field(() => ID)
id!: string;

@Field()
name!: string;

@Field()
slug!: string;
```

Sirf required public fields expose kiye gaye hain.

User ka `passwordHash` ya refresh token organization response ka part nahi hona chahiye.

### 18.2 Authenticated identity trusted source se aani chahiye

```ts
@CurrentUser() user: { id: string }
```

Ye tabhi safe hai jab guard aur custom decorator properly configured hon.

Sirf TypeScript type likhne se identity trusted nahi ban jaati.

### 18.3 Membership checks har protected resource par chahiye

Organization access authorize ho jaana automatically uske har project ya task ke access ki permission nahi deta.

Example:

```text
Organization Membership
        |
        v
Project Authorization
        |
        v
Task Authorization
```

Actual permission rules application ki policy par depend karenge.

Har resource ke liye relevant tenant relationship aur authorization rule verify karna hoga.

### 18.4 Global modules ka limited use

`JwtModule` ko global banana ek architectural choice hai.

Har module ko global bana dena dependency relationships ko less explicit bana sakta hai.

Jahan shared global availability genuinely useful ho, wahan use karo. Baaki dependencies ko explicit imports ke through manage karna reasonable hai.

### 18.5 Database query mein least privilege

`findAllForUser()` mein:

```ts
include: {
  organization: true,
}
```

Related organization ke additional scalar fields bhi fetch ho sakte hain.

GraphQL entity unmein se sirf `id`, `name` aur `slug` expose karti hai, lekin unnecessarily sensitive fields fetch na karne ke liye explicit Prisma `select` future optimization ho sakta hai.

Data minimization performance aur security dono ke liye useful hai.

---

# 19. Interview questions and answers

### Q1. Authentication aur authorization mein kya difference hai?

Authentication verify karta hai ki user kaun hai. Authorization verify karta hai ki authenticated user requested resource access kar sakta hai ya nahi.

TaskForge mein JWT guard authentication handle karta hai aur organization membership service authorization handle karti hai.

### Q2. Multi-tenant application mein tenant isolation kaise implement ki?

Authenticated user ID token context se obtain hoti hai. Organization-specific query execute karne se pehle `(userId, organizationId)` membership verify hoti hai. Membership missing hone par access reject kiya jaata hai.

### Q3. `findMany()` aur `findUnique()` mein difference?

`findMany()` matching records ka array return karta hai. `findUnique()` unique selector ke basis par ek record return karta hai ya record missing hone par `null`.

### Q4. `include` aur `select` kya karte hain?

`include` query result mein related records include karne ke liye use hota hai. `select` result mein specific fields choose karne ke liye use hota hai.

### Q5. Compound unique constraint kyun use ki?

Ek user-organization pair ki duplicate membership prevent karne aur dono IDs ke basis par membership record identify karne ke liye.

### Q6. Resolver mein membership check kyun nahi kiya?

Business authorization service layer mein centralized rehti hai. Isse logic reusable aur independently testable hota hai.

### Q7. `@CurrentUser()` ka purpose?

Authenticated request context se current user ki identity extract karna, taaki client arbitrary user ID provide karke kisi doosre user ke roop mein request execute na kar sake.

### Q8. `@UseGuards(JwtAuthGuard)` kya karta hai?

Resolver ke liye configured authentication guard apply karta hai. Guard request ko allow ya reject karta hai, based on existing JWT authentication implementation.

### Q9. Non-member aur nonexistent organization ka same error kyun?

Organization existence ko unauthorized clients se reveal karne wale ek direct signal ko reduce karne ke liye.

### Q10. Mock-based unit tests kya verify karte hain?

Service ki business logic, expected Prisma calls, result transformations aur authorization error behavior.

Ye apne aap real database constraints ya complete GraphQL integration verify nahi karte.

### Q11. `PrismaModule` import kyun karna pada?

`OrganizationsService` ko `PrismaService` dependency chahiye. Module import se required exported provider dependency injection context mein available hota hai.

### Q12. `JwtModule` ko global kyun banaya?

JWT module ke exported providers ko consuming modules mein repeatedly import kiye bina available karne ke liye, current module dependency structure ke according.

### Q13. Kya UUID authorization ke liye enough hai?

Nahi. UUID guessing difficult kar sakta hai, lekin user ke access rights verify nahi karta. Authorization server-side enforce karni hoti hai.

### Q14. Kya organization ka member hone se user ko har operation ki permission mil jaati hai?

Nahi. Day 1 mein membership organization read access ke liye sufficient hai. Future operations mein role-based permissions aur resource-specific authorization apply karni hogi.

---

# 20. Day 1 completion checklist

### Implementation

- [x] `Organization` GraphQL entity create ki.
- [x] `myOrganizations` query implement ki.
- [x] `organization(id)` query implement ki.
- [x] `JwtAuthGuard` integrate kiya.
- [x] `@CurrentUser()` se authenticated user ID obtain ki.
- [x] Membership check service layer mein rakha.
- [x] Compound unique selector se membership lookup ki.
- [x] Non-member ke liye `ForbiddenException` implement ki.
- [x] `OrganizationsModule` mein `PrismaModule` import kiya.
- [x] Service ke six unit tests likhe.

### Verification

- [x] Recorded build result: successful.
- [x] Recorded test result: 8 files, 20 tests passed.
- [ ] `pnpm start:dev` se runtime startup verify karo.
- [ ] Apollo Sandbox mein dono queries test karo.
- [ ] Cross-tenant access reject hone ki confirmation lo.
- [ ] Missing aur invalid access token test karo.
- [ ] Git commit aur push karo.

### Suggested Git commands

```bash
git status
git add .
git commit -m "feat(organizations): add membership-authorized organization queries"
git push
```

---

# 21. Phase 2 ka sequence

Day 1 complete hone ke baad organization-related features ko logically extend karna hai.

| Day | Feature | Main objective |
|---|---|---|
| Day 1 | Organization Queries | Apni organizations fetch karna aur membership verify karna |
| Day 2 | Organization Members Queries | Authorized organization ke members fetch karna |
| Day 3 | Role-Based Authorization | ADMIN, MANAGER aur EMPLOYEE ke permissions enforce karna |
| Day 4 onward | Core business resources | Projects aur tasks jaise resources ko tenant-scoped banana |

Ye tumhare current project plan ka logical sequence hai. Exact implementation order tumhare finalized Phase 2 roadmap ke according confirm karna chahiye.

## Day 2 mein kya important hoga?

Next day hum implement karenge:

```graphql
organizationMembers(organizationId: ID!): [OrganizationMember!]!
```

Aur:

```graphql
organizationMember(
  organizationId: ID!
  userId: ID!
): OrganizationMember
```

In queries mein ek naya security concern aayega: kisi organization ke members fetch karte waqt unauthorized user ko doosre tenant ki membership list access nahi karne deni hai.

Saath hi response mein `passwordHash` aur refresh token jaise sensitive fields expose nahi hone chahiye.

**Bhai, Day 1 ka sabse important takeaway ye hai: JWT se user ki identity milti hai, lekin organization ka access membership verify karne ke baad hi milta hai.** Ye principle TaskForge ke baaki multi-tenant features ka foundation banega.