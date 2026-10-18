

# Part 2 — Week 3, Day 3: Detailed Notes

# 📘 TaskForge — Archived Project Read-Only Policy

## 1. Day 3 ka objective

TaskForge ek multi-tenant task management application hai.

Ismein ek organization ke andar multiple projects aur tasks ho sakte hain.

Jab kisi project ko archive kar diya jaata hai, to us project ka existing data accessible rehna chahiye, lekin usmein further modifications allowed nahi honi chahiye.

Is behaviour ko **read-only archive policy** kehte hain.

### Expected behaviour

| Operation | Active project | Archived project |
|---|---|---|
| Project read | Allowed | Allowed |
| Existing tasks read | Allowed | Allowed |
| Tasks list karna | Allowed | Allowed |
| Naya task create karna | Allowed, subject to permissions | Rejected |
| Existing task update karna | Allowed, subject to permissions | Rejected |
| Task status change karna | Allowed, subject to permissions | Rejected |

Yahan permissions ka matlab hai ki normal authorization rules bhi apply honge. Active project hone ka matlab ye nahi ki har user har operation kar sakta hai.

**Core principle: Archive karna aur delete karna alag operations hain.**

Archive hone par data ko read kiya ja sakta hai, lekin project ko modify nahi kiya ja sakta.

---

## 2. Service layer mein archive policy

Humne task operations ko protect karne ke liye ek shared helper use kiya:

```ts
private async assertProjectActive(
  organizationId: string,
  projectId: string,
) {
  const project = await this.getProject(organizationId, projectId);

  if (project.status === 'ARCHIVED') {
    throw new BadRequestException(
      'Cannot modify tasks in an archived project',
    );
  }

  return project;
}
```

Chalo isko detail mein samajhte hain.

### A. `getProject()`

```ts
const project = await this.getProject(organizationId, projectId);
```

Ye requested project ko organization ke context mein retrieve karta hai.

Isse do important cheezein hoti hain:

1. Project ko organization scope ke andar resolve kiya jaata hai.
2. Agar project us organization ke andar exist nahi karta, to existing lookup logic ke according `NotFoundException` throw hota hai.

Multi-tenant applications mein organization scoping important hai, kyunki ek organization ka user doosri organization ke resources ko freely access nahi kar sakta.

### B. Project status check

```ts
if (project.status === 'ARCHIVED')
```

Agar status `ARCHIVED` hai, to write operation reject kar diya jaata hai.

### C. Exception

```ts
throw new BadRequestException(
  'Cannot modify tasks in an archived project',
);
```

Is exception ka purpose invalid operation ko stop karna hai.

Archived project ke tasks ko modify karne ki request accept nahi honi chahiye.

### D. Project return karna

```ts
return project;
```

Agar project active hai, to helper project object return kar deta hai.

Is tarah caller ko alag se project retrieve karne aur status check karne ki zaroorat nahi padti—jab use sirf validation ke liye active-project guard chahiye.

---

## 3. Shared helper kyun banaya?

Maan lo humne har method mein manually check likha hota:

```ts
if (project.status === 'ARCHIVED') {
  throw new BadRequestException(
    'Cannot modify tasks in an archived project',
  );
}
```

Agar ye check `create()`, `update()` aur `changeStatus()` mein alag-alag likha jaaye, to future mein policy change karte waqt multiple locations update karni padengi.

Agar ek method mein check bhool gaye, to archived project modify ho sakta hai.

Shared helper ke saath:

```ts
await this.assertProjectActive(organizationId, projectId);
```

Benefits:

- Duplicate code kam hota hai.
- Business rule ek jagah defined rehta hai.
- Error message consistent rehta hai.
- Unit testing simpler hoti hai.
- Future maintenance easier hoti hai.

**Interview terminology:** Code reuse, single source of truth, separation of concerns.

Dhyan rahe: helper apne aap mein security guarantee nahi hai. Guarantee tab milti hai jab har relevant write path is guard ko correctly invoke karta hai.

---

## 4. `create()` mein archive protection

Task create karte waqt project active hona zaroori hai.

Conceptual flow:

```text
Create task request
       |
       v
Check organization membership
       |
       v
Check project is active
       |
       +---- Archived ----> Reject request
       |
       v
Validate task input
       |
       v
Create task
```

Agar project archived hai, to task creation reject ho jaati hai.

Isse archived project mein naye tasks add nahi kiye ja sakte.

