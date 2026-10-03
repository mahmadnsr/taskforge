# 📘 Day 3 — Database Schema Design — Auth Foundation

> **Project:** TaskForge  
> **Goal:** Authentication aur multi-tenant authorization ke liye database foundation design karna.
>
> **Main entities:** `User`, `Organization`, `OrganizationMember`, `RefreshToken`
>
> **Next:** Registration, Login, Password Hashing, JWT aur RBAC.

---

# 🗺️ 0. What Are We Building?

Day 2 me humne:

```text
NestJS
   ↓
Prisma
   ↓
Neon PostgreSQL
```

connection establish kiya tha.

Day 3 me actual database structure design karna hai.

High-level structure:

```text
                    ┌────────────────┐
                    │     User       │
                    └───────┬────────┘
                            │
                            │
                    ┌───────▼────────────┐
                    │ OrganizationMember │
                    │                    │
                    │ role               │
                    └───────┬────────────┘
                            │
                            │
                    ┌───────▼────────────┐
                    │   Organization     │
                    └────────────────────┘


User
 │
 └──────────────► RefreshToken
```

### Why this structure?

TaskForge ek organization/team based application hai.

Ek user:

- ek organization ka member ho sakta hai
- multiple organizations ka member ho sakta hai
- har organization me different role ho sakta hai
- multiple devices se login kar sakta hai

Isliye simple:

```text
User → Organization
```

relation enough nahi hai.

Humein membership ke liye separate model chahiye:

```text
User
  ↕
OrganizationMember
  ↕
Organization
```

---

# 1. 🧠 Database Schema Kya Hota Hai?

Database schema basically database ka **blueprint** hota hai.

Ye define karta hai:

```text
Tables
Columns
Data types
Primary keys
Foreign keys
Relationships
Constraints
Indexes
Enums
```

Example:

```text
User
 ├── id
 ├── name
 ├── email
 ├── passwordHash
 ├── createdAt
 └── updatedAt
```

Without proper schema:

```text
Application
     ↓
Random database structure
     ↓
Duplicate / inconsistent data
```

With schema:

```text
Application
     ↓
Well-defined rules
     ↓
Consistent database
```

---

# 2. 🧩 `Role` Enum

First:

```prisma
enum Role {
  ADMIN
  MANAGER
  EMPLOYEE
}
```

---

## Enum Kya Hota Hai?

**Enum = fixed set of allowed values.**

Yahan `Role` ke liye sirf:

```text
ADMIN
MANAGER
EMPLOYEE
```

allowed hain.

Conceptually:

```text
Role
 ├── ADMIN
 ├── MANAGER
 └── EMPLOYEE
```

Invalid values:

```text
OWNER ❌
SUPERADMIN ❌
random ❌
123 ❌
```

Database/schema level par allowed values restricted rehti hain.

---

# 3. 🤔 Role Ko Simple String Kyun Nahi Rakha?

Alternative:

```prisma
role String
```

Isme theoretically koi bhi string aa sakti hai:

```text
"ADMIN"
"MANAGER"
"EMPLOYEE"
"banana"
"xyz"
```

Problem:

```text
Application expects:
ADMIN / MANAGER / EMPLOYEE

Database contains:
ADMIN / EMPLOYEE / xyz
```

Enum controlled values provide karta hai.

So:

```prisma
role Role
```

is more constrained than:

```prisma
role String
```

---

# 4. 🧠 Enum Mental Model

```text
                    Role
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
        ADMIN      MANAGER    EMPLOYEE
```

Ye basically database ko bolta hai:

> "Role field ke liye isi predefined set me se value use karna."

---

# 5. 📌 Enum Declaration Order

Schema me:

```prisma
enum Role {
  ADMIN
  MANAGER
  EMPLOYEE
}
```

ko model se pehle define kiya gaya.

Then:

```prisma
model OrganizationMember {
  ...
  role Role
}
```

### Important

Tumhare original notes ke setup me enum ko pehle define kiya gaya tha because `OrganizationMember` us type ko use karta hai.

**Practical rule for these notes:**

> Type/enum ko use karne wale model se pehle declare karna clear aur readable schema organization hai.

---

