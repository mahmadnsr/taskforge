# TaskForge — Week 5: Notifications

## 1. Week 5 ka objective

Week 5 mein TaskForge backend ke liye **in-app notification system** implement aur manually verify kiya gaya.

Notifications ka purpose users ko organization ke andar tasks se related important activities ke baare mein inform karna hai.

Examples:
- Kisi user ko task assign hua.
- Kisi task par comment add hua.
- Kisi task ka status change hua.
- User apni notifications dekh sakta hai.
- User ek notification ya saari notifications read mark kar sakta hai.
- User apni unread notifications ka count check kar sakta hai.

### Week 5 ke learning objectives

Is week ke baad tumhe samajh aana chahiye:

1. Backend events se notifications kaise generate hote hain.
2. Notification recipients kaise select hote hain.
3. GraphQL mutations aur queries se notifications kaise access hote hain.
4. Unread count kaise track hota hai.
5. Single notification aur bulk notifications ko read kaise mark karte hain.
6. Multi-tenant application mein organization-scoped access kyon zaroori hai.
7. Notification-related functionality ko manually kaise verify karte hain.

---

## 2. Notification system ka architecture

TaskForge ka existing stack:

| Component | Technology |
|---|---|
| Backend framework | NestJS |
| API | GraphQL |
| GraphQL implementation | Apollo |
| ORM | Prisma 6 |
| Database | PostgreSQL |
| Database hosting | Neon |
| Package manager | pnpm |
| Testing framework | Vitest |

Notifications ke liye high-level flow:

```text
User performs an action
          |
          v
GraphQL Mutation
          |
          v
NestJS Resolver
          |
          v
Service validates the operation
          |
          v
Business action succeeds
          |
          v
Notification is created
          |
          v
Notification is stored in PostgreSQL
          |
          v
Recipient queries notifications
          |
          v
User reads the notification
```

For example:

```text
Admin assigns a task to Member
             |
             v
assignTask mutation
             |
             v
Assignment is processed
             |
             v
TASK_ASSIGNED notification
             |
             v
Notification saved for Member
             |
             v
Member queries myNotifications
```

**Important:** Notification ek in-app record hai. Is week ke verified operations se email, SMS, push notifications, ya real-time WebSocket delivery establish nahi hoti.

---

## 3. Notification types

TaskForge mein is week teen notification types manually verify kiye gaye.

### 3.1 TASK_ASSIGNED

Ye notification tab generate hota hai jab kisi user ko task assign kiya jata hai.

**Trigger:** Task assignment.

**Recipient:** Naya assignee, jab assignment karne wala user aur assignee alag hon.

Example:

```text
Admin assigns a task to Member
                 |
                 v
Member receives TASK_ASSIGNED
```

Verified notification:

```json
{
  "type": "TASK_ASSIGNED",
  "message": "You have been assigned to task: Verify Week 5 Notifications",
  "readAt": null
}
```

Iska matlab:
- Notification successfully create hua.
- Recipient ko task assignment ki information mili.
- `readAt: null` ka matlab notification abhi read mark nahi hua tha.

### 3.2 TASK_COMMENTED

Ye notification task par comment add hone ke baad generate hota hai, jab task ka assignee commenter se alag ho.

**Trigger:** Task comment creation.

**Recipient:** Task ka assignee.

Example:

```text
Admin adds a comment to the task
                 |
                 v
Task has an assignee
                 |
                 v
Commenter differs from assignee
                 |
                 v
Assignee receives TASK_COMMENTED
```

Verified notification:

```json
{
  "type": "TASK_COMMENTED",
  "message": "New comment on task: Verify Week 5 Notifications",
  "readAt": null
}
```

Ye notification user ko task par hone wali discussion ke baare mein inform karta hai.

### 3.3 TASK_STATUS_CHANGED

Ye notification tab generate hota hai jab task ka status successfully change hota hai aur actor task creator se alag hota hai.

**Trigger:** Successful task status change.

**Recipient:** Task creator.

Verified notification:

```json
{
  "type": "TASK_STATUS_CHANGED",
  "message": "Task \"Verify Week 5 Notifications\" status changed to IN_REVIEW",
  "readAt": null
}
```

Is week task ka status successfully change hua:

```text
IN_PROGRESS → IN_REVIEW
```

Admin task creator tha aur member ne status change kiya. Isliye admin ko status-change notification mila.

---

## 4. Notification creation aur business logic

Notification system ka ek important design principle hai:

**Notification tabhi create hona chahiye jab corresponding business action successful ho.**

