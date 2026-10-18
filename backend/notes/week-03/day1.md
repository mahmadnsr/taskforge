Bhai, **TaskForge Phase 3 — Day 1 complete ho gaya hai.** ✅

Day 1 mein humne Task Management feature ki database foundation banayi: task statuses, priorities, relationships, indexes aur Prisma migration. Neeche complete notes hain, code ke saath. Inhe apni documentation ya README mein save kar sakta hai.

# 📘 TaskForge — Phase 3, Day 1
## Task Management: Database Schema Design

### 🎯 1. Day 1 ka goal

TaskForge mein Project Management ke baad ab Task Management implement karna hai.

Ek project ke andar multiple tasks honge. Har task ke paas:
- Title aur optional description.
- Status aur priority.
- Task create karne wale user ki information.
- Optional assignee.
- Optional due date.
- Creation aur update timestamps.

Humne in requirements ke liye Prisma schema update kiya aur database migration apply ki.

---

## 2. Database relationships samjho

Humare existing database mein `User`, `Organization` aur `Project` models pehle se the.

Task Management add karne ke baad relationship kuch aisa hai:

```text
Organization
     |
     | 1:N
     |
   Project
     |
     | 1:N
     |
    Task
     |
     |----------------------|
     |                      |
     v                      v
 Created By              Assignee
   (User)                  (User)
```

**Iska matlab:**

- Ek organization mein multiple projects ho sakte hain.
- Ek project mein multiple tasks ho sakte hain.
- Ek user multiple tasks create kar sakta hai.
- Ek user multiple tasks ko assign kiye jaane ke liye eligible ho sakta hai.
- Task ka assignee optional hai.
- Task apne project se linked rehta hai.

**Important:** Schema mein assignee ko `User` se link kiya gaya hai. Lekin assignee usi organization ya project ka member hai ya nahi, ye service layer mein validate karna hoga.

---

## 3. Task status enum

Humne task ke lifecycle ke liye `TaskStatus` enum banaya.

```prisma
enum TaskStatus {
  TODO
  IN_PROGRESS
  IN_REVIEW
  DONE
}
```

### Har status ka meaning

| Status | Meaning |
|---|---|
| `TODO` | Task abhi start nahi hua |
| `IN_PROGRESS` | Task par kaam chal raha hai |
| `IN_REVIEW` | Task review ke liye ready hai |
| `DONE` | Task complete ho gaya |

Task create hote waqt default status `TODO` rahega.

**Enum use kyun kiya?**

Agar status ko simple `String` rakhte, toh koi `"PENDING"`, `"working"` ya `"completed"` jaisi inconsistent values store kar sakta tha.

Enum allowed values ko restrict karta hai.

---

## 4. Task priority enum

Task ki importance represent karne ke liye:

```prisma
enum TaskPriority {
  LOW
  MEDIUM
  HIGH
  URGENT
}
```

| Priority | Meaning |
|---|---|
| `LOW` | Kam priority |
| `MEDIUM` | Normal priority |
| `HIGH` | High importance |
| `URGENT` | Jaldi complete karna zaroori |

Task create karte waqt default priority `MEDIUM` hogi.

### Status aur priority mein difference

Dono alag cheezein represent karte hain.

Example:

```text
Task: Fix login bug

Status: IN_PROGRESS
Priority: URGENT
```

Iska matlab login bug par kaam chal raha hai aur uski priority urgent hai.

---

## 5. User model mein relationships add kiye

Humare existing `User` model mein do reverse relations add kiye:

```prisma
createdTasks  Task[] @relation("TasksCreated")
assignedTasks Task[] @relation("TasksAssigned")
```

### `createdTasks`

Ye batata hai ki user ne kaun-kaun se tasks create kiye hain.

Example:

```text
User: Ahmad

createdTasks:
  - Fix login bug
  - Add pagination
  - Improve API validation
```

### `assignedTasks`

Ye batata hai ki user ko kaun-kaun se tasks assign hue hain.

```text
User: Ahmad

assignedTasks:
  - Fix login bug
  - Add task filtering
```

### Relation names kyun diye?

Dono relations `User` aur `Task` ke beech hain.

Prisma ko distinguish karna padta hai ki ek relation task creator ko represent karta hai aur doosra assignee ko.

Isliye:

```prisma
@relation("TasksCreated")
@relation("TasksAssigned")
```

use kiya.

---

## 6. Project model mein relation add kiya

Existing `Project` model mein ye relation add kiya:

```prisma
tasks Task[]
```

Iska matlab ek project ke andar multiple tasks ho sakte hain.

Example:

```text
Project: TaskForge Backend

Tasks:
  1. Implement task creation
  2. Add task details query
  3. Implement task assignment
  4. Add task filtering
```

Yahan `Task[]` one-to-many relationship ke reverse side ko represent karta hai.

---

# 7. Complete Task model

Day 1 ka main implementation ye `Task` model hai.

```prisma
model Task {
  id          String       @id @default(uuid())
  projectId   String
  title       String
  description String?
  status      TaskStatus   @default(TODO)
  priority    TaskPriority @default(MEDIUM)
  createdById String
  assigneeId  String?
  dueDate     DateTime?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdBy User    @relation("TasksCreated", fields: [createdById], references: [id], onDelete: Restrict)
  assignee  User?   @relation("TasksAssigned", fields: [assigneeId], references: [id], onDelete: SetNull)

  @@index([projectId, status])
  @@index([projectId, priority])
  @@index([createdById])
  @@index([assigneeId])
  @@index([dueDate])
}
```

Chalo ise detail mein samajhte hain.

### A. Primary key

```prisma
id String @id @default(uuid())
```

- `id` task ka unique identifier hai.
- `@id` primary key define karta hai.
- `@default(uuid())` automatically UUID generate karta hai.

Example:

```text
id = "a1b2c3d4-..."
```

Har task ki apni unique ID hogi.

### B. Project relationship

```prisma
projectId String
```

Ye store karta hai ki task kis project ka hai.

Actual foreign-key relation:

```prisma
project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
```

Iska matlab:
- `fields: [projectId]` batata hai ki foreign key kaunsi field hai.
- `references: [id]` batata hai ki `Project` ki kaunsi field reference hogi.
- `onDelete: Cascade` ka matlab project delete hone par uske tasks bhi delete ho jayenge.

**Design implication:** Project deletion cascading hai, isliye application mein project deletion ko carefully authorize karna hoga.

### C. Task title aur description

```prisma
title       String
description String?
```

- `title` required hai.
- `description` optional hai.
- `String?` ka `?` matlab field `null` ho sakti hai.

Example:

```text
title: "Implement authentication"

description: "Add refresh token rotation"
```

Agar description nahi di gayi, toh woh `null` ho sakti hai.

Note: Title ki non-empty validation aur maximum length jaise rules baad mein input DTOs aur service layer mein enforce karne honge.

### D. Status aur priority

```prisma
status   TaskStatus   @default(TODO)
priority TaskPriority @default(MEDIUM)
```

Agar task create karte waqt status aur priority provide nahi kiye gaye, toh database defaults apply honge.

```text
status   = TODO
priority = MEDIUM
```

### E. Creator relationship

```prisma
createdById String
```

Ye task create karne wale user ki ID store karta hai.

```prisma
createdBy User @relation("TasksCreated", fields: [createdById], references: [id], onDelete: Restrict)
```

`createdById` foreign key hai jo `User.id` ko reference karti hai.

`onDelete: Restrict` ka matlab task creator ko delete karna database level par tab tak allow nahi hoga jab tak dependent tasks ka relationship resolve na ho.

Isse creator relationship accidentally delete hone se bachta hai.

### F. Assignee relationship

```prisma
assigneeId String?
```

Assignee optional hai.

Task create ho sakta hai bina kisi user ko assign kiye.

```prisma
assignee User? @relation("TasksAssigned", fields: [assigneeId], references: [id], onDelete: SetNull)
```

Yahan:
- `User?` optional relation hai.
- `fields: [assigneeId]` foreign key define karta hai.
- `onDelete: SetNull` ka matlab assignee user delete hone par task ko delete nahi kiya jayega; uska `assigneeId` null ho jayega.

Example:

```text
Task: Add task comments
Assignee: null
```

Baad mein task kisi user ko assign kiya ja sakta hai.

### G. Due date

```prisma
dueDate DateTime?
```

Task ki deadline store karta hai.

Optional hone ke kaaran har task ki deadline hona zaroori nahi.

Example:

```text
dueDate = 2026-11-01T18:30:00.000Z
```

Timezone handling aur past-date restrictions application layer mein define ki ja sakti hain.

### H. Timestamps

```prisma
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
```

`createdAt` task create hone ka timestamp hai.

`@default(now())` creation ke samay current timestamp set karta hai.

`updatedAt` task last update hone ka timestamp hai. Prisma update operations ke through ise automatically maintain karta hai.

Example:

```text
createdAt: 2026-10-18 10:00
updatedAt: 2026-10-18 10:00
```

Agar task baad mein update hua:

```text
createdAt: 2026-10-18 10:00
updatedAt: 2026-10-19 12:30
```

