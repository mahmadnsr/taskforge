# Phase 2 — Day 2: Organization Member Queries

> **Project:** TaskForge  
> **Phase:** Phase 2 — Organization & Team Management  
> **Day:** 2  
> **Feature:** View Organization Members and Member Details  
> **Backend:** NestJS, GraphQL, Prisma ORM, PostgreSQL  
> **Testing:** Vitest  
> **Package Manager:** pnpm

---

# 1. Overview

## 1.1 What did we build?

Day 1 mein humne authenticated users ke liye organization-related queries implement ki thi.

Day 2 mein humne organization ke andar team members ko retrieve karne ke liye do GraphQL queries implement ki hain:

1. `organizationMembers` — kisi organization ke saare members retrieve karna.
2. `organizationMember` — kisi organization ke ek specific member ki details retrieve karna.

Lekin sirf database se members retrieve karna sufficient nahi hai.

Humein ye bhi ensure karna hai ki:

- Sirf authenticated users queries execute kar sakein.
- User sirf us organization ki team dekh sake jiska woh member hai.
- Ek organization ka member doosri organization ka data access na kar sake.
- User ka password hash aur refresh tokens expose na hon.
- Database se unnecessary columns retrieve na kiye jayein.
- Invalid requests par appropriate errors return hon.
- Automated tests security-related behaviour verify karein.

Isliye Day 2 ka primary focus hai:

**GraphQL Queries + Service Layer Authorization + Multi-Tenant Isolation + Data Minimization.**

## 1.2 Final outcome

Day 2 complete hone ke baad authenticated organization members apni organization ki team dekh sakte hain.

Example:

Suppose TaskForge mein do organizations hain:

```text
Organization A
|
|-- Alice (ADMIN)
|-- Bob (MANAGER)
|-- Charlie (EMPLOYEE)


Organization B
|
|-- David (ADMIN)
|-- Emma (EMPLOYEE)
```

Expected behaviour:

- Alice Organization A ki team dekh sakti hai.
- Bob Organization A ki team dekh sakta hai.
- Charlie Organization A ki team dekh sakta hai.
- David Organization B ki team dekh sakta hai.
- Alice Organization B ki team nahi dekh sakti.
- David Organization A ki team nahi dekh sakta.

Yahan ADMIN, MANAGER aur EMPLOYEE ke beech koi viewing restriction nahi hai.

**Important:** Organization membership check aur role-based authorization do alag concepts hain. Day 2 mein membership check implement kiya gaya hai; role-specific permissions future features mein add ki jayengi.

---

# 2. Goal and Requirements

Day 2 ke requirements:

| Requirement | Implementation |
|---|---|
| Organization ke saare members retrieve karna | `organizationMembers` |
| Ek member ki details retrieve karna | `organizationMember` |
| Authentication | `JwtAuthGuard` |
| Organization membership verify karna | `assertMember()` |
| Cross-organization access rokna | `organizationId` scoping |
| Sensitive fields ko database se exclude karna | Prisma `select` |
| GraphQL response ko control karna | GraphQL `ObjectType` |
| Role enum ko GraphQL mein register karna | `registerEnumType()` |
| Database query types validate karna | Prisma types + TypeScript |
| Automated verification | Vitest |
| Build verification | `pnpm build` |

## 2.1 What did we NOT change?

Day 2 mein:

- Koi database model add nahi kiya.
- Koi Prisma schema change nahi kiya.
- Koi migration create nahi ki.
- Koi new authentication mechanism implement nahi kiya.
- Koi invitation system implement nahi kiya.
- Koi role modification functionality implement nahi ki.

Humne Phase 1 ke existing `User` aur `OrganizationMember` models reuse kiye.

Isse existing database design ko unnecessarily modify kiye bina functionality extend hui.

---

# 3. Technology and Terminology

Is section mein un concepts ki definitions hain jo Day 2 ke implementation ko samajhne ke liye important hain.

## 3.1 NestJS

**Definition:**

NestJS ek Node.js framework hai jo TypeScript ke saath scalable, modular aur maintainable backend applications build karne ke liye use hota hai.

NestJS application ko modules, controllers, providers, services aur guards jaise components mein organize karta hai.

**Day 2 mein use:**

- `OrganizationsService` mein business logic.
- `OrganizationMembersResolver` mein GraphQL query handling.
- `OrganizationsModule` mein dependencies register karna.
- `JwtAuthGuard` ke through authentication enforce karna.

**Why use it?**

Large backend applications mein authentication, database operations aur business logic ko separate rakhna easier hota hai.

---

## 3.2 GraphQL

**Definition:**

GraphQL ek API query language aur execution system hai jiske through clients specify karte hain ki unhe response mein kaunsa data chahiye.

Traditional REST API mein alag endpoints ho sakte hain:

```http
GET /organizations
GET /organizations/123/members
GET /organizations/123/members/456
```

GraphQL mein client schema ke according queries execute karta hai.

Example:

```graphql
query {
  organizationMembers(organizationId: "org-123") {
    id
    role
  }
}
```

Client sirf `id` aur `role` request kar raha hai.

Agar client ko user details bhi chahiye:

```graphql
query {
  organizationMembers(organizationId: "org-123") {
    id
    role
    user {
      id
      name
      email
    }
  }
}
```

Toh woh nested `user` fields bhi request kar sakta hai.

**Day 2 mein use:**

Do read-only GraphQL queries expose ki gayi hain:

- `organizationMembers`
- `organizationMember`

**Important:** Client ko fields choose karne ki flexibility dene ka matlab ye nahi hai ki client arbitrary database columns access kar sakta hai. GraphQL schema decide karta hai ki client kya request kar sakta hai.

---

## 3.3 GraphQL Code-First Approach

**Definition:**

Code-first approach mein GraphQL schema TypeScript classes aur decorators se define hota hai.

Example:

```ts
@ObjectType()
export class OrganizationMember {
  @Field(() => ID)
  id!: string;
}
```

Yahan decorators GraphQL schema ke corresponding parts define karte hain.

**Day 2 mein use:**

- `@ObjectType()` GraphQL object type define karta hai.
- `@Field()` GraphQL fields expose karta hai.
- `@Query()` GraphQL query register karta hai.
- `@Args()` query arguments define karta hai.

**Why use it?**

Schema aur TypeScript code ek hi place par maintain kiye ja sakte hain.

---

## 3.4 Prisma ORM

**Definition:**

Prisma ek Object-Relational Mapping (ORM) toolkit hai jo application code ko relational database ke saath interact karne deta hai.

ORM ka purpose database operations ko application-level methods aur TypeScript types ke through represent karna hai.

Raw SQL:

```sql
SELECT id, role
FROM "OrganizationMember"
WHERE "organizationId" = 'org-123';
```

Prisma:

```ts
const members = await prisma.organizationMember.findMany({
  where: {
    organizationId: 'org-123',
  },
  select: {
    id: true,
    role: true,
  },
});
```

Dono examples ka purpose organization ke members retrieve karna hai.

**Day 2 mein use:**

- `findMany()` multiple members retrieve karta hai.
- `findUnique()` unique membership record retrieve karta hai.
- `where` database records filter karta hai.
- `select` requested fields specify karta hai.
- `orderBy` records ka order specify karta hai.

---

## 3.5 PostgreSQL

**Definition:**

PostgreSQL ek relational database management system hai.

Data tables, rows, columns, relationships aur constraints ke through organize hota hai.

TaskForge mein PostgreSQL organization, user aur membership jaise structured data ko persist karta hai.

Example conceptual tables:

```text
User
--------------------------------
id | name | email | passwordHash


Organization
--------------------------------
id | name | slug


OrganizationMember
--------------------------------
id | userId | organizationId | role
```

`OrganizationMember` user aur organization ke beech membership represent karta hai.

**Day 2 mein use:**

Existing database records ko retrieve kiya gaya. Koi schema migration required nahi thi.

---

## 3.6 Authentication

**Definition:**

Authentication verify karta hai ki request karne wala user kaun hai.

Example:

```http
Authorization: Bearer <accessToken>
```

Backend token verify karta hai aur authenticated user ki identity establish karta hai.

**Day 2 mein use:**

`JwtAuthGuard` protected GraphQL queries par authentication enforce karta hai.

Agar request authenticated nahi hai, toh resolver ka normal execution nahi hona chahiye.

---

## 3.7 Authorization

**Definition:**

Authorization determine karta hai ki authenticated user ko requested resource access karne ki permission hai ya nahi.

Example:

Alice authenticated hai.

Lekin iska matlab ye nahi ki Alice har organization ki team dekh sakti hai.

Backend ko verify karna padega ki Alice requested organization ki member hai ya nahi.

