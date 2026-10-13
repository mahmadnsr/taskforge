# Phase 2 -- Day 5: Project DB Design

## Schema + Migration + Database Integrity Check

> **Repo:** `work-bench/backend`\
> **Stack:** NestJS 12 (ESM), Prisma 6.19, Neon PostgreSQL, pnpm 10,
> Node 22\
> **Status:** ✅ Day 5 complete --- schema ✅ · migration ✅ ·
> regression 62/62 ✅ · integrity script 6/6 ✅

------------------------------------------------------------------------

## 🧭 Day 5 at a glance

  -------------------------------------------------------------------------------
  Area                    What was done                   Why it matters
  ----------------------- ------------------------------- -----------------------
  Data model              Added `ProjectStatus`,          Defines how projects
                          `Project`, `ProjectMember`      and their members are
                                                          represented

  Tenant safety           Added composite foreign keys    Prevents a project from
                                                          being connected to a
                                                          user from another
                                                          organization

  Migration               Created                         Converts the Prisma
                          `20261013071127_add_projects`   schema changes into
                                                          real PostgreSQL
                                                          tables/constraints

  Regression              Ran existing tests: 62/62       Checks that earlier
                                                          Phase 1 functionality
                                                          still behaves as
                                                          expected

  Integrity check         Ran 6 real-database checks: 6/6 Verifies PostgreSQL
                                                          constraints, not just
                                                          application assumptions

  API                     Not implemented on Day 5        Project API work
                                                          belongs to Day 6
  -------------------------------------------------------------------------------

## 1. Day 5 ka goal

Project feature ke liye **database design** banana, API nahi (API Day 6
mein). Day 5 mein sirf teen cheezein:

1.  `Project` aur `ProjectMember` models + enum `ProjectStatus`.
2.  Migration `20261013071127_add_projects`.
3.  Ek script jo DB ke constraints ko **seedha test** karti hai
    (cross-tenant leak DB level par possible hai ya nahi).

Is din koi resolver/service nahi bana, isliye naye unit tests nahi hain.
Test count 62 hi raha (regression).

### Is sequence ka logic

``` text
Prisma schema
    │  describes desired data model
    ▼
Prisma migration
    │  translates schema changes into SQL
    ▼
Neon PostgreSQL
    │  stores and enforces the constraints
    ▼
Integrity-check script
       tries valid and invalid operations against the real DB
```

**Important distinction:** schema file mein relation likhna design
declare karta hai; migration us design ko database mein apply karti hai;
integrity script verify karti hai ki database waqai expected rules
enforce kar raha hai. In teenon ka role alag hai.

### Day 5 ka scope boundary

-   ✅ Database models, relationships, indexes, unique constraints,
    foreign keys.
-   ✅ Migration generation/application and SQL inspection.
-   ✅ Real database integrity verification.
-   ❌ Project GraphQL resolver/service/API nahi.
-   ❌ Project permissions ka complete API-level authorization flow
    nahi.
-   ❌ Frontend changes nahi.

------------------------------------------------------------------------

## 2. Definitions (concepts)

  -----------------------------------------------------------------------
  Term                                Matlab
  ----------------------------------- -----------------------------------
  **Multi-tenancy (shared schema)**   Sab organizations ka data ek hi
                                      tables mein, `organizationId`
                                      column se alag.

  **Tenant isolation**                Org A ka data Org B ko kisi bhi
                                      halat mein na dikhe / na jude.

  **Foreign Key (FK)**                Ek table ka column jo dusre table
                                      ki row ko point kare, DB enforce
                                      karta hai.

  **Composite FK**                    FK jo ek se zyada columns se bana
                                      ho, jaise
                                      `(projectId, organizationId)`.

  **Denormalization**                 Jaanbujh kar ek value (yahan
                                      `organizationId`) dobara store
                                      karna taaki DB constraint laga
                                      sake.

  **ON DELETE CASCADE**               Parent row delete ho to child rows
                                      apne aap delete.

  **ON DELETE RESTRICT**              Child/reference relationship hone
                                      par parent delete block.

  **Unique constraint**               Duplicate combination rok deta hai
                                      (`P2002`).

  **Prisma P2003**                    Foreign key constraint fail.

  **Prisma P2002**                    Unique constraint fail.

  **Primary key (PK)**                Row ka unique identifier; yahan har
                                      model ka `id`.

  **Nullable field**                  Aisa field jiska value `NULL` ho
                                      sakta hai; Prisma mein `String?`
                                      jaise likhte hain.

  **Index**                           Database structure jo matching rows
                                      ko dhoondhne mein madad karta hai;
                                      write/storage overhead bhi hota
                                      hai.

  **Migration**                       Version-controlled SQL changes jo
                                      database schema ko ek state se
                                      doosri state mein le jaate hain.

  **Back-relation**                   Prisma model par opposite side ka
                                      relation field; aam taur par
                                      navigation/type generation ke liye
                                      hota hai.

  **Regression test**                 Pehle se working features ko dobara
                                      test karna taaki naye changes
                                      purana behaviour na todein.

  **Integrity test**                  Real database constraints ko actual
                                      inserts/deletes ke through verify
                                      karna.
  -----------------------------------------------------------------------

### Multi-tenancy ko simple example se samjho

Maan lo TaskForge mein do organizations hain:

``` text
Organization A
 ├── User A1
 └── Project A1

Organization B
 ├── User B1
 └── Project B1
```

Shared-schema design mein in sab rows ko alag database/table mein rakhna
zaroori nahi. `organizationId` batata hai ki row kis tenant ki hai.
Lekin sirf `organizationId` column rakh dena isolation ki guarantee nahi
hai. Relations aur queries ko bhi tenant boundaries follow karni
chahiye.

