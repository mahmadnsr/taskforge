Bhai, bilkul! 🔥 Main tere liye **TaskForge ke completed feature — Task Search, Filtering, Sorting & Pagination — ke detailed, README-style notes** bana raha hoon. Saath mein feature checklist bhi rakhenge, taaki humein pata chale ki kya complete hai, kya verify karna baaki hai aur kya abhi implement nahi hua.

Ek important distinction: **398 passing tests ka matlab 398 features nahi hain.** Tests implementation ki correctness check karte hain; poore project ki feature completeness jaanne ke liye roadmap aur code bhi review karna hoga.

# 📘 TaskForge — Day Notes: Task Search, Filtering, Sorting & Pagination

## 1. Day ka objective

TaskForge mein project ke tasks ko efficiently retrieve karne ki functionality implement karni thi.

Pehle `projectTasks` query se project ke tasks list kiye ja sakte the. Lekin real-world task management system mein users ko ye capabilities bhi chahiye:

- Title ya description se task search karna.
- Status ke according tasks filter karna.
- Priority ke according tasks filter karna.
- Assignee ke according tasks filter karna.
- Different fields ke according sorting karna.
- Results ko pages mein divide karna.
- Total results aur next page ki availability jaanana.
- Organization aur project ke access rules enforce karna.

**Implementation status:** Code complete, tests passed, production build successful aur changes GitHub par push ho chuke hain.

Commit: `0b40e24`  
Commit message: `feat: add task search filtering and pagination`

---

## 2. Architecture mein kya add hua?

Is feature mein paanch files commit hui hain.

| File | Responsibility |
|---|---|
| `src/tasks/dto/task-query.input.ts` | Search, filters, sorting aur pagination ke input rules |
| `src/tasks/entities/paginated-tasks.entity.ts` | Paginated response ka GraphQL structure |
| `src/tasks/tasks.resolver.ts` | GraphQL query expose karna |
| `src/tasks/tasks.service.ts` | Authorization, filtering, searching, sorting aur database queries |
| `src/tasks/tasks.service.spec.ts` | Service behaviour aur edge cases ke tests |
| `src/common/graphql/format-error.ts` | Validation errors ke messages ko client tak safely expose karna |

Pehli file pehle se commit ho chuki thi. Baaki paanch files latest feature commit mein shamil hain.

### Request ka flow

```text
GraphQL Client
      |
      v
searchProjectTasks Query
      |
      v
TaskQueryInput Validation
      |
      v
TasksResolver
      |
      v
TasksService
      |
      +--> Organization Membership Check
      |
      +--> Project Validation
      |
      +--> Employee Project-Membership Check
      |
      +--> Search + Filters + Sorting
      |
      +--> Prisma Database Queries
      |
      v
PaginatedTasks Response
```

Is architecture mein resolver GraphQL request handle karta hai, service business logic aur authorization sambhalti hai, aur Prisma database se data retrieve karta hai.

---

## 3. `TaskQueryInput` — Query input ka design

File: `src/tasks/dto/task-query.input.ts`

Ye DTO define karta hai ki client task search karte waqt kaun-kaun se parameters bhej sakta hai.

### Available parameters

| Parameter | Type | Default | Purpose |
|---|---|---|---|
| `status` | Task status | None | Status ke basis par filter |
| `priority` | Task priority | None | Priority ke basis par filter |
| `assigneeId` | UUID | None | Specific assignee ke tasks |
| `search` | String | None | Title aur description mein search |
| `sortBy` | Sort enum | `CREATED_AT` | Kis field se sorting hogi |
| `sortDirection` | Direction enum | `DESC` | Ascending ya descending order |
| `limit` | Integer | `20` | Ek page mein maximum kitne tasks |
| `offset` | Integer | `0` | Kitne records skip karne hain |

### Sorting ke supported fields

```ts
CREATED_AT = 'createdAt'
UPDATED_AT = 'updatedAt'
DUE_DATE = 'dueDate'
PRIORITY = 'priority'
```

Sorting direction:

```ts
ASC = 'asc'
DESC = 'desc'
```

Iska matlab user creation date, update date, due date ya priority ke basis par tasks sort kar sakta hai.

### Input validation

DTO mein validation rules hain:

- `search` ki maximum length 100 characters.
- `assigneeId` valid UUID hona chahiye.
- `limit` minimum `1` aur maximum `100`.
- `offset` non-negative integer hona chahiye.
- Sorting field aur direction defined enums se aane chahiye.

Isse invalid input ko GraphQL layer par hi reject karne mein madad milti hai.

**Important:** DTO validation aur service validation dono ka role hai. DTO incoming request validate karta hai, jabki service mein limit, offset aur sorting ke liye additional guards bhi hain.

---

## 4. `PaginatedTasks` — Response structure

File: `src/tasks/entities/paginated-tasks.entity.ts`

Is entity ka purpose paginated results ke saath additional metadata return karna hai.

```ts
@ObjectType()
export class PaginatedTasks {
  @Field(() => [Task])
  tasks!: Task[];

  @Field(() => Int)
  totalCount!: number;

  @Field()
  hasNextPage!: boolean;

  @Field(() => Int)
  limit!: number;

  @Field(() => Int)
  offset!: number;
}
```

### Har field ka meaning

| Field | Meaning |
|---|---|
| `tasks` | Current page ke tasks |
| `totalCount` | Filters apply hone ke baad matching total tasks |
| `hasNextPage` | Kya current page ke baad aur results available hain? |
| `limit` | Current request mein kitne records tak ki limit hai |
| `offset` | Results retrieve karne ke liye kitne records skip hue |

### `totalCount` kyun zaroori hai?

Maan le project mein 73 tasks hain aur tum 20 tasks per page retrieve kar rahe ho.

```text
Total matching tasks = 73
Limit                = 20
Offset               = 0
```

Response mein `totalCount = 73` hoga, jabki `tasks` array mein maximum 20 records honge.

Is information se frontend pagination controls ya total-results indicator bana sakta hai.

### `hasNextPage` ka logic

Service mein calculation hai:

```ts
hasNextPage: offset + tasks.length < totalCount
```

Example:

```text
totalCount = 73
offset     = 20
tasks.length = 20

20 + 20 < 73
40 < 73

hasNextPage = true
```

Lekin agar `offset = 60` ho aur sirf 13 records return hon:

```text
60 + 13 < 73
73 < 73

hasNextPage = false
```

Yaani last page par aur results available nahi hain.

---

## 5. GraphQL resolver mein kya implement hua?

File: `src/tasks/tasks.resolver.ts`

Nayi query ka naam hai:

```graphql
searchProjectTasks
```

Ye query client ko filters aur pagination parameters ke saath tasks retrieve karne deti hai.

Resolver ke important parameters:

- `organizationId`
- `projectId`
- Optional `filters`

Agar filters provide nahi kiye jaate, resolver empty object pass karta hai:

```ts
filters ?? {}
```

Isse service apne defaults use kar sakti hai.

**Purani `projectTasks` query bhi retained hai.** Isliye existing functionality ko replace kiye bina naya search-based endpoint add hua hai.

---

## 6. Service layer — Business logic

File: `src/tasks/tasks.service.ts`

Ye feature ka main implementation hai.

### Step 1: Organization membership check

Service sabse pehle:

```ts
const membership = await this.getMembership(
  userId,
  organizationId,
);
```

Iska purpose verify karna hai ki user requested organization ka member hai.

### Step 2: Project validation

```ts
await this.getProject(organizationId, projectId);
```

Project ko requested organization ke context mein validate kiya jata hai.

Isse query ko organization aur project ke scope mein rakhne mein madad milti hai.

### Step 3: Employee authorization

```ts
if (membership.role === Role.EMPLOYEE) {
  await this.assertProjectMembership(userId, projectId);
}
```

Employee ke liye project membership check hota hai.

Manager aur admin ke behaviour ko existing authorization rules ke saath consistent rakhna zaroori hai. Current tests mein manager access ke liye project-member lookup ki requirement na hone ka case bhi cover hai.

### Step 4: Filters apply karna

Service in optional filters ko combine karti hai:

```ts
status
priority
assigneeId
```

Agar koi filter provide nahi hua, to woh condition `where` object mein add nahi hoti.

Conceptually:

```text
organizationId = requested organization
projectId      = requested project
status         = optional
priority       = optional
assigneeId     = optional
```