**Day 2 mein use:**

`assertMember(userId, organizationId)` caller ki organization membership verify karta hai.

### Authentication vs Authorization

| Authentication | Authorization |
|---|---|
| User ki identity verify karta hai | User ka access verify karta hai |
| Token validation se related | Resource permissions se related |
| `JwtAuthGuard` | `assertMember()` |
| "Who are you?" | "Are you allowed to access this?" |

Dono security layers ka purpose alag hai.

---

## 3.8 Multi-Tenancy

**Definition:**

Multi-tenancy ek architecture hai jisme ek application multiple organizations, customers ya tenants ko serve karti hai.

Har tenant ka data logically isolated rehna chahiye.

TaskForge mein organization ek tenant ki tarah behave karti hai.

Example:

```text
TaskForge
|
|-- Organization A
|     |-- Members
|     |-- Tasks
|     |-- Projects
|
|-- Organization B
      |-- Members
      |-- Tasks
      |-- Projects
```

Organization A ka user Organization B ka private data access nahi kar sakta, jab tak explicitly authorized na ho.

**Day 2 mein use:**

Membership verification aur organization-scoped database queries multi-tenant isolation enforce karte hain.

---

## 3.9 Data Minimization

**Definition:**

Data minimization ka matlab hai application ko sirf utna data retrieve aur expose karna chahiye jitna current operation ke liye necessary hai.

Example:

Team list ke liye generally ye fields sufficient hain:

```text
OrganizationMember:
- id
- role

User:
- id
- name
- email
- createdAt
```

Team list ke liye `passwordHash` ya refresh-token records ki requirement nahi hai.

Isliye unhe query mein retrieve hi nahi karna chahiye.

**Day 2 mein use:**

Prisma `select` ke through database fields explicitly whitelist kiye gaye hain.

---

## 3.10 Cross-Tenant Isolation

**Definition:**

Cross-tenant isolation ensure karta hai ki ek organization ka user doosri organization ka restricted data access na kar sake.

Example:

```text
Alice belongs to Organization A.

Alice requests:
organizationMember(
  organizationId: "Organization B",
  userId: "Bob"
)
```

Agar Alice Organization B ki member nahi hai, toh request reject honi chahiye.

Sirf `userId` validate karna sufficient nahi hai.

**Day 2 mein use:**

Pehle caller ki membership check hoti hai.

Uske baad target member ka lookup requested `organizationId` ke andar scoped hota hai.

---

## 3.11 IDOR — Insecure Direct Object Reference

**Definition:**

IDOR ek access-control vulnerability hai jisme attacker kisi resource ka identifier modify karke doosre user ya tenant ka data access kar leta hai.

Example:

```text
/api/members/user-101
/api/members/user-102
/api/members/user-103
```

Agar backend sirf user ID dekhkar data return kar deta hai aur permission verify nahi karta, toh attacker identifiers change karke unauthorized records access kar sakta hai.

GraphQL mein bhi yahi vulnerability ho sakti hai.

**Day 2 mein protection:**

1. Caller ki membership verify hoti hai.
2. Target member ko `organizationId` aur `userId` ke combination se find kiya jata hai.

Sirf ID ko secret rakhna security mechanism nahi hai. Authorization har request par enforce honi chahiye.

---

# 4. Database Relationship

Day 2 ke queries existing database models ko reuse karte hain.

Conceptual relationship:

```text
User
 |
 | 1
 |
 | N
OrganizationMember
N |
  |
  | 1
Organization
```

More clearly:

```text
User
  |
  | One user can have multiple memberships
  |
  v
OrganizationMember
  ^
  |
  | One organization can have multiple members
  |
Organization
```

`OrganizationMember` junction model ki tarah work karta hai.

Example:

```text
User
--------------------------------
id: u1
name: Alice


Organization
--------------------------------
id: org1
name: Alpha


OrganizationMember
--------------------------------
id: membership1
userId: u1
organizationId: org1
role: ADMIN
```

Is record ka matlab hai Alice Organization Alpha ki ADMIN member hai.

Ek user multiple organizations ka member ho sakta hai.

Example:

```text
Alice
 |
 |-- Organization A (ADMIN)
 |
 |-- Organization B (EMPLOYEE)
```

Isliye membership user aur organization ke combination se determine hoti hai.

**Important:** Prisma schema mein actual relation definitions aur constraints project ke existing schema par depend karte hain. Upar diya gaya diagram conceptual relationship explain karta hai.

---

# 5. Architecture and Request Flow

Day 2 ka request flow:

```text
                    GraphQL Client
                          |
                          | Query + Variables
                          | Authorization Header
                          v
                    JwtAuthGuard
                          |
                          | Token verification
                          v
               OrganizationMembersResolver
                          |
                          | Current authenticated user
                          | organizationId / userId
                          v
                  OrganizationsService
                          |
                          | 1. assertMember()
                          |
                          | 2. Requested data query
                          v
                     PrismaService
                          |
                          v
                      PostgreSQL
                          |
                          | Selected records
                          v
                  OrganizationsService
                          |
                          v
               GraphQL Response
```

## 5.1 Step-by-step execution

### Step 1: Client sends a request

Client Apollo Sandbox ya kisi frontend se GraphQL query execute karta hai.

Example:

```graphql
query OrganizationMembers($organizationId: ID!) {
  organizationMembers(organizationId: $organizationId) {
    id
    role
    user {
      id
      name
      email
    }
  }
}
```

### Step 2: JWT authentication

`JwtAuthGuard` request ko protect karta hai.

Valid authentication ke baad `@CurrentUser()` authenticated user ki identity provide karta hai.

Is implementation mein expected user object ka relevant structure hai:

```ts
{
  id: 'authenticated-user-id'
}
```

Actual object ka structure existing authentication implementation par depend karta hai.

### Step 3: Resolver receives arguments

Resolver ko milta hai:

- Authenticated caller ka ID.
- Requested `organizationId`.
- Single-member query ke case mein target `userId`.

Resolver request ko service method tak forward karta hai.

### Step 4: Service verifies membership

```ts
await this.assertMember(callerId, organizationId);
```

Agar caller organization ka member nahi hai, service `ForbiddenException` throw karti hai.

Is case mein member-data query execute nahi hoti.

### Step 5: Prisma retrieves data

Membership verify hone ke baad service appropriate Prisma query execute karti hai.

List ke liye:

```ts
findMany()
```

Single member ke liye:

```ts
findUnique()
```

### Step 6: GraphQL returns selected data

GraphQL client ko requested schema fields return hote hain.

Example:

```json
{
  "data": {
    "organizationMembers": [
      {
        "id": "membership-1",
        "role": "ADMIN",
        "user": {
          "id": "user-1",
          "name": "Alice",
          "email": "alice@example.com"
        }
      }
    ]
  }
}
```

---

# 6. Definitions of Important Prisma and TypeScript Concepts

## 6.1 `findMany()`

**Definition:**

Prisma ka `findMany()` method matching records ki list retrieve karta hai.

Example:

```ts
const members = await prisma.organizationMember.findMany({
  where: {
    organizationId: 'org-1',
  },
});
```

Iska purpose Organization 1 ki memberships retrieve karna hai.

Agar matching records nahi milte, normally empty array return hota hai:

```ts
[]
```

**Day 2 mein use:**

`listMembers()` organization ki complete member list retrieve karta hai.

---

## 6.2 `findUnique()`

**Definition:**

Prisma ka `findUnique()` method unique identifier ya unique constraint ke basis par ek record retrieve karta hai.

Example:

```ts
const membership = await prisma.organizationMember.findUnique({
  where: {
    userId_organizationId: {
      userId: 'user-1',
      organizationId: 'org-1',
    },
  },
});
```

Yahan `userId_organizationId` ek compound unique selector hai jo existing Prisma schema ke generated client se aata hai.

Agar record nahi milta, `findUnique()` `null` return karta hai.

**Day 2 mein use:**

- Caller ki membership verify karna.
- Ek specific organization member retrieve karna.

---

## 6.3 `where`

**Definition:**

Prisma ka `where` option records filter karne ke liye use hota hai.

Example:

```ts
where: {
  organizationId: 'org-1',
}
```

Iska matlab hai ki sirf Organization 1 ke matching records retrieve karo.

**Security significance:**

Organization-scoped queries mein `organizationId` ka filter critical hai.

Lekin `where` filter aur authorization check interchangeable nahi hain.

- Membership check verify karta hai ki caller ko access hai.
- `where` filter ensure karta hai ki returned records requested organization tak limited hain.

Dono ka purpose alag hai.

---

## 6.4 `select`

**Definition:**