`createdAt` unchanged rahega, jabki `updatedAt` update ho jayega.

---

# 8. Database indexes

Task model mein ye indexes add kiye:

```prisma
@@index([projectId, status])
@@index([projectId, priority])
@@index([createdById])
@@index([assigneeId])
@@index([dueDate])
```

Indexes frequently used queries ko efficient banane mein help karte hain.

### Index 1: Project aur status

```prisma
@@index([projectId, status])
```

Example query:

> Is project ke saare `IN_PROGRESS` tasks nikalo.

Database ko `projectId` aur `status` ke combination par filtering mein help milti hai.

### Index 2: Project aur priority

```prisma
@@index([projectId, priority])
```

Example:

> Is project ke urgent tasks find karo.

### Index 3: Creator

```prisma
@@index([createdById])
```

Example:

> Kisi particular user ne kaun se tasks create kiye?

### Index 4: Assignee

```prisma
@@index([assigneeId])
```

Example:

> Ahmad ko kaun se tasks assign hue hain?

### Index 5: Due date

```prisma
@@index([dueDate])
```

Example:

> Kaun se tasks ki deadline aa rahi hai?

**Important:** Index har query ko automatically fast nahi karta. Query patterns aur database query plans ke hisaab se indexes ka benefit evaluate kiya jaata hai. Har extra index writes aur storage par bhi cost add karta hai.

---

# 9. Schema validation aur migration

Schema likhne ke baad humne Prisma commands run ki.

### Step 1: Schema formatting

```bash
pnpm exec prisma format
```

Purpose:
- Schema ko consistent format mein arrange karna.
- Formatting errors ko identify karne mein help karna.

### Step 2: Schema validation

```bash
pnpm exec prisma validate
```

Successful output:

```text
Prisma config detected, skipping environment variable loading.
The schema at prisma/schema.prisma is valid 🚀
```

Iska matlab Prisma schema syntax aur relation definitions validate ho gayi.

### Step 3: Migration

Humne Task Management ke liye migration create/apply ki:

```text
20261018042347_add_task_management
```

Migration SQL yahan hai:

```text
prisma/migrations/20261018042347_add_task_management/migration.sql
```

Migration ka kaam Prisma schema ke changes ko database structure mein apply karna hai.

Is migration mein task-related database structures create hue, including enums, table, foreign keys aur indexes.

### Step 4: Migration status verify karna

```bash
pnpm prisma migrate status
```

Successful output:

```text
6 migrations found in prisma/migrations
Database schema is up to date!
```

Iska matlab local migration history ke according database mein koi pending migration nahi hai.

### Step 5: Prisma Client

Migration process ke dauraan Prisma Client generate hua:

```text
Prisma Client v6.19.3
```

Prisma Client application code mein database models ko access karne ke liye use hota hai.

Example:

```typescript
const tasks = await this.prisma.task.findMany();
```

Ye sirf illustrative example hai; actual Task service implementation Day 2 mein hogi.

---

# 10. Day 1 mein kya complete hua?

| Task | Status |
|---|---|
| Task status enum | ✅ Complete |
| Task priority enum | ✅ Complete |
| User-task relations | ✅ Complete |
| Project-task relation | ✅ Complete |
| Task model | ✅ Complete |
| Foreign keys aur delete behavior | ✅ Complete |
| Query-oriented indexes | ✅ Complete |
| Prisma schema formatting | ✅ Complete |
| Prisma schema validation | ✅ Passed |
| Task migration | ✅ Applied |
| Database migration status | ✅ Up to date |

---

# 11. Abhi kya implement nahi hua?

Day 1 **database foundation** ka kaam tha. Abhi ye features implement nahi hue:

- GraphQL `CreateTask` mutation.
- Task detail aur list queries.
- Input validation.
- Task create karne ke liye authorization checks.
- Assignee project membership validation.
- Task update aur archive.
- Task assignment.
- Status workflow.
- Filtering, sorting aur pagination.
- Comments aur activity history.

Ye agle days ke tasks hain.

## Security note

Sirf `projectId` ya `assigneeId` valid hone se authorization complete nahi hota.

Task create karte waqt service layer ko verify karna hoga ki:
1. Current user authenticated hai.
2. User ko specified project access karne ki permission hai.
3. Project specified organization ka hi hai.
4. Assignee ko assign karne ki permission aur project membership valid hai.
5. Creator ID trusted authenticated context se aati hai, client ke arbitrary input se nahi.

Ye checks TaskForge ke multi-tenant architecture ke liye important hain.

---

# 12. Day 1 ka final outcome