**Important security note:** composite FKs relational integrity ko
strong banate hain, lekin woh apne aap har read query ko tenant-safe
nahi banate. Day 6 ki service/resolver layer ko bhi organization access
verify karna hoga.

------------------------------------------------------------------------

## 3. Design decisions (kyun aisa banaya)

### 3.1 `ProjectMember` mein `organizationId` kyun duplicate kiya?

Agar sirf `projectId` aur `userId` rakhte, to DB ye nahi rok pata ki:

-   Org A ke project mein Org B ka user add ho jaye.

Service-layer check pe bharosa karna risky hai (ek bug = data leak).
Isliye **DB level** par rule laga diya.

#### Without composite FK --- possible bad state

  -------------------------------------------------------------------------
  ProjectMember.projectId   ProjectMember.userId    What could go wrong?
  ------------------------- ----------------------- -----------------------
  Project-A                 User-B                  Project A belongs to
                                                    Org A, but User B
                                                    belongs to Org B

  -------------------------------------------------------------------------

Agar plain FK sirf `projectId -> Project.id` aur `userId -> User.id`
hoti, dono IDs individually valid hoti. Database ko ye nahi pata hota ki
dono entities ka organization same hona chahiye.

#### With `organizationId`

`ProjectMember` row mein teen relevant values hoti hain:

``` text
projectId      = project ka ID
userId         = user ka ID
organizationId = woh organization jiske context mein membership hai
```

Phir database do composite constraints check karta hai:

1.  `(projectId, organizationId)` kisi `Project` row se match kare.
2.  `(userId, organizationId)` kisi `OrganizationMember` row se match
    kare.

Agar Project Org A ka hai aur user Org B ka member hai, ek hi
`organizationId` dono sides ko satisfy nahi kar sakta. Isliye invalid
row reject hoti hai.

Ye **intentional denormalization** hai: organization ID project se
derive ho sakti hai, phir bhi membership row mein store ki gayi taaki
database multi-column FK se tenant consistency enforce kar sake.

### 3.2 Do composite FKs

``` text
ProjectMember(projectId, organizationId)
    └──> Project(id, organizationId)

ProjectMember(userId, organizationId)
    └──> OrganizationMember(userId, organizationId)
```

Matlab ek `ProjectMember` row tabhi ban sakti hai jab:

1.  Project **usi organization** ka ho, aur
2.  User **usi organization** ka member ho.

Dono mein same `organizationId` use hota hai, isliye cross-org row
possible hi nahi---jab tak constraints disable/drop na kiye jaayen ya
database-level privilege se schema modify na kiya jaaye.

#### Constraint failure ka example

``` text
Project:           projectId = P1, organizationId = ORG_A
OrganizationMember: userId = U2, organizationId = ORG_B
ProjectMember insert: projectId = P1, userId = U2, organizationId = ORG_A
```

-   Project FK: `(P1, ORG_A)` project row se match --- valid.
-   OrganizationMember FK: `(U2, ORG_A)` membership row se match nahi
    karta, kyunki U2 ka membership `(U2, ORG_B)` hai --- reject,
    normally Prisma `P2003`.

### 3.3 Isko possible banane ke liye `@@unique([id, organizationId])` on Project

Composite FK ka target (referenced columns) unique hona zaroori hai.
`id` already unique hai, par `(id, organizationId)` jodi ko alag se
unique declare karna padta hai. `OrganizationMember` mein
`(userId, organizationId)` unique pehle se tha (Phase 1).

``` prisma
@@unique([id, organizationId])
```

-   `@@` ka matlab model-level attribute hai.
-   `unique` database ko combination par uniqueness enforce karne ko
    kehta hai.
-   `id` akela hi row identify karta hai, isliye logically pair bhi
    unique hai.
-   Lekin composite FK ko exactly `(id, organizationId)` target karna
    hai, to schema mein matching unique key declare karna
    Prisma/PostgreSQL ke relation design ke liye zaroori hai.

Yeh uniqueness business rule ke liye nahi---mainly composite reference
ko valid target dene ke liye hai. Database migration mein iska
corresponding unique constraint/index banega.

### 3.4 Cascade / Restrict choices

  -----------------------------------------------------------------------
  Relation                `onDelete`              Reason
  ----------------------- ----------------------- -----------------------
  Project → Organization  `CASCADE`               Org delete = uske
                                                  projects delete

  ProjectMember → Project `CASCADE`               Project delete =
                                                  memberships delete

  ProjectMember →         `CASCADE`               Member org se remove =
  OrganizationMember                              project se bhi
                                                  automatically remove

  Project.createdBy →     **`RESTRICT`**          Jis user ne project
  User                                            banaya usko
                                                  accidentally delete na
                                                  kiya ja sake
  -----------------------------------------------------------------------

#### Cascade ko chain ke saath samjho

``` text
Organization
  └── Project
       └── ProjectMember
```

Organization delete hone par uske projects cascade se delete ho sakte
hain; projects ke project-memberships bhi cascade se delete ho sakte
hain. Isse dependent rows orphan nahi hoti.

Organization membership remove karne par:

``` text
OrganizationMember deleted
       │ ON DELETE CASCADE
       ▼
ProjectMember rows for that org membership deleted
```

Is cascade ki wajah se Day 4 ka `removeMember` ab project memberships
bhi clean kar dega, alag code ki zarurat nahi---**provided Day 4 ka
delete operation wahi `OrganizationMember` row delete karta hai aur
database constraints/migration applied hain.**

