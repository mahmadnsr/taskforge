

Day 5 ka topic hai **Task Status Workflow & State Transition Validation**. Tere existing code aur test output ke according notes banayenge—koi imaginary feature add nahi karenge.

Day 5 mein hum cover karenge:
- Task status lifecycle aur allowed transitions
- `changeStatus()` service method
- Employee, Manager aur organization authorization
- Project membership aur task assignment checks
- Archived project protection
- Invalid transitions aur GraphQL error handling
- Testing strategy
- Important concepts aur interview questions with answers

**Verification already complete hai:** status-related tests **15/15 passed**, TypeScript check successful, aur full test suite **378/378 passed**.

---

# 📘 TaskForge — Day 5
## Task Status Workflow & State Transition Validation

### 1. Day 5 ka objective

Day 5 ka primary objective TaskForge mein **task status workflow ko verify karna aur uske business rules ko document karna** hai.

Task management application mein sirf task create aur assign karna sufficient nahi hai. Humein task ki progress ko track karna hota hai.

For example, kisi task ka lifecycle kuch is tarah ho sakta hai:

```text
TODO
  |
  v
IN_PROGRESS
  |
  v
IN_REVIEW
  |
  v
DONE
```

Lekin real-world workflow mein har status se directly har doosre status par jaana valid nahi hota.

For example:

```text
TODO → DONE
```

TaskForge ke existing rules ke according, ye transition allowed nahi hai.

Isliye Day 5 ka focus tha:
1. Existing task status workflow ko inspect karna.
2. Valid status transitions verify karna.
3. User authorization aur project membership rules check karna.
4. Archived projects par status changes ko prevent karna.
5. Existing unit tests aur complete test suite run karna.
6. Implementation ko documentation mein record karna.

**Important:** Status workflow pehle se implemented tha. Humne ise dobara implement karne ke bajaye audit aur verify kiya.

---

## 2. Day 5 ke end tak kya verify hua?

| Component | Responsibility | Status |
|---|---|---|
| `TaskStatus` enum | Available task statuses define karna | Verified |
| `ChangeTaskStatusInput` | Mutation input define karna | Verified |
| `TasksResolver` | GraphQL status mutation expose karna | Verified |
| `TasksService.changeStatus()` | Status change ki business logic | Verified |
| `getMembership()` | Organization membership verify karna | Verified |
| `assertProjectActive()` | Archived project par status change rokna | Verified |
| `tasks.service.spec.ts` | Status workflow aur authorization test karna | Passed |
| GraphQL error formatter | Public error messages ki status mapping | Verified |

### Test results

```text
Task service tests:  63 passed
Status tests:        15 passed
TypeScript check:    Passed
Full test suite:     378 passed
Test files:          20 passed
Failed tests:        0
```

Ye results us run ke hain jo humne Day 5 verification ke dauran execute kiya tha.

---

## 3. TaskForge mein available statuses

File:

```text
prisma/schema.prisma
```

Existing Prisma enum:

```prisma
enum TaskStatus {
  TODO
  IN_PROGRESS
  IN_REVIEW
  DONE
}
```

Ye enum task ke possible statuses define karta hai.

### Har status ka meaning

| Status | Meaning |
|---|---|
| `TODO` | Task abhi start nahi hua hai |
| `IN_PROGRESS` | Task par kaam chal raha hai |
| `IN_REVIEW` | Task review ke liye ready hai ya review mein hai |
| `DONE` | Task complete ho chuka hai |

### Enum use karne ka benefit

Agar hum statuses ko arbitrary strings ke form mein store karte, toh invalid values enter hone ka risk hota.

Example:

```text
TODO
IN_PROGRESS
COMPLETED
INPROGRESS
```

Yahan `COMPLETED` aur `INPROGRESS` hamare defined enum values nahi hain.

Enum ke through application known status values ke saath kaam karti hai.

Isse:
- Status values consistent rehti hain.
- Invalid status input validate karna easier hota hai.
- Business logic readable hoti hai.
- TypeScript aur Prisma ke saath type safety milti hai.

**Important:** Enum valid status names define karta hai, lekin valid transitions define nahi karta. Transition rules service ki responsibility hain.

---

## 4. Status workflow — allowed transitions

File:

```text
src/tasks/tasks.service.ts
```

Existing implementation mein `allowedTransitions` map use kiya gaya hai.

Conceptually, iska structure ye hai:

```ts
const allowedTransitions: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS],
  [TaskStatus.IN_PROGRESS]: [TaskStatus.IN_REVIEW],
  [TaskStatus.IN_REVIEW]: [TaskStatus.IN_PROGRESS, TaskStatus.DONE],
  [TaskStatus.DONE]: [],
};
```

Ye existing implementation ke transition rules ko represent karta hai.

### Transition table

| Current status | Allowed next status | Rejected examples |
|---|---|---|
| `TODO` | `IN_PROGRESS` | `IN_REVIEW`, `DONE` |
| `IN_PROGRESS` | `IN_REVIEW` | `TODO`, `DONE` |
| `IN_REVIEW` | `IN_PROGRESS`, `DONE` | `TODO` |
| `DONE` | None | All transitions |

### Workflow visualization

```text
              ┌─────────────────┐
              │      TODO       │
              └────────┬────────┘
                       │
                       │ Start task
                       v
              ┌─────────────────┐
              │   IN_PROGRESS   │◄──────────┐
              └────────┬────────┘           │
                       │                    │
                       │ Submit for review  │ Request changes
                       v                    │
              ┌─────────────────┐           │
              │    IN_REVIEW    │───────────┘
              └────────┬────────┘
                       │
                       │ Approve
                       v
              ┌─────────────────┐
              │      DONE       │
              └─────────────────┘
```

**Note:** Diagram mein arrows business workflow ko explain karte hain. Actual allowed transitions wahi hain jo transition table mein listed hain.

### `IN_REVIEW → IN_PROGRESS` kyun allowed hai?

Suppose Ahmad task complete karke review ke liye submit karta hai.

Manager review ke dauran changes request karta hai.

Task ko dobara kaam ke liye open karna padega:

```text
IN_REVIEW → IN_PROGRESS
```

Isliye TaskForge mein ye transition allowed hai.

### `DONE` se transition kyun allowed nahi hai?

Current implementation ke according:

```ts
[TaskStatus.DONE]: []
```

Empty array ka matlab hai ki `DONE` status se koi next transition defined nahi hai.

Agar task `DONE` hai aur client status change karne ki request karta hai, toh transition reject hota hai.

**Important:** Ye current business rule hai. Future mein reopening support karna ho, toh transition map aur tests dono update karne honge.

---

## 5. GraphQL Input DTO

File:

```text
src/tasks/dto/change-task-status.input.ts
```

Existing DTO:

```ts
import { Field, ID, InputType } from '@nestjs/graphql';
import { IsEnum, IsUUID } from 'class-validator';
import { TaskStatus } from '@prisma/client';

@InputType()
export class ChangeTaskStatusInput {
  @Field(() => ID)
  @IsUUID()
  organizationId!: string;

  @Field(() => ID)
  @IsUUID()
  taskId!: string;

  @Field(() => TaskStatus)
  @IsEnum(TaskStatus)
  status!: TaskStatus;
}
```

Chalo, ise samajhte hain.

### `@InputType()`

```ts
@InputType()
```

NestJS GraphQL ko batata hai ki ye class GraphQL input type ke roop mein use hogi.

### `@Field(() => ID)`

```ts
@Field(() => ID)
```

GraphQL schema mein field ko ID type ke roop mein expose karta hai.

### `@IsUUID()`

```ts
@IsUUID()
```

Validation ke through verify karta hai ki input UUID format mein hai.

Iska use `organizationId` aur `taskId` ke liye kiya gaya hai.

### `@IsEnum(TaskStatus)`

```ts
@IsEnum(TaskStatus)
```

Verify karta hai ki supplied status defined `TaskStatus` enum ka valid member hai.

For example:

```text
IN_PROGRESS → Valid enum value
IN_REVIEW   → Valid enum value
INVALID     → Invalid enum value
```

Lekin ek subtle difference yaad rakh:

**Valid enum value ka matlab valid transition nahi hai.**

Example:

```text
Current status = TODO
Requested status = DONE
```

`DONE` ek valid enum value hai, lekin `TODO → DONE` allowed transition nahi hai.