# 6. 👤 `User` Model

```prisma
model User {
  id           String   @id @default(uuid())
  name         String
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  memberships   OrganizationMember[]
  refreshTokens RefreshToken[]
}
```

Ab isko field-by-field samjho.

---

# 7. 🆔 `id` — UUID Primary Key

```prisma
id String @id @default(uuid())
```

Isme 3 important parts hain:

```text
String
  +
@id
  +
@default(uuid())
```

### `String`

ID ka data type string hai.

### `@id`

Ye field table ki **primary key** hai.

### `@default(uuid())`

Agar new user create hota hai, Prisma automatically UUID generate karega.

---

# 8. 🔑 Primary Key Kya Hoti Hai?

Primary key kisi table ke record ko uniquely identify karti hai.

Example:

```text
User
--------------------------------
id              name
--------------------------------
uuid-123        Ahmad
uuid-456        Sara
uuid-789        Ali
```

Har row ka unique identifier:

```text
id
```

hai.

---

# 9. UUID Kya Hota Hai?

UUID:

> **Universally Unique Identifier**

Example format:

```text
550e8400-e29b-41d4-a716-446655440000
```

Ye random-looking unique identifier hota hai.

---

# 10. 🤔 UUID vs Auto-Increment Integer

Traditional approach:

```prisma
id Int @id @default(autoincrement())
```

IDs:

```text
1
2
3
4
5
```

UUID approach:

```prisma
id String @id @default(uuid())
```

IDs:

```text
a3f...
7bd...
91c...
```

---

## Int Autoincrement — Advantage

Simple:

```text
1
2
3
4
```

Easy to understand.

---

## Int Autoincrement — Problem

IDs sequential/predictable hote hain.

Example:

```text
/users/101
```

Someone may infer:

```text
/users/102
/users/103
/users/104
```

### Important clarification

UUID alone **authorization/security nahi provide karta**.

Agar API authorization broken hai, UUID use karne se problem automatically solve nahi hoti.

UUID ka advantage mainly:

```text
Less predictable identifiers
Distributed-system friendliness
Global uniqueness
```

hai.

---

# 11. 🌐 Distributed Systems Me UUID Useful Kyun?

Suppose do independent systems IDs generate kar rahe hain.

System A:

```text
1
2
3
```

System B:

```text
1
2
3
```

Merge karne par conflicts:

```text
1
1
2
2
3
3
```

UUIDs ka collision probability extremely low hota hai.

Conceptually:

```text
System A → UUID-A
System B → UUID-B
```

Merge easier hota hai.

---

# 12. 📌 Project-Wide ID Strategy

TaskForge me consistency ke liye UUID IDs use karenge:

```text
User
Organization
OrganizationMember
RefreshToken
Task
...
```

Example:

```prisma
id String @id @default(uuid())
```

---

# 13. 📧 `email`

```prisma
email String @unique
```

`@unique` database-level uniqueness constraint create karta hai.

Means:

```text
User 1 → ahmad@example.com
User 2 → ahmad@example.com ❌
```

Second user same unique email ke saath insert nahi ho sakta.

---

# 14. 🤔 Application Check Enough Kyun Nahi?

Suppose registration code:

```text
Check email
    ↓
Email doesn't exist
    ↓
Create user
```

Agar same time par do requests aaye:

```text
Request A ──┐
            ├── check → doesn't exist
Request B ──┘
            └── check → doesn't exist
```

Both may try to insert.

Database-level:

```prisma
@unique
```

final protection provide karta hai.

### Lesson

> Important data integrity rules ko sirf application code par depend nahi karna chahiye; database constraints bhi use karne chahiye.

---

# 15. 🔐 `passwordHash`

```prisma
passwordHash String
```

Yahan **plain password store nahi hoga**.

### ❌ Never

```text
password = "mypassword123"
```

database me directly.

### ✅ Instead

```text
User password
     ↓
Password hashing algorithm
     ↓
Password hash
     ↓
Database
```

Example algorithms:

```text
bcrypt
Argon2
```

Day 5 me actual password hashing implement hoga.

---

# 16. 🕐 `createdAt`

```prisma
createdAt DateTime @default(now())
```