#### `RESTRICT` ka trade-off

`createdBy` relation par `RESTRICT` ka matlab hai ki agar user kisi
project ka creator hai, to us user ko delete karne ki koshish block ho
sakti hai. Isse accidental project loss se protection milti hai. Lekin
product policy ke hisaab se future mein owner transfer, soft-delete, ya
deliberate project deletion workflow chahiye ho sakta hai.

### 3.5 Indexes

-   `Project @@index([organizationId, status])` -- "org ke active
    projects" query fast.
-   `ProjectMember @@index([userId])` -- "ye user kin projects mein hai"
    query fast.
-   `ProjectMember @@unique([projectId, userId])` -- ek user ek project
    mein sirf ek baar.

#### Index ka practical example

``` sql
SELECT *
FROM "Project"
WHERE "organizationId" = 'org_123'
  AND "status" = 'ACTIVE';
```

`(organizationId, status)` index is filter pattern ko support kar sakta
hai. Actual performance table size, data distribution, query plan aur
selected columns par depend karti hai; index hona speed ki absolute
guarantee nahi.

`@@unique([projectId, userId])` uniqueness enforce karne ke saath index
bhi create karta hai. Isliye same user ko same project mein duplicate
membership nahi mil sakti.

**Index design rule of thumb:** indexes useful read patterns aur
constraints ke liye hote hain, har column par index lagane ke liye nahi.
Extra indexes inserts/updates/deletes ko thoda costly aur storage use ko
zyada kar sakte hain.

------------------------------------------------------------------------

## 4. Schema (final)

``` prisma
enum ProjectStatus {
  ACTIVE
  ARCHIVED
}

model Project {
  id             String        @id @default(uuid())
  organizationId String
  name           String
  description    String?
  status         ProjectStatus @default(ACTIVE)
  createdById    String
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  organization Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdBy    User            @relation("ProjectsCreated", fields: [createdById], references: [id], onDelete: Restrict)
  members      ProjectMember[]

  @@unique([id, organizationId])
  @@index([organizationId, status])
}

model ProjectMember {
  id             String   @id @default(uuid())
  projectId      String
  userId         String
  organizationId String
  createdAt      DateTime @default(now())

  project   Project            @relation(fields: [projectId, organizationId], references: [id, organizationId], onDelete: Cascade)
  orgMember OrganizationMember @relation(fields: [userId, organizationId], references: [userId, organizationId], onDelete: Cascade)

  @@unique([projectId, userId])
  @@index([userId])
}
```

### 4.1 `ProjectStatus` enum --- each line ka reason

``` prisma
enum ProjectStatus {
  ACTIVE
  ARCHIVED
}
```

-   `enum ProjectStatus`: fixed, known set of statuses define karta hai.
-   `ACTIVE`: project normal use mein hai.
-   `ARCHIVED`: project retained hai lekin active work se bahar ho sakta
    hai.
-   Enum arbitrary strings jaise `"actve"` ya `"archvied"` ko valid
    status banne se rokta hai.
-   `ARCHIVED` ka actual product behaviour---jaise edit allowed hai ya
    nahi---API/business logic mein define hoga; enum akela woh rules
    enforce nahi karta.

### 4.2 `Project` model --- field-by-field

``` prisma
id String @id @default(uuid())
```

-   `String`: Prisma-level field type.
-   `@id`: primary key.
-   `@default(uuid())`: ID generate karne ka default.
-   Purpose: har project ko stable identifier dena.

``` prisma
organizationId String
```

Project kis organization ka hai. Non-optional hai, isliye har project ko
organization se linked hona chahiye.

``` prisma
name String
description String?
```

-   `name` required hai.
-   `description String?` optional hai; `?` ka matlab null allow hai.
-   Name/description ki length, whitespace, allowed characters jaise
    validations ko API/schema validation layer mein define karna hoga,
    unless DB constraints separately add kiye jaayen.

``` prisma
status ProjectStatus @default(ACTIVE)
```

Naye project ka status automatically `ACTIVE` hoga agar create operation
mein explicit status nahi diya gaya.

``` prisma
createdById String
```

Creator user ka ID. Ye normal scalar field hai jo neeche `createdBy`
relation ke FK column ke roop mein use hota hai.

``` prisma
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
```

-   `createdAt`: row create hone par database-side/default current
    timestamp.
-   `updatedAt`: Prisma client ke update operations par timestamp update
    karta hai.
-   Note: `@updatedAt` Prisma Client behaviour hai; raw SQL se updates
    karne par equivalent trigger na ho to timestamp automatic update
    hona guaranteed nahi.

``` prisma
organization Organization @relation(
  fields: [organizationId],
  references: [id],
  onDelete: Cascade
)
```

-   `organization` relation field se Prisma ko related organization
    navigate karne ka path milta hai.
-   `fields: [organizationId]`: current `Project` row ka FK column.
-   `references: [id]`: `Organization` ka referenced key.
-   `onDelete: Cascade`: organization delete ho to dependent projects
    delete ho sakte hain.

``` prisma
createdBy User @relation(
  "ProjectsCreated",
  fields: [createdById],
  references: [id],
  onDelete: Restrict
)
```

-   Named relation `"ProjectsCreated"` creator-user relationship ko
    unambiguous banati hai.
-   `createdById` user row ke `id` ko reference karta hai.
-   `Restrict` creator ko delete karne se rok sakta hai jab dependent
    projects exist karte hon.

``` prisma
members ProjectMember[]
```

Ek project ke multiple membership rows ho sakte hain. `[]` list relation
ko represent karta hai; ye SQL column nahi hai.