**Important:** Organization aur project scope optional nahi hain. Ye query ke base conditions hain.

### Step 5: Search

Search string ko trim kiya jata hai:

```ts
const normalizedSearch = search?.trim();
```

Phir title aur description dono mein case-insensitive partial matching hoti hai.

Example search:

```text
"login"
```

Potential matches:

- `Implement login endpoint`
- `Fix LOGIN validation`
- `Update login error description`

Search ke liye Prisma ka `contains` aur `mode: 'insensitive'` use hota hai.

Search condition tabhi add hoti hai jab trimmed search string non-empty ho.

### Step 6: Sorting

Default sorting:

```text
createdAt DESC
```

Matlab newest-created tasks pehle aayenge.

Supported sorting fields DTO mein enum se restricted hain. Service additional validation bhi karti hai.

Implementation mein primary sort ke saath `id ASC` tie-breaker use kiya gaya hai, jisse equal primary-sort values wale records ka order deterministic reh sake.

### Step 7: Pagination

Prisma query mein:

```ts
take: limit,
skip: offset,
```

- `take` batata hai maximum kitne records return karne hain.
- `skip` batata hai kitne records skip karne hain.

### Step 8: Total count aur task retrieval

Service do queries parallel mein execute karti hai:

```ts
const [tasks, totalCount] = await Promise.all([
  this.prisma.task.findMany({
    where,
    orderBy,
    take: limit,
    skip: offset,
  }),
  this.prisma.task.count({ where }),
]);
```

Dono queries same filter conditions use karti hain.

Isse ek request mein page ke tasks aur matching total count dono mil jaate hain.

**Technical note:** `Promise.all` dono database queries ko parallel execute karta hai, lekin ye apne aap transaction-level snapshot consistency guarantee nahi karta. Agar concurrent updates ho rahe hon, count aur returned records ke beech temporary difference possible hai.

---

## 7. GraphQL Playground mein test kaise karna hai?

### Example 1: Default query

```graphql
query {
  searchProjectTasks(
    organizationId: "YOUR_ORGANIZATION_UUID"
    projectId: "YOUR_PROJECT_UUID"
  ) {
    tasks {
      id
      title
      status
      priority
      createdAt
    }
    totalCount
    hasNextPage
    limit
    offset
  }
}
```

Is query mein filters nahi diye gaye.

Expected defaults:

```text
sortBy        = createdAt
sortDirection = desc
limit         = 20
offset        = 0
```

Apne actual organization aur project UUIDs use karna. Agar authentication required hai, valid access token bhi provide karna.

### Example 2: Search aur filters

```graphql
query {
  searchProjectTasks(
    organizationId: "YOUR_ORGANIZATION_UUID"
    projectId: "YOUR_PROJECT_UUID"
    filters: {
      search: "login"
      status: TODO
      priority: HIGH
      limit: 10
      offset: 0
    }
  ) {
    tasks {
      id
      title
      description
      status
      priority
    }
    totalCount
    hasNextPage
    limit
    offset
  }
}
```

Ye example `login` search ke saath `TODO` status aur `HIGH` priority wale matching tasks retrieve karne ke liye hai.

`TODO` aur `HIGH` tumhare actual Prisma enums ke valid values hone chahiye.

### Example 3: Sorting aur pagination

```graphql
query {
  searchProjectTasks(
    organizationId: "YOUR_ORGANIZATION_UUID"
    projectId: "YOUR_PROJECT_UUID"
    filters: {
      sortBy: UPDATED_AT
      sortDirection: ASC
      limit: 10
      offset: 10
    }
  ) {
    tasks {
      id
      title
      updatedAt
    }
    totalCount
    hasNextPage
    limit
    offset
  }
}
```

Is example mein second page ke records retrieve karne ki koshish hogi, har page mein maximum 10 records ke saath.

---

## 8. Testing aur verification

Feature ke baad ye checks execute hue:

| Check | Result |
|---|---|
| Task service tests | 79 passed |
| TypeScript check | Passed |
| Complete test suite | 20 test files, 398 tests passed |
| Production build | Successful |
| Git commit | Successful |
| Git push to `origin/main` | Successful |

Latest commit:

```text
0b40e24 feat: add task search filtering and pagination
```