Record create hote waqt timestamp automatically set hota hai.

Example:

```text
createdAt
2026-10-03 16:00:00
```

Application ko manually timestamp provide karne ki zarurat nahi.

---

# 17. 🔄 `updatedAt`

```prisma
updatedAt DateTime @updatedAt
```

Prisma is field ko record update hone par automatically update karta hai.

Example:

```text
Created:
10:00

Updated:
12:30
```

`updatedAt`:

```text
12:30
```

ho jayega.

---

# 18. 🔗 `memberships OrganizationMember[]`

```prisma
memberships OrganizationMember[]
```

Ye **actual database column nahi hai**.

Ye Prisma ka **relation field** hai.

Meaning:

> Is user se related saari `OrganizationMember` records access kar sakte hain.

Example:

```text
User: Ahmad

memberships:
 ├── Google → ADMIN
 ├── Startup → EMPLOYEE
 └── College → MANAGER
```

---

# 19. 🔗 `refreshTokens RefreshToken[]`

```prisma
refreshTokens RefreshToken[]
```

Ye bhi reverse relation field hai.

Meaning:

> Is user ke saare related refresh tokens access kar sakte hain.

Example:

```text
Ahmad
 ├── Chrome refresh token
 ├── Firefox refresh token
 └── Mobile refresh token
```

---

# 20. 🧠 User Model Mental Model

```text
User
│
├── id
├── name
├── email
├── passwordHash
├── createdAt
├── updatedAt
│
├── memberships[]
│      │
│      └── OrganizationMember
│
└── refreshTokens[]
       │
       └── RefreshToken
```

---

# 21. 🏢 `Organization` Model

```prisma
model Organization {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  members   OrganizationMember[]
}
```

Organization basically team/company/workspace ko represent karegi.

Example:

```text
Google
Acme Corp
My Startup
College Project
```

---

# 22. 🏷️ `name`

```prisma
name String
```

Human-readable display name.

Example:

```text
"Acme Corporation"
```

---

# 23. 🔗 `slug`

```prisma
slug String @unique
```

Slug URL-friendly identifier hai.

Example:

```text
Organization:
Acme Corp Pvt Ltd

Slug:
acme-corp-pvt-ltd
```

Then route:

```text
app.com/org/acme-corp-pvt-ltd
```

Instead of:

```text
app.com/org/550e8400-e29b-41d4-a716-446655440000
```

---

# 24. 🤔 UUID Already Hai, Slug Kyun?

UUID machine-friendly identifier hai.

Slug human/URL-friendly identifier hai.

```text
UUID
→ unique internal ID

Slug
→ readable URL identifier
```

Example:

```text
Internal:
7f3c...uuid

URL:
acme-corp
```

---

# 25. ⚠️ Slug Unique Kyun?

Do organizations same slug nahi rakh sakti:

```text
Organization A → acme-corp
Organization B → acme-corp ❌
```

Because:

```prisma
slug String @unique
```

database-level uniqueness enforce karta hai.

---

# 26. 🔄 Slug Generation

Registration ke time:

```text
"Acme Corp Pvt Ltd"
          ↓
lowercase
          ↓
remove/replace spaces
          ↓
"acme-corp-pvt-ltd"
```

Day 4 me utility function ke through generate karenge.

---

# 27. 🔗 `members OrganizationMember[]`

```prisma
members OrganizationMember[]
```

Again, ye actual `members` database column nahi hai.

It's Prisma's reverse relation field.

Meaning:

```text
Organization
      ↓
all membership records
```

Example:

```text
Acme Corp
 ├── Ahmad → ADMIN
 ├── Sara  → MANAGER
 └── Ali   → EMPLOYEE
```

---

# 28. 🔀 Many-to-Many Relationship

Ye Day 3 ka **most important database concept** hai.

Requirement:

> One user can belong to multiple organizations.

And:

> One organization can contain multiple users.

So:

```text
User ↔ Organization
```

is:

```text
Many-to-Many
```

---

# 29. ❌ Direct Many-to-Many Problem

Imagine:

```text
User
Organization
```

Agar direct relation banate:

```text
User ───────── Organization
```

Problem:

User ke organization membership ka:

```text
role
joinedAt
status
```

jaise extra information kahan store karenge?

---

# 30. ✅ Junction Table Solution

Create:

```text
OrganizationMember
```

Structure:

```text
User
 │
 │
 ▼
OrganizationMember
 │
 │
 ▼
Organization
```

So:

```text
User ↔ OrganizationMember ↔ Organization
```

---

# 31. 🧩 `OrganizationMember`

```prisma
model OrganizationMember {
  id             String   @id @default(uuid())
  userId         String
  organizationId String
  role           Role
  createdAt      DateTime @default(now())

  user         User         @relation(fields: [userId], references: [id])
  organization Organization @relation(fields: [organizationId], references: [id])

  @@unique([userId, organizationId])
}
```

---

# 32. 🆔 `id`

```prisma
id String @id @default(uuid())
```

Membership record ka unique ID.

---

# 33. 🔗 `userId`

```prisma
userId String
```

Ye foreign key column hai.

It stores:

```text
User.id
```

ki value.

---

# 34. 🔗 `organizationId`

```prisma
organizationId String
```

Ye:

```text
Organization.id
```

ko reference karta hai.

---

# 35. 🔐 Foreign Key Kya Hoti Hai?

Foreign key ek table ko doosre table ke record se connect karti hai.

Example:

```text
User
----------------
id
u123
u456
```

OrganizationMember:

```text
userId
------
u123
```

Means:

```text
OrganizationMember.userId
             ↓
          User.id
```

---

# 36. `@relation()` Ka Meaning

```prisma
user User @relation(
  fields: [userId],
  references: [id]
)
```

Iska meaning:

```text
OrganizationMember.userId
           │
           ▼
        User.id
```

Specifically:

```text
fields:
userId
```

means local foreign-key field.

```text
references:
id
```

means target model ka referenced field.

---

# 37. Organization Relation

```prisma
organization Organization @relation(
  fields: [organizationId],
  references: [id]
)
```

Means:

```text
OrganizationMember.organizationId
            │
            ▼
       Organization.id
```

---

# 38. 🎭 `role Role`

```prisma
role Role
```

Ye membership-specific role hai.

**Very important: role user ka global role nahi hai.**

Example:

```text
Ahmad
 ├── Google → ADMIN
 └── Startup → EMPLOYEE
```

Same user ke different organizations me different roles ho sakte hain.

Isi wajah se:

```text
role
```

`User` table me rakhna wrong design hota for this requirement.

It belongs to:

```text
OrganizationMember
```

---

# 39. 🧠 Why Role Belongs to Membership

Wrong:

```text
User
 ├── name
 ├── email
 └── role = ADMIN
```

Problem:

```text
Ahmad → Google = ADMIN
Ahmad → Startup = EMPLOYEE
```

Ek user ke paas ek `role` field se dono represent nahi honge.

Correct:

```text
OrganizationMember

Ahmad + Google   → ADMIN
Ahmad + Startup  → EMPLOYEE
```

---

# 40. 📊 Example Data

### User

```text
User
--------------------------------
id       name
--------------------------------
u1       Ahmad
u2       Sara
```

### Organization

```text
Organization
--------------------------------
id       name
--------------------------------
o1       Google
o2       Startup
```

### OrganizationMember

```text
userId    organizationId    role
-----------------------------------------
u1        o1                ADMIN
u1        o2                EMPLOYEE
u2        o1                MANAGER
```

Now:

```text
Ahmad
 ├── Google  → ADMIN
 └── Startup → EMPLOYEE

Sara
 └── Google  → MANAGER
```

---

# 41. 🔒 Composite Unique Constraint

```prisma
@@unique([userId, organizationId])
```

This is extremely important.

It means:

> Same user + same organization combination database me sirf ek baar allowed hai.

---

# 42. Without Composite Unique

Possible bad data:

```text
userId   organizationId   role
--------------------------------
u1       o1                ADMIN
u1       o1                MANAGER
```

Same user same organization ka duplicate membership.

Problem.

---

# 43. With Composite Unique

```prisma
@@unique([userId, organizationId])
```

Database says:

```text
u1 + o1 → allowed once
u1 + o1 → ❌ duplicate
u1 + o2 → ✅
u2 + o1 → ✅
```

So:

```text
(userId, organizationId)
```

together unique hone chahiye.

---

# 44. 🧠 Composite Unique Mental Model

Individual uniqueness nahi:

```text
userId unique ❌
organizationId unique ❌
```

Combination unique:

```text
userId + organizationId
```

Example:

```text
u1 + o1 → unique
u1 + o2 → unique
u2 + o1 → unique
```

---

# 45. 🔑 `RefreshToken` Model

```prisma
model RefreshToken {
  id        String   @id @default(uuid())
  userId    String
  tokenHash String
  expiresAt DateTime
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
}
```

Purpose:

> User ke long-lived authentication sessions ko database me track karna.

---

# 46. 🎟️ Access Token vs Refresh Token

Authentication me commonly do token concepts hote hain:

```text
Access Token
Refresh Token
```

### Access Token

Short-lived.

Example target from these notes:

```text
~15 minutes
```

Used for:

```text
API authorization
```

### Refresh Token

Long-lived.

Example target:

```text
7–30 days
```

Used to obtain a new access token/session continuation.

---

# 47. 🔄 Token Flow

Conceptually:

```text
Login
  ↓
Access Token + Refresh Token
  │             │
  │             └── stored/managed securely
  │
  └── short-lived API access
```

When access token expires:

```text
Refresh Token
      ↓
Server verifies it
      ↓
New Access Token
```

Actual complete implementation Day 5 onward.

---

# 48. 🔐 Why Store `tokenHash`, Not Raw Token?

Model:

```prisma
tokenHash String
```

not:

```prisma
token String
```

Reason:

Database compromise hone par raw refresh tokens directly usable nahi hone chahiye.

Flow:

```text
Raw Refresh Token
       ↓
Hash
       ↓
Database
```

Database stores:

```text
tokenHash
```

not:

```text
raw token
```

---

# 49. Password Hash vs Refresh Token Hash

Same security principle:

```text
Password
   ↓
Hash
   ↓
Database
```

```text
Refresh Token
   ↓
Hash
   ↓
Database
```

But implementation details/verification flow differ and Day 5 me actual code dekhenge.

---

# 50. ⏳ `expiresAt`

```prisma
expiresAt DateTime
```

Refresh token kab expire hoga, wo store karta hai.

Example:

```text
createdAt:
2026-10-03

expiresAt:
2026-11-02
```

After expiry:

```text
Refresh Token ❌
```

---

# 51. 🔗 `user User @relation(...)`

```prisma
user User @relation(
  fields: [userId],
  references: [id]
)
```

Means:

```text
RefreshToken.userId
       ↓
User.id
```

One user can have multiple refresh tokens.

---

# 52. 📱 Multiple Devices

Suppose Ahmad login karta hai:

```text
Chrome
Firefox
Mobile
```

Then:

```text
User
 │
 ├── RefreshToken #1 → Chrome
 ├── RefreshToken #2 → Firefox
 └── RefreshToken #3 → Mobile
```

That's why:

```prisma
refreshTokens RefreshToken[]
```

User model me hai.

---

# 53. 🧠 Complete Relationship Diagram

```text
                    ┌──────────────────┐
                    │       User       │
                    │                  │
                    │ id               │
                    │ name             │
                    │ email            │
                    │ passwordHash     │
                    └───────┬──────────┘
                            │
             ┌──────────────┼──────────────┐
             │              │              │
             │              │              │
             ▼              │              ▼
     OrganizationMember     │       RefreshToken
             │              │
             │              │
             ▼              │
      Organization          │
```

More precisely:

```text
User
 │
 ├──────────────< OrganizationMember >────────────── Organization
 │
 └──────────────< RefreshToken
```

`<` means one user can have many related records.

---

# 54. 🔄 Why Reverse Relations Are Needed in Prisma

Ye important issue Day 3 me encounter hua.

Suppose:

```prisma
model OrganizationMember {
  organization Organization @relation(...)
}
```

But Organization me:

```prisma
members OrganizationMember[]
```

missing hai.

Prisma relation incomplete samajh sakta hai and validation error deta hai.

