Bhai ❤️ chalo, **TaskForge — Day 4 ke detailed notes** banate hain, bilkul documentation style mein. Inhe tum apne project notes mein save kar sakte ho aur future mein revision, debugging aur interview preparation ke liye use kar sakte ho.

Notes mein hum cover karenge:
- Day 4 ka objective aur architecture
- GraphQL mutation aur input DTO
- Service-layer business logic
- Authorization aur project membership validation
- Archived projects ke rules
- Assign aur unassign ka behaviour
- Error handling aur testing
- Important code concepts aur interview questions

---

# 📘 TaskForge — Day 4
## Task Assignment Mutation & Business Rules

### 1. Day 4 ka objective

Day 4 ka primary objective TaskForge mein **dedicated task assignment functionality** implement karna tha.

TaskForge ek multi-tenant task management backend hai. Ismein users organizations ke members hote hain, projects ke andar tasks hote hain, aur tasks kisi user ko assign kiye ja sakte hain.

Task assignment implement karte waqt sirf task ka `assigneeId` update karna sufficient nahi hai. Humein verify karna hota hai ki:

1. Current user ko task assign karne ki permission hai.
2. Task current user's organization se belong karta hai.
3. Task jis project ka hai, woh archived nahi hai.
4. Jis user ko assign kar rahe hain, woh us project ka member hai.
5. Unassignment aur invalid input ko correctly handle kiya jaye.

**Core principle:** Database update se pehle business rules validate hone chahiye.

### 2. Day 4 ke end tak kya implement hua?

| Component | Responsibility |
|---|---|
| `AssignTaskInput` | Assignment mutation ka input define karna |
| `TasksResolver` | GraphQL mutation expose karna |
| `TasksService` | Assignment ki business logic execute karna |
| `assertProjectActive()` | Archived project par mutation rokna |
| `tasks.service.spec.ts` | Assignment behaviour aur edge cases test karna |
| `format-error.ts` | GraphQL errors ko safely format karna |
| `format-error.spec.ts` | Error formatting behaviour test karna |

Implementation ke baad complete test suite mein **378 tests pass** hue aur TypeScript check successful raha.

---

## 3. Architecture: GraphQL request se database tak

Task assignment ka request multiple layers se pass hota hai.

```text
Client
  |
  | assignTask(input)
  v
TasksResolver
  |
  | Current user ID + input
  v
TasksService.assign(userId, input)
  |
  |-- 1. Organization membership check
  |
  |-- 2. ADMIN/MANAGER permission check
  |
  |-- 3. Organization ke andar task find karo
  |
  |-- 4. Project active hai ya nahi
  |
  |-- 5. Assignee project member hai ya nahi
  |
  |-- 6. Task ka assigneeId update karo
  |
  v
Database
  |
  v
Updated task returned
```

### Layer-wise responsibilities

**Resolver:** GraphQL request receive karta hai aur service ko delegate karta hai.

**Service:** Business rules validate karta hai aur database operation execute karta hai.

**DTO:** Define karta hai ki mutation ko kis tarah ka input accept karna hai.

**Database:** Task ke assignment ko persist karta hai.

Ye separation important hai, kyunki resolver ko business logic se bhar dene ke bajaye hum logic ko service mein maintain karte hain.

---

## 4. `AssignTaskInput` — Input DTO

File:

```text
src/tasks/dto/assign-task.input.ts
```

Humne assignment mutation ke liye dedicated input DTO banaya.

DTO ka purpose hai GraphQL API ke input ka structure define karna.

Assignment mein do important pieces of information hain:

- Kaunsa task assign karna hai.
- Kise assign karna hai, ya task unassign karna hai.

Conceptually, input ka structure kuch is tarah hai:

```graphql
input AssignTaskInput {
  taskId: ID!
  assigneeId: ID
}
```

**Important:** Upar diya gaya schema conceptual illustration hai. Apne actual DTO mein field names aur types wahi use karna jo tumhare committed code mein hain.