### Service tests mein kya cover hua?

- Default pagination aur sorting.
- Status, priority aur assignee filters.
- Search string trimming.
- Custom sorting aur pagination.
- `hasNextPage` calculation.
- Organization membership failure.
- Employee project-membership failure.
- Invalid limits.
- Invalid offsets.
- Invalid sorting field.
- Invalid sorting direction.
- Manager ke liye project-member lookup ki requirement na hona.

### Ek minor cleanup

Commit se pehle `git diff --check` ne `src/tasks/tasks.service.spec.ts:687` par trailing whitespace report kiya tha.

Ye functionality ka failure nahi hai. Lekin future mein file clean karte waqt ise remove karna chahiye.

---

# 9. Kya koi feature chhoot gaya?

Bhai, isko do parts mein dekhna chahiye.

## A. Is feature ke scope mein

| Capability | Status |
|---|---|
| Search by title | Implemented |
| Search by description | Implemented |
| Case-insensitive search | Implemented |
| Status filter | Implemented |
| Priority filter | Implemented |
| Assignee filter | Implemented |
| Creation-date sorting | Implemented |
| Update-date sorting | Implemented |
| Due-date sorting | Implemented |
| Priority sorting | Implemented |
| Ascending/descending direction | Implemented |
| Limit/offset pagination | Implemented |
| Total count | Implemented |
| Next-page indicator | Implemented |
| Organization membership check | Implemented |
| Employee project-membership check | Implemented |
| Invalid pagination/sort values ke service guards | Implemented |
| GraphQL response entity | Implemented |
| Automated service tests | Implemented |

Ye checklist available implementation aur tests ke basis par hai.

## B. Kuch cheezein jo abhi verify karni chahiye

Inhe automatically missing features nahi kahenge; pehle project requirements se match karna hoga.

### 1. Due-date sorting with null values

Agar tasks ka `dueDate` optional hai, to check karo ki null due dates ascending aur descending order mein kaise appear hote hain.

Prisma/database ka actual behaviour verify karna zaroori hai.

### 2. Priority sorting ka meaning

Enum-based priority sorting database ke stored enum order ke hisaab se ho sakti hai.

Agar expected behaviour `URGENT → HIGH → MEDIUM → LOW` hai, to confirm karo ki database enum ordering bhi wahi produce karti hai. Warna custom sorting logic ki zaroorat pad sakti hai.

### 3. Search performance

`contains`-based search chhote aur medium datasets ke liye practical ho sakti hai, lekin bade datasets mein query performance measure karni chahiye.

Neon PostgreSQL par large task tables ke liye query plans aur suitable indexes review karna future optimization ka part ho sakta hai.

### 4. Pagination consistency

Offset pagination implement hai. Lekin agar bahut saare records insert ya delete ho rahe hain, to page boundaries shift ho sakti hain.

Agar future mein very large task lists ya frequently changing data handle karna ho, to cursor pagination evaluate kar sakte hain. Abhi ise mandatory missing feature nahi maanenge.

### 5. GraphQL validation aur actual API behaviour

Service tests pass hue hain, lekin actual GraphQL request se ye verify karna useful hoga:

- Invalid `limit` bhejne par response kya aata hai?
- Invalid enum value par GraphQL validation kaise behave karti hai?
- Unauthenticated request reject hoti hai?
- Unauthorized user ko doosre organization/project ke tasks nahi milte?
- Empty search string aur whitespace-only search expected result dete hain?

Kuch cases existing tests mein cover ho sakte hain; actual API testing se end-to-end confidence badhega.

---

# 10. TaskForge ka overall feature audit

Yahan ek important limitation hai: **mere paas is conversation mein TaskForge ke poore current roadmap aur har completed day ki authoritative checklist nahi hai.** Isliye main honestly ye guarantee nahi de sakta ki poore project mein koi feature nahi chhoota.

Available project context se ye areas known hain:

| Area | Available status |
|---|---|
| NestJS ESM foundation | Completed |
| GraphQL code-first setup | Completed |
| Prisma + Neon PostgreSQL | Completed |
| Authentication foundation | Completed |
| Organization-based multi-tenancy | Implemented in foundation |
| Role-based access control | Implemented in foundation |
| Task management | Existing implementation |
| Task search/filter/sort/pagination | Just completed |
| Full frontend integration | Current information se status confirm nahi |
| Production deployment and monitoring | Current information se status confirm nahi |