Bhai, ab TaskForge ke database mein **Task Management ke liye schema foundation ready hai**. Humne task ki fields, status, priority, creator, optional assignee, due date, timestamps aur database indexes define kar diye hain.

Migration bhi apply ho gayi aur `prisma validate` successful raha.

**Next: Phase 3 — Day 2: Create Task + Task Queries**

Day 2 mein hum existing NestJS + GraphQL architecture ke andar:
1. Task GraphQL inputs aur object types.
2. Task creation mutation.
3. Task detail query.
4. Project ke tasks ki query.
5. Validation aur authorization checks.
6. Unit tests.

implement karenge.

Day 2 start karne se pehle existing project module/resolver/service ka structure dekhna hoga, taaki naya code tumhare current TaskForge architecture ke saath fit ho aur existing features duplicate na hon.



Bhai, ek important baat: **Day 1 ka database-schema work complete hai, lekin main 100% guarantee nahi dunga ki poora Day 1 bina kisi pending issue ke complete hai**, kyunki abhi humne sirf schema validation aur migration status verify kiya hai. Task-specific integration tests aur schema ke actual requirements ka final review alag se nahi kiya.

Humne jo verify kiya tha:
- ✅ `prisma format` successful.
- ✅ `prisma validate` successful.
- ✅ Task Management migration apply ho gayi.
- ✅ `prisma migrate status` mein database up to date tha.

Day 1 ka scope database design tha, isliye ye uski completion ke liye strong evidence hai. Neeche notes mein interview questions bhi add kar raha hoon.

# 📘 TaskForge — Phase 3, Day 1 Notes
## Part 2: Interview Questions & Answers

### Q1. What is Prisma ORM?

**Answer:** Prisma is a TypeScript-friendly ORM that helps applications interact with databases using a generated, type-safe client.

TaskForge mein hum Prisma Client ke through PostgreSQL database access karte hain.

```typescript
const tasks = await this.prisma.task.findMany();
```

### Q2. What is the purpose of `schema.prisma`?

**Answer:** `schema.prisma` mein hum database models, fields, relations, enums aur indexes define karte hain.

Example:

```prisma
model Task {
  id    String @id @default(uuid())
  title String
}
```

Prisma schema database structure aur generated Prisma Client ke types ko define karne mein help karta hai.

### Q3. What is a primary key?

**Answer:** Primary key kisi table ke har record ko uniquely identify karti hai.

```prisma
id String @id @default(uuid())
```

Yahan `id` primary key hai aur `uuid()` default unique identifier generate karta hai.

### Q4. What is a foreign key?

**Answer:** Foreign key ek table ke record ko doosre table ke record se relate karti hai aur referential integrity maintain karne mein help karti hai.

TaskForge mein:

```prisma
project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
```

Yahan `projectId` task ko project se connect karta hai.

### Q5. What is a one-to-many relationship?

**Answer:** One-to-many relationship mein ek record ke saath doosre table ke multiple records associated ho sakte hain.

Example: Ek project ke andar multiple tasks ho sakte hain.

```prisma
// Project model
tasks Task[]

// Task model
projectId String
project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
```

`Task[]` multiple related tasks ko represent karta hai.

### Q6. Why did we use enums for task status and priority?

**Answer:** Enums allowed values ko restrict karte hain aur inconsistent data store hone ka risk kam karte hain.

```prisma
enum TaskStatus {
  TODO
  IN_PROGRESS
  IN_REVIEW
  DONE
}
```

```prisma
enum TaskPriority {
  LOW
  MEDIUM
  HIGH
  URGENT
}
```

Isse status aur priority ke liye predefined values milti hain.

### Q7. What is the difference between `String` and `String?` in Prisma?

**Answer:**

```prisma
title       String
description String?
```

- `String`: required field.
- `String?`: optional field; database mein `NULL` ho sakti hai.

Isliye task title required hai, lekin description optional hai.

### Q8. What is the difference between `@default(now())` and `@updatedAt`?

**Answer:**

```prisma
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
```

- `@default(now())`: record create hone par default timestamp set karta hai.
- `@updatedAt`: Prisma update operations ke through record update hone par timestamp maintain karta hai.

### Q9. What is a database index, and why do we need it?

**Answer:** Index database ko matching records efficiently locate karne mein help karta hai, especially frequently queried fields par.

Example:

```prisma
@@index([projectId, status])
```

Ye project aur status ke combination par queries ke liye useful ho sakta hai.

**Trade-off:** Indexes additional storage lete hain aur insert/update operations ki cost badha sakte hain. Isliye indexes query patterns ke according select karne chahiye.

### Q10. What is a composite index?

**Answer:** Composite index multiple columns par banaya gaya index hota hai.