### `assigneeId` nullable kyun hai?

Kyunki humne assignment ke saath unassignment bhi support kiya.

Do valid operations:

**Case 1 — Kisi user ko assign karna**

```text
assigneeId = user ki ID
```

**Case 2 — Task unassign karna**

```text
assigneeId = null
```

Yahan ek subtle lekin important distinction hai:

- `assigneeId` mein user ID dena: assignment.
- `assigneeId: null` dena: unassignment.
- `assigneeId` omit karna: validation error.

Is distinction ko samajhna API design ke liye important hai.

---

## 5. GraphQL Resolver — Mutation expose karna

File:

```text
src/tasks/tasks.resolver.ts
```

Resolver ka kaam client ko assignment mutation provide karna hai.

GraphQL mein mutation ka use tab hota hai jab client server par data modify karna chahta hai.

Examples:

- Task create karna.
- Task update karna.
- Task ka status change karna.
- Task assign ya unassign karna.

Humne task assignment ke liye dedicated `assignTask` mutation add ki.

### Resolver ka flow

```text
GraphQL request
      |
      v
assignTask mutation
      |
      v
Input receive karo
      |
      v
Authenticated user ki ID lo
      |
      v
TasksService.assign(...)
      |
      v
Result return karo
```

Resolver ko assignment ki saari validation khud nahi karni chahiye. Permission aur business rules service mein enforce hote hain.

### Dedicated mutation kyun?

Agar assignment ko generic task update ke through hi handle karte, toh assignment-specific permissions aur validation ko samajhna aur maintain karna mushkil ho sakta tha.

Dedicated mutation se API ka intent clear hota hai:

```text
updateTask  → Task ke general fields update karna

assignTask  → Task ka assignee change karna
```

Isse authorization aur future maintenance bhi easier hoti hai.

---

## 6. Service Layer — Assignment ki main business logic

File:

```text
src/tasks/tasks.service.ts
```

Ye Day 4 ka sabse important part hai.

Humne service mein assignment ke liye dedicated method implement kiya:

```ts
assign(userId, input)
```

Is method mein `userId` current authenticated user ko represent karta hai, jabki `input` assignment request ki details contain karta hai.

Method ka overall responsibility hai:

1. Organization membership validate karna.
2. Role-based authorization enforce karna.
3. Organization-scoped task lookup karna.
4. Archived project par assignment rokna.
5. Assignee ki project membership validate karna.
6. Task update karna.

Chalo in checks ko detail mein samajhte hain.

### 6.1 Organization membership check

TaskForge multi-tenant application hai.

Iska matlab hai ki ek application mein multiple organizations ke users aur resources ho sakte hain.

Example:

```text
Organization A
├── Ahmad
├── Sara
└── Project A
    └── Task A

Organization B
├── Ali
└── Project B
    └── Task B
```

Organization A ka user automatically Organization B ke resources access nahi kar sakta.

Isliye assignment operation mein current user ki organization membership verify karna zaroori hai.

**Security principle:** Har request mein user ka authenticated hona sufficient nahi hai. User ko requested resource access karne ki permission bhi honi chahiye.

### 6.2 Role-based authorization

TaskForge mein roles hain:

```text
ADMIN
MANAGER
EMPLOYEE
```

Day 4 ke assignment rules ke according:

| Role | Task assign kar sakta hai? |
|---|---|
| ADMIN | Yes |
| MANAGER | Yes |
| EMPLOYEE | No |

Service mein ADMIN aur MANAGER ko assignment permission di gayi hai.

Agar unauthorized role assignment attempt karta hai, operation reject hota hai.

Error message:

```text
Only admins and managers can assign tasks
```

Error formatter mein is message ko HTTP-style status `403` se map kiya gaya.

### 403 ka meaning

`403 Forbidden` ka matlab hai ki request ko perform karne ki permission nahi hai.