Isliye DTO validation aur service-level transition validation dono ki zaroorat hai.

---

## 6. GraphQL Resolver

File:

```text
src/tasks/tasks.resolver.ts
```

Existing resolver status mutation ko service tak delegate karta hai:

```ts
this.service.changeStatus(user.id, input)
```

Is line mein:

- `user.id` authenticated current user ko represent karta hai.
- `input` mein organization ID, task ID aur requested status hota hai.
- `changeStatus()` business rules validate karta hai.

### Request flow

```text
GraphQL Client
      |
      | Change task status
      v
TasksResolver
      |
      | user.id + input
      v
TasksService.changeStatus()
      |
      |-- Membership validation
      |-- Task lookup
      |-- Project active check
      |-- Employee-specific authorization
      |-- Status transition validation
      |
      v
Prisma task update
      |
      v
Updated task
```

### Resolver aur service ko separate kyun rakha?

Resolver API boundary ka kaam karta hai.

Service business logic handle karti hai.

Agar saari validation resolver mein hoti, toh service-level unit testing aur future reuse difficult ho sakta tha.

Separation of concerns se:
- Code maintainable rehta hai.
- Business rules ek jagah maintain hote hain.
- Unit tests likhna easier hota hai.
- Resolver unnecessary complexity se bachta hai.

---

## 7. Service layer — `changeStatus()`

File:

```text
src/tasks/tasks.service.ts
```

Method:

```ts
async changeStatus(userId: string, input: ChangeTaskStatusInput)
```

Is method ka kaam sirf database mein status update karna nahi hai.

Isse pehle multiple business rules enforce karne hote hain.

### Step 1 — Input se values extract karna

```ts
const { organizationId, taskId, status } = input;
```

Requested organization, task aur new status extract kiye jaate hain.

### Step 2 — Organization membership verify karna

```ts
const membership = await this.getMembership(
  userId,
  organizationId,
);
```

Current user ki organization membership retrieve ki jaati hai.

Agar user organization ka member nahi hai, toh request reject hoti hai.

### Step 3 — Organization-scoped task lookup

Existing code:

```ts
const task = await this.prisma.task.findFirst({
  where: { id: taskId, organizationId },
});
```

Yahan task ko dono conditions ke basis par find kiya jaata hai:

```text
task.id == requested taskId
AND
task.organizationId == requested organizationId
```

Agar task nahi milta:

```ts
if (!task) {
  throw new NotFoundException('Task not found');
}
```

### Ye check important kyun hai?

Suppose:

```text
Organization A
└── Task A

Organization B
└── Task B
```

Organization A ka user Organization B ke task ko apni organization ke context mein access karne ki koshish karta hai.

Organization-scoped lookup ensure karta hai ki requested task specified organization se belong karta ho.

**Security lesson:** Sirf authenticated user aur valid task ID sufficient nahi hain. Resource ko correct tenant ke context mein resolve karna bhi important hai.

### Step 4 — Archived project check

Existing implementation:

```ts
await this.assertProjectActive(
  organizationId,
  task.projectId,
);
```

Task ke project ki active state verify ki jaati hai.

Agar project archived hai, toh status change reject hota hai.

### Step 5 — Employee-specific authorization

Agar current user's role `EMPLOYEE` hai, toh service do additional checks karti hai:

1. User task ke project ka member hai.
2. Task current user ko assigned hai.

### Step 6 — Allowed transition validate karna

Service current status aur requested status ko transition map ke against check karti hai.

Agar transition allowed nahi hai, toh:

```ts
throw new BadRequestException(
  'Invalid task status transition',
);
```

### Step 7 — Database update

Agar saare checks pass ho jaate hain, toh service task status update karti hai.

Existing implementation:

```ts
return this.prisma.task.update({
  where: { id: taskId },
  data: { status },
});
```

**Key principle:** Authorization aur business-rule validation ke baad hi status update execute hota hai.

---

## 8. Role-based authorization

TaskForge mein organization roles hain:

```text
ADMIN
MANAGER
EMPLOYEE
```

Status workflow ke liye existing service mein special restrictions `EMPLOYEE` role par apply hoti hain.

### Employee ke rules

Employee ko status change karne ke liye:

- Organization ka member hona chahiye.
- Task ke project ka member hona chahiye.
- Task usi employee ko assigned hona chahiye.
- Requested transition allowed hona chahiye.
- Project archived nahi hona chahiye.

### Authorization table

| Scenario | Expected behaviour |
|---|---|
| Organization membership nahi hai | Reject |
| Employee project member nahi hai | Reject |
| Employee task ka assignee nahi hai | Reject |
| Assigned employee valid transition karta hai | Allow |
| Manager valid transition karta hai | Allow |
| Task doosri organization ka hai | Reject |
| Project archived hai | Reject |

**Clarification:** Existing test suite mein Manager ke successful status change ka explicit test hai. Humne Admin ke liye dedicated status-success test output mein verify nahi kiya. Existing service Employee ko specifically restrict karti hai, lekin ise Admin-specific test coverage ka substitute nahi maana jaana chahiye.

### Employee sirf assigned task kyun change kar sakta hai?

Suppose:

```text
Project Alpha
├── Task 1 → Ahmad ko assigned
├── Task 2 → Sara ko assigned
└── Task 3 → Unassigned
```

Agar Ahmad employee hai, toh existing rule ke according woh Task 1 ka status change kar sakta hai.

Lekin Task 2 aur Task 3 ke status change karne ki permission nahi hai.

Isse employee doosre users ke work items ka status arbitrarily change nahi kar sakta.

---

## 9. Project membership aur task assignment mein difference

Ye do separate checks hain.

### Project membership

Question:

> Kya user us project ka member hai?

Example:

```text
Project Alpha
├── Ahmad
└── Sara
```

Ahmad aur Sara dono project members hain.

### Task assignment

Question:

> Kya specific task current user ko assigned hai?

Example:

```text
Project Alpha
├── Task 1 → Ahmad
└── Task 2 → Sara
```

Ahmad project member hai, lekin Task 2 usko assigned nahi hai.

Isliye project member hone ke bawajood Ahmad Task 2 ka status change nahi kar sakta, kyunki Employee-specific assignment rule bhi enforce hota hai.

### Yaad rakhne ka shortcut

```text
Organization membership
        +
Project membership
        +
Task assignment
        +
Allowed transition
        +
Active project
        |
        v
Status change allowed
```

Ye diagram Employee ke successful status-change path ko summarize karta hai. Manager ke liye same Employee-specific project-membership aur assignment restrictions apply nahi ki gayi hain; organization membership, active project aur transition rules phir bhi important hain.

---

## 10. Archived project protection

TaskForge mein archived project par status change allowed nahi hai.

Existing helper:

```ts
assertProjectActive()
```

Status change method mein call kiya jaata hai.

### Example

Suppose:

```text
Project: TaskForge Website
Status: ARCHIVED

Task: Build login page
Task status: IN_PROGRESS
```

Agar client task ko `IN_REVIEW` karne ki request bhejta hai, toh project archive hone ki wajah se operation reject hona chahiye.

### Archived project protection kyun zaroori hai?

Project archive hone ka matlab hai ki us par further modifications allowed nahi hain, according to the current business rules.

Task status change ek write operation hai.

Isliye archived project ke tasks par status update rokna data consistency aur predictable application behaviour ke liye important hai.

### Reusable helper ka benefit

Agar archived-project check har method mein manually implement kiya jaata, toh duplicate logic create ho sakti thi.

Reusable helper:
- Code duplication reduce karta hai.
- Rules ko consistent rakhta hai.
- Future maintenance easier banata hai.
- Business intent ko clear karta hai.

---

## 11. Invalid transition handling

Existing service transition map ke against requested status validate karti hai.

Conceptually:

```ts
if (!allowedTransitions[task.status].includes(status)) {
  throw new BadRequestException(
    'Invalid task status transition',
  );
}
```

### Example 1 — Valid transition

```text
Current: TODO
New: IN_PROGRESS

Result: Allowed
```

### Example 2 — Invalid transition

```text
Current: TODO
New: DONE

Result: Rejected
```

### Example 3 — Task already done

```text
Current: DONE
New: IN_PROGRESS

Result: Rejected
```

### Error status

Invalid transition ke liye:

```text
Invalid task status transition
```

Existing error formatter mein is message ko status `400` se map kiya gaya hai.