Frontend, deployment aur monitoring ko missing declare nahi kar raha hoon—sirf itna keh raha hoon ki available context se unka final status establish nahi hota.

**Meri recommendation:** Abhi kisi naye feature ko bina audit ke add mat karna. Pehle roadmap aur repository ko match karke completed, incomplete aur unverified items alag karte hain. Isse unnecessary features build karne se bachoge.

---

## 11. Notes save karne se pehle Git cleanup

Trailing whitespace remove karne ke liye:

```bash
sed -i '687s/[[:space:]]*$//' src/tasks/tasks.service.spec.ts
```

Uske baad:

```bash
git diff --check
git status --short
```

Dhyan rahe, `src/tasks/tasks.resolver.ts.bak` backup file untracked thi. Use feature commit mein include nahi kiya gaya tha. Jab tak zaroorat hai, use stage mat karna.

Whitespace fix ko commit karna ho to:

```bash
git add src/tasks/tasks.service.spec.ts
git commit -m "style: remove trailing whitespace from task tests"
git push origin main
```

Ye cleanup optional hai; feature already commit aur push ho chuka hai.

---

### Bhai, ab overall audit kaise complete karenge?

Apne TaskForge roadmap ki day-wise notes file ya README yahan upload kar de. Uske saath, agar possible ho, repository ka current structure bhi share karna.

Main ek **complete feature audit** banaunga, jisme har feature ko in categories mein rakhenge:

- **Completed & tested**
- **Implemented, but end-to-end verification pending**
- **Partially implemented**
- **Not implemented**
- **Optional future enhancement**

Is tarah hum exact identify kar paayenge ki kaunse features chhoote hain, aur kaunse already complete hone ke bawajood dobara banane ki zaroorat nahi hai.


Haan bhai 😅 sahi kaha! TaskForge ke detailed notes mein **Interview Questions & Answers** bhi hone chahiye, taaki tu project implement karne ke saath interview mein uska design aur working explain bhi kar sake.

Is completed feature ke notes ke end mein ye section add kar dena.

# 🎯 12. Interview Questions & Answers

## Q1. What is pagination, and why do we need it?

**Answer:** Pagination divides a large dataset into smaller pages instead of returning all records in a single request.

For example, agar project mein 1,000 tasks hain aur frontend ko ek baar mein sirf 20 tasks chahiye, toh pagination database se limited records retrieve karne mein help karti hai.

TaskForge mein hum **limit-offset pagination** use kar rahe hain.

- `limit`: Maximum records to return.
- `offset`: Number of records to skip.

---

## Q2. What is the difference between limit and offset?

**Answer:**

Suppose database mein 100 tasks hain.

```text
limit  = 10
offset = 0
```

First 10 records retrieve honge.

```text
limit  = 10
offset = 10
```

Next 10 records retrieve honge.

TaskForge mein Prisma ke `take` aur `skip` options use hote hain:

```ts
take: limit,
skip: offset,
```

`take` limit ke equivalent hai, aur `skip` offset ke equivalent hai.

## Q3. What is filtering, and how is it different from searching?

**Answer:**

**Filtering** predefined attributes ke basis par records select karta hai. **Searching** text ke andar matching content find karta hai.

TaskForge examples:

| Operation | Example |
|---|---|
| Status filter | Sirf `TODO` tasks |
| Priority filter | Sirf `HIGH` priority tasks |
| Assignee filter | Specific user ko assigned tasks |
| Text search | Title ya description mein `login` |

Hum filtering ke liye Prisma `where` conditions aur text search ke liye `contains` use karte hain.

## Q4. How does text search work in TaskForge?

**Answer:**

TaskForge search string ko trim karta hai aur title aur description dono mein case-insensitive partial matching karta hai.

Example:

```ts
OR: [
  {
    title: {
      contains: normalizedSearch,
      mode: 'insensitive',
    },
  },
  {
    description: {
      contains: normalizedSearch,
      mode: 'insensitive',
    },
  },
],
```