``` prisma
@@unique([id, organizationId])
@@index([organizationId, status])
```

Pehla composite FK ke liye referenced key declare karta hai. Doosra
common organization/status filtering ko support karta hai.

### 4.3 `ProjectMember` model --- field-by-field

`ProjectMember` ek **join/association model** hai. Ye Project aur User
ke beech relationship represent karta hai, aur saath mein organization
context aur membership timestamp rakhta hai.

``` prisma
id String @id @default(uuid())
```

Har membership row ki apni ID. Natural composite key bhi design ki ja
sakti thi, lekin yahan surrogate `id` use hua hai.

``` prisma
projectId String
userId String
organizationId String
```

-   `projectId`: kis project ka member.
-   `userId`: kaunsa user member.
-   `organizationId`: woh tenant context jo dono composite FKs mein
    match hona chahiye.
-   Teeno required hain, isliye partial membership row valid nahi.

``` prisma
createdAt DateTime @default(now())
```

Membership create hone ka timestamp; future mein audit/display/ordering
mein useful ho sakta hai.

``` prisma
project Project @relation(
  fields: [projectId, organizationId],
  references: [id, organizationId],
  onDelete: Cascade
)
```

Yeh simple FK se stronger hai. Sirf project ID nahi, project ID **aur
organization ID dono** referenced project row se match hone chahiye.
Project delete ho to membership row bhi delete hoti hai.

``` prisma
orgMember OrganizationMember @relation(
  fields: [userId, organizationId],
  references: [userId, organizationId],
  onDelete: Cascade
)
```

User ka global `User` row exist karna alone sufficient nahi. User ka us
specific organization ka `OrganizationMember` row bhi hona chahiye. Org
membership delete ho to corresponding project membership cascade se
delete hoti hai.

``` prisma
@@unique([projectId, userId])
@@index([userId])
```

-   Unique pair duplicate membership rokti hai.
-   `userId` index user ke project memberships lookup karne mein madad
    kar sakta hai.

### 4.4 Back-relations jo existing models mein jode gaye

  Model                  Naya field
  ---------------------- ----------------------------------------------------------
  `User`                 `createdProjects Project[] @relation("ProjectsCreated")`
  `Organization`         `projects Project[]`
  `OrganizationMember`   `projectMemberships ProjectMember[]`

Back-relation ka purpose Prisma Client mein navigation/type safety dena
hai. Example: project ke saath members include karna, ya user ke created
projects query karna. Relation field khud usually extra SQL column nahi
banata; actual FK scalar fields aur constraints database mein
columns/constraints banate hain.

### 4.5 Relationship diagram

``` text
User
 └── createdProjects ──> Project <── organization ── Organization
                             │
                             │ members
                             ▼
                       ProjectMember
                             ▲
                             │ orgMember
                             │
                    OrganizationMember
                             │
                             ▼
                       Organization
```

`ProjectMember` ka `userId` directly `User.id` ko reference nahi karta;
woh `(userId, organizationId)` ke through `OrganizationMember` ko
reference karta hai. Is design ka key point yahi hai: user ka tenant
membership required hai.

------------------------------------------------------------------------

## 5. Commands (order mein)

``` bash
cd backend
pnpm prisma format
pnpm prisma validate
pnpm prisma migrate dev --name add_projects
pnpm prisma generate            # migrate dev usually khud kar deta hai
# TS server restart: VS Code -> Ctrl+Shift+P -> "TypeScript: Restart TS Server"
pnpm build
pnpm test
```

### Command-by-command explanation

  -------------------------------------------------------------------------------------------------
  Command                                         Kya karta hai             Kyun chalaya
  ----------------------------------------------- ------------------------- -----------------------
  `cd backend`                                    Backend package directory Prisma config/schema
                                                  mein jaata hai            aur `package.json` ke
                                                                            expected folder mein
                                                                            rehne ke liye

  `pnpm prisma format`                            `schema.prisma`           Relations/attributes
                                                  formatting normalize      readable aur consistent
                                                  karta hai                 hote hain

  `pnpm prisma validate`                          Prisma schema             Migration se pehle
                                                  syntax/config/relations   schema errors pakadne
                                                  validate karta hai        ke liye

  `pnpm prisma migrate dev --name add_projects`   Development migration     Database ko schema ke
                                                  generate/apply karta hai  desired state tak le
                                                                            jaane ke liye

  `pnpm prisma generate`                          Prisma Client             New models aur fields
                                                  types/client code         ko application code
                                                  generate karta hai        mein type-safe access
                                                                            karne ke liye

  Restart TS Server                               VS Code TypeScript        Stale generated
                                                  language service restart  types/editor
                                                                            diagnostics refresh
                                                                            karne ke liye

  `pnpm build`                                    Application compile/build Type errors aur
                                                  karta hai                 compile-time problems
                                                                            pakadne ke liye

  `pnpm test`                                     Project test suite run    Existing behaviour
                                                  karta hai                 regress na hua ho
                                                                            verify karne ke liye
  -------------------------------------------------------------------------------------------------

**Caution:** `migrate dev` development workflow ke liye hai. Production
deployment mein project ke chosen deployment process ke mutabiq
`prisma migrate deploy` use hota hai; production database par casually
`migrate dev` run nahi karna.

### Migration SQL check (composite FK sach mein bane ya nahi)

``` bash
grep -n "FOREIGN KEY" prisma/migrations/20261013071127_add_projects/migration.sql
```