### `400 Bad Request` kyun?

Request ki input values valid enum values ho sakti hain, lekin current state ke context mein requested operation allowed nahi hai.

Is application mein invalid state transition ko `400` ke through represent kiya gaya hai.

---

## 12. GraphQL error formatting

Files:

```text
src/common/graphql/format-error.ts
src/common/graphql/format-error.spec.ts
```

Status workflow se related existing public error mappings:

| Error message | Mapped status |
|---|---:|
| `You must be a project member to change task status` | 403 |
| `You can only change the status of tasks assigned to you` | 403 |
| `Invalid task status transition` | 400 |

### 403 — Forbidden

User ko requested operation perform karne ki permission nahi hai.

Examples:
- Employee project ka member nahi hai.
- Employee task ka assignee nahi hai.

### 400 — Bad Request

Requested operation current business rules ke according valid nahi hai.

Example:
- `TODO → DONE`

### Error formatting ka purpose

GraphQL errors ko consistent aur safe way mein client tak pahunchana important hai.

Unexpected internal errors ke case mein database ya implementation details expose nahi karni chahiye.

TaskForge existing error-formatting conventions ko status workflow ke errors ke liye reuse karta hai.

---

## 13. Unit testing strategy

File:

```text
src/tasks/tasks.service.spec.ts
```

Existing `changeStatus` test suite mein **15 tests** hain.

### Test cases

| Test | Expected result |
|---|---|
| `TODO → IN_PROGRESS` | Allowed |
| Archived project mein status change | Rejected |
| `IN_PROGRESS → IN_REVIEW` | Allowed |
| `IN_REVIEW → IN_PROGRESS` | Allowed |
| `IN_REVIEW → DONE` | Allowed |
| `TODO → DONE` | Rejected |
| `IN_PROGRESS → DONE` | Rejected |
| `DONE` se transition | Rejected |
| Missing task | Rejected |
| User organization ka member nahi hai | Rejected |
| Employee project member nahi hai | Rejected |
| Employee task ka assignee nahi hai | Rejected |
| Assigned employee valid transition karta hai | Allowed |
| Manager status change karta hai | Allowed |
| Task doosri organization ka hai | Rejected |

### Happy-path testing

Happy-path tests valid scenarios verify karte hain.

Examples:

```text
TODO → IN_PROGRESS
IN_PROGRESS → IN_REVIEW
IN_REVIEW → DONE
```

In tests se pata chalta hai ki intended workflow successfully execute hota hai.

### Negative testing

Negative tests invalid scenarios verify karte hain.

Examples:

```text
TODO → DONE
Employee → Unassigned task
Non-member → Change task status
Archived project → Change status
```

In tests ka purpose ensure karna hai ki invalid requests silently accept na ho jaayen.

### Unit tests aur full suite mein difference

Command:

```bash
pnpm exec vitest run src/tasks/tasks.service.spec.ts
```

Ye specific task service test file execute karta hai.

Recorded result:

```text
Tests  63 passed (63)
```

Command:

```bash
pnpm exec vitest run
```

Ye complete project test suite execute karta hai.

Recorded result:

```text
Test Files  20 passed (20)
Tests      378 passed (378)
```

Dono commands useful hain:
- Focused tests fast feedback dete hain.
- Full suite regressions detect karne mein help karti hai.

---

## 14. TypeScript verification

Command:

```bash
pnpm exec tsc --noEmit
```

Ye command successful hui.

### `--noEmit` ka meaning

TypeScript compiler project ko type-check karta hai, lekin generated output files create nahi karta.

Isse humein compile-time issues detect karne mein help milti hai.

Lekin yaad rakh:

**TypeScript check pass hona aur runtime business logic correct hona do alag cheezein hain.**

Isliye humne type-check ke saath unit tests aur full test suite bhi run ki.

---

## 15. Vite aur GraphQL warnings

Verification ke dauran do types ki warnings dikhi thi.

### Vite warning

```text
The plugin "vite-tsconfig-paths" is detected.
Vite now supports tsconfig paths resolution natively...
```

Ye Vite configuration ke liye suggestion hai.

Is warning ki wajah se test run fail nahi hua.

Future cleanup ke liye existing Vite configuration inspect kar sakte hain, lekin bina configuration check kiye plugin remove nahi karna chahiye.