`OR` ka matlab hai ki title **ya** description mein match milne par task result mein aa sakta hai.

`mode: 'insensitive'` case differences ko ignore karne ke liye use hota hai.

## Q5. What is sorting? Which sorting options does TaskForge support?

**Answer:**

Sorting records ko kisi field ke order mein arrange karti hai.

TaskForge supports:

- `createdAt`
- `updatedAt`
- `dueDate`
- `priority`

Direction `ASC` ya `DESC` ho sakti hai.

For example, `createdAt DESC` newest-created tasks ko pehle return karta hai.

## Q6. Why do we use enums for sorting fields and directions?

**Answer:**

Enums supported values ko restrict karte hain. Isse clients arbitrary sorting fields ya unsupported directions request nahi kar sakte.

TaskForge mein `TaskSortField` aur `SortDirection` enums use hote hain.

Ye input validation aur API consistency mein help karta hai.

## Q7. Why do we need `totalCount`?

**Answer:**

`tasks` array sirf current page ke records return karta hai, jabki `totalCount` filters apply hone ke baad matching records ki total number batata hai.

Example:

```json
{
  "totalCount": 53,
  "limit": 20,
  "offset": 0
}
```

Iska matlab 53 tasks match karte hain, lekin current request maximum 20 return karegi.

Frontend `totalCount` se pagination controls aur result summaries bana sakta hai.

## Q8. How does `hasNextPage` work?

**Answer:**

TaskForge mein:

```ts
offset + tasks.length < totalCount
```

Agar current page ke end ke baad bhi matching records bachte hain, `hasNextPage` true hota hai.

Agar current page last page hai, toh false hota hai.

Dhyan rahe, ye calculation current query ke results aur count par based hai.

## Q9. Why do we use `Promise.all()` in the service?

**Answer:**

TaskForge ko do results chahiye:

1. Current page ke tasks.
2. Matching tasks ka total count.

`Promise.all()` dono database operations ko concurrently execute karta hai.

```ts
const [tasks, totalCount] = await Promise.all([
  this.prisma.task.findMany({
    where,
    orderBy,
    take: limit,
    skip: offset,
  }),
  this.prisma.task.count({ where }),
]);
```

Isse operations sequentially execute karne ki zaroorat nahi hoti. Lekin `Promise.all()` transaction-level consistency guarantee nahi karta.

## Q10. Why do both queries use the same `where` condition?

**Answer:**

Taaki returned tasks aur `totalCount` same filtering criteria ko represent karein.

Agar `findMany` mein status filter apply ho lekin `count` mein na ho, toh total count actual matching tasks se different ho sakta hai.

TaskForge mein dono queries same `where` object use karti hain.

## Q11. Why is authorization checked in the service layer?

**Answer:**

Resolver client se GraphQL input receive karta hai, lekin service business logic aur access-control checks execute karti hai.

TaskForge mein service:

1. Organization membership verify karti hai.
2. Project ko requested organization ke context mein validate karti hai.
3. Employee ke liye project membership verify karti hai.

Isse unauthorized users ko project tasks access karne se rokne mein help milti hai.

**Interview point:** Authentication user ki identity verify karti hai; authorization decide karti hai ki authenticated user ko requested resource access karne ki permission hai ya nahi.

## Q12. Why must tasks be scoped by both `organizationId` and `projectId`?

**Answer:**

TaskForge multi-tenant application hai. Different organizations ke data ko isolate rakhna important hai.

Query mein dono conditions use hoti hain:

```ts
const where = {
  organizationId,
  projectId,
};
```

Iske saath applicable filters add hote hain.

Ye query-level scoping hai; service ke membership aur project-validation checks iske saath milkar access control implement karte hain.

## Q13. What is multi-tenancy?

**Answer:**

Multi-tenancy ek application architecture hai jahan multiple organizations ya customers same application infrastructure use karte hain, lekin unka data logically separate rehta hai.

TaskForge mein organizations aur organization memberships isi architecture ka part hain.

Interview mein explain karna ki sirf `organizationId` parameter receive karna sufficient security nahi hai. Server-side authorization aur properly scoped database queries bhi zaroori hain.

## Q14. Why do we validate `limit` and `offset` in the service if the DTO already validates them?

**Answer:**