---

# 55. ❌ Incomplete Relation

```prisma
model OrganizationMember {
  organization Organization @relation(...)
}
```

but:

```prisma
model Organization {
  // missing opposite relation
}
```

---

# 56. ✅ Complete Relation

```prisma
model Organization {
  members OrganizationMember[]
}
```

and:

```prisma
model OrganizationMember {
  organization Organization @relation(...)
}
```

Now Prisma relation ko dono sides se understand kar sakta hai.

---

# 57. User ↔ RefreshToken Relation

Same pattern.

`RefreshToken`:

```prisma
user User @relation(
  fields: [userId],
  references: [id]
)
```

User:

```prisma
refreshTokens RefreshToken[]
```

Both sides present.

---

# 58. 🧠 Reverse Relation Mental Model

Imagine physical relationship:

```text
User
  ↓
RefreshToken
```

Prisma ko dono directions me navigation deni hai:

```text
User
  ↓
user.refreshTokens

RefreshToken
  ↓
refreshToken.user
```

Similarly:

```text
Organization
      ↓
organization.members

OrganizationMember
      ↓
membership.organization
```

This makes relational querying convenient.

---

# 59. ⚠️ Common Mistake — Missing Reverse Relation

Whenever you write:

```prisma
@relation(...)
```

immediately check:

```text
Target model me opposite relation field hai?
```

Example:

```text
OrganizationMember
      │
      │ @relation
      ▼
Organization
      │
      └── members OrganizationMember[]
```

---

# 60. 🏗️ Final Prisma Schema

Day 3 ka complete schema conceptually:

```prisma
enum Role {
  ADMIN
  MANAGER
  EMPLOYEE
}

model User {
  id           String   @id @default(uuid())
  name         String
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  memberships   OrganizationMember[]
  refreshTokens RefreshToken[]
}

model Organization {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  members OrganizationMember[]
}

model OrganizationMember {
  id             String   @id @default(uuid())
  userId         String
  organizationId String
  role           Role
  createdAt      DateTime @default(now())

  user         User         @relation(fields: [userId], references: [id])
  organization Organization @relation(fields: [organizationId], references: [id])

  @@unique([userId, organizationId])
}

model RefreshToken {
  id        String   @id @default(uuid())
  userId    String
  tokenHash String
  expiresAt DateTime
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
}
```

---

# 61. 🗺️ Schema Breakdown

```text
                         Role Enum
                            │
                            ▼
                    OrganizationMember
                     ▲               ▲
                     │               │
                     │               │
                   User       Organization
                     │
                     │
                     ▼
                RefreshToken
```

More detailed:

```text
User
│
├── id
├── name
├── email
├── passwordHash
├── createdAt
├── updatedAt
│
├── memberships[]
│       │
│       ├── organizationId
│       └── role
│
└── refreshTokens[]
        │
        ├── tokenHash
        └── expiresAt
```

---

# 62. 🏢 Multi-Tenant Architecture

TaskForge ka design **organization-based / multi-tenant** direction me hai.

### Tenant kya hota hai?

Simple terms me:

> Ek organization/workspace ko ek tenant ke roop me treat kiya ja sakta hai.

Example:

```text
TaskForge
│
├── Google Organization
│    ├── Ahmad
│    ├── Sara
│    └── Ali
│
├── Startup Organization
│    ├── Ahmad
│    └── Zoya
│
└── College Organization
     ├── Sara
     └── Ali
```

Same user:

```text
Ahmad
```

multiple organizations me exist kar sakta hai.

Aur har organization me role different ho sakta hai.

---

# 63. 🎭 RBAC Foundation

RBAC:

> **Role-Based Access Control**

Day 3 ka schema RBAC ke liye foundation provide karta hai.

Example:

```text
OrganizationMember

Ahmad → Google → ADMIN
Sara  → Google → MANAGER
Ali   → Google → EMPLOYEE
```

Later authorization logic:

```text
ADMIN
  → manage organization

MANAGER
  → manage team/tasks

EMPLOYEE
  → work on assigned tasks
```

Exact permissions Day 4–6 implementation me define honge.

---

# 64. 🔐 Authentication vs Authorization