### Important interview point

Agar tumhare paas active project aur valid task input hai, to bhi authorization checks apply honge.

Business validation aur authorization alag responsibilities hain:

- **Authorization:** Kya user operation perform kar sakta hai?
- **Business rule:** Kya operation current resource state mein allowed hai?

Dono checks required ho sakte hain.

---

## 5. `update()` mein archive protection

Task update karte waqt application ko pehle task ko correct organization ke context mein locate karna chahiye.

Uske baad project status check hota hai.

Conceptual flow:

```text
Update task request
       |
       v
Find task within organization
       |
       v
Task exists?
       |
       +---- No ----> NotFoundException
       |
       v
Check parent project status
       |
       +---- Archived ----> Reject request
       |
       v
Validate update permissions and input
       |
       v
Update task
```

Tumhare implementation mein existing role policy bhi preserve ki gayi hai: `ADMIN` aur `MANAGER` task update kar sakte hain, subject to the rest of the service's checks.

### Task ke bajaye project status kyun check karte hain?

Kyunki archive status project ka property hai, task ka nahi.

Agar project archived hai, to uske saare tasks par read-only policy apply honi chahiye.

Isliye task se `projectId` retrieve karke parent project ka status check kiya jaata hai.

---

## 6. `changeStatus()` mein archive protection

Task status change karna bhi ek write operation hai.

Example:

```text
TODO → IN_PROGRESS
```

Ya:

```text
IN_PROGRESS → DONE
```

Agar project archived hai, to task status transition bhi reject honi chahiye.

Tumhare implementation mein archive guard ke saath existing status transition rules aur employee/project membership ya assignee-related checks bhi preserve kiye gaye hain.

### Important distinction

**Task status aur project status do alag concepts hain.**

Task status ke examples:

- `TODO`
- `IN_PROGRESS`
- `DONE`

Project status ke examples:

- `ACTIVE`
- `ARCHIVED`

Exact enum values tumhare Prisma schema ke according defined hoti hain.

Task ka `DONE` hona project ko archive nahi karta. Isi tarah project ka `ARCHIVED` hona uske har task ka status `DONE` nahi bana deta.

Archive policy sirf modification restrictions enforce karti hai.

---

## 7. Read operations ko block kyun nahi kiya?

Humne archive guard ko har operation mein blindly apply nahi kiya.

`get()` aur `listByProject()` mein archived projects ke tasks read karne ki permission preserve ki gayi hai.

Ye intentional design hai.

Suppose kisi team ne project complete karne ke baad archive kar diya. Kuch mahine baad unhe us project ka task history check karna ho.

Agar archive hone ke baad saara access block kar diya jaaye, to historical information dekhna difficult ho jaayega.

Isliye humne operations ko logically separate kiya:

```text
READ OPERATIONS
    |
    +---- Active project ----> Allow, subject to access rules
    |
    +---- Archived project --> Allow, subject to access rules


WRITE OPERATIONS
    |
    +---- Active project ----> Continue normal validations
    |
    +---- Archived project --> Reject
```

Is approach ko **read-only archived resource** design keh sakte hain.

Dhyan rahe: archived resource ko read karne ki permission ka matlab public access nahi hai. Existing authentication, authorization aur tenant-isolation rules phir bhi apply hone chahiye.

---

## 8. Organization scoping aur multi-tenancy

TaskForge multi-tenant application hai.

Iska matlab multiple organizations same application aur database use kar sakti hain, lekin unka data logically isolated hona chahiye.

Isliye project lookup mein organization scope important hai.

Conceptually:

```ts
where: {
  id: projectId,
  organizationId,
}
```

Tumhare existing implementation mein project lookup composite key `id_organizationId` use karta hai.

### Iska benefit

Maan lo:

- Organization A mein Project X hai.
- Organization B ka user Project X ki ID jaanta hai.

Sirf ID jaanna sufficient nahi hona chahiye.

Resource ko correct organization ke context mein resolve karna zaroori hai.

**Interview terminology:** Tenant isolation, scoped queries, authorization boundary, composite unique key.

Ek aur important distinction: organization membership check aur resource lookup alag checks hain. Dono ka purpose different hai.

---

## 9. Error handling aur GraphQL

Archived project mein task modification attempt karne par service:

```ts
throw new BadRequestException(
  'Cannot modify tasks in an archived project',
);
```

throw karti hai.