Expected: 4 FKs. Line 48 aur 51 composite wale hain
(`("projectId","organizationId")` aur `("userId","organizationId")`,
dono `ON DELETE CASCADE`). Baaki do: `Project.organizationId` CASCADE,
`Project.createdById` RESTRICT.

**Line numbers migration file ke exact version ke hisaab se badal sakte
hain.** More reliable check is to inspect all `FOREIGN KEY` statements
rather than assume a line number.

### Migration file ka role

Migration file generated SQL ka version-controlled record hai. Ismein
aam taur par `CREATE TABLE`, `CREATE INDEX`,
`ALTER TABLE ... ADD CONSTRAINT` jaise statements hote hain. Isko Git
mein commit karne se teammates/deployment environment database structure
ko reproducibly update kar sakte hain.

------------------------------------------------------------------------

## 6. `scripts/db-integrity-check.mjs` -- DB constraints ka direct test

> **Note:** neeche ka code is notes ke liye design se reconstruct kiya
> gaya hai (tumhari file ka exact copy nahi). Logic aur checks wahi hain
> jo tumne run kiye. Apni asli file ko source of truth maano.

### 6.1 Ye script kya karti hai

-   Temp data banati hai: 2 orgs (a, b), 3 users (a, b, c). Sab `tmp-`
    prefix aur `@example.test` email ke saath, matrix test users ko
    touch nahi karti.
-   6 checks chalati hai (neeche table).
-   `finally` block mein sab temp data FK order mein delete karti hai,
    chahe check fail ho ya pass.

### Script ka flow

``` text
Node starts script
   │
   ├─ Load .env (DATABASE_URL, etc.)
   ├─ Create PrismaClient
   ├─ Create isolated temporary fixture rows
   ├─ Run valid operation → must succeed
   ├─ Run invalid operation → must fail with expected Prisma code
   ├─ Run uniqueness/cascade checks
   ├─ finally: clean up temporary rows
   ├─ Disconnect Prisma
   └─ Exit 0 if all passed; non-zero if any failed
```

Real database test kyun? Kyunki FK, unique aur cascade rules PostgreSQL
enforce karta hai. Mock object ya unit test mein Prisma call ko simulate
karne se ye prove nahi hota ki actual database constraints correctly
applied hain.

### 6.2 Checks aur result

  --------------------------------------------------------------------------
                     \# Check              Expected         Result
  --------------------- ------------------ ---------------- ----------------
                      1 Same-org member ko success          ✅ PASS
                        project mein add                    

                      2 Org ka member nahi `P2003`          ✅ PASS
                        hai us user ko add                  

                      3 `organizationId`   `P2003`          ✅ PASS
                        mismatch (project                   
                        org A, user org B)                  

                      4 Duplicate project  `P2002`          ✅ PASS
                        member                              

                      5 Org member delete  cascade ✅, user ✅ PASS
                        → uski             alive            
                        ProjectMember row                   
                        cascade, User                       
                        account bacha                       

                      6 Project delete →   rows 0           ✅ PASS
                        uske ProjectMember                  
                        rows cascade                        
  --------------------------------------------------------------------------

Final output: `Result: 6 passed, 0 failed` aur temp data cleanup.

### 6.3 Code skeleton (reconstructed)