Ye distinction important hai.

### Authentication

> "Tum kaun ho?"

Example:

```text
Email + Password
       ↓
User identified
```

### Authorization

> "Tum kya kar sakte ho?"

Example:

```text
User role = ADMIN
       ↓
Can perform certain admin actions
```

Schema:

```text
User
  ↓
Authentication identity

OrganizationMember.role
  ↓
Organization-specific authorization
```

---

# 65. 🏗️ Migration

Schema ready hone ke baad:

```bash id="px2x6w"
npx prisma migrate dev --name auth_foundation
```

Prisma:

```text
schema.prisma
      ↓
Migration
      ↓
SQL
      ↓
Neon PostgreSQL
```

---

# 66. 📄 Migration File

Prisma migration generate karega:

```text
prisma/
└── migrations/
    └── <timestamp>_auth_foundation/
        └── migration.sql
```

Migration SQL me concepts like:

```sql
CREATE TABLE ...
ALTER TABLE ...
FOREIGN KEY ...
UNIQUE ...
```

generated hote hain.

---

# 67. 🧹 What Happened to `Test` Model?

Day 2 ka temporary:

```prisma
model Test {
  ...
}
```

Day 3 schema se remove kar diya gaya.

Then migration run hui.

Prisma database ko desired schema ke saath synchronize karta hai, so old temporary table is removed through the migration.

### Important lesson

> `schema.prisma` current desired schema describe karta hai, while migration history records how the database structure changes over time.

---

# 68. 🖥️ Verify With Prisma Studio

```bash id="0sovjz"
npx prisma studio
```

Open:

```text id="v2n18c"
http://localhost:5555
```

Expected tables:

```text
User
Organization
OrganizationMember
RefreshToken
```

---

# 69. 🧠 Why Prisma Studio Verification Matters

Code compile hona:

```text
NestJS ✓
```

enough nahi hai.

Migration success:

```text
Prisma ✓
```

still actual visual verification ke liye Studio useful hai.

Expected:

```text
Prisma Schema
      ↓
Migration
      ↓
Neon PostgreSQL
      ↓
Prisma Studio
      ↓
4 tables visible
```

---

# 70. 📝 Git Commit

```bash id="f7df4t"
git add .
```

```bash id="w1j1jq"
git commit -m "feat: auth foundation schema - User, Organization, OrganizationMember, RefreshToken"
```

---

# 71. 🚨 Common Mistakes — Day 3

## Mistake 1 — Role ko User me rakhna

❌:

```prisma
model User {
  role Role
}
```

For organization-specific roles, this doesn't represent:

```text
Google → ADMIN
Startup → EMPLOYEE
```

Correct:

```prisma
OrganizationMember {
  role Role
}
```

---

## Mistake 2 — Many-to-Many ko direct relation samajhna

Requirement:

```text
User ↔ multiple Organizations
Organization ↔ multiple Users
```

Solution:

```text
User
  ↕
OrganizationMember
  ↕
Organization
```

---

## Mistake 3 — Duplicate membership allow karna

Without:

```prisma
@@unique([userId, organizationId])
```

same membership duplicate ho sakti hai.

---

## Mistake 4 — Raw password store karna

❌:

```text
password = "123456"
```

✅:

```text
password
  ↓
hash
  ↓
passwordHash
```

---

## Mistake 5 — Raw refresh token store karna

❌:

```text
token
```

✅:

```text
token
  ↓
hash
  ↓
tokenHash
```

---

## Mistake 6 — Reverse relation bhoolna

If:

```prisma
user User @relation(...)
```

then User model me corresponding reverse relation bhi define karo:

```prisma
refreshTokens RefreshToken[]
```

---

## Mistake 7 — UUID ko security solution samajhna

UUID IDs less predictable hote hain, but:

```text
UUID ≠ Authorization
UUID ≠ Authentication
UUID ≠ Complete security
```

Proper authentication/authorization still required.

---

# 72. 🔑 Key Concepts — One-Line Revision

### Primary Key

> Table ke record ko uniquely identify karti hai.

### Foreign Key

> Ek table ke record ko doosre table ke record se connect karti hai.

### UUID

