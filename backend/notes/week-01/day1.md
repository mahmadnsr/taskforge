

# 📘 Day 1 — Backend Foundation
### WorkBench Project · NestJS + GraphQL

> **Objective:** NestJS + GraphQL ka clean, scalable aur working foundation prepare karna.  
> **Database:** ❌ Not connected yet  
> **Architecture:** NestJS + GraphQL + Apollo + ESM  
> **Package Manager:** pnpm

---

# 🎯 Day 1 Goals

Aaj ka primary focus backend ka **initial foundation** ready karna tha:

- [x] NestJS project scaffold
- [x] pnpm setup
- [x] ESM module system
- [x] GraphQL integration
- [x] Apollo Server integration
- [x] Code-first GraphQL schema
- [x] Environment configuration
- [x] Request validation packages
- [x] Dummy GraphQL resolver
- [x] GraphQL query testing
- [x] Git repository initialization

> **Important:** Day 1 par database intentionally connect nahi kiya gaya.  
> Database integration Day 2 mein Prisma + Neon PostgreSQL ke through ki jayegi.

---

# 1️⃣ Package Manager — pnpm

## Installation

```bash
npm i -g pnpm
```

`pnpm` ek fast aur disk-efficient Node.js package manager hai.

### Why pnpm?

Compared to traditional `npm`, pnpm:

- dependencies ko efficiently manage karta hai
- disk space kam use karta hai
- monorepo/workspace projects ke liye useful hai
- modern Node.js projects mein commonly use hota hai

---

## ⚠️ Corepack Cache Issue

Agar pnpm activate karte waqt Corepack cache corrupt ho jaye, to cache remove karke pnpm dobara activate kar sakte hain:

```bash
rm -rf ~/.cache/node/corepack/pnpm
corepack prepare pnpm@10 --activate
pnpm -v
```

### Verify

```bash
pnpm -v
```

Expected output:

```text
10.x.x
```

---

# 2️⃣ NestJS Project Scaffold

Project create karne ke liye:

```bash
pnpm dlx @nestjs/cli new work-bench
```

## `pnpm dlx` kya hai?

`pnpm dlx` roughly `npx` ke equivalent hai.

Iska benefit:

> Package ko globally install kiye bina temporarily execute kar sakte ho.

So:

```bash
pnpm dlx @nestjs/cli
```

NestJS CLI ko temporarily run karta hai.

---

## Project Directory

```bash
cd work-bench
```

---

## ⚙️ Scaffold Configuration

Project creation ke time:

| Setting | Choice |
|---|---|
| Package Manager | **pnpm** |
| Module System | **ESM** |
| `@nestjs/observe` | Enabled initially → later commented out |

### Why ESM?

ESM = **ECMAScript Modules**

Modern JavaScript/TypeScript projects mein standard module system hai.

Example:

```ts
import { Module } from '@nestjs/common';
```

instead of:

```ts
const { Module } = require('@nestjs/common');
```

---

# 3️⃣ GraphQL + Apollo Setup

GraphQL dependencies install ki:

```bash
pnpm add @nestjs/graphql @nestjs/apollo @apollo/server graphql
```

## 📦 Packages Explained

| Package | Purpose |
|---|---|
| `@nestjs/graphql` | NestJS ko GraphQL ke saath integrate karta hai |
| `@nestjs/apollo` | Apollo Server ko NestJS GraphQL driver ke roop mein connect karta hai |
| `@apollo/server` | Actual Apollo GraphQL server |
| `graphql` | GraphQL ka core implementation |

### Architecture

```text
Client
   │
   ▼
GraphQL Request
   │
   ▼
NestJS
   │
   ▼
@nestjs/graphql
   │
   ▼
Apollo Driver
   │
   ▼
Apollo Server
   │
   ▼
GraphQL Execution
```

---

# ⚠️ GraphQL Version Conflict

Installation ke time peer dependency conflict mila.

Problem:

```text
@apollo/server
        ↓
requires graphql ^16.11.0

Installed:
graphql 17.0.2 ❌
```

Apollo Server ke required GraphQL version ke saath installed version compatible nahi tha.

---

## ✅ Fix

Specific compatible major version install ki:

```bash
pnpm add graphql@^16.11.0
```

Result:

```text
graphql 16.14.2
```

### Important Learning

Latest version hamesha automatically **best choice** nahi hoti.

Dependencies ke beech compatibility check karna important hai:

```text
Package A
   ↓
requires Package B version X
   ↓
Package B ka incompatible version install
   ↓
Peer dependency conflict
```

---

# 4️⃣ Environment Configuration

Install:

```bash
pnpm add @nestjs/config
```

`@nestjs/config` ka purpose hai application configuration aur environment variables ko centrally manage karna.

Example `.env`:

```env
DATABASE_URL=...
PORT=3000
```

NestJS mein:

```ts
ConfigModule.forRoot({
  isGlobal: true,
})
```

use karne ke baad configuration application ke different modules mein easily available hoti hai.

### Why `isGlobal: true`?

Without global configuration:

```text
Every module
    ↓
ConfigModule import
```