Prisma `select` option specify karta hai ki query ke result mein kaunse fields include hone chahiye.

Example:

```ts
select: {
  id: true,
  role: true,
}
```

Result mein `id` aur `role` selected honge.

**Why use it?**

1. Unnecessary data retrieve nahi hota.
2. Sensitive fields accidentally load hone ka risk kam hota hai.
3. API response ko predictable rakhna easier hota hai.
4. Database se application tak unnecessary data transfer reduce hota hai.

Nested relations ke fields bhi explicitly select kiye ja sakte hain.

```ts
select: {
  id: true,
  role: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
}
```

Yahan `OrganizationMember` aur related `User` ke fields explicitly specify kiye gaye hain.

---

## 6.5 `include`

**Definition:**

Prisma `include` related model ke records ko query result mein include karne ke liye use hota hai.

Example:

```ts
const membership = await prisma.organizationMember.findUnique({
  where: {
    userId_organizationId: {
      userId: 'user-1',
      organizationId: 'org-1',
    },
  },
  include: {
    user: true,
  },
});
```

Yahan membership ke saath related user bhi return hoga.

**`select` aur `include` ka difference:**

| `select` | `include` |
|---|---|
| Explicit fields choose karta hai | Related records include karta hai |
| Fields ki whitelist banane ke liye useful | Relations load karne ke liye useful |
| Unselected fields result mein nahi aate | Included model ke default selected fields aa sakte hain |
| Sensitive data handling mein useful | Relation access convenient banata hai |

**Important technical nuance:**

Prisma ke ek hi query level par `select` aur `include` generally ek saath use nahi kiye ja sakte.

Agar relation ke saath exact fields chahiye, nested `select` use karna suitable hai.

Example:

```ts
select: {
  id: true,
  user: {
    select: {
      id: true,
      name: true,
    },
  },
}
```

---

## 6.6 `satisfies`

**Definition:**

`satisfies` TypeScript ka operator hai jo verify karta hai ki expression kisi specified type ki requirements satisfy karta hai.

Saath hi, expression ka inferred type unnecessarily widen nahi hota.

Example:

```ts
const config = {
  enabled: true,
} satisfies {
  enabled: boolean;
};
```

TypeScript verify karta hai ki `config` specified structure follow karta hai.

**Day 2 mein use:**

```ts
const MEMBER_SELECT = {
  id: true,
  role: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
    },
  },
} satisfies Prisma.OrganizationMemberSelect;
```

Iska benefit:

- Invalid Prisma field names par compile-time errors mil sakte hain.
- Query configuration reusable rehti hai.
- Prisma selection ka inferred structure preserve hota hai.
- Code review mein selected fields inspect karna easier hota hai.

**Important:** `satisfies` runtime security mechanism nahi hai. Ye compile-time type checking ke liye hai.

---

## 6.7 Compound Unique Key

**Definition:**

Compound unique constraint multiple fields ke combination ko unique banata hai.

Example:

```text
userId + organizationId
```

Agar schema mein dono fields ka combination unique define hai, toh same user ki same organization mein duplicate membership records create nahi kiye ja sakte.

Example:

```text
(user-1, org-1) -> Membership A
(user-1, org-2) -> Membership B
```

Ye valid combinations hain.

Lekin:

```text
(user-1, org-1) -> Membership A
(user-1, org-1) -> Membership B
```

Agar compound uniqueness enforced hai, toh duplicate combination allowed nahi hoga.

**Day 2 mein use:**

```ts
where: {
  userId_organizationId: {
    userId: targetUserId,
    organizationId,
  },
}
```

Isse target membership specific organization ke andar retrieve hoti hai.

**Important:** `userId_organizationId` ka generated selector naam existing Prisma schema mein defined unique constraint par depend karta hai.

---

## 6.8 `async` and `await`

**Definition:**

JavaScript mein `async` function Promise return karta hai.

`await` asynchronous operation complete hone tak current async function ke execution ko suspend karta hai.

Example:

```ts
async function getMembers() {
  const members = await prisma.organizationMember.findMany();

  return members;
}
```

Database query asynchronous hoti hai.

`await` ke baad result available hone par function next statement execute karta hai.

**Day 2 mein use:**

Membership verify hone ke baad hi member-data query execute karni hai.

```ts
await this.assertMember(callerId, organizationId);

return this.prisma.organizationMember.findMany({
  where: {
    organizationId,
  },
});
```

Yahan `await` authorization check ke complete hone ka wait karta hai.

Agar `assertMember()` exception throw karta hai, subsequent query execute nahi hoti.

---

## 6.9 `ForbiddenException` and `NotFoundException`

NestJS mein HTTP exception classes available hain jo request failure ko represent karti hain.

### `ForbiddenException`

```ts
throw new ForbiddenException(
  'You are not a member of this organization',
);
```

Conceptually HTTP `403 Forbidden` represent karta hai.

Iska use tab hota hai jab caller authenticated hai lekin requested organization ka member nahi hai.

### `NotFoundException`

```ts
throw new NotFoundException('Member not found');
```

Conceptually HTTP `404 Not Found` represent karta hai.

Iska use tab hota hai jab caller ka organization access verify ho chuka hai lekin requested member us organization mein nahi milta.

**GraphQL nuance:**

GraphQL errors HTTP transport status ke bajay GraphQL response ke `errors` section mein bhi represent ho sakte hain. Exact response format NestJS, Apollo aur exception handling configuration par depend karta hai.

---

## 6.10 `@ObjectType()`

**Definition:**

NestJS GraphQL ka `@ObjectType()` decorator kisi TypeScript class ko GraphQL object type ke roop mein register karta hai.

Example:

```ts
@ObjectType()
export class OrganizationMember {
  @Field(() => ID)
  id!: string;
}
```

Is class se GraphQL schema mein `OrganizationMember` type represent hota hai.

---

## 6.11 `@Field()`

**Definition:**

`@Field()` decorator GraphQL object type ke andar field expose karta hai.

Example:

```ts
@Field()
name!: string;
```

Ye GraphQL schema mein `name` field define karta hai.

**Day 2 mein use:**

`OrganizationMember` type mein `id`, `role` aur `user` fields expose kiye gaye hain.

---

## 6.12 `registerEnumType()`

**Definition:**

`registerEnumType()` Prisma ya TypeScript enum ko GraphQL schema mein register karne ke liye use hota hai.

Example:

```ts
registerEnumType(Role, {
  name: 'Role',
});
```

Agar enum register nahi hai, GraphQL schema builder ko enum ka GraphQL representation automatically available nahi hoga.

**Day 2 mein use:**

`ADMIN`, `MANAGER` aur `EMPLOYEE` roles ko GraphQL field ke valid enum values ke roop mein represent kiya gaya hai.

---

## 6.13 `@Query()`

**Definition:**

`@Query()` decorator NestJS GraphQL mein read operation register karta hai.

Example:

```ts
@Query(() => [OrganizationMember])
organizationMembers() {
  // ...
}
```

Is query ka return type GraphQL mein `OrganizationMember` objects ki list hai.

---

## 6.14 `@Args()`

**Definition:**

`@Args()` decorator GraphQL query ya mutation ke arguments ko resolver method ke parameters se bind karta hai.

Example:

```ts
@Args('organizationId', {
  type: () => ID,
})
organizationId: string
```

Isse client ka `organizationId` argument resolver ko milta hai.

`ID` GraphQL ka built-in scalar type hai jo identifiers represent karne ke liye use hota hai.

---

## 6.15 `@UseGuards()`

**Definition:**

`@UseGuards()` decorator kisi resolver ya handler par guards apply karta hai.

Example:

```ts
@UseGuards(JwtAuthGuard)
```

Guard request ko allow ya reject karne ka decision leta hai.

**Day 2 mein use:**

Dono GraphQL queries ko JWT authentication se protect kiya gaya hai.

---

## 6.16 `@CurrentUser()`

**Definition:**

`@CurrentUser()` project ka custom parameter decorator hai jo authenticated request se current user ki information extract karta hai.

Example:

```ts
@CurrentUser() user: { id: string }
```

Is implementation mein resolver ko authenticated user ka ID milta hai.

**Security benefit:**

Caller ki identity client ke arbitrary `userId` argument se nahi leni chahiye.

Current caller ka ID authenticated request context se aana chahiye.

Single-member query mein:

- Caller ka ID `@CurrentUser()` se aata hai.
- Target member ka ID client ke `userId` argument se aata hai.

Dono IDs ka purpose alag hai.

---

## 6.17 Dependency Injection

**Definition:**

Dependency Injection (DI) ek design technique hai jisme class apni dependencies ko khud instantiate karne ke bajay external container se receive karti hai.