> Unique, less predictable identifier; distributed systems ke liye useful.

### Enum

> Fixed set of allowed values.

### `@unique`

> Field ke duplicate values prevent karta hai.

### `@@unique([a, b])`

> Two fields ke combination ko unique banata hai.

### Junction Table

> Many-to-many relationship ko represent karti hai aur relationship-specific data store kar sakti hai.

### Reverse Relation

> Related model se opposite direction me records navigate/query karne ke liye Prisma relation field.

### RBAC

> Role ke basis par permissions control karna.

### Multi-Tenant

> Ek application ke andar multiple organizations/workspaces ko isolate/manage karna.

### `passwordHash`

> Password ka hashed representation; raw password store nahi karna.

### `tokenHash`

> Refresh token ka hashed representation; raw refresh token database me store nahi karna.

---

# 73. 🧠 Most Important Concepts From Day 3

## 1. UUID

```text
Int:
1 → 2 → 3 → 4

UUID:
a8f... → 91c... → 4de...
```

Used for project-wide identifiers.

---

## 2. Many-to-Many

```text
User
  ↕
OrganizationMember
  ↕
Organization
```

---

## 3. Role Is Membership-Specific

```text
User
 │
 ├── Google → ADMIN
 │
 └── Startup → EMPLOYEE
```

---

## 4. Composite Unique

```prisma
@@unique([userId, organizationId])
```

Prevents:

```text
same user
+
same organization
+
duplicate membership
```

---

## 5. Secrets Are Hashed

```text
Password
   ↓
Hash
   ↓
passwordHash
```

```text
Refresh Token
   ↓
Hash
   ↓
tokenHash
```

---

# 74. 🔄 Day 3 Complete Flow

```text
                    DATABASE DESIGN
                           │
                           ▼
                       Role Enum
                           │
                           ▼
                         User
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
   OrganizationMember            RefreshToken
              │
              │
              ▼
       Organization
```

Then:

```text
schema.prisma
      ↓
prisma migrate dev
      ↓
migration.sql
      ↓
Neon PostgreSQL
      ↓
Prisma Studio
```

---

# 75. 📋 Day 3 Checklist

## Role

- [x] `Role` enum created
- [x] `ADMIN`
- [x] `MANAGER`
- [x] `EMPLOYEE`

## User

- [x] UUID primary key
- [x] Unique email
- [x] Password hash field
- [x] Created timestamp
- [x] Updated timestamp
- [x] Organization membership relation
- [x] Refresh token relation

## Organization

- [x] UUID primary key
- [x] Name
- [x] Unique slug
- [x] Created timestamp
- [x] Updated timestamp
- [x] Membership relation

## OrganizationMember

- [x] UUID primary key
- [x] User foreign key
- [x] Organization foreign key
- [x] Organization-specific role
- [x] Created timestamp
- [x] Composite unique constraint

## RefreshToken

- [x] UUID primary key
- [x] User foreign key
- [x] Hashed token field
- [x] Expiry timestamp
- [x] Created timestamp

## Database

- [x] Reverse relations completed
- [x] Migration generated
- [x] Migration applied
- [x] Temporary `Test` model removed
- [x] Prisma Client regenerated
- [x] Prisma Studio verified
- [x] Four expected tables visible

---

# 🚀 Next — Day 4

## Registration Flow

Ab schema ready hai.

Day 4 me registration ke waqt complete flow implement hoga:

```text
User Registration
       │
       ▼
Validate input
       │
       ▼
Hash password
       │
       ▼
Create User
       │
       ▼
Create Organization
       │
       ▼
Create OrganizationMember
       │
       ▼
Assign initial role
       │
       ▼
Registration Complete
```

### Important concept

Ye teen records:

```text
User
Organization
OrganizationMember
```

**ek logical registration operation** ka part honge.

Agar beech me failure ho:

```text
User created
Organization created
OrganizationMember failed
```

to inconsistent data nahi rehna chahiye.

Isliye Day 4 me **Prisma Transaction** ka concept important hoga.

> **Day 3 objective achieved:** TaskForge ke authentication, organization membership, RBAC aur refresh-token system ke liye database foundation successfully design aur migrate ho chuka hai.