With:

```ts
isGlobal: true
```

configuration globally available ho sakti hai.

---

# 5️⃣ Validation Setup

Install:

```bash
pnpm add class-validator class-transformer
```

## Packages

| Package | Purpose |
|---|---|
| `class-validator` | DTO validation ke liye decorators provide karta hai |
| `class-transformer` | Plain objects ko class instances mein transform karne mein help karta hai |

Example:

```ts
@IsEmail()
email: string;

@MinLength(8)
password: string;
```

---

## 🔄 Validation Flow

```text
Client Request
      │
      ▼
   Raw JSON
      │
      ▼
class-transformer
      │
      ▼
   DTO Instance
      │
      ▼
class-validator
      │
      ├──── Invalid ────► Validation Error
      │
      ▼
    Valid
      │
      ▼
 Resolver / Controller
```

### Example

Client sends:

```json
{
  "email": "wrong-email",
  "password": "123"
}
```

DTO:

```ts
class CreateUserDto {
  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;
}
```

Validation fail ho jayegi.

---

# 6️⃣ GraphQL Module Configuration

`src/app.module.ts`

```ts
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      playground: true,
    }),
  ],
  providers: [AppService, AppResolver],
})
export class AppModule {}
```

---

## 🔍 Configuration Breakdown

### `GraphQLModule.forRoot()`

```ts
GraphQLModule.forRoot(...)
```

Application ke root level par GraphQL configure karta hai.

Normally ise application mein ek central GraphQL configuration ke roop mein use kiya jata hai.

---

### `driver: ApolloDriver`

```ts
driver: ApolloDriver
```

NestJS ko batata hai ki GraphQL ke liye **Apollo Server driver** use karna hai.

---

### `autoSchemaFile: true`

```ts
autoSchemaFile: true
```

Ye **Code-First GraphQL** approach enable karta hai.

Matlab manually:

```text
schema.graphql
```

likhne ki zaroorat nahi.

Instead TypeScript decorators se GraphQL schema generate hota hai.

```text
TypeScript Classes
       +
GraphQL Decorators
       ↓
Generated GraphQL Schema
```

---

### `playground: true`

```ts
playground: true
```

GraphQL testing interface enable karta hai.

Development ke time browser se queries test karna easy hota hai.

---

# 7️⃣ First GraphQL Resolver

GraphQL setup ke baad ek error mila:

```text
GraphQLError:
Query root type must be provided.
```

## Why?

GraphQL schema completely empty tha.

GraphQL ko minimum ek root operation type chahiye, generally:

```text
Query
```

Code-first approach mein iske liye ek `@Query()` resolver define karna zaroori tha.

---

# 8️⃣ Dummy Resolver

`src/app.resolver.ts`

```ts
import { Query, Resolver } from '@nestjs/graphql';

@Resolver()
export class AppResolver {

  @Query(() => String)
  hello(): string {
    return 'Hello World';
  }

}
```

---

## 🔍 Resolver Explained

### `@Resolver()`

```ts
@Resolver()
```

Class ko GraphQL resolver ke roop mein mark karta hai.

Conceptually:

```text
REST
@Controller()
    ↓
Controller

GraphQL
@Resolver()
    ↓
Resolver
```

---

### `@Query(() => String)`

```ts
@Query(() => String)
```

GraphQL mein ek Query field define karta hai.

Is case mein:

```text
Query name  → hello
Return type → String
```

Function:

```ts
hello()
```

GraphQL query ban jaati hai:

```graphql
hello
```

---

# 9️⃣ Register Resolver

Resolver ko `app.module.ts` ke providers mein register karna zaroori hai:

```ts
providers: [
  AppService,
  AppResolver,
],
```

Complete relationship:

```text
AppModule
   │
   └── AppResolver
          │
          └── @Query()
                 │
                 ▼
              hello
```

---

# 🔟 Test GraphQL Query

Application start karo:

```bash
pnpm start:dev
```

GraphQL endpoint:

```text
http://localhost:3000/graphql
```

Query:

```graphql
query {
  hello
}
```

Expected response:

```json
{
  "data": {
    "hello": "Hello World"
  }
}
```

---

# 1️⃣1️⃣ Code-First GraphQL — Core Concept

WorkBench project mein hum **Code-First** approach use kar rahe hain.

### Traditional / Schema-First

```text
.graphql file
      ↓
Schema
      ↓
Resolvers
```

### Code-First

```text
TypeScript
    +
Decorators
    ↓
Generated GraphQL Schema
    ↓
Resolvers
```

### Why Code-First?

NestJS + TypeScript projects mein ye approach useful hai because:

- types ek hi place par maintain ho sakte hain
- TypeScript integration strong hoti hai
- decorators se schema readable rehta hai
- schema manually duplicate karne ki need kam hoti hai

---

# 1️⃣2️⃣ Project Structure

Current foundation:

```text
work-bench/
│
├── src/
│   │
│   ├── auth/
│   ├── users/
│   ├── organizations/
│   ├── common/
│   ├── config/
│   │
│   ├── app.module.ts
│   ├── app.resolver.ts
│   └── main.ts
│
├── .env
├── package.json
├── pnpm-lock.yaml
└── tsconfig.json
```