For example, task assignment ka flow:

```text
assignTask
    |
    v
Validate assignment
    |
    v
Process assignment
    |
    v
Create notification for new assignee
```

Isi tarah, status change mein invalid transition ko reject kiya jata hai. Rejected operation ko successful status change ki tarah treat nahi karna chahiye.

TaskForge ke status-change service code mein notification creation aur task update ke beech transaction ka use bhi dekha gaya. Isse related database operations ko ek transaction mein coordinate kiya ja sakta hai.

### Transaction ka benefit

Maan lo task update ho gaya lekin notification create karte waqt database error aa gaya.

Agar dono operations ek hi transaction mein correctly execute kiye gaye hain, to transaction failure par partial database changes commit hone se bach sakte hain.

Conceptually:

```text
BEGIN TRANSACTION
        |
        v
Update task status
        |
        v
Create notification
        |
        v
COMMIT
```

Agar transaction fail ho:

```text
Transaction failure
        |
        v
ROLLBACK
```

Transaction ka exact behaviour Prisma transaction ke andar execute hone wale operations aur error handling par depend karta hai.

---

## 5. Notification data aur unread tracking

Notification response mein manually verify kiye gaye important fields:

| Field | Meaning |
|---|---|
| `id` | Notification ka unique identifier |
| `type` | Notification category |
| `message` | User ko dikhaya jane wala message |
| `readAt` | Notification kab read mark hua |
| `organizationId` | Notification kis organization se related hai |

### `readAt` ka role

Unread notification:

```json
{
  "id": "notification-id",
  "type": "TASK_ASSIGNED",
  "readAt": null
}
```

Read notification:

```json
{
  "id": "notification-id",
  "type": "TASK_ASSIGNED",
  "readAt": "2026-10-22T10:10:46.841Z"
}
```

Yahan timestamp sirf example hai; actual verification mein read operations ne ISO-format timestamps return kiye.

Basic interpretation:

```text
readAt = null
     |
     v
Notification is unread

readAt = timestamp
     |
     v
Notification has been marked as read
```

`readAt` ek timestamp hai, boolean field nahi. Isse notification read hone ka time bhi record kiya ja sakta hai.

---

## 6. GraphQL operations

Week 5 mein notifications ke liye ye operations manually use kiye gaye.

### 6.1 `myNotifications`

Purpose: Organization ke context mein current user ki notifications retrieve karna.

Example query:

```graphql
query {
  myNotifications(
    input: {
      organizationId: "YOUR_ORGANIZATION_ID"
      first: 20
    }
  ) {
    items {
      id
      type
      message
      readAt
    }
    hasMore
  }
}
```

Important details:

- `organizationId` organization specify karta hai.
- `first` pagination input mein requested page size specify karta hai.
- `items` notification records return karta hai.
- `hasMore` batata hai ki aur results available hain ya nahi.

**Important:** Is input mein `first` use hua tha, `limit` nahi.

### 6.2 `unreadNotificationCount`

Purpose: Current user ke organization-scoped unread notifications ki count retrieve karna.

Example:

```graphql
query {
  unreadNotificationCount(
    organizationId: "YOUR_ORGANIZATION_ID"
  )
}
```

Expected response structure:

```json
{
  "data": {
    "unreadNotificationCount": 2
  }
}
```

Yahan `2` sirf example hai.

Ye count frontend par notification badge dikhane ke liye useful hai:

```text
Notifications 🔔  2
```

### 6.3 `markNotificationAsRead`

Purpose: Ek specific notification ko read mark karna.

Example:

```graphql
mutation($input: MarkNotificationReadInput!) {
  markNotificationAsRead(input: $input) {
    id
    readAt
  }
}
```

Input:

```json
{
  "input": {
    "organizationId": "YOUR_ORGANIZATION_ID",
    "notificationId": "YOUR_NOTIFICATION_ID"
  }
}
```

Actual operation mein dono required UUID fields use hue:

- `organizationId`
- `notificationId`

Successful operation notification ID aur `readAt` timestamp return karta hai.

### 6.4 `markAllNotificationsAsRead`

Purpose: Organization ke context mein current user ki unread notifications ko read mark karna.

Example:

```graphql
mutation($input: MarkAllNotificationsReadInput!) {
  markAllNotificationsAsRead(input: $input)
}
```

Input:

```json
{
  "input": {
    "organizationId": "YOUR_ORGANIZATION_ID"
  }
}
```

Is mutation ka return type **`Int!`** hai.

Successful example:

```json
{
  "data": {
    "markAllNotificationsAsRead": 1
  }
}
```

Yahan `1` ka matlab operation ne ek notification mark kiya.

### GraphQL selection-set mistake

Verification ke dauran pehle ye query use hui thi:

```graphql
mutation($input: MarkAllNotificationsReadInput!) {
  markAllNotificationsAsRead(input: $input) {
    count
  }
}
```

GraphQL ne error diya:

```text
Field "markAllNotificationsAsRead" must not have a selection
since type "Int!" has no subfields.
```

**Reason:** `count` tab select kiya ja sakta hai jab mutation kisi object ko return karti ho. Lekin yahan mutation directly integer return karti hai.

Correct form:

```graphql
mutation($input: MarkAllNotificationsReadInput!) {
  markAllNotificationsAsRead(input: $input)
}
```

**Learning:** GraphQL mein scalar return types—jaise `Int`, `String`, aur `Boolean`—ke saath nested field selection nahi hoti.

---

## 7. Multi-tenant security

TaskForge multi-tenant application hai. Ek user multiple organizations ka member ho sakta hai, aur har organization ka data logically separate rehna chahiye.

Notifications ke liye iska matlab hai ki API ko sirf `organizationId` receive karke notification access allow nahi karna chahiye. Server ko authenticated user aur organization membership/authorization verify karna zaroori hai.

Conceptually:

```text
Authenticated user
        |
        v
Requested organization
        |
        v
Validate membership and authorization
        |
        v
Return permitted notification records
```

Notification ID aur organization ID ko input mein dena apne aap authorization guarantee nahi karta. Server-side authorization checks essential hain.

### Security checklist

- Current user ki identity authenticated context se aani chahiye.
- Organization access server-side validate hona chahiye.
- User sirf authorized notifications read ya modify kar sake.
- Single-read operation mein notification ko organization aur authorized recipient ke context mein validate karna chahiye.
- Bulk-read operation mein doosre users ki notifications affect nahi honi chahiye.
- Unread count current user ke permitted data ko reflect karna chahiye.

Ye multi-tenant security ke design requirements hain. Is week ke manual results notification flows ko verify karte hain; har possible cross-tenant authorization attack ka complete security audit nahi.

---

## 8. Actual manual verification results

Week 5 verification ke liye test organization mein ek admin, ek member, ek project aur ek task use kiya gaya.

Task:

```text
Verify Week 5 Notifications
```

### Test 1: Task assignment

Admin ne task member ko assign kiya.

Mutation:

```graphql
mutation($input: AssignTaskInput!) {
  assignTask(input: $input) {
    id
    title
    assigneeId
  }
}
```

**Result:** PASS

- Task assignment successful hua.
- Member ko `TASK_ASSIGNED` notification mila.
- Notification initially unread tha.
- Member ka unread count `1` tha.

### Test 2: Task comment

Admin ne task par comment add kiya.

Comment:

```text
Week 5 notification verification
```

**Result:** PASS

- Comment create hua.
- Assignee ko `TASK_COMMENTED` notification mila.
- Notification initially unread tha.

### Test 3: Task status change

Member ne pehle task ko directly `DONE` karne ki koshish ki.

**Result:** Expected rejection

```text
Invalid task status transition
```

Iske baad valid transition use kiya:

```text
IN_PROGRESS → IN_REVIEW
```

**Result:** PASS

- Task status `IN_REVIEW` ho gaya.
- Admin ko `TASK_STATUS_CHANGED` notification mila.
- Admin ka unread count `1` tha.

Ye ek useful verification tha: status-change notification valid status transition ke baad create hua.

### Test 4: Single notification read

Admin ne status-change notification ko read mark kiya.

**Result:** PASS

Response mein notification ID aur non-null `readAt` timestamp return hua.

Member ne bhi apni comment notification ko read mark kiya.

**Result:** PASS

Response mein notification ID aur non-null `readAt` timestamp return hua.

### Test 5: Mark all notifications as read

Member ki unread count pehle `1` thi.

Mutation response:

```json
{
  "data": {
    "markAllNotificationsAsRead": 1
  }
}
```

Uske baad unread count query:

```json
{
  "data": {
    "unreadNotificationCount": 0
  }
}
```

**Result:** PASS

Bulk-read operation ne ek unread notification process kiya aur final unread count `0` ho gaya.

### Final verification table

| Feature | Result |
|---|---|
| Task assignment notification | PASS |
| Task comment notification | PASS |
| Task status-change notification | PASS |
| Single notification read — admin | PASS |
| Single notification read — member | PASS |
| Mark all notifications as read | PASS |
| Member unread count after bulk read | `0` |
| Admin unread count after single read | `0` |