```prisma
@@index([projectId, status])
```

Ye index `projectId` aur `status` dono ko use karne wali queries mein help kar sakta hai.

Column order important hota hai. Ye index generally `projectId` se filtering mein bhi useful ho sakta hai, lekin sirf `status` wali query ke liye equally useful hona guaranteed nahi hai.

### Q11. What is the difference between `onDelete: Cascade`, `Restrict`, and `SetNull`?

**Answer:**

| Option | Behavior |
|---|---|
| `Cascade` | Parent delete hone par related records bhi delete ho sakte hain |
| `Restrict` | Dependent records hone par parent deletion block hota hai |
| `SetNull` | Parent delete hone par foreign key `NULL` ho jaati hai, agar nullable ho |

TaskForge mein:

```prisma
project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
createdBy User    @relation("TasksCreated", fields: [createdById], references: [id], onDelete: Restrict)
assignee  User?   @relation("TasksAssigned", fields: [assigneeId], references: [id], onDelete: SetNull)
```

Isliye project deletion, creator deletion aur assignee deletion ke behaviors alag hain.

### Q12. Why is `assigneeId` optional?

**Answer:** Har task ko create hote hi assign karna zaroori nahi. Task pehle create ho sakta hai aur baad mein kisi eligible team member ko assign kiya ja sakta hai.

```prisma
assigneeId String?
```

### Q13. What is a database migration?

**Answer:** Migration database structure mein controlled changes apply karne ka versioned mechanism hai.

Humne Task Management ke liye migration banayi:

```text
20261018042347_add_task_management
```

Migration SQL yahan hai:

```text
prisma/migrations/20261018042347_add_task_management/migration.sql
```

Migration existing database mein schema changes apply karne mein help karti hai.

### Q14. What is the difference between `prisma validate` and `prisma migrate status`?

**Answer:**

```bash
pnpm exec prisma validate
```

Prisma schema ki validity check karta hai.

```bash
pnpm prisma migrate status
```

Migration history aur database ke migration status ko check karta hai.

Schema valid hona aur database migrations up to date hona do alag checks hain.

### Q15. Does defining a foreign key guarantee authorization?

**Answer:** No.

Foreign key referential integrity enforce karti hai, lekin ye verify nahi karti ki current user ko us project ka access hai.

Example: `assigneeId` valid user ko reference kar sakta hai, lekin woh user us organization ya project ka member hai ya nahi, iske liye service-layer authorization checks chahiye.

**TaskForge mein ye Day 2 ke implementation ke liye important requirement hai.**

### Q16. Why do we need both `createdById` and `assigneeId`?

**Answer:** Dono different responsibilities represent karte hain.

- `createdById`: task kis user ne create kiya.
- `assigneeId`: task kis user ko assign kiya gaya.

Ek task create karne wala user aur us par kaam karne wala user alag ho sakte hain.

### Q17. Why should we avoid storing status as an arbitrary string?

**Answer:** Arbitrary strings inconsistent values create kar sakti hain, jaise `in-progress`, `IN_PROGRESS` aur `working`.

Enum predefined values provide karta hai, jisse invalid status values ka risk kam hota hai.

### Q18. What is Prisma Client?

**Answer:** Prisma Client generated, type-safe database client hai. Iska use application code mein database operations perform karne ke liye hota hai.

Example:

```typescript
const task = await this.prisma.task.findUnique({
  where: { id: taskId },
});
```

Ye example sirf Prisma Client usage dikhata hai; actual resolver aur service implementation hum Day 2 mein banayenge.

---

# ✅ Final Day 1 Completion Checklist

Bhai, Day 1 ko properly close karne ke liye ye checklist use kar:

| Check | Status |
|---|---|
| Task requirements ke according schema define kiya | Complete, based on our planned scope |
| Enums aur relations add kiye | Complete |
| Indexes define kiye | Complete |
| Prisma schema format kiya | Verified |
| Prisma schema validate kiya | Passed |
| Migration apply ki | Applied |
| Migration status check kiya | Database up to date |
| Existing project functionality ke saath integration test | Abhi separately verify nahi kiya |
| Task-specific automated tests | Day 1 par nahi banaye |

### Mera final verdict

**Haan bhai, Day 1 ka planned database-schema implementation complete hai.** Lekin integration tests aur task-specific automated tests ke bina main ye claim nahi karunga ki poora Task Management feature tested aur production-ready hai.

Abhi Day 2 shuru karne se pehle koi nayi functionality add karna zaroori nahi hai. Hum existing schema aur migration ko verified baseline maan kar aage badh sakte hain, aur Day 2 mein authorization aur testing ko saath lekar chalenge.