## Planned Modules

| Folder | Responsibility |
|---|---|
| `auth/` | Authentication & authorization |
| `users/` | User management |
| `organizations/` | Organization/workspace related logic |
| `common/` | Shared utilities, guards, decorators, etc. |
| `config/` | Application configuration |
| `app.module.ts` | Root application module |
| `app.resolver.ts` | Initial GraphQL resolver |
| `main.ts` | Application bootstrap |

> Folder structure abhi foundation level par hai. Features develop hone ke saath modules expand honge.

---

# 1️⃣3️⃣ Git Setup

Repository initialize:

```bash
git init
```

Files stage:

```bash
git add .
```

Initial commit:

```bash
git commit -m "chore: nestjs + graphql foundation setup"
```

### Commit Message

```text
chore:
```

generally setup/configuration type changes ke liye useful convention hai.

---

# 🧠 Important Concepts Learned

## 1. NestJS

NestJS ek structured Node.js backend framework hai jo:

```text
Modules
Controllers
Providers
Resolvers
Dependency Injection
Decorators
```

jaise concepts provide karta hai.

---

## 2. GraphQL

GraphQL API mein client specify karta hai ki usse exactly kaunsa data chahiye.

Example:

```graphql
query {
  hello
}
```

---

## 3. Resolver

Resolver GraphQL operation ko actual application logic se connect karta hai.

```text
GraphQL Query
     ↓
Resolver
     ↓
Business Logic
     ↓
Data Source
```

---

## 4. Apollo Server

Apollo Server GraphQL requests ko process aur execute karta hai.

Architecture:

```text
Client
  ↓
GraphQL
  ↓
NestJS
  ↓
Apollo
  ↓
Resolver
  ↓
Service
  ↓
Database
```

Database abhi connected nahi hai.

---

# 🛠️ Troubleshooting Log

## Problem 1 — GraphQL Peer Dependency Conflict

### Error

```text
@apollo/server requires graphql ^16.11.0
```

but:

```text
graphql 17.0.2
```

installed tha.

### Solution

```bash
pnpm add graphql@^16.11.0
```

Final compatible version:

```text
graphql 16.14.2
```

---

## Problem 2 — Query Root Missing

### Error

```text
GraphQLError:
Query root type must be provided.
```

### Cause

GraphQL schema mein koi `Query` defined nahi thi.

### Solution

```ts
@Query(() => String)
hello(): string {
  return 'Hello World';
}
```

---

# 📌 Day 1 Architecture

```text
                    ┌──────────────────┐
                    │      Client      │
                    └────────┬─────────┘
                             │
                             │ GraphQL Query
                             ▼
                    ┌──────────────────┐
                    │     NestJS       │
                    │                  │
                    │ GraphQLModule    │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │  Apollo Server   │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │    Resolver      │
                    │                  │
                    │    @Query()      │
                    └────────┬─────────┘
                             │
                             ▼
                         Response

                Database ❌ (Day 2)
```

---

# ✅ Day 1 Final Checklist

### Project Setup

- [x] pnpm installed/configured
- [x] NestJS project created
- [x] ESM enabled
- [x] `@nestjs/observe` removed/commented for now

### GraphQL

- [x] `@nestjs/graphql` installed
- [x] `@nestjs/apollo` installed
- [x] `@apollo/server` installed
- [x] `graphql` installed
- [x] GraphQL version conflict resolved
- [x] Code-first schema enabled
- [x] Apollo driver configured
- [x] GraphQL endpoint working
- [x] Dummy `hello` query working

### Backend Infrastructure

- [x] `@nestjs/config` installed
- [x] `class-validator` installed
- [x] `class-transformer` installed
- [x] Initial folder structure created

### Version Control

- [x] Git initialized
- [x] Initial commit created

---

# 🎯 Day 1 Outcome

At the end of Day 1, WorkBench ke paas ek clean backend foundation ready hai:

```text
NestJS
   +
TypeScript
   +
ESM
   +
GraphQL
   +
Apollo Server
   +
Config
   +
Validation
   +
Git
```

Database abhi intentionally add nahi kiya gaya.

---

# 🚀 Next — Day 2

### Prisma + Neon PostgreSQL

Day 2 mein focus hoga:

```text
Neon PostgreSQL
       ↓
Prisma ORM
       ↓
NestJS
       ↓
GraphQL
       ↓
Database-backed API
```

Expected topics:

- Prisma installation
- Neon PostgreSQL setup
- `DATABASE_URL`
- Prisma schema
- Migrations
- Prisma Client
- NestJS + Prisma integration
- First database model
- Database connection testing

---

## 📝 Quick Revision

```text
pnpm
 ↓
NestJS
 ↓
GraphQLModule
 ↓
ApolloDriver
 ↓
Apollo Server
 ↓
@Resolver()
 ↓
@Query()
 ↓
GraphQL Schema
```

**Day 1 = Backend + GraphQL foundation ✅**