**Scope note:** Ye results is test scenario ke manual verification results hain. Automated test suite, lint aur build pehle pass hue the; Week 5 ke is final manual session mein unhe dobara run nahi kiya gaya.

---

## 9. Errors aur troubleshooting

### Error 1: Invalid task status transition

```text
Invalid task status transition
```

**Reason:** Requested status current status se directly reachable nahi tha.

**Solution:** Existing transition rules ke according valid next status select karo.

Test ke liye:

```text
IN_PROGRESS → IN_REVIEW
```

successful raha.

### Error 2: GraphQL selection-set error

```text
must not have a selection since type "Int!" has no subfields
```

**Reason:** Integer return karne wali mutation ke response par nested field select kiya gaya.

**Solution:**

```graphql
markAllNotificationsAsRead(input: $input)
```

Scalar return type ke liye `. { count }` mat use karo.

### Error 3: Unread count expected value se different

Possible reasons:

- Kuch notifications abhi read mark nahi hue.
- Single-read operation ne sirf ek notification process kiya.
- User ya organization context different hai.
- Notification query aur unread count query different context use kar rahi hain.

Troubleshooting ke liye pehle current user's notification list aur uske `readAt` values check karo; phir unread count query verify karo.

---

## 10. Important backend concepts learned

### A. Event-driven business logic

Task assignment, comments aur status changes notification generation ko trigger karte hain.

Yahan event-driven ka matlab business action ke response mein notification create karna hai; iska matlab automatically separate message broker ya asynchronous event queue use hona nahi hai.

### B. Separation of concerns

Task service task-related business logic handle karta hai, jabki notification service notification creation aur notification-related logic handle karne ke liye use ho sakta hai.

Is separation se future mein notification channels ya additional notification types add karna easier ho sakta hai.

### C. Database transactions

Task update aur notification creation jaise related database operations ko transaction mein coordinate karne se consistency improve hoti hai.

### D. Pagination

Notification lists potentially grow kar sakti hain. `first` aur `hasMore` jaise fields large lists ko manageable chunks mein retrieve karne mein help karte hain.

### E. Read state

`readAt` notification ki read state aur timestamp record karta hai. Iske basis par unread count aur notification badge maintain kiye ja sakte hain.

### F. GraphQL type system

GraphQL query aur mutation likhte waqt return type samajhna zaroori hai:

- Object return ho: fields select kar sakte ho.
- Scalar return ho: value directly return hoti hai.

### G. Manual integration testing

Ek successful unit test sirf isolated logic verify karta hai. Manual integration verification mein actual API requests, authentication, database state aur multiple users ke interactions bhi test kiye ja sakte hain.

---

## 11. Future improvements — abhi implemented assume mat karna

Week 5 ke verified scope se alag, future mein in features ko evaluate kiya ja sakta hai:

1. Real-time notifications using WebSockets or subscriptions.
2. Email ya push notification delivery.
3. Notification preferences.
4. Notification retention aur cleanup policy.
5. Additional notification types.
6. Frontend notification badge aur dropdown.
7. Dedicated authorization tests for cross-organization access.
8. Duplicate notification prevention aur idempotency checks.
9. Pagination ke saath large notification lists ki performance testing.

Ye future ideas hain, Week 5 mein completed features nahi.

---

## 12. Week 5 completion checklist

- [x] Task assignment notification verify kiya.
- [x] Task comment notification verify kiya.
- [x] Task status-change notification verify kiya.
- [x] Invalid status transition ka expected rejection verify kiya.
- [x] Admin ki single notification read operation verify ki.
- [x] Member ki single notification read operation verify ki.
- [x] Bulk notification read operation verify ki.
- [x] Final unread counts verify kiye.
- [x] GraphQL scalar selection-set error identify aur correct kiya.

## Final takeaway

**Week 5 ka main achievement:** TaskForge mein teen core notification triggers aur single/bulk read operations ko real GraphQL API ke through manually verify kiya gaya.

Sabse important concepts hain:

1. Business action ke baad notification generate karna.
2. Correct recipient select karna.
3. `readAt` se notification read state track karna.
4. Unread count expose karna.
5. GraphQL return types correctly handle karna.
6. Multi-tenant authorization ko notification access ke saath enforce karna.

**Week 5 status: Manual verification complete.** Automated suite, lint aur build ke liye pehle ke successful results available hain; unka is final session mein fresh rerun nahi hua.