``` js
import pkg from '@prisma/client';
const { PrismaClient } = pkg;

const prisma = new PrismaClient();
let passed = 0;
let failed = 0;

function pass(name) {
  console.log(`PASS  ${name}`);
  passed++;
}

function fail(name, why) {
  console.log(`FAIL  ${name} -> ${why}`);
  failed++;
}

async function expectCode(name, code, fn) {
  try {
    await fn();
    fail(name, `expected ${code} but it succeeded`);
  } catch (e) {
    e.code === code ? pass(name) : fail(name, `got ${e.code ?? e.message}`);
  }
}

const suffix = Date.now();
const created = { users: [], orgs: [] };

try {
  // setup: orgs a/b, users a/b/c, memberships, project in org a
  // check 1..6 as in the table above
} finally {
  // delete in FK order:
  // projectMember -> project -> organizationMember -> organization -> user
  await prisma.$disconnect();
}

console.log(`Result: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
```

### 6.4 Har code part kyun likha gaya?

#### Import

``` js
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
```

Script ESM (`.mjs`) hai. Default import ke through package object liya
gaya aur usse `PrismaClient` destructure kiya gaya. Ye CommonJS/ESM
interop ke liye chosen import style hai; generated Prisma Client setup
ke hisaab se import style verify karna chahiye.

#### Prisma client instance

``` js
const prisma = new PrismaClient();
```

Ye database queries aur mutations ke liye client banata hai. Iske
through script `project.create`, `projectMember.create`,
`organizationMember.delete` jaise operations execute kar sakti hai.

#### Pass/fail counters

``` js
let passed = 0;
let failed = 0;
```

Sirf console messages nahi, numeric summary bhi chahiye. Har successful
assertion `passed` increment karti hai; failed expectation `failed`
increment karti hai.

#### `pass()` and `fail()`

``` js
function pass(name) { ... }
function fail(name, why) { ... }
```

Repeated logging/counter logic ko ek jagah rakhte hain. Isse har test
mein counters manually update karne ki duplication kam hoti hai.

#### `expectCode()`

``` js
async function expectCode(name, code, fn) {
  try {
    await fn();
    fail(name, `expected ${code} but it succeeded`);
  } catch (e) {
    e.code === code ? pass(name) : fail(name, `got ${e.code ?? e.message}`);
  }
}
```

Is helper ka intention hai: operation fail hona chahiye aur error code
expected code ke barabar hona chahiye.

-   `fn` ek async operation hai jo test ke andar execute hoga.
-   Agar operation successful ho gaya, test fail hona chahiye.
-   Agar error aaya aur `e.code` expected code hai, test pass.
-   Agar koi doosra error aaya, test fail; warna unrelated error ko bhi
    expected constraint failure samajhne ka risk hota.

**Implementation caution:** reconstructed helper mein `try` ke andar
`fail(...)` call hota hai. Agar `fail()` sirf counter/logging karta hai
aur throw nahi karta, to uske baad execution `catch` mein nahi
jaayega---so this is fine. Lekin agar future mein `fail()` throw karne
lage, helper ka behaviour badal sakta hai. Exact script mein
cleanup/error handling bhi inspect karna.

#### Unique suffix

``` js
const suffix = Date.now();
```

Timestamp-based suffix temporary fixture names/emails ko unique banane
mein madad karta hai. Repeated runs mein same unique values collide hone
ka chance kam hota hai. Concurrent runs ke liye random UUID ya stronger
unique suffix bhi use kiya ja sakta hai.

#### Tracking created rows

``` js
const created = { users: [], orgs: [] };
```

Created rows ka record cleanup mein help karta hai. Script ko ideally
sirf wahi rows delete karni chahiye jo usne khud banayi hain. Actual
cleanup ko foreign-key dependency order follow karna chahiye.

#### `try ... finally`

`finally` cleanup/disconnect ke liye hota hai: checks pass hon ya error
throw ho, cleanup attempt phir bhi hoti hai. Lekin `finally` apne aap
perfect cleanup guarantee nahi karta---cleanup queries khud fail ho
sakti hain. Production-grade utility mein cleanup errors ko report karna
aur disconnect ko nested `finally` mein rakhna useful ho sakta hai.

#### Exit code

``` js
process.exit(failed ? 1 : 0);
```

-   `0`: automation/CI ke liye success.
-   `1`: kam se kam ek check fail hua.
-   Isse shell/CI pipeline result ko reliably detect kar sakti hai.

**Caution:** `process.exit()` immediately process terminate kar sakta
hai. Prisma disconnect aur pending logs complete hone ke baad exit karna
safer hota hai. Exact script ka output successful tha, lekin future
hardening mein awaited cleanup/disconnect ke baad
`process.exitCode = failed ? 1 : 0` set karna consider kar sakte ho.

### 6.5 Cleanup order kyun matter karta hai?

FK dependency ko child → parent direction mein delete karna hota hai,
jab tak cascade already rows ko delete na kar de.

``` text
ProjectMember
    ↓
Project
    ↓
OrganizationMember
    ↓
Organization
    ↓