Example:

```text
Employee → assignTask
              |
              v
       Permission denied
              |
              v
             403
```

Yahan important baat ye hai ki **permission check backend mein enforce hona chahiye**.

Frontend par button hide karna useful ho sakta hai, lekin woh authorization ka replacement nahi hai. Koi user directly GraphQL request bhej sakta hai.

---

## 7. Organization-scoped task lookup

Task assignment ke liye service ko requested task find karna hota hai.

Lekin sirf task ID se lookup karna sufficient nahi hai.

Suppose:

```text
Organization A → Task 101
Organization B → Task 202
```

Agar Organization A ka user Task 202 ko access karne ki koshish kare, toh service ko organization boundary enforce karni chahiye.

Conceptually, lookup ka rule hai:

```text
Find task where:
    task.id = requested task ID
    AND task belongs to current organization
```

Isse cross-organization access ka risk kam hota hai.

### Isko authorization ke saath confuse mat karna

Role check aur organization-scoped lookup alag responsibilities hain.

- **Role check:** Kya current user assignment operation kar sakta hai?
- **Organization scope:** Kya requested task current organization ka hai?

Dono checks ka purpose different hai.

---

## 8. Archived project protection

TaskForge mein archived project ko read-only behaviour diya gaya tha.

Day 3 mein `assertProjectActive()` helper implement kiya gaya tha.

Day 4 mein isi helper ko assignment flow mein reuse kiya gaya.

Relevant file:

```text
src/tasks/tasks.service.ts
```

### Archived project ka expected behaviour

Suppose:

```text
Project: Website Redesign
Status: ARCHIVED

Task: Create login page
Assignee: Ahmad
```

Ab agar manager archived project ke task ko kisi doosre user ko assign karne ki koshish karta hai, toh operation reject hona chahiye.

Kyun?

Kyunki project archive karne ke baad uske tasks par write operations allowed nahi hain.

Assignment bhi ek write operation hai, kyunki isse task ka data modify hota hai.

### Helper reuse karne ka benefit

Agar har service method mein archived project ki validation separately likhte, toh duplicate logic create hoti.

Dedicated helper se:

```text
createTask       → assertProjectActive()
updateTask       → assertProjectActive()
changeStatus     → assertProjectActive()
assignTask       → assertProjectActive()
```

Ye conceptual flow hai; har operation mein helper ki exact placement uske implementation par depend karti hai.

Benefits:

- Duplicate code kam hota hai.
- Business rule centralized rehta hai.
- Behaviour consistent rehta hai.
- Future changes maintain karna easier hota hai.

**LLD principle:** Common business rules ko reusable helpers mein rakhna code maintainability improve karta hai.

---

## 9. Assignee ka project member hona zaroori hai

Ye assignment feature ka ek important business rule hai.

Sirf valid user ID mil jaana sufficient nahi hai.

Suppose:

```text
Project Alpha
├── Ahmad
└── Sara

Project Beta
├── Ali
└── Zoya
```

Agar Project Alpha ka task Ali ko assign karne ki request aati hai, toh operation reject hona chahiye, kyunki Ali Project Alpha ka member nahi hai.

Expected behaviour:

```text
Task belongs to Project Alpha
                |
                v
Check requested assignee
                |
                v
Is assignee a member of Project Alpha?
          /             \
        Yes              No
         |                |
         v                v
  Allow assignment    Reject request
```

### Ye validation kyun important hai?

Agar project membership check nahi hota, toh:

- Tasks unrelated users ko assign ho sakte hain.
- Project ownership aur membership rules inconsistent ho sakte hain.
- Users ko aise tasks mil sakte hain jinse unka project-level relationship nahi hai.

Isliye humne assignment se pehle assignee ki project membership validate ki.

**Important distinction:** Organization membership aur project membership ek hi cheez nahi hain.

Koi user organization ka member ho sakta hai, lekin specific project ka member na ho.

---