Lekin TaskForge mein GraphQL error formatting bhi implemented hai.

Isliye internal NestJS exception aur client ko returned GraphQL error ko ek hi cheez nahi samajhna chahiye.

```text
Service exception
       |
       v
GraphQL error formatting
       |
       v
Client receives formatted error
```

Tumhare implementation mein archive error message ko public-message allowlist aur corresponding tests mein include kiya gaya tha.

Isse expected business error ka message client tak consistently pahunch sakta hai.

### Interview point

Error handling mein do concerns hote hain:

1. Expected business errors ko useful aur safe message ke saath return karna.
2. Unexpected internal errors ki sensitive details ko expose na karna.

Database internals, stack traces aur secrets ko clients ke saamne expose nahi karna chahiye.

---

# Part 3 — Testing Notes

## 10. Day 3 mein kaun-se tests add hue?

Humne archive policy verify karne ke liye paanch tests add kiye.

| Test | Expected behaviour |
|---|---|
| Create in archived project | Request rejected |
| Read task in archived project | Reading allowed |
| List tasks in archived project | Listing allowed |
| Update task in archived project | Request rejected |
| Change task status in archived project | Request rejected |

### Write test ka core idea

Archived project mock return karte hain:

```ts
prisma.project.findUnique.mockResolvedValue({
  id: PROJECT,
  organizationId: ORG,
  status: 'ARCHIVED',
});
```

Phir verify karte hain ki service expected error throw karti hai.

Saath hi, ensure karte hain ki relevant database write operation execute nahi hua.

For example, create operation ke liye:

```ts
expect(prisma.task.create).not.toHaveBeenCalled();
```

Aur update operation ke liye:

```ts
expect(prisma.task.update).not.toHaveBeenCalled();
```

Exact assertions test ke context ke according honge.

### Negative testing kyun important hai?

Sirf ye verify karna ki valid active project mein task create hota hai, sufficient nahi hai.

Humein ye bhi verify karna chahiye ki invalid state mein task create nahi hota.

Isko **negative testing** kehte hain.

### Read tests kyun important hain?

Agar hum sirf write rejection tests likhte, to galti se read methods mein bhi archive guard laga sakte the.

Isliye read tests ye verify karte hain ki policy unnecessarily restrictive nahi ho gayi.

**Testing ka goal sirf incorrect behaviour rokna nahi, intended behaviour preserve karna bhi hai.**

---

## 11. Test suite aur TypeScript verification

Tumne ye commands run kiye:

```bash
pnpm exec vitest run
```

Result:

```text
Test Files  20 passed (20)
Tests       367 passed (367)
```

Uske baad:

```bash
pnpm exec tsc --noEmit
```

Command bina errors ke complete hui.

### In dono checks mein difference

**Vitest**

- Automated tests execute karta hai.
- Expected behaviour verify karta hai.
- Regression detect karne mein help karta hai.

**TypeScript compiler**

- Type errors check karta hai.
- Type mismatches aur invalid references jaise issues identify kar sakta hai.
- `--noEmit` ke saath compiled output files generate nahi karta.

Ek important baat: tests aur type-check pass hone ka matlab ye nahi ki har possible production scenario automatically covered hai. Lekin ye changes ko verify karne ke liye useful checks hain.

### Warning ka meaning

Tumhe ye warning bhi mili:

```text
The plugin "vite-tsconfig-paths" is detected.
Vite now supports tsconfig paths resolution natively...
```

Ye informational configuration warning hai, test failure nahi.

GraphQL error-suppression warnings bhi test run ke dauran aaye, lekin test suite pass hui. Abhi in warnings ko fix karna Day 3 archive policy complete karne ki prerequisite nahi hai.

---

# Part 4 — Expected Interview Questions with Answers

Ye questions TaskForge ke implementation aur uske design decisions par based hain. Interviewer inmein se kuch questions follow-up ke saath pooch sakta hai.

## Q1. What is a read-only archive policy?

**Answer:**

A read-only archive policy allows users to retrieve archived resources while preventing further modifications.

In TaskForge, archived projects remain readable, but users cannot create tasks, update tasks, or change task statuses within those projects.

This preserves historical data while preventing unintended modifications.

---

## Q2. Why should archived projects remain readable?

**Answer:**

Archived projects may contain historical information that users need for auditing, reporting, or reference.

Blocking all access would make this information difficult to retrieve.