Example:

```ts
constructor(
  private organizationsService: OrganizationsService,
) {}
```

NestJS dependency injection container `OrganizationsService` ka instance provide karta hai.

**Day 2 mein use:**

Resolver `OrganizationsService` par depend karta hai.

Service `PrismaService` par depend karti hai.

Isse responsibilities separate rehti hain aur testing easier hoti hai.

---

# 7. Design Decisions

## 7.1 Membership check before retrieving members

Implementation:

```ts
await this.assertMember(callerId, organizationId);
```

**Why?**

Har authenticated user ko har organization ka data access nahi milna chahiye.

Membership verify kiye bina data retrieve karna authorization vulnerability create kar sakta hai.

**Expected behaviour:**

```text
Caller is a member
        |
        v
Membership check passes
        |
        v
Member-data query executes
```

Non-member:

```text
Caller is not a member
        |
        v
ForbiddenException
        |
        v
Member-data query never executes
```

---

## 7.2 Same error for non-members

Implementation:

```ts
const NOT_A_MEMBER =
  'You are not a member of this organization';
```

Ye message membership-related methods mein reuse hota hai.

**Why?**

Consistent error handling maintain karna easier hota hai.

Agar application ko organization existence ko non-members se conceal karna hai, toh missing organization aur non-membership ke cases ko carefully design karna chahiye.

**Important nuance:**

Same message return karna useful ho sakta hai, lekin complete information concealment automatically guarantee nahi hoti. Timing, error codes aur doosre endpoints bhi information expose kar sakte hain.

---

## 7.3 Reusable `MEMBER_SELECT`

Implementation:

```ts
const MEMBER_SELECT = {
  id: true,
  role: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
    },
  },
} satisfies Prisma.OrganizationMemberSelect;
```

**Why?**

Agar list query aur detail query alag-alag field selections define karein, toh future mein accidental inconsistency ho sakti hai.

Ek reusable constant se:

- Selected fields consistent rehte hain.
- Sensitive columns accidentally add karne ka risk kam hota hai.
- Query configuration ek place par maintain hoti hai.
- TypeScript Prisma schema ke against selection validate karta hai.

---

## 7.4 Target lookup must include `organizationId`

Incorrect approach:

```ts
// Conceptual example only
findUnique({
  where: {
    userId: targetUserId,
  },
});
```

Ye approach user ko globally identify karne ki koshish karti hai.

Lekin requirement hai organization-specific membership retrieve karna.

Correct approach:

```ts
findUnique({
  where: {
    userId_organizationId: {
      userId: targetUserId,
      organizationId,
    },
  },
});
```

**Why?**

Target user ka record exist karna aur target user ka requested organization ka member hona do alag conditions hain.

Humein membership record chahiye, sirf user record nahi.

---

## 7.5 Separate resolver file

File:

```text
src/organizations/organization-members.resolver.ts
```

**Why?**

`OrganizationsResolver` organization-related queries handle karta hai.

`OrganizationMembersResolver` organization-member queries handle karta hai.

Separate resolver se responsibilities clearly organized rehti hain.

Ye separation future mein testing aur maintenance ko easier bana sakta hai.

---

## 7.6 All roles can view the team

Day 2 mein ADMIN, MANAGER aur EMPLOYEE sabko team viewing ki permission di gayi hai.

Condition:

```text
Authenticated user
        +
Organization membership
        =
Permission to view the team
```

Role-specific restrictions implement nahi ki gayi hain.

Future mein permissions alag ho sakti hain:

| Action | Possible permission |
|---|---|
| View team | All organization members |
| Invite member | ADMIN / MANAGER |
| Change role | ADMIN |
| Remove member | ADMIN / authorized MANAGER |
| Delete organization | ADMIN |

Ye future design possibilities hain, current implementation ka claim nahi.

---

## 7.7 Reuse the existing User GraphQL type

Implementation:

```ts
import { User } from '../../users/entities/user.entity.js';
```

Existing `User` GraphQL entity reuse ki gayi hai.

**Why?**

Same user representation ko multiple features mein reuse kiya ja sakta hai.

Agar existing GraphQL `User` type mein `passwordHash` field expose nahi hai, toh client us field ko is type ke through query nahi kar sakta.

Lekin sirf GraphQL type par depend karna sufficient nahi hai. Database query ko bhi unnecessary sensitive fields retrieve nahi karne chahiye.

---

# 8. Implementation

## 8.1 File structure

Day 2 mein relevant files:

```text
src/
|
|-- organizations/
|   |
|   |-- entities/
|   |   |-- organization.entity.ts
|   |   |-- organization-member.entity.ts
|   |
|   |-- organizations.module.ts
|   |-- organizations.resolver.ts
|   |-- organization-members.resolver.ts
|   |-- organizations.service.ts
|   |-- organizations.members.spec.ts
|
|-- users/
|   |-- entities/
|       |-- user.entity.ts
|
|-- auth/
|   |-- guards/
|   |   |-- jwt-auth.guard.ts
|   |
|   |-- decorators/
|       |-- current-user.decorator.ts
|
|-- prisma/
    |-- prisma.service.ts
    |-- prisma.module.ts
```

Actual folder structure project ke existing files par depend karti hai.

---

# 9. Code Implementation

## 9.1 `organization-member.entity.ts`

Path:

```text
src/organizations/entities/organization-member.entity.ts
```

Code:

```ts
import {
  Field,
  ID,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';

import { Role } from '@prisma/client';

import { User } from '../../users/entities/user.entity.js';

registerEnumType(Role, {
  name: 'Role',
});

@ObjectType()
export class OrganizationMember {
  @Field(() => ID)
  id!: string;

  @Field(() => Role)
  role!: Role;

  @Field(() => User)
  user!: User;
}
```

### Explanation

#### Importing GraphQL decorators

```ts
import {
  Field,
  ID,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
```

Ye utilities GraphQL schema define karne ke liye use hoti hain.

- `ObjectType`: GraphQL object define karta hai.
- `Field`: Object ke fields define karta hai.
- `ID`: Identifier type represent karta hai.
- `registerEnumType`: Enum ko GraphQL schema mein register karta hai.

#### Importing Prisma Role

```ts
import { Role } from '@prisma/client';
```

`Role` existing Prisma schema se generated enum hai.

Is project mein expected values hain:

```text
ADMIN
MANAGER
EMPLOYEE
```

Ye values actual Prisma schema ke enum se match honi chahiye.

#### Registering the enum

```ts
registerEnumType(Role, {
  name: 'Role',
});
```

Is registration se GraphQL schema `Role` enum ko recognize kar sakta hai.

#### Defining the object type

```ts
@ObjectType()
export class OrganizationMember {
```

Ye class GraphQL response mein organization membership represent karti hai.

#### Exposing the membership ID

```ts
@Field(() => ID)
id!: string;
```

Ye membership record ka identifier hai.

#### Exposing the role

```ts
@Field(() => Role)
role!: Role;
```

Ye member ka organization-specific role return karta hai.

Ek user Organization A mein ADMIN aur Organization B mein EMPLOYEE ho sakta hai.

Isliye role membership ka attribute hai, sirf user ka global attribute nahi.

#### Exposing the related user

```ts
@Field(() => User)
user!: User;
```

Is field se client nested user details request kar sakta hai.

Example:

```graphql
user {
  id
  name
  email
}
```

Yahan `User` existing GraphQL type hai.

**Important:** `user!: User` TypeScript non-null assertion syntax use karta hai. Iska matlab compiler ko bataya ja raha hai ki property initialization ka responsibility runtime/framework ya application handling ke paas hai. Ye database value ki existence ko runtime par independently guarantee nahi karta.

---

## 9.2 `organizations.service.ts`

Path:

```text
src/organizations/organizations.service.ts
```

Service application ki business logic aur database operations handle karti hai.

Code:

```ts
import { Prisma, Role } from '@prisma/client';

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { generateSlug } from '../common/utils/slug.util.js';
import { PrismaService } from '../prisma/prisma.service.js';

const NOT_A_MEMBER =
  'You are not a member of this organization';

const MEMBER_SELECT = {
  id: true,
  role: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
    },
  },
} satisfies Prisma.OrganizationMemberSelect;

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

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

  async findAllForUser(userId: string) {
    const memberships =
      await this.prisma.organizationMember.findMany({
        where: {
          userId,
        },
        include: {
          organization: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

    return memberships.map((m) => m.organization);
  }

  async findOneForMember(
    userId: string,
    organizationId: string,
  ) {
    const membership =
      await this.prisma.organizationMember.findUnique({
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
      throw new ForbiddenException(NOT_A_MEMBER);
    }

    return membership.organization;
  }

  private async assertMember(
    userId: string,
    organizationId: string,
  ) {
    const membership =
      await this.prisma.organizationMember.findUnique({
        where: {
          userId_organizationId: {
            userId,
            organizationId,
          },
        },
        select: {
          id: true,
        },
      });

    if (!membership) {
      throw new ForbiddenException(NOT_A_MEMBER);
    }
  }

  async listMembers(
    callerId: string,
    organizationId: string,
  ) {
    await this.assertMember(callerId, organizationId);

    return this.prisma.organizationMember.findMany({
      where: {
        organizationId,
      },
      select: MEMBER_SELECT,
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async getMember(
    callerId: string,
    organizationId: string,
    targetUserId: string,
  ) {
    await this.assertMember(callerId, organizationId);

    const member =
      await this.prisma.organizationMember.findUnique({
        where: {
          userId_organizationId: {
            userId: targetUserId,
            organizationId,
          },
        },
        select: MEMBER_SELECT,
      });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    return member;
  }
}
```

### A. Imports

```ts
import { Prisma, Role } from '@prisma/client';
```

- `Prisma`: Prisma-generated types aur transaction-related types access karne ke liye.
- `Role`: Organization membership par role assign karne ke liye.

```ts
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
```

- `ForbiddenException`: Unauthorized organization access reject karne ke liye.
- `Injectable`: Class ko NestJS dependency injection system mein provider banane ke liye.
- `NotFoundException`: Requested member na milne par error throw karne ke liye.

### B. `NOT_A_MEMBER`

```ts
const NOT_A_MEMBER =
  'You are not a member of this organization';
```

Same error message ko constant mein store kiya gaya hai.

Benefits:

- Duplicate strings avoid hoti hain.
- Message update karna easier hota hai.
- Multiple methods consistent error return kar sakte hain.

### C. `MEMBER_SELECT`

```ts
const MEMBER_SELECT = {
  id: true,
  role: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
    },
  },
} satisfies Prisma.OrganizationMemberSelect;
```

Ye query selection configuration hai.

Membership ke liye:

```text
id
role
```

Related user ke liye:

```text
id
name
email
createdAt
```

Explicit selection se unnecessary user fields query result mein nahi aate.

### D. `@Injectable()`

```ts
@Injectable()
export class OrganizationsService {
```

Ye NestJS ko batata hai ki service dependency injection ke liye available hai.

### E. Constructor injection

```ts
constructor(private prisma: PrismaService) {}
```

`PrismaService` service ki dependency hai.

NestJS configured provider ke through instance inject karta hai.

Isse service ko har method mein manually database client create nahi karna padta.

### F. Existing `createWithAdmin()`

```ts
createWithAdmin(
  tx: Prisma.TransactionClient,
  name: string,
  adminUserId: string,
)
```

Ye existing organization creation logic hai.

Ye:

1. Organization create karta hai.
2. Slug generate karta hai.
3. Creator ko ADMIN membership deta hai.

Day 2 mein ye method change karne ki requirement nahi thi.

**Why retain it?**

Day 2 ka purpose existing service functionality ko replace karna nahi, balki member queries add karna hai.

### G. Existing `findAllForUser()`

```ts
async findAllForUser(userId: string)
```

Ye authenticated user ki memberships retrieve karta hai aur related organizations return karta hai.

```ts
where: {
  userId,
}
```

Is filter ka purpose current user ki memberships retrieve karna hai.

```ts
include: {
  organization: true,
}
```

Related organization records include kiye jaate hain.

```ts
orderBy: {
  createdAt: 'asc',
}
```

Results ko membership creation time ke ascending order mein arrange kiya jata hai.

### H. Existing `findOneForMember()`

```ts
async findOneForMember(
  userId: string,
  organizationId: string,
)
```

Ye verify karta hai ki user requested organization ka member hai.

```ts
where: {
  userId_organizationId: {
    userId,
    organizationId,
  },
}
```

Compound unique selector user aur organization dono ko identify karta hai.

Membership na mile toh:

```ts
throw new ForbiddenException(NOT_A_MEMBER);
```

Ye Day 1 ke organization access pattern ko reuse karta hai.

### I. `assertMember()`

```ts
private async assertMember(
  userId: string,
  organizationId: string,
)
```

Ye Day 2 ka important authorization helper hai.

`private` ka matlab hai ki TypeScript class ke bahar is method ko directly access nahi kiya jana chahiye.

Is method ka purpose caller ki membership verify karna hai.

Database query:

```ts
const membership =
  await this.prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
    select: {
      id: true,
    },
  });
```

Yahan sirf membership ka `id` select kiya gaya hai.

Humein authorization check ke liye user ka complete record ya membership ke saare fields retrieve karne ki requirement nahi hai.

Agar membership nahi milti:

```ts
if (!membership) {
  throw new ForbiddenException(NOT_A_MEMBER);
}
```

Method exception throw karta hai.

Agar exception nahi aati, caller membership check pass kar chuka hai.

**Important:** Is method ka purpose data return karna nahi, authorization condition enforce karna hai.

### J. `listMembers()`

```ts
async listMembers(
  callerId: string,
  organizationId: string,
)
```

Ye organization ke members ki list return karta hai.

First:

```ts
await this.assertMember(callerId, organizationId);
```

Caller ki membership verify hoti hai.

Next:

```ts
return this.prisma.organizationMember.findMany({
  where: {
    organizationId,
  },
  select: MEMBER_SELECT,
  orderBy: {
    createdAt: 'asc',
  },
});
```

Is query mein teen important operations hain:

1. `where`: requested organization ki memberships filter karta hai.
2. `select`: response ke liye required fields retrieve karta hai.
3. `orderBy`: memberships ko ascending creation order mein arrange karta hai.

### K. `getMember()`

```ts
async getMember(
  callerId: string,
  organizationId: string,
  targetUserId: string,
)
```

Ye requested organization ke andar ek specific member retrieve karta hai.

First:

```ts
await this.assertMember(callerId, organizationId);
```

Caller ka access verify hota hai.

Next:

```ts
const member =
  await this.prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId: targetUserId,
        organizationId,
      },
    },
    select: MEMBER_SELECT,
  });
```

Yahan `targetUserId` target member ko identify karta hai.

`organizationId` ensure karta hai ki lookup requested organization ki membership tak limited hai.

Agar target membership nahi milti:

```ts
if (!member) {
  throw new NotFoundException('Member not found');
}
```

Otherwise:

```ts
return member;
```

Selected member details return hoti hain.

---

## 9.3 `organization-members.resolver.ts`

Path:

```text
src/organizations/organization-members.resolver.ts
```

Code:

```ts
import { UseGuards } from '@nestjs/common';

import {
  Args,
  ID,
  Query,
  Resolver,
} from '@nestjs/graphql';

import { OrganizationsService } from './organizations.service.js';

import {
  OrganizationMember,
} from './entities/organization-member.entity.js';

import {
  JwtAuthGuard,
} from '../auth/guards/jwt-auth.guard.js';

import {
  CurrentUser,
} from '../auth/decorators/current-user.decorator.js';

@Resolver(() => OrganizationMember)
export class OrganizationMembersResolver {
  constructor(
    private organizationsService: OrganizationsService,
  ) {}

  @Query(() => [OrganizationMember])
  @UseGuards(JwtAuthGuard)
  organizationMembers(
    @CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => ID })
    organizationId: string,
  ) {
    return this.organizationsService.listMembers(
      user.id,
      organizationId,
    );
  }

  @Query(() => OrganizationMember)
  @UseGuards(JwtAuthGuard)
  organizationMember(
    @CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => ID })
    organizationId: string,
    @Args('userId', { type: () => ID })
    userId: string,
  ) {
    return this.organizationsService.getMember(
      user.id,
      organizationId,
      userId,
    );
  }
}
```

### A. `@Resolver()`

```ts
@Resolver(() => OrganizationMember)
```

Resolver ko `OrganizationMember` GraphQL object type ke saath associate karta hai.

### B. Constructor injection

```ts
constructor(
  private organizationsService: OrganizationsService,
) {}
```

Resolver service ko directly instantiate nahi karta.

NestJS dependency injection ke through service receive karta hai.

### C. `organizationMembers`

```ts
@Query(() => [OrganizationMember])
```

Square brackets indicate karti hain ki query `OrganizationMember` objects ki list return karti hai.

Authentication:

```ts
@UseGuards(JwtAuthGuard)
```

Current user:

```ts
@CurrentUser() user: { id: string }
```

Organization argument:

```ts
@Args('organizationId', {
  type: () => ID,
})
organizationId: string
```

Service invocation:

```ts
return this.organizationsService.listMembers(
  user.id,
  organizationId,
);
```

Resolver request ko service tak forward karta hai.

Authorization logic service layer mein maintain ki gayi hai.

### D. `organizationMember`

```ts
@Query(() => OrganizationMember)
```

Ye single `OrganizationMember` object return karti hai.

Is query ko do arguments chahiye:

```text
organizationId
userId
```

Caller ki identity:

```ts
user.id
```

Service invocation:

```ts
return this.organizationsService.getMember(
  user.id,
  organizationId,
  userId,
);
```

Yahan:

- `user.id`: request karne wala user.
- `organizationId`: requested organization.
- `userId`: target member.

In values ko mix nahi karna chahiye.

---

## 9.4 `organizations.module.ts`

Path:

```text
src/organizations/organizations.module.ts
```

Code:

```ts
import { Module } from '@nestjs/common';

import {
  OrganizationsService,
} from './organizations.service.js';

import {
  OrganizationsResolver,
} from './organizations.resolver.js';

import {
  OrganizationMembersResolver,
} from './organization-members.resolver.js';

import {
  PrismaModule,
} from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  providers: [
    OrganizationsService,
    OrganizationsResolver,
    OrganizationMembersResolver,
  ],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
```

### `@Module()`

NestJS modules application ko logical units mein organize karte hain.

### `imports`

```ts
imports: [PrismaModule]
```

Organization module ko Prisma module ke exported providers access karne ki permission deta hai.

Ye tabhi kaam karega jab `PrismaModule` apne required provider ko correctly export karta ho.

### `providers`

```ts
providers: [
  OrganizationsService,
  OrganizationsResolver,
  OrganizationMembersResolver,
]
```

NestJS dependency injection container ko batata hai ki ye classes module ke providers hain.

Agar `OrganizationMembersResolver` register nahi hoga, toh GraphQL schema mein expected query expose na hone ki problem aa sakti hai.

### `exports`

```ts
exports: [OrganizationsService]
```

Isse doosre modules `OrganizationsService` ko import kiye gaye module ke through use kar sakte hain.

---

# 10. Automated Tests

File:

```text
src/organizations/organizations.members.spec.ts
```

Testing framework:

**Vitest**

## 10.1 What is unit testing?

Unit testing mein application ke individual functions ya classes ko isolated environment mein test kiya jata hai.

Example:

```ts
service.listMembers('u1', 'o1');
```

Hum verify kar sakte hain:

- Member list return hui ya nahi.
- Non-member reject hua ya nahi.
- Correct organization ID use hui ya nahi.
- Sensitive fields query selection mein absent hain ya nahi.

Unit tests mein actual PostgreSQL database ki jagah mocked Prisma methods use kiye ja sakte hain.

## 10.2 What is mocking?

Mocking mein real dependency ki jagah controlled test implementation use hoti hai.

Example:

```ts
const findMany = vi.fn();
const findUnique = vi.fn();
```

Ye mock functions hain.

Inhe configure kiya ja sakta hai ki particular test mein kya return karein.

Example:

```ts
findUnique.mockResolvedValueOnce({
  id: 'membership-1',
});
```

Iska matlab hai ki next call par mocked `findUnique()` Promise ke through ye object return karega.

**Important:** Mock-based tests application logic aur query construction verify karte hain. Ye independently guarantee nahi karte ki real database, Prisma schema, network aur authentication integration sab sahi hain. Isliye build aur manual/integration testing bhi useful hai.

---

## 10.3 Test 1 — Valid member can list members

Expected:

```text
Caller is a member
        |
        v
Membership check succeeds
        |
        v
Member list returned
```

Test verifies ki authorized caller members ki list retrieve kar sakta hai.

---

## 10.4 Test 2 — Non-member is rejected

Expected:

```text
Caller is not a member
        |
        v
ForbiddenException
        |
        v
Member list query does not execute
```

Important assertion:

```ts
expect(findMany).not.toHaveBeenCalled();
```

Iska purpose hai verify karna ki unauthorized caller ke liye member-list query execute nahi hui.

---

## 10.5 Test 3 — Member list is organization-scoped

Expected query condition:

```ts
where: {
  organizationId: 'o1',
}
```

Ye test verify karta hai ki list query requested organization ke ID ko use karti hai.

---

## 10.6 Test 4 — Sensitive fields are not selected

Test checks:

```ts
expect(userSelect.passwordHash).toBeUndefined();
expect(userSelect.refreshTokens).toBeUndefined();
expect(arg.include).toBeUndefined();
```

Iska purpose hai ensure karna ki tested Prisma query explicitly safe fields select karti hai.

**Important:** Ye assertions tabhi relevant hain jab actual Prisma selection ka structure wahi ho. Agar future mein query structure change hota hai, test ko naye intended structure ke according update karna chahiye.

---

## 10.7 Test 5 — Empty organization returns an empty list

Expected result:

```ts
[]
```

Agar organization mein matching membership records nahi hain, list query empty array return kar sakti hai.

Caller ka membership check separately pass hona chahiye.

Isliye empty list ka matlab automatically ye nahi hai ki caller unauthorized hai.

---

## 10.8 Test 6 — Single-member lookup includes organizationId

Test verifies:

```ts
where: {
  userId_organizationId: {
    userId: 'u9',
    organizationId: 'o1',
  },
}
```

Isse ensure hota hai ki target lookup sirf user ID ke basis par nahi ho raha.

---

## 10.9 Test 7 — Non-member cannot retrieve a member

Caller membership check fail hone par:

```ts
ForbiddenException
```

Expected hai.

Target lookup execute nahi hona chahiye.

---

## 10.10 Test 8 — Missing target member returns NotFound

Agar caller organization ka member hai lekin requested target membership nahi milti:

```ts
NotFoundException
```

Expected hai.

Ye unauthorized caller aur authorized caller ke missing target ke cases ko separate karta hai.

---

# 11. Commands

## 11.1 Create files

```bash
touch src/organizations/entities/organization-member.entity.ts

touch src/organizations/organization-members.resolver.ts

touch src/organizations/organizations.members.spec.ts
```

`touch` file create karta hai agar file exist nahi karti.

Agar file already exist karti hai, toh `touch` generally uska modification timestamp update karta hai; existing content delete nahi karta.

**Important:** File create karne ke baad usmein required code add karna zaroori hai.

---

## 11.2 Build

```bash
pnpm build
```

Purpose:

- TypeScript compilation verify karna.
- Type errors detect karna.
- Build-related problems identify karna.

Successful build ka matlab compilation pass hui.

Lekin successful build alone runtime behaviour ya security correctness prove nahi karta.

---

## 11.3 Run tests

```bash
pnpm test
```

Purpose:

Vitest ke configured test suite ko execute karna.

Agar project mein 9 test files hain aur sab pass karti hain, toh output mein 9 test files passed dikh sakti hain.

**Test files aur individual tests alag counts hain.**

Day 2 ki provided spec file mein 8 individual test cases hain.

---

## 11.4 Start development server

```bash
pnpm start:dev
```

Purpose:

- NestJS development server start karna.
- Application initialization verify karna.
- Dependency injection errors identify karna.
- GraphQL schema initialization verify karna.

Expected startup message project configuration ke according similar ho sakta hai:

```text
Nest application successfully started
```

---

## 11.5 Git workflow

```bash
git status

git add src/organizations

git commit -m "feat(organizations): add organization member queries"

git push
```

### `git status`

Working tree mein modified, staged aur untracked files show karta hai.

### `git add`

Selected changes ko staging area mein add karta hai.

### `git commit`

Staged changes ka snapshot repository history mein save karta hai.

### `git push`

Local commits ko configured remote repository par upload karta hai.

**Best practice:** Commit karne se pehle `git status` aur test results verify karna useful hai.

---

# 12. Manual Testing with Apollo Sandbox

Automated unit tests ke alawa GraphQL queries ko manually execute karke verify karna bhi useful hai.

## 12.1 Prerequisites

Ensure karo:

1. NestJS server running hai.
2. GraphQL endpoint accessible hai.
3. Valid access token available hai.
4. Organization ID actual database se li gayi hai.
5. Target user ID actual database se li gayi hai.

Placeholder values actual identifiers nahi hain.

Example:

```text
<ORG1 real id>
<real user id>
<fresh access token>
```

Inhe real values se replace karna hai.

---

## 12.2 Query 1 — Organization members

```graphql
query OrganizationMembers($organizationId: ID!) {
  organizationMembers(
    organizationId: $organizationId
  ) {
    id
    role
    user {
      id
      name
      email
      createdAt
    }
  }
}
```

### Explanation

