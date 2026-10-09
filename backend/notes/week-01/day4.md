

# 📘 Day 04 — Registration Flow
### NestJS · GraphQL · Prisma · PostgreSQL · bcrypt

> **Objective:** Ek `register` mutation implement karna jo User, Organization aur ADMIN membership ko ek hi database transaction mein create kare.

## 📑 Table of Contents

1. [Goal & Registration Flow](#1--goal--registration-flow)
2. [NestJS CLI Commands](#2--nestjs-cli-commands)
3. [bcrypt & Password Security](#3--bcrypt--password-security)
4. [Global ValidationPipe](#4--global-validationpipe)
5. [Register Input DTO](#5--register-input-dto)
6. [Slug Utility](#6--slug-utility)
7. [OrganizationsService](#7--organizationsservice)
8. [ESM Import Error](#8--esm-import-error-ts2307)
9. [UsersService](#9--usersservice)
10. [Module Wiring & Dependency Injection](#10--module-wiring--dependency-injection)
11. [GraphQL User Output Type](#11--graphql-user-output-type)
12. [AuthService — Registration Logic](#12--authservice--registration-logic)
13. [AuthResolver](#13--authresolver)
14. [Testing with Apollo Sandbox](#14--testing-with-apollo-sandbox)
15. [Architecture & LLD Concepts](#15--architecture--lld-concepts)
16. [Interview Questions](#16--interview-questions)
17. [Final Folder Structure](#17--final-folder-structure)
18. [Git Commit](#18--git-commit)
19. [Completion Checklist](#19--completion-checklist)
20. [Quick Revision](#20--quick-revision)

---

## 1. 🎯 Goal & Registration Flow

### What Are We Building?

Hum ek GraphQL `register` mutation bana rahe hain jo registration ke waqt teen related records create karegi.

| Entity | Easy Definition | Example |
|---|---|---|
| **User** | Register karne wale person ki information | Ahmad |
| **Organization** | User ka workspace ya company | Acme Corp |
| **OrganizationMember** | User aur organization ke beech relationship aur role | Ahmad → ADMIN |

### Registration Flow

```text
                  GraphQL Mutation
                         |
                         ▼
                 RegisterInput (DTO)
                         |
                         ▼
                  Input Validation
                         |
                         ▼
                   Email Normalize
                         |
                         ▼
                Check Existing Email
                    /          \
                  Yes           No
                   |             |
                   ▼             ▼
              Throw Error    Hash Password
                                  |
                                  ▼
                         Prisma Transaction
                                  |
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
                 Create        Create        Create
                  User      Organization    Membership
                                               ADMIN
                    └─────────────┼─────────────┘
                                  |
                                  ▼
                           Return User Data
```

### Important Definition: Database Transaction

**Transaction database operations ka ek logical group hai jo ek unit ki tarah execute hota hai.**

Registration mein User, Organization aur OrganizationMember create hote hain. Agar inmein se koi operation fail ho, to transaction ke andar ke database changes rollback ho jaate hain.

Isse incomplete registration se bachne mein help milti hai.

```text
All operations successful  → COMMIT
Any operation fails        → ROLLBACK
```

**Note:** Ye guarantee transaction ke andar execute hone wale database changes par apply hoti hai.

---

## 2. ⚙️ NestJS CLI Commands

### Generate Required Files

```bash
nest g mo users
nest g s users

nest g mo organizations
nest g s organizations

nest g mo auth
nest g s auth
nest g r auth
```

### Commands Explained

| Command | Full Form | Purpose |
|---|---|---|
| `nest g mo` | Generate Module | Module create karna |
| `nest g s` | Generate Service | Service create karna |
| `nest g r` | Generate Resolver | GraphQL resolver create karna |

**Simple Definition — Module:** Related classes aur providers ko organize karne wala component.

**Simple Definition — Service:** Application ki business logic handle karne wali class.

**Simple Definition — Resolver:** GraphQL query ya mutation ko handle karne wala component.

### Important Notes

- Nest CLI generated files ko project structure mein organize karta hai.
- Module generation ke waqt CLI aam taur par module ko `AppModule` mein register bhi karta hai.
- `.spec.ts` files testing ke liye hoti hain.
- Doosre module ki service use karne ke liye appropriate `imports` aur `exports` configure karne padte hain.

---

## 3. 🔐 bcrypt & Password Security

### Installation

```bash
pnpm add bcrypt
pnpm add -D @types/bcrypt
pnpm approve-builds
```

### What Is bcrypt?

**bcrypt ek password-hashing library hai jo plain-text password ko computationally expensive, one-way hash representation mein convert karti hai.**

```text
Original Password
       |
       ▼
bcrypt.hash(password, 12)
       |
       ▼
Password Hash
       |
       ▼
Store Hash in Database
```

Example:

```text
Password: Test@12345
Hash:     $2b$12$...
```

Database mein original password store nahi karna chahiye.

### Hashing vs Encryption

| Hashing | Encryption |
|---|---|
| Generally one-way process | Authorized key se reverse kiya ja sakta hai |
| Password storage mein useful | Confidential data ko recover karna ho to useful |
| Original password directly decode nahi hota | Decryption se original data recover ho sakta hai |

### Understanding the Cost Factor

```ts
const passwordHash = await bcrypt.hash(input.password, 12);
```

- `input.password` — original password.
- `12` — bcrypt cost factor.
- `passwordHash` — generated password hash.

Higher cost factor hashing ko computationally more expensive banata hai. Isliye security aur application performance dono consider karne chahiye.

### Why `pnpm approve-builds`?

pnpm dependency ke native build scripts ko security reasons se block kar sakta hai.

Agar `bcrypt` ka build script block hua hai, to:

1. `pnpm approve-builds` execute karo.
2. Prompt mein `bcrypt` select karo.
3. Enter press karo.
4. Confirmation aaye to instructions follow karo.

Agar package pehle block ho chuka tha, to approval ke baad required rebuild bhi karna pad sakta hai.

### Terminal Warnings

| Warning | Meaning | Action |
|---|---|---|
| `Ignored build scripts: bcrypt` | Native build script execute nahi hua | Build-script approval aur rebuild check karo |
| TypeScript peer dependency warning | Installed TypeScript version expected range se differ kar sakta hai | Relevant compatibility issue aaye tab investigate karo |
| Deprecated subdependency | Dependency tree mein purana package hai | Zaroorat ke hisaab se update investigate karo |
| pnpm update available | New version available hai | Sirf notification ki wajah se update zaroori nahi |

> **Key Learning:** Har warning error nahi hoti. Warning ka actual meaning samajhkar hi action lena chahiye.

---

## 4. 🛡️ Global ValidationPipe

**File:** `src/main.ts`

### What Is Validation?

**Validation ka matlab hai check karna ki incoming data expected rules ko satisfy karta hai ya nahi.**

Examples:

- Email valid format mein ho.
- Password required length satisfy kare.
- Required fields empty na hon.

### Final Code

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap();
```

### Important Components

| Code | Meaning |
|---|---|
| `NestFactory.create()` | NestJS application create karta hai |
| `ValidationPipe` | Incoming data ki validation mein help karta hai |
| `useGlobalPipes()` | Application-wide pipes register karta hai |
| `whitelist: true` | DTO mein declared validation-decorated properties ke alawa doosri properties ko strip karta hai |
| `app.listen()` | Server start karta hai |
| `process.env.PORT ?? 3000` | Configured port use karta hai, warna `3000` |

### Extra Properties Reject Karna

Agar unknown properties ko remove karne ke bajaye reject karna ho:

```ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
);
```

### Error: `Cannot find name 'app'`

```text
TS2304: Cannot find name 'app'
```

**Reason:** `app.useGlobalPipes()` ko `bootstrap()` ke bahar likh diya tha.

`app` variable function ke andar declare hua tha:

```ts
const app = await NestFactory.create(AppModule);
```

Isliye function ke bahar variable accessible nahi tha.

### Correct Execution Order

```text
Create Application
       |
       ▼
Register ValidationPipe
       |
       ▼
Start Server
```

**Key Learning:** Variable ka scope determine karta hai ki woh code ke kis part mein accessible hoga.

---

## 5. 📝 Register Input DTO

**File:** `src/auth/dto/register.input.ts`

### What Is a DTO?

**DTO (Data Transfer Object) ek object structure hai jo define karta hai ki application ke ek part se doosre part tak kaunsa data transfer hoga.**

Registration DTO client ke input fields aur unke validation rules define karta hai.

### Code

```ts
import { Field, InputType } from '@nestjs/graphql';
import { IsEmail, IsNotEmpty, MaxLength, MinLength } from 'class-validator';

@InputType()
export class RegisterInput {
  @Field()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @Field()
  @IsEmail()
  email: string;

  @Field()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @Field()
  @IsNotEmpty()
  @MaxLength(100)
  organizationName: string;
}
```

### Decorators Explained

| Decorator | Easy Definition |
|---|---|
| `@InputType()` | Class ko GraphQL input type ke roop mein register karta hai |
| `@Field()` | Property ko GraphQL schema mein expose karta hai |
| `@IsEmail()` | Email format validate karta hai |
| `@IsNotEmpty()` | Value empty nahi honi chahiye |
| `@MinLength(8)` | Minimum 8 characters required |
| `@MaxLength(100)` | Maximum 100 characters allowed |

### Fields Explained

| Field | Purpose |
|---|---|
| `name` | User ka naam |
| `email` | User ka email address |
| `password` | Original password, hashing se pehle |
| `organizationName` | Initial organization ka naam |

### Why Password Has a Maximum Length?

bcrypt ke commonly used implementations password input ko **72 bytes** tak process karte hain.

Lekin yaad rakho:

- Characters aur bytes hamesha equal nahi hote.
- ASCII characters aam taur par ek byte use karte hain.
- Unicode characters multiple bytes use kar sakte hain.

Isliye `@MaxLength(72)` exactly 72 bytes enforce nahi karta.

Production implementation mein bcrypt ki byte limit ko dhyan mein rakhkar explicit validation karni chahiye.

### TypeScript Property Initialization

Strict property initialization error aaye to:

```ts
name!: string;
email!: string;
password!: string;
organizationName!: string;
```

`!` definite assignment assertion hai. Ye TypeScript ko batata hai ki property ki initialization kisi external mechanism se handle hogi.

**Important:** `!` actual value initialize nahi karta aur validation ka replacement nahi hai.

---

## 6. 🔗 Slug Utility

**File:** `src/common/utils/slug.util.ts`

### What Is a Slug?

**Slug kisi name ya title ka URL-friendly version hota hai.**

Example:

```text
Acme Corp Pvt Ltd
        |
        ▼
acme-corp-pvt-ltd
```

### Code

```ts
import { randomBytes } from 'crypto';

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function generateSlug(name: string): string {
  const base = slugify(name) || 'org';
  const suffix = randomBytes(3).toString('hex');

  return `${base}-${suffix}`;
}
```

### `slugify()` Explained

| Operation | Purpose | Example |
|---|---|---|
| `toLowerCase()` | Lowercase conversion | `ACME` → `acme` |
| `trim()` | Start/end spaces remove karna | `" Acme "` → `"Acme"` |
| `replace(/[^a-z0-9]+/g, '-')` | Unsupported characters ko hyphen se replace karna | `Acme Corp` → `acme-corp` |
| `replace(/^-+|-+$/g, '')` | Start/end ke hyphens remove karna | `-acme-` → `acme` |
| `slice(0, 40)` | Maximum 40 characters tak limit karna | Long string truncate hoti hai |

### Why Random Suffix?

```ts
const suffix = randomBytes(3).toString('hex');
```

Three random bytes hexadecimal representation mein normally six characters produce karte hain.

Example:

```text
Organization: Acme Corp

Slug 1: acme-corp-a3f9c1
Slug 2: acme-corp-81d20e
```

Random suffix same name wali organizations ke slug collision ka chance reduce karta hai.

**Important:** Random suffix uniqueness ki guarantee nahi deta. Database mein unique constraint aur collision hone par retry logic bhi zaroori hai.

### Fallback: `|| 'org'`

```ts
const base = slugify(name) || 'org';
```

Agar name se empty slug generate ho, to fallback `org` use hota hai.

```text
Input:     !!!
Slugify:   ""
Fallback:  org
Final:     org-a3f9c1
```

---

## 7. 🏢 OrganizationsService

**File:** `src/organizations/organizations.service.ts`

### Code

```ts
import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { generateSlug } from '../common/utils/slug.util.js';

@Injectable()
export class OrganizationsService {
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
          create: { userId: adminUserId, role: Role.ADMIN },
        },
      },
    });
  }
}
```

### Important Concepts

**`@Injectable()`**

NestJS ko batata hai ki class dependency injection system mein provider ke roop mein use ki ja sakti hai.

**`Prisma.TransactionClient`**

Transaction ke andar database operations execute karne ke liye use hone wala Prisma client.

**Nested Create**

Prisma parent record ke saath related record ko bhi create kar sakta hai.

```ts
members: {
  create: {
    userId: adminUserId,
    role: Role.ADMIN,
  },
}
```

Is code mein organization ke saath uski initial admin membership bhi create hoti hai.

### `Role.ADMIN`

Generated Prisma enum value use karne se role type-safe rehta hai.

```ts
role: Role.ADMIN
```

### Execution Flow

```text
createWithAdmin()
       |
       ▼
Generate Organization Slug
       |
       ▼
Create Organization
       |
       ▼
Create OrganizationMember
       |
       ▼
Assign ADMIN Role
```

### Why Does the Service Receive `tx`?

Organization creation ko registration transaction ka part banana hai.

Isliye `AuthService` transaction create karti hai aur `OrganizationsService` ko uska `tx` pass karti hai.

Isse organization aur membership ke database operations same transaction mein execute hote hain.

---

## 8. 🐛 ESM Import Error — TS2307

### Error

```text
TS2307: Cannot find module '../common/utils/slug.util'
or its corresponding type declarations.
```

### What Is ESM?

**ESM (ECMAScript Modules) JavaScript ka standard module system hai jo `import` aur `export` use karta hai.**

### Debugging Commands

```bash
pwd
ls src/common/utils
```

- `pwd` current directory show karta hai.
- `ls` directory ke contents show karta hai.

### Correct Import

```ts
import { generateSlug } from '../common/utils/slug.util.js';
```

Is project ki ESM configuration mein relative import ke end mein `.js` extension required hai.

Source file `.ts` hai, lekin compiled output `.js` hota hai.

### Quick Fix Command

```bash
sed -i "s#'../common/utils/slug.util'#'../common/utils/slug.util.js'#" src/organizations/organizations.service.ts
```

### Error Codes

| Error | Meaning |
|---|---|
| `TS2834` | Relative import mein required extension missing ho sakti hai |
| `TS2307` | Module resolve nahi ho raha; path, file, package ya configuration issue ho sakta hai |

### Project Rule

> Is ESM project mein relative imports ke end mein `.js` extension use karo. Package imports jaise `@nestjs/common`, `@prisma/client` aur `bcrypt` mein relative file extension add nahi karni.

---

## 9. 👤 UsersService

**File:** `src/users/users.service.ts`

### Code

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  create(
    tx: Prisma.TransactionClient,
    data: {
      name: string;
      email: string;
      passwordHash: string;
    },
  ) {
    return tx.user.create({ data });
  }
}
```

### Method 1: `findByEmail()`

```ts
findByEmail(email: string) {
  return this.prisma.user.findUnique({
    where: { email },
  });
}
```

**Purpose:** Email se existing user search karna.

- User milta hai → matching record return hota hai.
- User nahi milta → result `null` hota hai.

Registration mein duplicate email check karne ke liye use hota hai.

### Method 2: `create()`

```ts
create(tx, data) {
  return tx.user.create({ data });
}
```

**Purpose:** Transaction ke andar user create karna.

### `this.prisma` vs `tx`

| `this.prisma` | `tx` |
|---|---|
| Normal database operations ke liye | Current transaction ke operations ke liye |
| Transaction ke bahar use ho sakta hai | Transaction context mein use hota hai |
| Email lookup mein use kiya | Registration ke user creation mein use kiya |

**Key Learning:** Transaction ke andar related database operations ko same transaction client ke through execute karna zaroori hai.

---

## 10. 🧩 Module Wiring & Dependency Injection

NestJS mein modules apne providers ko automatically har doosre module ke liye expose nahi karte.

Agar kisi module ki service doosre module mein use karni ho, to service ko export aur importing module mein import karna hota hai.

### 10.1 UsersModule

**File:** `src/users/users.module.ts`

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [PrismaModule],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

### 10.2 OrganizationsModule

**File:** `src/organizations/organizations.module.ts`

```ts
import { Module } from '@nestjs/common';
import { OrganizationsService } from './organizations.service.js';

@Module({
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
```

`PrismaModule` yahan import nahi kiya gaya kyunki `OrganizationsService` constructor mein `PrismaService` inject nahi karti. Woh caller se transaction client leti hai.

### 10.3 AuthModule

**File:** `src/auth/auth.module.ts`

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { OrganizationsModule } from '../organizations/organizations.module.js';
import { AuthService } from './auth.service.js';
import { AuthResolver } from './auth.resolver.js';

@Module({
  imports: [
    PrismaModule,
    UsersModule,
    OrganizationsModule,
  ],
  providers: [
    AuthService,
    AuthResolver,
  ],
})
export class AuthModule {}
```

### Module Properties Explained

| Property | Meaning |
|---|---|
| `imports` | Doosre modules ki exported functionality use karna |
| `providers` | Services aur injectable providers register karna |
| `exports` | Functionality ko doosre modules ke liye available karna |

### Dependency Flow

```text
                   AuthModule
                       |
          ┌────────────┼────────────┐
          ▼            ▼            ▼
     PrismaModule  UsersModule  OrganizationsModule
          |            |            |
          ▼            ▼            ▼
    PrismaService UsersService OrganizationsService
          |
          ▼
      PostgreSQL
```

### Dependency Injection — Easy Definition

**Dependency Injection ek technique hai jisme class ko required dependencies framework ke through milti hain, instead of manually creating them.**

Example:

```ts
constructor(private usersService: UsersService) {}
```

Isse code modular aur testable banane mein help milti hai.

---

## 11. 🔒 GraphQL User Output Type

**File:** `src/users/entities/user.entity.ts`

### What Is a GraphQL Object Type?

**GraphQL Object Type define karta hai ki API response mein kaunse fields available honge.**

### Code

```ts
import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class User {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field()
  email!: string;

  @Field()
  createdAt!: Date;
}
```

### Components Explained

| Component | Purpose |
|---|---|
| `@ObjectType()` | Class ko GraphQL object type banata hai |
| `@Field(() => ID)` | `id` ko GraphQL ID type ke roop mein expose karta hai |
| `@Field()` | Property ko GraphQL field banata hai |
| `id` | User ki unique identifier |
| `name` | User ka naam |
| `email` | User ka email |
| `createdAt` | Account creation timestamp |

### Why Is `passwordHash` Missing?

GraphQL `User` type mein `passwordHash` intentionally include nahi kiya gaya.

Isliye client normal GraphQL selection ke through is field ko request nahi kar sakta.

> **Security Principle:** API response mein sirf required aur safe fields expose karo.

---

## 12. 🔑 AuthService — Registration Logic

**File:** `src/auth/auth.service.ts`

### Complete Code

```ts
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { OrganizationsService } from '../organizations/organizations.service.js';
import { RegisterInput } from './dto/register.input.js';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private organizationsService: OrganizationsService,
  ) {}

  async register(input: RegisterInput) {
    const email = input.email.toLowerCase().trim();

    const existing = await this.usersService.findByEmail(email);

    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await this.usersService.create(tx, {
          name: input.name,
          email,
          passwordHash,
        });

        await this.organizationsService.createWithAdmin(
          tx,
          input.organizationName,
          user.id,
        );

        return user;
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Email already registered');
      }

      throw e;
    }
  }
}
```

### Step-by-Step Explanation

#### Step 1 — Normalize Email

```ts
const email = input.email.toLowerCase().trim();
```

Email ke start/end spaces remove hote hain aur letters lowercase ho jaate hain.

```text
" Ahmad@Test.com "
        |
        ▼
"ahmad@test.com"
```

**Note:** Database unique constraint bhi required hai. Email normalization akeli duplicate accounts ko prevent karne ke liye sufficient nahi hai.

#### Step 2 — Check Existing User

```ts
const existing = await this.usersService.findByEmail(email);

if (existing) {
  throw new ConflictException('Email already registered');
}
```

Agar email pehle se registered hai, to registration reject hoti hai.

**`ConflictException`:** NestJS ka exception jo normally HTTP `409 Conflict` represent karta hai.

#### Step 3 — Hash Password

```ts
const passwordHash = await bcrypt.hash(input.password, 12);
```

Original password ko hash mein convert kiya jata hai.

Database mein `passwordHash` store hota hai, plain-text password nahi.

#### Step 4 — Start Transaction

```ts
return await this.prisma.$transaction(async (tx) => {
  // Database operations
});
```

Transaction related database operations ko ek logical unit mein execute karti hai.

#### Step 5 — Create User

```ts
const user = await this.usersService.create(tx, {
  name: input.name,
  email,
  passwordHash,
});
```

User record create hota hai aur uska generated `id` milta hai.

#### Step 6 — Create Organization and Membership

```ts
await this.organizationsService.createWithAdmin(
  tx,
  input.organizationName,
  user.id,
);
```

Organization create hoti hai aur user ko `ADMIN` role ke saath member banaya jata hai.

#### Step 7 — Return User

```ts
return user;
```

Created user object return hota hai.

GraphQL output type decide karta hai ki response mein kaunse fields expose honge.

### Transaction Flow

```text
          BEGIN TRANSACTION
                  |
                  ▼
             Create User
                  |
                  ▼
         Create Organization
                  |
                  ▼
         Create ADMIN Membership
                  |
                  ▼
          All Steps Successful?
              /          \
            Yes           No
             |             |
             ▼             ▼
           COMMIT        ROLLBACK
```

---

### 12.1 Race Condition

**Definition:** Race condition tab hoti hai jab concurrent operations ka result unke execution timing ya ordering par depend kar sakta hai.

Example:

```text
Request A                  Request B
    |                          |
    ▼                          ▼
Check Email               Check Email
    |                          |
    ▼                          ▼
Not Found                  Not Found
    |                          |
    ▼                          ▼
Create User               Create User
    |                          |
    ▼                          ▼
Success                   Unique Constraint Error
```

Dono requests initial email check pass kar sakti hain.

Isliye database mein email par unique constraint zaroori hai.

### 12.2 Prisma Error — `P2002`

```ts
if (
  e instanceof Prisma.PrismaClientKnownRequestError &&
  e.code === 'P2002'
) {
  throw new ConflictException('Email already registered');
}
```

**`P2002` Prisma ka known request error code hai jo unique constraint violation indicate karta hai.**

Lekin `P2002` sirf email duplicate hone par nahi, kisi bhi unique constraint violation par aa sakta hai.

Is schema mein slug par bhi unique constraint hai. Production code mein error ki target information check karni chahiye, taaki email duplicate aur slug collision ko distinguish kiya ja sake.

Slug collision hone par slug regenerate karke retry karna appropriate ho sakta hai.

---

## 13. 🌐 AuthResolver

**File:** `src/auth/auth.resolver.ts`

### Code

```ts
import { Args, Mutation, Resolver } from '@nestjs/graphql';

import { AuthService } from './auth.service.js';
import { RegisterInput } from './dto/register.input.js';
import { User } from '../users/entities/user.entity.js';

@Resolver()
export class AuthResolver {
  constructor(private authService: AuthService) {}

  @Mutation(() => User)
  register(@Args('input') input: RegisterInput) {
    return this.authService.register(input);
  }
}
```

### Important Decorators

| Decorator | Meaning |
|---|---|
| `@Resolver()` | Class ko GraphQL resolver ke roop mein register karta hai |
| `@Mutation(() => User)` | Method ko GraphQL mutation banata hai |
| `@Args('input')` | GraphQL mutation ka `input` argument receive karta hai |

### Why Keep the Resolver Thin?

Resolver ka main kaam request receive karke service ko call karna hai.

```text
GraphQL Request
       |
       ▼
AuthResolver
       |
       ▼
AuthService
       |
       ▼
UsersService / OrganizationsService
       |
       ▼
Prisma
       |
       ▼
PostgreSQL
```

Isse request handling aur business logic separate rehti hain.

---

## 14. 🧪 Testing with Apollo Sandbox

GraphQL endpoint:

```text
http://localhost:3000/graphql
```

### Registration Mutation

```graphql
mutation {
  register(input: {
    name: "Ahmad"
    email: "ahmad@test.com"
    password: "Test@12345"
    organizationName: "Acme Corp"
  }) {
    id
    name
    email
    createdAt
  }
}
```

### Expected Response

```json
{
  "data": {
    "register": {
      "id": "generated-user-id",
      "name": "Ahmad",
      "email": "ahmad@test.com",
      "createdAt": "2026-10-09T10:00:00.000Z"
    }
  }
}
```

*Note: Ye illustrative response hai. Actual `id` aur `createdAt` database se generate honge.*

### Test Cases

| Test | Expected Result |
|---|---|
| Valid details ke saath registration | User create ho |
| Same email se dobara registration | Conflict error |
| Password minimum length se chhota | Validation error |
| Invalid email | Validation error |
| Organization creation fail ho | Transaction rollback |
| Membership creation fail ho | Transaction rollback |
| Database records check karo | Teeno records verify hon |

### Prisma Studio

```bash
pnpm exec prisma studio
```

Is command se Prisma Studio open ho sakta hai, provided ki project mein Prisma Studio available aur correctly configured hai.

### Expected Database State

```text
User
 └── Ahmad

Organization
 └── Acme Corp

OrganizationMember
 ├── User: Ahmad
 ├── Organization: Acme Corp
 └── Role: ADMIN
```

---

## 15. 🏗️ Architecture & LLD Concepts

### 15.1 Separation of Concerns

**Definition:** Application ke different components ko separate responsibilities dena.

| Component | Responsibility |
|---|---|
| `AuthResolver` | GraphQL request handle karna |
| `AuthService` | Registration process coordinate karna |
| `UsersService` | User-related operations |
| `OrganizationsService` | Organization-related operations |
| `slug.util.ts` | Slug generate karna |
| Prisma | Database operations |

### 15.2 Single Responsibility Principle (SRP)

**Definition:** Ek class ki responsibilities focused honi chahiye, taaki changes ke reasons unnecessarily multiple responsibilities ko affect na karein.

Examples:

- `UsersService` user operations handle karti hai.
- `OrganizationsService` organization operations handle karti hai.
- `AuthService` registration coordinate karti hai.

### 15.3 Dependency Injection

**Definition:** Dependencies ko class ke andar manually create karne ke bajaye framework ke through provide karna.

```ts
constructor(private usersService: UsersService) {}
```

Isse classes ko manage aur test karna easy ho sakta hai.

### 15.4 Transaction Boundary

**Definition:** Transaction boundary woh point hai jahan transaction ke operations start aur finish hote hain.

Is project mein:

```ts
this.prisma.$transaction(async (tx) => {
  // Create user
  // Create organization
  // Create membership
});
```

`AuthService` transaction ko coordinate karti hai aur doosri services ko same `tx` provide karti hai.

### 15.5 Repository Pattern

**Definition:** Repository Pattern database access logic ko ek dedicated abstraction ke through expose karta hai.

Is project mein dedicated repository layer nahi hai. Services directly Prisma use karti hain.

Ye current architecture ke liye practical decision ho sakta hai.

Repository layer tab add kar sakte hain jab:

- Multiple database implementations support karni hon.
- Persistence logic ko strongly isolate karna ho.
- Custom repository abstractions se testing significantly improve hoti ho.
- Database access logic kaafi complex ho jaye.

### 15.6 Unit of Work Concept

Registration ke andar multiple services ko same transaction client diya jata hai.

Isse unke database operations ek transaction mein coordinate hote hain.

Ye Unit of Work ke concept se milta-julta hai, lekin ise automatically complete Unit of Work Pattern implementation nahi kehna chahiye.

### Architecture Decision

> Is project mein layered architecture use ki gayi hai. Prisma ko service layer se access kiya jata hai aur transaction `AuthService` mein coordinate hoti hai. Extra repository abstraction tab introduce karenge jab uski practical requirement hogi.

---

## 16. 🎤 Interview Questions

### Q1. What happens during user registration?

**Answer:** The GraphQL resolver receives the registration input and passes it to `AuthService`. The service normalizes the email, checks for an existing user, hashes the password using bcrypt, and creates the user, organization, and admin membership within a Prisma transaction.

### Q2. Why do you use bcrypt?

**Answer:** bcrypt is a password-hashing algorithm designed to make password guessing computationally expensive. It allows us to store password hashes instead of plain-text passwords and verify passwords during login.

### Q3. Why do you use a database transaction?

**Answer:** Registration involves creating multiple related records. A transaction allows these database operations to succeed or fail together, preventing partial registration.

### Q4. Why is the database unique constraint necessary?

**Answer:** Two concurrent requests can pass the initial email check before either creates a user. The database unique constraint prevents both requests from successfully creating duplicate email records.

### Q5. What is a race condition?

**Answer:** A race condition occurs when the result of concurrent operations depends on their timing or execution order.

### Q6. Why do you use `tx` instead of `this.prisma` inside the transaction?

**Answer:** The transaction client ensures that the relevant database operations participate in the same transaction, allowing their changes to be rolled back together if necessary.

### Q7. Why is `passwordHash` missing from the GraphQL User type?

**Answer:** The GraphQL output type defines which fields clients can select. Omitting `passwordHash` prevents its exposure through the normal GraphQL response.

### Q8. Why do you keep the resolver thin?

**Answer:** The resolver handles GraphQL requests, while the service contains business logic. This separation improves maintainability and testability.

### Q9. Why do you generate a slug with a random suffix?

**Answer:** Different organizations can have the same name. A random suffix reduces the chance of slug collisions, while a database unique constraint enforces uniqueness.

### Q10. Why did you not create a repository layer?

**Answer:** Prisma provides the required database abstraction for the current project. A separate repository layer can be introduced if database independence or additional persistence isolation becomes necessary.

---

## 17. 📂 Final Folder Structure

```text
src/
├── app.module.ts
├── app.resolver.ts
├── auth/
│   ├── dto/
│   │   └── register.input.ts
│   ├── auth.module.ts
│   ├── auth.resolver.ts
│   └── auth.service.ts
├── users/
│   ├── entities/
│   │   └── user.entity.ts
│   ├── users.module.ts
│   └── users.service.ts
├── organizations/
│   ├── organizations.module.ts
│   └── organizations.service.ts
├── common/
│   └── utils/
│       └── slug.util.ts
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts
└── main.ts
```

---

## 18. 📝 Git Commit

```bash
git add .
git commit -m "feat: implement registration flow with organization and admin membership"
```

**Definition — Git Commit:** Project ke tracked changes ka recorded snapshot jo future mein changes ko understand aur track karne mein help karta hai.

---

## 19. ✅ Completion Checklist

### Setup & Validation

- [x] Users, Organizations aur Auth modules generate kiye.
- [x] Required services aur resolver generate kiye.
- [x] bcrypt install aur build configuration check ki.
- [x] Global `ValidationPipe` configure kiya.
- [x] `RegisterInput` DTO create kiya.
- [x] Input validation rules define kiye.

### Database & Business Logic

- [x] Slug utility implement ki.
- [x] `OrganizationsService.createWithAdmin()` implement kiya.
- [x] `UsersService.findByEmail()` implement kiya.
- [x] `UsersService.create()` mein transaction client use kiya.
- [x] Module dependencies configure ki.
- [x] GraphQL User output type define kiya.
- [x] Password hashing implement ki.
- [x] Registration transaction implement ki.
- [x] Duplicate email handling implement ki.

### GraphQL & Testing

- [x] `register` mutation expose ki.
- [x] Successful registration test ki.
- [x] Duplicate email test ki.
- [x] Validation errors test kiye.
- [x] User, Organization aur OrganizationMember records verify kiye.

*Checklist ko apne actual implementation aur test results ke according maintain karna.*

---

## 20. 🧠 Quick Revision

| Concept | One-Line Definition |
|---|---|
| Registration | User account create karne ka process |
| DTO | Data ka structure define karne wala object |
| ValidationPipe | Incoming data ki validation apply karne wala NestJS pipe |
| bcrypt | Password hashing library |
| Hashing | Data ko one-way hash representation mein convert karna |
| Slug | URL-friendly text identifier |
| Service | Business logic handle karne wali class |
| Resolver | GraphQL request handle karne wala component |
| Prisma ORM | Database access aur queries manage karne wala tool |
| Transaction | Related database operations ko ek unit mein execute karna |
| Rollback | Failed transaction ke changes undo karna |
| Commit | Successful transaction ke changes persist karna |
| Dependency Injection | Dependencies ko framework ke through provide karna |
| Module | Related functionality aur providers ko organize karna |
| Race Condition | Concurrent operations ke timing se related problem |
| Unique Constraint | Duplicate unique values ko database mein prevent karne wala rule |
| `P2002` | Prisma ka unique constraint violation error code |
| GraphQL Object Type | API response ke available fields define karne wala type |
| Repository Pattern | Database access ko dedicated abstraction mein organize karna |
| SRP | Class ki responsibilities ko focused rakhne ka principle |
| ESM | JavaScript ka standard import/export module system |

### ⭐ Key Takeaways

1. **Transactions:** Related database operations ke liye same `tx` use karo.
2. **Data Integrity:** Application-level checks ke saath database constraints bhi zaroori hain.
3. **Password Security:** Plain-text passwords store mat karo.
4. **GraphQL Security:** Output types mein sirf required fields expose karo.
5. **ESM Imports:** Is project mein relative imports ke end mein `.js` extension use karo.
6. **Clean Architecture:** Responsibilities separate rakho, lekin unnecessary abstractions avoid karo.
7. **Testing:** Successful registration ke saath failure cases bhi verify karo.