### GraphQL warning logs

```text
WARN [GraphQLError] Suppressed GraphQL error detail
```

Ye error formatter ke tests ke dauran logged messages the.

Recorded test suite successful rahi.

In logs ka purpose aur appropriateness formatter ki intended security behaviour aur logging configuration ke context mein evaluate karna chahiye. Sirf warning dikhne ka matlab automatically application bug nahi hai.

---

## 16. Important engineering concepts

### A. State machine

State machine ek system ko states aur unke beech allowed transitions ke through model karti hai.

TaskForge example:

```text
TODO → IN_PROGRESS → IN_REVIEW → DONE
```

Yahan har status ek state hai, aur allowed status change ek transition hai.

State machine ka benefit ye hai ki application invalid state changes ko reject kar sakti hai.

### B. State transition validation

Transition validation check karti hai ki current state se requested state tak jaana allowed hai ya nahi.

Example:

```text
Current state: TODO
Requested state: DONE
```

`DONE` valid status hai, lekin transition invalid hai.

Isliye status enum validation ke saath transition validation bhi zaroori hai.

### C. RBAC — Role-Based Access Control

RBAC user ke role ke basis par permissions control karta hai.

TaskForge roles:

```text
ADMIN
MANAGER
EMPLOYEE
```

Status workflow mein Employee ke liye additional task-level restrictions hain.

### D. Multi-tenancy

TaskForge multiple organizations ko support karta hai.

Organization-scoped task lookup ensure karta hai ki requested task specified organization ka ho.

Isse cross-organization resource access ko prevent karne mein help milti hai.

### E. Defense in depth

Security ke liye ek hi check par depend karne ke bajaye multiple relevant checks enforce kiye jaate hain.

Status workflow mein examples:
- Organization membership.
- Organization-scoped task lookup.
- Project active-state check.
- Employee-specific project membership.
- Employee-specific task assignment.
- Valid status transition.

Har check ek different concern address karta hai.

### F. Separation of concerns

TaskForge mein:

```text
DTO       → Input contract
Resolver  → GraphQL API boundary
Service   → Business rules
Prisma    → Database access
Tests     → Behaviour verification
```

Ye separation code ko easier to test aur maintain banati hai.

### G. Regression testing

Regression testing ka purpose verify karna hai ki recent changes ki wajah se existing functionality break nahi hui.

Complete test suite ke 378 passing tests humein recorded codebase ke tested behaviours par confidence dete hain.

---

# 17. Interview questions with answers

Ye questions TaskForge ke Day 5 implementation ko explain karne aur backend interviews ke liye revision mein help karenge.

### Q1. What is a state machine?

**Answer:**

A state machine models a system using a set of states and defined transitions between those states.

In TaskForge, `TODO`, `IN_PROGRESS`, `IN_REVIEW` aur `DONE` task states hain. Service define karti hai ki ek state se kaunsi next state allowed hai.

### Q2. Why is a status enum not sufficient for validating a workflow?

**Answer:**

An enum validates which status values are valid, but it does not define which transitions are allowed.

For example, `DONE` is a valid enum value, but `TODO → DONE` is not an allowed transition in TaskForge.

Therefore, enum validation and transition validation serve different purposes.

### Q3. Why do we use an `allowedTransitions` map?

**Answer:**

The map centralizes the allowed next states for each current state.

It makes transition rules easier to read, test and maintain. It also avoids scattering transition conditions across multiple branches.

### Q4. What is the difference between validation and authorization?

**Answer:**

Validation checks whether the supplied input satisfies the required constraints.

Authorization checks whether the current user is permitted to perform the operation.

For example:
- `@IsEnum(TaskStatus)` validates the status value.
- Role, membership and assignment checks enforce authorization rules.

### Q5. Why can `TODO → DONE` be rejected even though `DONE` is a valid status?

**Answer:**

Because valid status values do not imply that every pair of states can transition into each other.

TaskForge allows `TODO → IN_PROGRESS`, but it does not allow `TODO → DONE`.

### Q6. Why does TaskForge prevent transitions from `DONE`?

**Answer:**

The current business rules define an empty list of allowed next states for `DONE`.

This makes `DONE` a terminal state in the existing workflow.