```graphql
query OrganizationMembers
```

Operation ka naam hai.

Named operation multiple queries ke saath document use karte waqt identification mein help karti hai.

```graphql
$organizationId: ID!
```

Variable declaration hai.

- `ID`: GraphQL identifier scalar.
- `!`: Non-null requirement.

Client ko valid non-null variable provide karna hoga.

```graphql
organizationMembers(...)
```

Resolver ki query execute karta hai.

```graphql
user {
  id
  name
  email
  createdAt
}
```

Nested selection related user ke requested fields return karti hai.

---

## 12.3 Query 1 variables

```json
{
  "organizationId": "YOUR_REAL_ORGANIZATION_ID"
}
```

Actual organization ID use karo.

---

## 12.4 Query 2 — Single member

```graphql
query OrganizationMemberDetail(
  $organizationId: ID!,
  $userId: ID!
) {
  organizationMember(
    organizationId: $organizationId,
    userId: $userId
  ) {
    id
    role
    user {
      id
      name
      email
      createdAt
    }
  }
}
```

### Variables

```json
{
  "organizationId": "YOUR_REAL_ORGANIZATION_ID",
  "userId": "YOUR_REAL_TARGET_USER_ID"
}
```

Is query mein `userId` target member ko identify karta hai.

Caller ki identity token se determine hoti hai.

---

## 12.5 Authorization header

Apollo Sandbox mein request headers set karo:

```json
{
  "Authorization": "Bearer YOUR_REAL_ACCESS_TOKEN"
}
```

**Important:**

- `Bearer` ke baad ek space.
- Token actual hona chahiye.
- Placeholder text use nahi karna.
- Token ke around `<` aur `>` nahi lagane.
- Expired token ko fresh token se replace karna.

---

# 13. Manual Security Test Matrix

| # | Test | Expected behaviour |
|---|---|---|
| 1 | Authorized user requests organization member list | Members ki list return ho |
| 2 | Authorized user requests their own membership details | Corresponding member details return hon |
| 3 | Non-member requests organization member list | Membership-related error |
| 4 | Non-member requests single-member details | Membership-related error |
| 5 | Authorized caller requests missing target | `Member not found` |
| 6 | Request without access token | Authentication failure |
| 7 | Request `passwordHash` from GraphQL `User` type | GraphQL schema validation error |
| 8 | User requests members from another organization | Cross-tenant access reject ho |

### Important testing notes

**Test 1:** Organization mein expected members hone chahiye.

**Test 2:** Target user requested organization ka member hona chahiye.

**Test 3:** Test account requested organization ka member nahi hona chahiye.

**Test 5:** Target user ID aisa hona chahiye jiske liye requested organization mein membership record exist na karta ho.

**Test 6:** Authorization header omit karo ya invalid credentials use karo.

**Test 7:** Sensitive field ko separate query document mein test karo.

**Test 8:** Sirf doosri organization ke member ki ID provide karna enough test nahi hai. Caller ka organization membership bhi independently verify karna zaroori hai.

---

# 14. GraphQL Sandbox Errors and Their Fixes

## 14.1 `Cannot query field`

Example:

```text
Cannot query field "passwordHash" on type "User"
```

**Meaning:**

Requested field GraphQL schema mein available nahi hai.

**Day 2 ke context mein:**

Agar `passwordHash` GraphQL `User` type mein expose nahi hai, toh client us field ko request nahi kar sakta.

Ye expected security behaviour hai.

---

## 14.2 Multiple operations in one document

GraphQL document mein multiple named operations ho sakti hain.

Example:

```graphql
query OrganizationMembers {
  # ...
}

query OrganizationMemberDetail {
  # ...
}
```

Agar document mein multiple operations hain, client ko execution ke liye operation select karni pad sakti hai.

Agar ek operation ka naam anonymous hai aur multiple operations hain, document invalid ho sakta hai.

**Fix:**

Operations ko names do aur zarurat pade toh separate Sandbox tabs mein rakho.

---

## 14.3 Missing variables

Error:

```text
Variable "$organizationId" of required type "ID!" was not provided.
```

**Reason:**

Query required variable expect karti hai, lekin request mein variable provide nahi hua.

**Fix:**

Variables panel mein valid JSON do:

```json
{
  "organizationId": "YOUR_REAL_ORGANIZATION_ID"
}
```

---

## 14.4 Invalid or expired access token

Error:

```text
Invalid or expired access token
```

**Possible reasons:**

- Token expire ho gaya.
- Token malformed hai.
- Wrong token paste hua.
- Authorization header incorrect hai.

**Fix:**

Login flow se fresh access token generate karo aur headers update karo.

---

## 14.5 Literal placeholder IDs

Incorrect:

```json
{
  "organizationId": "ORG1"
}
```

Agar `ORG1` sirf documentation label hai, toh ye actual database identifier nahi hai.

**Fix:**

Actual organization ID use karo.

---

## 14.6 Token ke around angle brackets

Incorrect:

```json
{
  "Authorization": "Bearer <YOUR_ACCESS_TOKEN>"
}
```

Yahan angle brackets literal string ka part ban gaye.

Correct:

```json
{
  "Authorization": "Bearer actual-token-value"
}
```

---

# 15. Security Analysis

## 15.1 Security layer 1 — Authentication

```ts
@UseGuards(JwtAuthGuard)
```

Purpose:

Request ko authenticated user se associate karna.

---

## 15.2 Security layer 2 — Membership authorization

```ts
await this.assertMember(callerId, organizationId);
```

Purpose:

Verify karna ki authenticated caller requested organization ka member hai.

---

## 15.3 Security layer 3 — Organization-scoped lookup

```ts
where: {
  userId_organizationId: {
    userId: targetUserId,
    organizationId,
  },
}
```

Purpose:

Target membership ko requested organization tak limit karna.

---

## 15.4 Security layer 4 — Explicit field selection

```ts
select: MEMBER_SELECT
```

Purpose:

Database query mein sirf required fields retrieve karna.

---

## 15.5 Security layer 5 — GraphQL schema control

```ts
@Field(() => User)
user!: User;
```

Related user object ka actual exposed schema existing `User` GraphQL class determine karti hai.

Agar `passwordHash` schema ka field nahi hai, client usse directly query nahi kar sakta.

---

## 15.6 Security layer 6 — Automated regression tests

Tests verify karte hain ki:

- Non-members reject hote hain.
- Unauthorized list query execute nahi hoti.
- Target lookup organization-scoped hai.
- Sensitive fields explicitly select nahi hote.

Future code changes ke baad tests rerun karke regressions detect ki ja sakti hain.

---

## 15.7 Important security limitations

Current implementation useful protections provide karti hai, lekin kuch additional considerations bhi hain.

### A. Authorization must cover every relevant endpoint

Agar koi doosra resolver organization membership verify kiye bina private data return karta hai, toh Day 2 ke protections us endpoint ko automatically secure nahi karenge.

Har relevant resolver/service path ko appropriate authorization enforce karna hoga.

### B. Avoid returning internal fields

Future database fields ko GraphQL types aur Prisma selections mein automatically expose nahi karna chahiye.

### C. Protect sensitive user fields everywhere

Sirf `OrganizationMember` query ko safe banana enough nahi hai.

User information return karne wale doosre endpoints ko bhi audit karna chahiye.

### D. Consider large organizations

Agar organization mein thousands of members hain, unrestricted `findMany()` expensive ho sakta hai.

Future implementation mein pagination add ki ja sakti hai:

```text
organizationMembers(
  organizationId,
  first,
  after
)
```

Exact GraphQL API pagination design project requirements par depend karega.

### E. Consider authorization race conditions

Membership verification aur subsequent data retrieval do separate database operations hain.

Agar membership concurrently revoke ho jaye, toh strict authorization requirements ke liye transaction isolation, query design ya other synchronization strategies consider karni pad sakti hain.

Current implementation simple read operations ke liye membership check enforce karti hai, lekin concurrent revocation scenarios separately evaluate karne chahiye.

---

# 16. Interview Questions and Answers

## Q1. What is the difference between authentication and authorization?

Authentication user ki identity verify karta hai.

Authorization verify karta hai ki authenticated user requested resource access kar sakta hai ya nahi.

TaskForge mein JWT guard authentication karta hai, jabki `assertMember()` organization membership verify karta hai.

---

## Q2. Why do we verify membership before retrieving members?

Taaki organization ka non-member team data retrieve na kar sake.

Service pehle membership check karti hai. Check fail hone par exception throw hoti hai aur subsequent member-data query execute nahi hoti.

---

## Q3. Why is `organizationId` required in the single-member query?

Sirf `userId` user ko identify karta hai, organization-specific membership ko nahi.