User
```

Actual schema ke exact dependencies ke hisaab se order adjust hota hai.
Agar parent pehle delete ki aur relation `RESTRICT` hai, delete fail ho
sakta hai. Cascade-enabled relationships children ko automatically
remove kar sakti hain, lekin test cleanup explicit rakhne se intent
clearer hota hai.

### 6.6 `expectCode` aur Prisma errors

-   `P2002`: unique constraint fail --- e.g. same `(projectId, userId)`
    membership dobara insert karna.
-   `P2003`: foreign key fail --- e.g. `(userId, organizationId)` kisi
    valid `OrganizationMember` key se match na kare.

Error code ko assert karna generic "operation failed" se stronger hai,
kyunki ye verify karta hai ki operation expected constraint ki wajah se
fail hua.

### 6.7 Script run karna

``` bash
node --env-file=.env scripts/db-integrity-check.mjs
```

-   `node`: JavaScript runtime.
-   `--env-file=.env`: `.env` variables ko `process.env` mein load karta
    hai (Node 20+).
-   `scripts/db-integrity-check.mjs`: standalone script path.
-   Is command ko `backend` directory se run karo, jahan `.env` expected
    hai.

Script ko shared/development database par run karte waqt bhi unique
temporary data, limited cleanup scope aur correct `DATABASE_URL` verify
karo. Production database par test fixtures insert/delete karne se pehle
explicit approval and isolation strategy zaroori hai.

------------------------------------------------------------------------

## 7. `.mjs` file kya hoti hai (poori detail)

### 7.1 Definition

`.mjs` = **ES Module JavaScript file** ("m" = module). Extension se hi
Node samajh jata hai ki file `import` / `export` syntax use karti hai,
`package.json` mein `"type": "module"` ki zarurat nahi.

### 7.2 Extensions ka comparison

  ------------------------------------------------------------------------
  Extension         Module system     Syntax             Compile chahiye?
  ----------------- ----------------- ------------------ -----------------
  `.js`             `package.json` ke depend             nahi (plain JS)
                    `type` par depend                    

  `.mjs`            hamesha ESM       `import` /         nahi
                                      `export`,          
                                      top-level `await`  

  `.cjs`            hamesha CommonJS  `require()` /      nahi
                                      `module.exports`   

  `.ts`             TypeScript        typed              haan (`tsc` /
                                                         `nest build`)
  ------------------------------------------------------------------------

`.mjs` plain JavaScript hi hai; extension use karne se TypeScript types
nahi milte. Runtime par Node JS execute karta hai. `top-level await` ESM
context mein supported hai, though script mein use karna compulsory
nahi.

### 7.3 Kaisa code isme likha jata hai

Standalone **utility scripts**, jo NestJS app ka part nahi hote:

-   DB integrity / sanity checks (hamari script)
-   Seed data, one-off data fixes
-   Migration ke baad verification
-   Chhoti automation / maintenance tasks

### 7.4 Humne `.mjs` kyun chuna

1.  **Build step nahi.** `nest build` sirf `src/` compile karta hai;
    `scripts/` ki file seedha `node` se chalti hai.

2.  **Top-level `await`** milta hai (`main()` wrapper nahi chahiye).

3.  **App se alag.** Ye test ya runtime code nahi, ek tool hai, to
    `src/` ke bahar rakha.

4.  **Prisma import ka gotcha:** `@prisma/client` CommonJS package hai,
    ESM se named import kabhi fail hota hai. Isliye:

    ``` js
    import pkg from '@prisma/client';
    const { PrismaClient } = pkg;
    ```

Package module behaviour version aur generated client setup ke saath
change ho sakta hai; agar import error aaye to installed Prisma version,
`generator` provider aur generated client output check karo.

### 7.5 `node --env-file=.env`

-   Node 20+ ka built-in flag, `.env` ke variables `process.env` mein
    load karta hai.
-   `dotenv` package ki zarurat nahi.
-   Flag na do to `DATABASE_URL` missing hoga aur Prisma connect nahi
    karega---unless variable shell/environment mein pehle se set ho.

------------------------------------------------------------------------

## 8. Errors / observations jo Day 5 mein mile

  ----------------------------------------------------------------------------------------------------------
                     \# Problem                                Kaaran                 Fix
  --------------------- -------------------------------------- ---------------------- ----------------------
                      1 `projectMemberships ProjectMember[]`   Relation               Field
                        galat model mein (Organization) rakha  `OrganizationMember`   `OrganizationMember`
                        tha                                    ke through hai         model mein move kiya
                                                               (composite FK)         

                      2 `migrate dev` ka output beech mein cut Neon (serverless       Wait kiya, baad mein
                        / hang jaisa                           Postgres) wake hone    full success output
                                                               mein time leta hai     aaya

                      3 Prisma Client types stale              `prisma generate` ke   TS server restart
                                                               baad TS server restart 
                                                               nahi hua tha           
  ----------------------------------------------------------------------------------------------------------

### Lesson ko detail mein

1.  **Relation field ko FK target se map karo.**
    `ProjectMember.orgMember` ka `references: [userId, organizationId]`
    target `OrganizationMember` hai, isliye opposite/back-relation
    `OrganizationMember` model par honi chahiye.
2.  **Migration output ko patience ke saath inspect karo.** Neon
    connection wake-up/latency ka factor ho sakta hai, lekin har hang ko
    serverless wake-up assume na karo; process exit code, network/DB
    logs aur full terminal output bhi check karo.
3.  **Generated types aur editor diagnostics alag layers hain.**
    `prisma generate` client artifacts update karta hai. VS Code
    TypeScript server kabhi old cached type state dikha sakta hai;
    restart editor diagnostics refresh kar sakta hai.

Lesson: composite FK mein back-relation hamesha **referenced model** par
jaati hai jisko FK point karta hai, har `@relation` ke `references` dekh
kar decide karo.

------------------------------------------------------------------------

## 9. Verification summary

  Check                                            Result
  ------------------------------------------------ -----------------------
  `prisma validate`                                ✅
  `migrate dev` (`add_projects`)                   ✅
  Migration SQL mein composite FKs (line 48, 51)   ✅
  `pnpm build`                                     ✅
  `pnpm test`                                      ✅ 12 files, 62 tests
  `db-integrity-check.mjs`                         ✅ 6/6

### Verification ka meaning

-   `prisma validate` pass hone ka matlab Prisma schema internally valid
    hai.
-   Migration success ka matlab schema changes target DB par apply hue.
-   SQL inspection verify karta hai expected composite FK statements
    migration mein present hain.
-   Build pass compile/type-level issues ke against confidence deta hai.
-   62 regression tests pass hona existing test suite ke pass hone ka
    evidence hai, complete correctness proof nahi.
-   6/6 integrity checks pass hona listed scenarios ke expected database
    behaviour ka evidence hai; ye har possible edge case cover nahi
    karta.

------------------------------------------------------------------------

## 10. Interview Q&A

**Q1. Multi-tenancy ke approaches kaun se hain, tumne kaunsa chuna?**\
Database-per-tenant, schema-per-tenant, shared-schema (row-level,
`organizationId`). Maine shared-schema liya: sasta, migrations simple,
scale theek. Trade-off: isolation khud enforce karni padti hai (service
layer + DB constraints).

**Q2. `ProjectMember` mein `organizationId` kyun store kiya jab project
se mil sakta hai?**\
Taaki composite FK laga sakoon. Is se DB khud guarantee karta hai ki
project aur member same org ke hon. Ye jaanbujh ki denormalization hai
integrity ke liye.

**Q3. Composite FK ka target unique kyun hona chahiye?**\
SQL standard: referenced columns ka set unique/PK hona chahiye warna
"kaun si row" ambiguous hogi. Isliye
`Project @@unique([id, organizationId])`.

**Q4. Service layer check kaafi kyun nahi?**\
Ek bug, race condition ya naya developer check bhool sakta hai. DB
constraint last line of defense hai, bypass nahi hota.

**Q5. `createdBy` pe Restrict kyun, Cascade kyun nahi?**\
User delete hone par saare uske banaye projects chup-chaap ud jate, jo
dangerous hai. Restrict forcefully pehle ownership handle karwata hai.

**Q6. Member ko org se remove karo to project memberships ka kya hota
hai?**\
Composite FK ke `ON DELETE CASCADE` se automatically delete. Alag
cleanup code nahi. Script ka check 5 yehi verify karta hai, aur User
account bacha rehta hai.

**Q7. P2002 aur P2003 mein difference?**\
P2002 = unique constraint violation (duplicate). P2003 = foreign key
violation (referenced row nahi mili / mismatch).

**Q8. `.mjs` aur `.js` mein kya fark hai?**\
`.mjs` hamesha ESM hoti hai; `.js` ka behaviour package.json ke `type`
par depend karta hai. `.cjs` hamesha CommonJS.

**Q9. DB-level test script kyun likhi, unit test kyun nahi?**\
Constraints Postgres enforce karta hai, mock Prisma pe unka test
meaningful nahi. Real DB par temp data se test kiya aur `finally` mein
cleanup kiya.

**Q10. Script real data ko affect kyun nahi karti?**\
Temp data `tmp-` prefix aur `@example.test` email se banta hai, aur
`finally` mein delete hota hai, matrix users touch nahi hote.

### Bonus interview questions

**Q11. Kya composite FK complete tenant security provide karta hai?**\
Nahi. Ye invalid cross-tenant relationships ko database level par block
karta hai. Reads, updates, deletes aur authorization ke liye API/service
layer ko bhi current user's organization membership verify karni
chahiye. Row-level security ek additional option ho sakta hai, agar
architecture usko use kare.

**Q12. `@@unique([projectId, userId])` aur `@@index([userId])` alag
kyun?**\
Unique constraint duplicate pair rokta hai aur index create karta hai jo
`(projectId, userId)` order ko support karta hai. User-only lookup ke
liye `userId` first column nahi hai, isliye separate `userId` index
useful ho sakta hai.

**Q13. Migration ko Git mein kyun commit karna chahiye?**\
Taaki database schema changes reproducible aur reviewable hon.
Teammates/CI/deployment same migration history apply kar sakte hain,
instead of manually recreating database changes.

**Q14. `@updatedAt` aur database trigger same cheez hain?**\
Nahi. Prisma `@updatedAt` Prisma Client writes par update timestamp
manage karta hai. Raw SQL updates ko bhi cover karna ho to database
trigger ya explicit SQL update logic chahiye ho sakti hai.

**Q15. `P2003` ka matlab hamesha cross-tenant mismatch hai?**\
Nahi. Ye FK violation ka general Prisma code hai. Missing referenced
row, wrong composite key, ya kisi aur FK violation ki wajah se aa sakta
hai. Test ko input aur expected constraint ke context mein interpret
karna chahiye.

------------------------------------------------------------------------

## 11. Day 5 completion checklist

-   [x] `ProjectStatus` enum, `Project`, `ProjectMember` models
-   [x] Back-relations (User, Organization, OrganizationMember)
-   [x] Migration `add_projects` applied
-   [x] Composite FKs migration SQL mein confirm
-   [x] Build + 62 tests pass
-   [x] Integrity script 6/6
-   [x] Notes (ye file)
-   [ ] Git commit (neeche)

------------------------------------------------------------------------

## 12. Git (repo root se)

Suggested commits (agar Day 4 abhi commit nahi hua to pehle wo):

``` bash
git status
git add .
git commit -m "feat(projects): add Project/ProjectMember schema, composite FKs and integrity check"
git push
```

Day 4 aur Day 5 alag commit chahiye to pehle Day 4 files
`git add <paths>` se alag stage karo, phir baaki.

### Git commands ka reason

-   `git status`: working tree/staging state check karo; accidental
    files, `.env` ya unrelated changes identify karo.
-   `git add .`: current directory ke changes stage karta hai. Isliye
    command repo root se run karte waqt check karo ki unrelated/unwanted
    files stage na ho.
-   `git commit -m "...":` staged changes ka local snapshot create karta
    hai.
-   `git push`: local commit ko configured remote branch par upload
    karta hai.

**Secret safety:** `.env`, database URLs, API keys, credentials ya
production dumps commit mat karna. `git status` aur staged diff review
karna good practice hai.

### Current push context

Day 5 commit ka terminal output pehle share kiya gaya tha:

``` text
[a3be4c9] feat(projects): add Project/ProjectMember schema, composite FKs and integrity check
3 files changed, 265 insertions(+), 2 deletions(-)
To https://github.com/mahmadnsr/work-bench.git
   6efe13e..a3be4c9  main -> main