If reopening is required in the future, the transition rules and corresponding tests must be updated.

### Q7. Why must the task be looked up using both task ID and organization ID?

**Answer:**

TaskForge is a multi-tenant application. The organization-scoped lookup ensures that the requested task belongs to the specified organization.

Looking up a task only by ID would not, by itself, enforce that organization boundary.

### Q8. What is the difference between organization membership and project membership?

**Answer:**

Organization membership establishes the user's relationship with an organization.

Project membership establishes the user's relationship with a particular project.

A user can belong to an organization without necessarily being a member of every project in that organization.

### Q9. Why must an employee be assigned to a task before changing its status?

**Answer:**

TaskForge's current Employee-specific rules restrict status changes to tasks assigned to the current employee.

This prevents employees from changing the status of other employees' tasks or unassigned tasks.

### Q10. Why do we check whether a project is archived?

**Answer:**

TaskForge's current business rules prevent status changes in archived projects.

The `assertProjectActive()` helper enforces this rule before the task update is executed.

### Q11. Why is the status change implemented in the service layer?

**Answer:**

The service layer contains business logic, authorization checks and database operations.

Keeping these responsibilities out of the resolver makes the code easier to test, maintain and reuse.

### Q12. Why are negative tests important?

**Answer:**

Happy-path tests verify that valid operations succeed, but they do not prove that invalid operations are rejected.

Negative tests verify cases such as invalid transitions, unauthorized users, missing tasks and archived projects.

### Q13. What is the purpose of `@IsEnum(TaskStatus)`?

**Answer:**

It validates that the supplied value belongs to the defined `TaskStatus` enum.

It does not validate whether the transition from the task's current status to the requested status is allowed. That rule is enforced separately by the service.

### Q14. What is the difference between HTTP-style 400 and 403 errors in this workflow?

**Answer:**

In TaskForge's error mappings:
- `400` represents an invalid status transition.
- `403` represents a permission-related rejection, such as an employee who is not a project member or is not assigned to the task.

These are the application's chosen mappings for the corresponding public error messages.

### Q15. What does `pnpm exec tsc --noEmit` do?

**Answer:**

It runs the TypeScript compiler's checks without emitting compiled output files.

It helps detect compile-time errors, but it does not replace runtime tests.

### Q16. What is regression testing?

**Answer:**

Regression testing checks whether existing functionality continues to behave correctly after changes.

In TaskForge, running the full Vitest suite helps detect unintended changes in authentication, organizations, projects, tasks and GraphQL error handling.

### Q17. Does passing 378 tests guarantee that the application has no bugs?

**Answer:**

No. Passing tests show that the tested scenarios passed under the conditions of that test run.

Uncovered edge cases, integration issues and production-specific conditions can still exist.

### Q18. Why is project membership checked separately from task assignment?

**Answer:**

They represent different relationships.

Project membership checks whether the user belongs to the project. Task assignment checks whether the particular task is assigned to that user.

An employee may be a project member but not the assignee of a particular task.

### Q19. What happens if a client requests `IN_REVIEW` for a task currently in `DONE`?

**Answer:**

The request is rejected because `DONE` has no allowed next transitions in the existing transition map.

### Q20. How would you add a new status such as `BLOCKED`?

**Answer:**

I would first define the business rules for `BLOCKED`, including which statuses can transition into it and which statuses can transition out of it.

Then I would update the Prisma enum and relevant schema as required, update the transition map, review API compatibility and validation, and add positive and negative tests for the new transitions.

I would also run the full test suite and TypeScript checks.

---

## 18. Day 5 completion checklist

| Task | Result |
|---|---|
| Existing status enum inspected | ✅ |
| Transition map inspected | ✅ |
| Status input DTO inspected | ✅ |
| Resolver-to-service flow verified | ✅ |
| Organization-scoped task lookup verified | ✅ |
| Employee authorization verified | ✅ |
| Archived project protection verified | ✅ |
| Invalid transitions tested | ✅ |
| Status service tests | ✅ 15/15 passed |
| Full test suite | ✅ 378/378 passed |
| TypeScript check | ✅ Passed |
| Day 5 documentation | 📝 Save this document as `day5.md` |
| Documentation commit and push | ⏳ Pending |


