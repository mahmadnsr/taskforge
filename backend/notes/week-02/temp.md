Bhai ❤️ ab teri confusion ko permanently clear karte hain. Tujhe bas **3 cheezein samajhni hain: `query`, `mutation` aur ye 2 headers kab use karne hain.**

## 1. Pehle samajh: Query aur Mutation ka meaning kya hai?

GraphQL mein server se baat karne ke liye commonly do operations use hote hain.

### 🔹 Query = Data read karna

Jab database se data **fetch/read** karna ho, tab `query` use karte hain.

Maan le TaskForge mein kisi organization ke tasks dekhne hain:

```graphql
query {
  myTasks {
    id
    title
    status
  }
}
```

Iska meaning:

> Bhai, mujhe tasks ka data do. Har task ki `id`, `title` aur `status` return karna.

Database mein koi change nahi karna. Sirf data read karna hai.

**Examples:**
- User ki profile dekhna
- Tasks ki list fetch karna
- Kisi organization ki details dekhna
- Task ki details fetch karna

### 🔹 Mutation = Data change karna

Jab database mein data create, update ya delete karna ho, tab `mutation` use karte hain.

**Example 1: Task create karna**

```graphql
mutation {
  createTask(input: {
    title: "Complete GraphQL"
  }) {
    id
    title
  }
}
```

Meaning:

> Bhai, database mein ek naya task create karo aur uski `id` aur `title` return karo.

**Example 2: Task update karna**

```graphql
mutation {
  deleteTask(id: "task_101") {
    id
    title
  }
}
```

Naam `deleteTask` hai, isliye task delete karne ka operation hai. Ye mutation hai.

Ek important baat: mutation ka matlab hamesha database mein change hona nahi hai. Iska use server par aise operations ke liye bhi ho sakta hai jo data change karte hain ya koi action perform karte hain. Aur technically, query resolver ko bhi side effects ke liye use kiya ja sakta hai, lekin aisa karna GraphQL conventions ke against hai.

**Yaad rakhne ka shortcut:**

| Kaam | Operation |
|---|---|
| Data read karna | `query` |
| Data create karna | `mutation` |
| Data update karna | `mutation` |
| Data delete karna | `mutation` |

---

## 2. Ab tere main confusion par aate hain: Ye dono headers kab use honge?

Tere paas ye headers hain:

```json
{
  "Authorization": "Bearer YOUR_ACCESS_TOKEN",
  "x-organization-id": "5cb6f8e6-f915-4715-9094-da37626b2d72"
}
```

Bhai, inko alag-alag samajh.

### Header 1: `Authorization`

```json
"Authorization": "Bearer YOUR_ACCESS_TOKEN"
```

Iska purpose hai authenticated user ki identity establish karna.

Maan le tu TaskForge mein login kar chuki hai aur tere paas access token hai.

Ab tu apne tasks dekhna chahti hai:

```graphql
query {
  myTasks {
    id
    title
  }
}
```

Agar `myTasks` authenticated operation hai, toh request ke saath `Authorization` header bhejegi.

Kyun?

Kyunki server ko pata hona chahiye ki **kis user ke tasks return karne hain**.

### Header 2: `x-organization-id`

```json
"x-organization-id": "5cb6f8e6-f915-4715-9094-da37626b2d72"
```

Iska purpose tumhare backend ke implementation par depend karta hai. Aam taur par aisa custom header server ko batata hai ki request kis organization ke context mein process karni hai.

Maan le tu in teen organizations ki member hai:

```text
User
 ├── Organization A
 ├── Organization B
 └── Organization C
```

Ab tu Organization B ke tasks dekhna chahti hai.

Request mein Organization B ki ID bheji ja sakti hai:

```json
"x-organization-id": "ORGANIZATION_B_ID"
```

Isse server ko organization context milta hai.

Lekin dhyan de: **organization ID bhejne se membership prove nahi hoti.** Backend ko check karna chahiye ki authenticated user ko us organization ka data access karne ki permission hai.

---

## 3. Sabse important: Kab dono headers ek saath use honge?

Is rule ko yaad rakh:

- `Authorization` tab bhejo jab operation ko authenticated user ki identity chahiye.
- `x-organization-id` tab bhejo jab tumhare backend ke according operation ko organization context chahiye.
- Jab operation ko dono chahiye, tab dono headers bhejo.

### Case A: Public data — Dono nahi

Maan le API ka welcome message public hai:

```graphql
query {
  hello
}
```

Agar server ne ise public rakha hai aur organization context bhi required nahi hai, toh dono headers ki zaroorat nahi.

### Case B: Authentication required, organization context nahi

Maan le user apni personal profile dekhna chahti hai:

```graphql
query {
  me {
    id
    name
    email
  }
}
```

Agar `me` operation ko sirf authenticated user ki identity chahiye, toh:

```json
{
  "Authorization": "Bearer YOUR_ACCESS_TOKEN"
}
```

Yahan `x-organization-id` ki zaroorat nahi, **agar backend ne ise required nahi banaya hai**.

### Case C: Organization context required, authentication nahi

Kisi public organization ki public details fetch karni hain:

```graphql
query {
  publicOrganization {
    name
  }
}
```

Agar tumhara backend public organization context ke liye `x-organization-id` require karta hai, lekin authentication required nahi hai, toh sirf organization header use ho sakta hai.

Ye ek possible design hai, universal rule nahi.

### Case D: Authentication aur organization context dono required

Maan le tu Organization B ke tasks fetch karna chahti hai:

```graphql
query {
  organizationTasks {
    id
    title
    status
  }
}
```

Agar tumhare backend mein `organizationTasks` authenticated user aur selected organization dono require karta hai, toh:

```json
{
  "Authorization": "Bearer YOUR_ACCESS_TOKEN",
  "x-organization-id": "ORGANIZATION_B_ID"
}
```

Server:
1. Token verify karega.
2. User ki identity establish karega.
3. Organization context identify karega.
4. Membership aur permissions check karega.
5. Allowed tasks return karega.

---

## 4. Tere liye ek simple decision table

| Situation | Authorization | `x-organization-id` |
|---|---|---|
| Public welcome message | Usually nahi | Usually nahi |
| Apni profile fetch karna | Haan, agar protected hai | Sirf agar required ho |
| Apne personal tasks fetch karna | Haan, agar protected hai | Sirf agar organization context required ho |
| Organization ke tasks fetch karna | Usually haan | Agar backend organization context header se leta hai |
| Organization mein task create karna | Usually haan | Agar operation ko organization context chahiye |
| Organization ke task ko update/delete karna | Usually haan | Agar backend organization context require karta hai |

**Bhai, ek baat yaad rakh:** `x-organization-id` GraphQL ka standard header nahi hai. Ye tumhare backend ka custom header hai. Isliye exact decision lene ke liye us operation ke resolver, guards aur organization-context implementation ko dekhna pad sakta hai.

---

## 5. Ab final trick: Request banate waqt ye 2 questions poochna

**Question 1:** Kya server ko authenticated user ki identity chahiye?

- Haan → `Authorization` bhejo.
- Nahi → Agar operation public hai, toh shayad nahi.

**Question 2:** Kya server ko selected organization ka context chahiye?

- Haan → `x-organization-id` bhejo, agar tumhara backend isi header se context leta hai.
- Nahi → Is header ki zaroorat nahi.

Dono ka answer **haan** hai toh dono headers bhejo.

Aur agar GraphQL operation ko dynamic input bhi chahiye, toh variables alag se bhej sakti ho.

### Ek example mein teeno

**Query:**

```graphql
query GetTask($taskId: ID!) {
  task(id: $taskId) {
    id
    title
    status
  }
}
```

**Variables:**

```json
{
  "taskId": "task_101"
}
```

**Headers:**

```json
{
  "Authorization": "Bearer YOUR_ACCESS_TOKEN",
  "x-organization-id": "ORGANIZATION_B_ID"
}
```

Ismein:

- `query` → Data read karna hai.
- `taskId` → Kaunsa task chahiye.
- `Authorization` → Kis user ki request hai.
- `x-organization-id` → Kis organization ke context mein task access karna hai.

**Bas bhai, ab 4 cheezein alag-alag yaad rakh:**

`query` = Read, `mutation` = Change/action, `Authorization` = User identity, `x-organization-id` = Organization context.