```

Is output ke basis par commit `a3be4c9` successfully `main` branch par
push hua tha. Agar notes file ko iske baad edit kiya hai, to woh edit
automatically push nahi hota; use separately commit/push karna hoga.

------------------------------------------------------------------------

## 13. Pending / carry-forward

-   Day 3 Sandbox rows (I3, I5--I7, A1--A6, D1--D3) ka result abhi
    report nahi hua.
-   Day 4 Sandbox rows (1--9, C1, C2) ka result abhi report nahi hua.
-   Observation: Nest `ConflictException` / `NotFoundException` GraphQL
    mein `INTERNAL_SERVER_ERROR` code ke saath aate hain; production
    `formatError` unka message mask kar dega. Day 7 audit mein fix ka
    plan, tumhari permission ke baad.
-   **Day 6 (Project APIs) tab tak start nahi hoga jab tak tum
    explicitly na bolo.**

### Day 5 se carry-forward mental model

``` text
Schema design      = rules describe karo
Migration          = rules DB mein apply karo
Database constraints = invalid relationships block karo
Integrity script   = real DB par rules test karo
Regression suite   = purane behaviour ko dobara verify karo
Day 6              = API/service layer, authorization and business behaviour
```

Day 5 ka central lesson: **tenant isolation ko sirf application code ki
good intention par mat chhodo.** Application-level authorization aur
database-level relational constraints ek doosre ko complement karte
hain.