DTO validation normal API request validation ka part hai. Service validation additional defensive checks provide karti hai.

TaskForge mein:

- `limit` integer hona chahiye aur 1–100 ke beech hona chahiye.
- `offset` non-negative integer hona chahiye.
- Sort field aur direction supported values hone chahiye.

Ye checks invalid parameters ko database query execute hone se pehle reject karne mein help karte hain.

## Q15. What happens if the client sends a limit of 10,000?

**Answer:**

TaskForge service maximum limit 100 enforce karti hai. Isliye `limit = 10000` par `BadRequestException` throw hoti hai.

Large limits ko restrict karne se clients ke accidental ya excessive requests ke against resource usage control karne mein help milti hai.

## Q16. Why do we use `PaginatedTasks` instead of returning only `Task[]`?

**Answer:**

A plain array sirf tasks return karta hai. `PaginatedTasks` tasks ke saath metadata bhi provide karta hai:

- `totalCount`
- `hasNextPage`
- `limit`
- `offset`

Isse frontend ko pagination manage karne ke liye separate request ya additional calculations ki kam zaroorat padti hai.

## Q17. What is the difference between offset and cursor pagination?

**Answer:**

| Offset pagination | Cursor pagination |
|---|---|
| `limit` aur `offset` use karti hai | Cursor ke baad records retrieve karti hai |
| Page number implement karna straightforward hai | Next/previous traversal ke liye useful hai |
| Large offsets expensive ho sakte hain | Suitable indexing ke saath large datasets par efficient ho sakti hai |
| Concurrent inserts/deletes se page boundaries shift ho sakti hain | Cursor-based traversal shifting ko reduce kar sakti hai |

TaskForge ka current implementation offset pagination use karta hai. Cursor pagination future optimization ho sakti hai, lekin use abhi implemented feature nahi kehna chahiye.

## Q18. Why is deterministic sorting important?

**Answer:**

Agar multiple tasks ka `createdAt` same ho, toh sirf `createdAt` ke basis par sorting unke relative order ko fully determine nahi karti.

Secondary sort key, jaise `id ASC`, tie-breaker provide kar sakti hai.

TaskForge implementation mein primary sorting ke saath ID-based tie-breaker add kiya gaya hai. Isse equal primary-sort values ke liye ordering more predictable hoti hai.

## Q19. What are the limitations of `contains`-based search?

**Answer:**

`contains` partial-text matching provide karta hai, lekin large tables mein query performance dataset size, indexing aur database query plan par depend karti hai.

Agar TaskForge ka task dataset bahut bada ho jaye, toh PostgreSQL indexing aur full-text search evaluate karna useful ho sakta hai.

Ye future optimization hai, current feature ka failure nahi.

## Q20. How did you test this feature?

**Answer:**

Feature ke service tests mein default pagination, filters, text search, sorting, next-page calculation, authorization failures aur invalid input cases cover kiye gaye.

Verification ke waqt:

- TypeScript check passed.
- Complete test suite mein 398 tests pass hue.
- Production build successful hua.

Actual GraphQL API aur live database ke saath end-to-end verification ko alag se confirm karna chahiye agar woh abhi run nahi hua hai.

---

# 13. Interview ke liye short project explanation

Agar interviewer pooche, **“Explain the task search and pagination feature you implemented,”** toh tu ye answer de sakta hai:

> “In TaskForge, I implemented a GraphQL-based task search and pagination feature using NestJS, Prisma, and PostgreSQL. It supports filtering tasks by status, priority, and assignee, along with case-insensitive text search across task titles and descriptions. Users can sort tasks by creation date, update date, due date, or priority, and retrieve paginated results using limit and offset. The response includes total count and next-page metadata. I also added input validation, organization and project access checks, and service-level tests covering filtering, pagination, sorting, and authorization scenarios.”

**Bhai, aage se har TaskForge ke detailed day notes mein ye sections bhi include karenge:**

1. Objective and concepts
2. Files changed and implementation details
3. Architecture and request flow
4. Important code explanations
5. Testing and edge cases
6. Git commands and commit
7. Possible missing features
8. **Interview questions with answers**
9. **A short interview-ready explanation of the feature**

Isse tere notes implementation reference aur interview preparation—dono ke kaam aayenge.