Therefore, read operations remain available subject to normal authorization rules, while write operations are restricted.

---

## Q3. Why did you create a separate `assertProjectActive()` helper?

**Answer:**

I created a shared helper to centralize the active-project validation rule.

Without it, the same status check would be duplicated across multiple write methods.

Centralizing the rule improves consistency, reduces duplication, and makes future maintenance easier.

It also makes the business rule explicit in the service implementation.

---

## Q4. Why do you check the parent project's status when updating a task?

**Answer:**

The archive status belongs to the project, not the individual task.

A task can exist within an archived project, so checking only the task's existence is insufficient.

After locating the task within the correct organization, I check its parent project's status and reject the modification if the project is archived.

---

## Q5. Why do you use `BadRequestException`?

**Answer:**

The application uses `BadRequestException` to represent this rejected operation because the requested modification violates the application's business rules.

The project exists, but its current state does not permit the requested operation.

The exception is subsequently processed by the GraphQL error-handling layer.

**Follow-up:** Could another HTTP status be used?

Depending on the API's error conventions, a team could consider `409 Conflict` to represent a state conflict. The important point is to choose a consistent error contract and ensure the GraphQL formatter handles it correctly.

For TaskForge, we preserve the currently implemented `BadRequestException` behaviour.

---

## Q6. What is the difference between authentication and authorization?

**Answer:**

Authentication verifies who the user is.

Authorization determines what that authenticated user is allowed to do.

For example, JWT validation may authenticate a user, while organization membership and role checks determine whether that user can update a task.

The archive policy adds another business-state restriction: even a user with the required role cannot modify a task in an archived project.

---

## Q7. What is multi-tenancy?

**Answer:**

Multi-tenancy is an architecture in which one application serves multiple organizations or tenants while keeping their resources logically isolated.

In TaskForge, organization-scoped queries help ensure that users access resources belonging to the correct organization.

For example, project lookup uses both the project ID and organization ID rather than relying on the project ID alone.

---

## Q8. Why is organization scoping important when retrieving a task?

**Answer:**

A resource ID alone should not establish that a user is authorized to access that resource.

Organization scoping helps prevent cross-tenant data access.

By retrieving the task within the relevant organization, the service ensures that the operation is performed against a resource in the correct tenant context.

This lookup must be combined with appropriate authentication and authorization checks.

---

## Q9. Why is a task's status different from a project's status?

**Answer:**

They represent different levels of the application's workflow.

A task's status describes its progress, such as `TODO`, `IN_PROGRESS`, or `DONE`.

A project's status describes the project's lifecycle, such as `ACTIVE` or `ARCHIVED`.

A task can be marked `DONE` while its project remains active. Conversely, a project can be archived while its tasks retain their existing statuses.

Archiving the project restricts further task modifications; it does not automatically complete every task.

---

## Q10. Why did you add negative tests?

**Answer:**

Negative tests verify that invalid operations are rejected.

For the archive policy, it is not enough to test that valid task operations work. We must also verify that write operations fail when the parent project is archived.

I also verify that the database write methods are not called, ensuring that the operation does not proceed after the guard rejects it.

---

## Q11. Why did you add tests for reading archived tasks?

**Answer:**

Because the intended policy allows reading archived projects.

Without explicit read tests, an incorrect implementation could block both reads and writes.

The tests verify both sides of the business rule: writes are rejected, but permitted reads continue to work.

---

## Q12. What is regression testing?

**Answer:**

Regression testing verifies that new changes do not break existing functionality.

After implementing the archive policy, I ran the complete Vitest suite, not just the task service tests.

The full suite passed 367 tests across 20 test files, helping verify that the changes did not break other tested application behaviour.

---

## Q13. What is the difference between unit testing and integration testing?

**Answer:**

Unit tests typically focus on a specific component in isolation, often using mocks for its dependencies.

Integration tests verify that multiple components work together.

For example, a task service unit test can mock Prisma to verify the archive guard's behaviour. A GraphQL integration test can verify how exceptions are transformed into responses by the error-formatting layer.

The exact classification depends on what each test actually exercises.

---

## Q14. Why did you run `tsc --noEmit` after running tests?

**Answer:**

Passing tests does not necessarily mean the entire codebase is free from TypeScript type errors.

Running `tsc --noEmit` performs a separate static type-check without generating output files.

Using both checks provides complementary verification: automated behavioural tests and static type validation.

---