## 10. Assignment aur unassignment ka difference

Day 4 mein humne assignment ke saath explicit unassignment bhi support ki.

### Case A: Task assign karna

Suppose:

```text
Task: Implement authentication
Current assignee: null
New assignee: Ahmad
```

Request mein Ahmad ki ID dene par task Ahmad ko assign ho jata hai.

Expected state:

```text
Before:
assigneeId = null

After:
assigneeId = Ahmad's ID
```

### Case B: Existing assignee change karna

Suppose:

```text
Task: Implement authentication
Current assignee: Ahmad
New assignee: Sara
```

Successful assignment ke baad:

```text
Before:
assigneeId = Ahmad's ID

After:
assigneeId = Sara's ID
```

### Case C: Task unassign karna

Suppose:

```text
Task: Implement authentication
Current assignee: Ahmad
```

Request mein explicitly:

```text
assigneeId: null
```

dene par task unassign ho jata hai.

Expected state:

```text
Before:
assigneeId = Ahmad's ID

After:
assigneeId = null
```

### Case D: `assigneeId` omit karna

Ye valid unassignment nahi hai.

Agar client `assigneeId` provide hi nahi karta, toh service request reject karti hai.

Error message:

```text
Provide assigneeId or null to unassign the task
```

Is message ko error formatter mein status `400` se map kiya gaya.

### `null` aur omitted field alag kyun hain?

GraphQL APIs mein ye distinction bahut useful hai.

| Input behaviour | Meaning |
|---|---|
| Valid user ID | Us user ko assign karo |
| Explicit `null` | Task unassign karo |
| Field omitted | Is operation ke liye invalid input |

Agar omitted field ko automatically `null` treat kar dete, toh accidental unassignment ka risk ho sakta tha.

**API design lesson:** Explicit user intent ko implicit behaviour se distinguish karna important hai.

---

## 11. Error handling aur GraphQL error formatting

Day 4 mein assignment-related error messages ko existing GraphQL error formatting system mein integrate kiya gaya.

Files:

```text
src/common/graphql/format-error.ts
src/common/graphql/format-error.spec.ts
```

Humne formatter mein do public error messages ki status mappings add ki:

| Error message | Mapped status |
|---|---:|
| `Only admins and managers can assign tasks` | 403 |
| `Provide assigneeId or null to unassign the task` | 400 |

### 400 aur 403 mein difference

**400 — Bad Request**

Request mein required input missing ya invalid hai.

Example:

```text
assigneeId omitted
       |
       v
400 Bad Request
```

**403 — Forbidden**

Request karne wale user ko operation perform karne ki permission nahi hai.

Example:

```text
Employee tries to assign task
       |
       v
403 Forbidden
```

### Error formatter ka role

GraphQL error formatter ka purpose hai errors ko client ke liye consistent aur safe format mein return karna.

Unexpected internal errors mein sensitive implementation details expose nahi karni chahiye.

Assignment feature mein existing error-formatting conventions ko follow kiya gaya, instead of creating a separate error-handling mechanism.

---

## 12. Testing strategy

Day 4 ke tests primarily is file mein add kiye gaye:

```text
src/tasks/tasks.service.spec.ts
```

Assignment-related tests ka purpose tha successful behaviour ke saath invalid scenarios ko bhi verify karna.

### Important test cases

| Test scenario | Expected result |
|---|---|
| ADMIN assignment karta hai | Allowed |
| MANAGER assignment karta hai | Allowed |
| EMPLOYEE assignment karta hai | Rejected |
| Task current organization ka nahi hai | Access reject |
| Assignee project member hai | Assignment allowed, other checks pass hone par |
| Assignee project member nahi hai | Assignment reject |
| Project archived hai | Assignment reject |
| `assigneeId: null` diya hai | Unassignment |
| `assigneeId` omit kiya hai | Validation error |

Ye table intended behaviour summarize karti hai; ye har test ka exact test-name ya assertion text nahi hai.