`organizationId` ke saath lookup karne se target membership requested organization ke andar scoped rehti hai.

Ye IDOR aur cross-tenant access risks reduce karta hai.

---

## Q4. What is the difference between Prisma `select` and `include`?

`select` exact fields choose karta hai.

`include` related records ko query result mein include karta hai.

Sensitive fields wale models par explicit selection useful hai kyunki unselected columns query result mein nahi aate.

---

## Q5. How do you prevent `passwordHash` from leaking?

Is implementation mein multiple protections hain:

1. GraphQL `User` type mein sensitive field expose nahi kiya gaya.
2. Prisma `MEMBER_SELECT` explicit safe fields choose karta hai.
3. Automated test verify karta hai ki sensitive fields selected nahi hain.

Sensitive data ko retrieve hi na karna exposure risk reduce karta hai.

---

## Q6. What is `satisfies Prisma.OrganizationMemberSelect`?

Ye TypeScript expression ko Prisma ke expected selection type ke against validate karta hai.

Isse invalid selection properties par compile-time errors detect kiye ja sakte hain aur exact selection structure infer hota hai.

---

## Q7. What is a compound unique constraint?

Compound unique constraint multiple fields ke combination ko unique banata hai.

Example:

```text
userId + organizationId
```

Iska use ek user ki ek organization mein unique membership identify karne ke liye kiya ja sakta hai.

---

## Q8. Why is `assertMember()` private?

Ye service ka internal authorization helper hai.

Isse public service API ko unnecessary methods se clutter kiye bina multiple service methods mein common membership-check logic reuse ki ja sakti hai.

TypeScript ka `private` compile-time access restriction provide karta hai; ye runtime security boundary nahi hai.

---

## Q9. Why use a separate resolver?

Separate resolver responsibilities ko organize karta hai.

`OrganizationsResolver` organization-level queries handle kar sakta hai, jabki `OrganizationMembersResolver` member-related queries handle karta hai.

Isse code maintain aur test karna easier ho sakta hai.

---

## Q10. Why are all roles allowed to view the team?

Current requirement ke according organization ke saare members team dekh sakte hain.

ADMIN, MANAGER aur EMPLOYEE ke beech viewing restrictions implement nahi ki gayi hain.

Future mein invite, role modification aur member removal jaise actions role-based authorization use kar sakte hain.

---

## Q11. What is multi-tenant isolation?

Multi-tenant isolation ensure karta hai ki application ke ek organization ka private data doosri organization ko improperly accessible na ho.

TaskForge mein membership checks aur organization-scoped queries is isolation ka part hain.

---

## Q12. What is the difference between 403 and 404?

`403 Forbidden` indicate karta hai ki caller requested operation ke liye authorized nahi hai.

`404 Not Found` indicate karta hai ki requested resource nahi mila.

Current implementation membership failure par 403 aur authorized caller ke missing target member par 404 use karti hai.

GraphQL response mein exact transport representation framework configuration par depend kar sakti hai.

---

## Q13. What do the Day 2 unit tests verify?

Provided test file mein 8 test cases hain:

1. Authorized caller member list retrieve kar sakta hai.
2. Non-member reject hota hai.
3. Unauthorized list query execute nahi hoti.
4. List query organization-scoped hai.
5. Sensitive fields selection mein absent hain.
6. Empty list correctly return hoti hai.
7. Single-member lookup organization-scoped hai.
8. Missing target aur non-member caller ke error cases correctly handle hote hain.

---

## Q14. Why is a GraphQL schema check not enough for sensitive data protection?

GraphQL schema client ko available fields control karta hai.

Lekin agar backend unnecessary sensitive fields retrieve karta hai, toh woh application memory ya internal processing mein available ho sakte hain.

Isliye schema control ke saath explicit database field selection bhi useful hai.

---

## Q15. Does passing all unit tests prove that the feature is production-ready?

Nahi.

Unit tests targeted business logic verify karte hain.

Production readiness evaluate karne ke liye additional checks useful hain:

- Integration tests.
- Real database constraints.
- Authentication integration.
- Authorization coverage.
- Error handling.
- Query performance.
- Pagination.
- Logging and monitoring.
- Deployment configuration.

---

# 17. Day 2 Completion Checklist

## Implementation

- [x] `OrganizationMember` GraphQL entity created.
- [x] `Role` enum registered.
- [x] `MEMBER_SELECT` defined.
- [x] `assertMember()` implemented.
- [x] `listMembers()` implemented.
- [x] `getMember()` implemented.
- [x] `organizationMembers` query implemented.
- [x] `organizationMember` query implemented.
- [x] `OrganizationMembersResolver` registered in the module.
- [x] Existing Prisma models reused.
- [x] No database migration required.

## Security

- [x] Both queries protected with `JwtAuthGuard`.
- [x] Caller identity obtained from authenticated context.
- [x] Membership verified before retrieving member data.
- [x] List query scoped by `organizationId`.
- [x] Single-member lookup scoped by `organizationId`.
- [x] Explicit Prisma field selection used.
- [x] Existing GraphQL `User` type reused.

## Testing

- [x] 8 member-related unit tests present in the provided spec file.
- [x] Unauthorized caller test included.
- [x] Organization scoping test included.
- [x] Sensitive field selection test included.
- [x] Missing target test included.
- [ ] Verify the current test suite passes locally.
- [ ] Verify `pnpm build` passes locally.
- [ ] Verify development server starts successfully.
- [ ] Complete the manual GraphQL test matrix.

## Git

- [ ] Review `git status`.
- [ ] Commit verified changes.
- [ ] Push commit to the configured remote.

**Note:** Checklist mein implementation items code ke basis par mark kiye gaye hain. Commands aur manual tests ko tabhi complete mark karo jab unhe actual environment mein execute karke verify kar liya ho.

---

# 18. Day 2 Summary

Day 2 mein TaskForge ke organization-management module ko extend karke member retrieval functionality implement ki gayi.

Do GraphQL queries add hui:

```graphql
organizationMembers(organizationId: ID!)
```

Aur:

```graphql
organizationMember(
  organizationId: ID!,
  userId: ID!
)
```

Implementation mein:

- GraphQL code-first approach use hui.
- Existing `OrganizationMember` aur `User` models reuse hue.
- Prisma queries ke through members retrieve kiye gaye.
- Membership check service layer mein enforce hua.
- `organizationId` ke through cross-organization access restrict kiya gaya.
- Explicit Prisma selection ke through unnecessary fields exclude kiye gaye.
- Vitest ke through authorization aur query-scoping behaviour test kiya gaya.

## Most important concepts learned

```text
Authentication
    |
    v
Authorization
    |
    v
Tenant Scoping
    |
    v
Data Minimization
    |
    v
Testing
```

Ye concepts sirf TaskForge ke liye nahi, balki multi-tenant SaaS applications ke backend design mein bhi useful hain.

---

# 19. Next — Phase 2, Day 3: Organization Invitations

Day 3 ka proposed feature organization invitation system hai.

High-level flow:

```text
Organization Admin / Authorized Manager
                  |
                  v
             Invite Member
                  |
                  v
       Create Invitation Record
                  |
                  v
       Generate Invitation Token
                  |
                  v
      Invitee Receives Dev Link
                  |
                  v
           Accept Invitation
                  |
                  v
       Validate Token and Expiry
                  |
                  v
      Verify Invitee's Email
                  |
                  v
      Create Organization Membership
                  |
                  v
       Mark Invitation Accepted
```

Potential database fields:

```text
OrganizationInvitation
--------------------------------
id
organizationId
email
role
tokenHash
expiresAt
acceptedAt
createdById
createdAt
```

Ye proposed fields hain; final model existing schema aur implementation requirements ke according design hoga.

## Day 3 ke important security concepts

- Role-based authorization.
- Secure invitation token generation.
- Token hashing.
- Invitation expiry.
- Single-use invitation acceptance.
- Email verification.
- Transactional membership creation.
- Duplicate invitation handling.
- Existing membership handling.
- Invitation acceptance race conditions.

**Day 3 ka objective:** Authorized organization members ko secure invitation workflow ke through naye members add karne ki functionality provide karna.

---

# Final Takeaway

Day 2 ka core lesson ye hai:

**Authenticated hona aur kisi organization ka data access karne ke liye authorized hona alag baatein hain.**

TaskForge mein member queries pehle caller ki organization membership verify karti hain, phir organization-scoped Prisma queries execute karti hain, aur response ke liye explicitly selected fields return karti hain.

Ye pattern future mein projects, tasks, comments, files aur doosre organization-specific resources par authorization implement karne ke liye bhi ek useful foundation provide karta hai.