## Q15. Can an archived project be permanently deleted?

**Answer:**

Not under the scope of the archive policy implemented in this phase.

Archiving and permanent deletion are separate lifecycle operations.

The current implementation preserves archived project data for reading and rejects task modifications. Permanent deletion and unarchiving have not been included in this scope.

If deletion is introduced later, it should have its own authorization rules, data-retention policy, and tests.

---

## Q16. Can an ADMIN modify tasks in an archived project?

**Answer:**

Under the current archive policy, the answer is no for the protected task write operations.

The archive guard rejects those operations regardless of whether the user would otherwise have sufficient permissions.

This illustrates the distinction between role authorization and resource-state validation: both conditions matter, and satisfying the role requirement does not override the archive restriction.

---

## Q17. Is calling `assertProjectActive()` sufficient to guarantee that an archived project can never be modified?

**Answer:**

It protects the write paths that call the helper, but it does not automatically guarantee that every possible write path is protected.

Every relevant operation must enforce the same rule.

Also, if project archiving and task modification happen concurrently, the project could be archived after the status check but before the task write.

For stronger concurrency guarantees, the application may need transaction-level coordination, appropriate locking, or conditional database operations.

The correct solution depends on the database, Prisma operations, and transaction design.

**Ye ek important advanced follow-up hai.** Interviewer ko ye batana achha hai ki tum validation logic ke saath concurrency concerns bhi samajhte ho.

---

## Q18. What happens if someone forgets to apply the archive guard to a new mutation?

**Answer:**

That mutation could bypass the policy.

A shared helper reduces duplicated logic, but it does not force every write path to invoke it.

To reduce this risk, developers should audit all task mutations, write unit tests for each protected operation, and consider architectural approaches that centralize or enforce the policy more comprehensively.

---

# Part 5 — Scenario-Based Questions

In questions mein interviewer tumhari practical reasoning test kar sakta hai.

### Scenario 1: A project is archived, but an ADMIN tries to create a task. What happens?

**Expected answer:** The archive guard rejects the request. The ADMIN role does not override the archived project's read-only policy.

### Scenario 2: A user wants to view a task from an archived project.

**Expected answer:** The read operation remains allowed, subject to authentication, authorization, and organization-scoping rules.

### Scenario 3: A task exists, but its parent project does not exist in the user's organization.

**Expected answer:** The service must not treat the task ID alone as sufficient authorization. The organization-scoped lookup and existing error-handling rules determine the response.

### Scenario 4: Every test passes, but the TypeScript compiler reports an error.

**Expected answer:** The code should not be considered fully verified. Tests and static type-checking catch different categories of problems, so both need to be addressed.

### Scenario 5: The archive guard is used in `create()` but omitted from `changeStatus()`.

**Expected answer:** Task status changes could bypass the intended policy. Each relevant write operation must enforce the rule, and tests should cover those operations separately.

### Scenario 6: The project is archived immediately after `assertProjectActive()` returns.

**Expected answer:** A race condition may exist between validation and the write. Stronger consistency may require a suitable transaction or database-level coordination strategy.

---

# Part 6 — Day 3 Revision Checklist

Commit karne se pehle aur interview revision ke liye ye checklist use karo:

- [ ] Archive aur delete ka difference samajhta hoon.
- [ ] Read-only archive policy explain kar sakta hoon.
- [ ] `assertProjectActive()` ka purpose explain kar sakta hoon.
- [ ] Task aur project status ka difference samajhta hoon.
- [ ] Organization-scoped queries ka purpose samajhta hoon.
- [ ] Authentication aur authorization mein difference samajhta hoon.
- [ ] Negative tests aur read tests ka purpose samajhta hoon.
- [ ] Vitest aur `tsc --noEmit` ka difference samajhta hoon.
- [ ] Race condition ka basic concept explain kar sakta hoon.
- [ ] Explain kar sakta hoon ki admin role archive restriction ko override kyun nahi karta.

## Day 3 ka final outcome

TaskForge mein archived projects ke liye **read-only policy** implement aur test kar di gayi hai.

Tumhare final verification results:

```text
Test Files: 20 passed (20)
Tests:      367 passed (367)
TypeScript: Passed
```

Bhai, ab Git commit complete kar lo. Iske baad Day 3 ke notes revise karna aur interview questions ke answers apne words mein bolne ki practice karna. Phir hum Week 3, Day 4 start karenge.