### Unit tests kyun important hain?

Maan lo happy path ka test sirf itna verify karta hai:

```text
ADMIN → Assign task → Success
```

Isse humein pata chalta hai ki basic flow work karta hai.

Lekin isse ye prove nahi hota ki:

- Employee assignment nahi kar sakta.
- Cross-organization access blocked hai.
- Archived project protected hai.
- Non-member ko task assign nahi kiya ja sakta.
- Omitted input accidentally unassign nahi karta.

Isliye negative test cases bhi important hain.

### Tests mein kya verify karna chahiye?

Business logic ke tests mein generally ye verify karna useful hai:

1. Operation successful hua ya reject hua.
2. Expected error message mila.
3. Invalid operation mein database update nahi hua.
4. Correct assignee persist hua.
5. Unassignment mein assignee `null` hua.

Ye general testing checklist hai; exact assertions committed test file mein dekh sakte ho.

---

## 13. Test suite aur TypeScript verification

Day 4 ke end par humne project ki verification ki.

### TypeScript check

Command:

```bash
pnpm exec tsc --noEmit
```

**Result:** Command successful hui, bina TypeScript errors ke.

`--noEmit` ka matlab hai TypeScript compiler type-check karega, lekin generated JavaScript files emit nahi karega.

### Full test suite

Final recorded result:

```text
Test Files: 20 passed (20)
Tests:      378 passed (378)
```

Matlab:

- 20 test files pass hui.
- 378 tests pass hue.
- Koi test fail nahi hua.

Ye result us waqt ke codebase ka tha jab full suite execute ki gayi thi.

### Informational warnings

Testing ke dauran `vite-tsconfig-paths` warning aur suppressed GraphQL error details ki security logging bhi dikh rahi thi.

Recorded run mein ye warnings test failures nahi thi.

---

## 14. Day 4 mein Git aur GitHub workflow

Implementation ke baad humne changes commit kiye aur whitespace clean-up bhi kiya.

### First commit

```text
bab1960
feat(tasks): add task assignment mutation
```

Is commit mein assignment implementation, DTO, resolver, service changes, tests, error formatter changes aur Day 3 notes include the.

### Second commit

```text
6499e6f
style(tasks): remove trailing whitespace
```

Is commit mein `tasks.service.ts` se trailing whitespace clean ki gayi.

### Trailing whitespace kya hoti hai?

Example:

```ts
const taskId = input.taskId;    
```

Semicolon ke baad extra spaces hain.

Clean version:

```ts
const taskId = input.taskId;
```

Trailing whitespace generally program ke behaviour ko affect nahi karti, lekin:

- Code diff noisy ho sakta hai.
- `git diff --check` warnings de sakta hai.
- Code review mein unnecessary changes dikhte hain.

Humne cleanup ke baad separate style commit banaya.

Dono commits ko tumne successfully push kar diya.

---

## 15. Important concepts for revision

### A. Authentication vs Authorization

**Authentication:** User kaun hai?

**Authorization:** Kya user ko ye operation karne ki permission hai?

TaskForge example:

```text
Authentication:
Current user = Ahmad

Authorization:
Ahmad ka role ADMIN hai?
       |
       v
Task assign karne ki permission?
```

Authentication ke bina user ki identity establish nahi hoti. Authorization ke bina server decide nahi kar sakta ki user ko particular operation perform karne dena chahiye ya nahi.

### B. Multi-tenancy

Multi-tenancy ka matlab ek application multiple organizations ko serve karti hai, while unke resources ko logically separate rakhti hai.

TaskForge mein organization-scoped lookup isi boundary ko enforce karne ka part hai.

### C. RBAC

RBAC ka full form hai **Role-Based Access Control**.

Permissions user ke assigned role ke basis par control hoti hain.

Day 4 ka example:

```text
ADMIN    → Assignment allowed
MANAGER  → Assignment allowed
EMPLOYEE → Assignment denied
```

### D. Business invariants

Business invariant aisa rule hai jo application ke valid state ko define karta hai.

Day 4 ke examples:

- Task sirf permitted user assign kar sakta hai.
- Assignee project ka member hona chahiye.
- Archived project par assignment nahi ho sakta.
- Explicit `null` unassignment hai.
- Omitted `assigneeId` valid unassignment nahi hai.

Invariants ko enforce karna service layer ki important responsibility hai.

### E. Single Responsibility Principle

Resolver aur service ke separate responsibilities rakhne se code easier to test aur maintain hota hai.

```text
Resolver → API boundary
Service  → Business logic
DTO      → Input contract
Tests    → Behaviour verification
```

Ye separation future mein features add karne mein help karega.

---

## 16. Interview questions with answers

### Q1. Dedicated `assignTask` mutation kyun banayi?

**Answer:** Assignment ek specific business operation hai jiske apne authorization aur validation rules hain. Dedicated mutation se operation ka intent clear hota hai aur assignment-specific business logic ko maintain karna easier hota hai.

### Q2. Kya frontend par assignment button hide karna sufficient hai?

**Answer:** Nahi. Frontend controls ko bypass karke direct GraphQL requests bheji ja sakti hain. Authorization backend par enforce honi chahiye.

### Q3. Organization membership aur project membership mein kya difference hai?

**Answer:** Organization membership user ka organization ke saath relationship establish karti hai. Project membership batati hai ki user particular project ka member hai. Organization member hona automatically har project ka member hona nahi hai.

### Q4. Archived project par assignment kyun block kiya?

**Answer:** TaskForge ka archived-project rule project ko read-only behaviour deta hai. Assignment task ko modify karta hai, isliye archived project par assignment reject hota hai.

### Q5. `assigneeId: null` aur omitted `assigneeId` mein kya difference hai?

**Answer:** Explicit `null` unassignment intent represent karta hai. Omitted field required input provide na karne ko represent karta hai, aur Day 4 ke rules ke according is case mein validation error return hota hai.

### Q6. `403` aur `400` mein kya difference hai?

**Answer:** `400` request input ki problem ko represent karta hai. `403` operation perform karne ki permission na hone ko represent karta hai.

### Q7. Service layer mein validation kyun karte hain?

**Answer:** Service layer business logic aur resource access rules enforce karti hai. Isse business rules resolver ya frontend par depend nahi karte aur unhe unit tests ke through verify karna easier hota hai.

### Q8. Negative test cases kyun important hain?

**Answer:** Happy-path test sirf successful behaviour verify karta hai. Negative tests unauthorized access, invalid membership, archived resources aur malformed inputs jaise cases mein expected protection verify karte hain.

### Q9. `tsc --noEmit` kya karta hai?

**Answer:** TypeScript compiler types aur compile-time errors check karta hai, lekin generated output files create nahi karta.

### Q10. 378 passing tests ka kya meaning hai?

**Answer:** Recorded test run mein 378 tests successful hue. Ye tested behaviour ke liye confidence provide karta hai, lekin iska matlab ye nahi ki har possible production scenario automatically covered hai.

---

## 17. Day 4 ka final summary

Day 4 mein humne TaskForge ke task assignment workflow ko implement aur verify kiya.

**Implemented functionality:**
- Dedicated `assignTask` mutation.
- ADMIN/MANAGER authorization.
- Organization-scoped task lookup.
- Assignee project membership validation.
- Archived-project assignment protection.
- Explicit unassignment support.
- Omitted input validation.
- GraphQL error formatter integration.
- Assignment-related tests.

**Verification:**
- TypeScript check successful.
- Full suite: 378/378 tests passed.
- Trailing whitespace clean-up complete.
- Implementation aur style commits create kiye gaye.
- Commits GitHub par push kar diye gaye.

**Day 4 status: COMPLETE ✅**


