# 🚀 Phase 2 — Day 3: Organization Invitations

> **Project:** TaskForge  
> **Phase:** 2 — Organization & Team Management  
> **Day:** 3  
> **Backend Stack:** NestJS + GraphQL + Prisma ORM + PostgreSQL + Vitest  
> **Focus:** Organization Invitations, Role-Based Access Control (RBAC), Token Security, Transactions, Race Conditions

---

## 📌 1. Day 3 Overview

Day 2 tak TaskForge mein hum existing organization members ko fetch kar sakte the.

Lekin real-world applications mein organization ka ADMIN ya MANAGER naye users ko team mein invite bhi kar sakta hai.

For example:

- ADMIN apni organization mein MANAGER ya EMPLOYEE invite kar sakta hai.
- MANAGER sirf EMPLOYEE invite kar sakta hai.
- EMPLOYEE kisi ko invite nahi kar sakta.
- Invite ki expiry honi chahiye.
- Ek invitation ko multiple times accept nahi kiya ja sakta.
- Invitation sirf usi email wale account se accept hona chahiye jiske liye invite generate hua hai.

Isliye Day 3 mein hum **Organization Invitation System** implement karenge.

### 🎯 Learning Objectives

Day 3 complete karne ke baad tumhe ye concepts samajh aane chahiye:

- [x] Prisma mein `OrganizationInvitation` model banana.
- [x] Database migration create karna.
- [x] GraphQL input types aur mutations implement karna.
- [x] Role-Based Access Control (RBAC) enforce karna.
- [x] Cryptographically secure invitation token generate karna.
- [x] Raw token ke badle SHA-256 hash database mein store karna.
- [x] Invitation expiry implement karna.
- [x] Email normalization aur matching implement karna.
- [x] Single-use invitation enforce karna.
- [x] Race conditions aur atomic database operations samajhna.
- [x] Prisma transaction ke through invitation accept aur membership create karna.
- [x] Vitest se positive aur negative test cases likhna.
- [x] Apollo Sandbox se GraphQL mutations manually test karna.

### 🧠 Day 2 vs Day 3

| Day 2 | Day 3 |
|---|---|
| Existing members fetch karna | Naye members ko invite karna |
| Organization membership query | Invitation create mutation |
| User aur organization ka relationship read karna | Invitation accept karke membership create karna |
| Role ke according access check karna | Role ke according invitation permission enforce karna |
| GraphQL queries | GraphQL mutations |
| Existing membership | Invitation lifecycle |

### Expected Flow

```text
Organization ADMIN / MANAGER
           |
           | inviteMember()
           v
  OrganizationInvitation
           |
           | Secure invitation token
           v
     Invited User
           |
           | acceptInvitation()
           v
  Validate token + email + expiry
           |
           v
   Database Transaction
           |
           +---- Mark invitation accepted
           |
           +---- Create organization membership
           |
           v
   User becomes organization member
```

**Important:** Invitation create karne se user immediately organization ka member nahi banta. Membership tab create hoti hai jab invitation successfully accept hota hai.

---

# 📖 2. Important Definitions

In concepts ko samajhna important hai, kyunki invitation system mein security aur database consistency dono matter karte hain.

| Term | Meaning |
|---|---|
| **Invitation** | Ek database record jo batata hai ki kis email ko kis organization mein kis role ke saath invite kiya gaya hai. |
| **Invitation Token** | Ek secret random string jiske through invitation accept kiya ja sakta hai. |
| **Cryptographically Secure Randomness** | Aisi randomness jo security-sensitive tokens generate karne ke liye suitable ho. Node.js mein `crypto.randomBytes()` use karte hain. |
| **Hashing** | Data ko one-way transformation se fixed-length representation mein convert karna. |
| **SHA-256** | Ek cryptographic hash function jo token ka hash generate karta hai. |
| **bcrypt** | Ek deliberately slow password-hashing algorithm jo passwords ke brute-force attacks ko expensive banata hai. |
| **Entropy** | Kisi secret mein unpredictability ki quantity. |
| **TTL — Time to Live** | Koi token ya invitation kitne samay tak valid rahega. |
| **Expiry** | Woh time jiske baad invitation accept nahi kiya ja sakta. |
| **Single-use Token** | Aisa token jo successful acceptance ke baad dobara use nahi ho sakta. |
| **`acceptedAt`** | Nullable timestamp jo batata hai ki invitation accept hua hai ya nahi. |
| **Atomic Operation** | Database operation jo ek indivisible operation ki tarah execute hota hai. |
| **Race Condition** | Jab multiple concurrent requests ke execution order ki wajah se incorrect result aa sakta hai. |
| **Database Transaction** | Multiple database operations ko ek unit ki tarah execute karna: sab successful honge ya failure par rollback hoga. |
| **RBAC** | Role-Based Access Control; permissions user ke role ke according determine hoti hain. |
| **P2002** | Prisma ka known error code jo unique constraint violation indicate karta hai. |
| **Information Leakage** | Error messages ya responses se attacker ko internal information milna. |
| **Normalization** | Equivalent input values ko consistent format mein convert karna, jaise email ko lowercase karna. |
| **Idempotency** | Kisi operation ko repeat karne par uska final effect unexpectedly duplicate na hona. |
| **Foreign Key** | Database constraint jo related records ke beech relationship maintain karta hai. |
| **Unique Constraint** | Database rule jo duplicate values ya duplicate combinations ko prevent karta hai. |

---

## 2.1 Invitation Token Kya Hai?

Suppose ADMIN kisi naye user ko invite karta hai.

System ek random token generate karta hai:

```text
e4a8f0c1...long-random-secret...
```

User ko real application mein email ke through invitation link mil sakta hai:

```text
https://taskforge.example/invitations/accept?token=<secret-token>
```

User authenticated account se invitation accept karta hai.

Backend token ko verify karke check karta hai:

1. Kya token valid hai?
2. Kya invitation expire nahi hua?
3. Kya invitation pehle accept nahi hua?
4. Kya logged-in user ki email invited email se match karti hai?

Saari checks pass hone par user organization ka member ban sakta hai.

**Security rule:** Token ko password ki tarah secret treat karna chahiye. Jis kisi ke paas valid token ho, woh invitation accept karne ki koshish kar sakta hai—subject to authentication aur email-match checks.

---

## 2.2 Hashing vs Encryption

| Hashing | Encryption |
|---|---|
| One-way transformation | Reversible with the appropriate key |
| Original value normally recover nahi kar sakte | Decryption se original value recover kar sakte hain |
| Token verification ke liye useful | Confidential data ko recoverable form mein store karne ke liye useful |
| Example: SHA-256 | Example: AES |

Hamare invitation system mein original token ki zaroorat sirf invite create karte waqt hoti hai.

Accept karte waqt backend received token ka hash calculate karke database mein stored hash se match karta hai.

Isliye raw token database mein store karne ki zaroorat nahi hai.

---

## 2.3 SHA-256 vs bcrypt

Passwords aur random invitation tokens ki security requirements different hoti hain.

### Password

User password predictable ya low-entropy ho sakta hai.

Example:

```text
password123
```

Attacker common passwords try kar sakta hai. Isliye passwords ke liye bcrypt ya Argon2 jaise deliberately slow password-hashing algorithms useful hote hain.

### Invitation Token

Hum generate karenge:

```ts
randomBytes(32).toString('hex');
```

Ismein 32 random bytes hote hain, yani 256 bits of randomness.

Possible combinations:

```text
2^256
```

Yeh bahut badi search space hai.

Isliye high-entropy random token ke liye SHA-256 suitable hai.

SHA-256 deterministic bhi hai:

```text
SHA256(token) = same hash every time
```

Isse database mein `tokenHash` ke through direct lookup possible hota hai.

**Important:** SHA-256 password hashing ka replacement nahi hai. Yahan iska use high-entropy random token ke liye ho raha hai.

---

# 🏗️ 3. System Design Decisions

Implementation start karne se pehle design decisions samajhna important hai.

## 3.1 Raw Token Database Mein Store Nahi Karenge

Database mein ye store hoga:

```text
tokenHash
```

Ye nahi:

```text
rawToken
```

Reason:

Agar database leak ho jaye, toh attacker ko directly usable invitation tokens nahi milne chahiye.

Backend raw token ko hash karke store karega:

```ts
const token = randomBytes(32).toString('hex');
const tokenHash = hashToken(token);
```

Database:

```text
tokenHash = SHA256(rawToken)
```

Development environment mein testing ke liye raw token response mein return hoga.

Production environment mein token response mein `null` return hoga. Real email delivery Phase 5 mein implement karni hai.

---

## 3.2 Token Hash Unique Hoga

Prisma schema:

```prisma
tokenHash String @unique
```

Reason:

Har invitation token hash uniquely identify hona chahiye.

Isse database token hash ke through invitation ko efficiently find kar sakta hai.

---

## 3.3 Role-Based Invitation Permissions

TaskForge mein teen roles hain:

```text
ADMIN
MANAGER
EMPLOYEE
```

Permissions:

| Caller Role | Invite EMPLOYEE | Invite MANAGER | Invite ADMIN |
|---|---:|---:|---:|
| ADMIN | Yes | Yes | Yes |
| MANAGER | Yes | No | No |
| EMPLOYEE | No | No | No |
| Non-member | No | No | No |

Reason:

Agar MANAGER kisi ko ADMIN invite kar sake, toh woh organization mein unauthorized privilege escalation kar sakta hai.

Isliye role rules service layer mein enforce honge.

**Important:** GraphQL input mein role specify kar dena permission nahi deta. Backend ko har request mein caller ka actual database role verify karna hoga.

---

## 3.4 Caller Membership Pehle Check Karenge

Sabse pehle verify hoga ki caller organization ka member hai ya nahi.

```text
Caller membership check
          |
          v
    Is caller a member?
       /       \
     No         Yes
     |           |
    403       Check role
```

Agar caller organization ka member hi nahi hai, toh system ko invitation-related data checks continue nahi karne chahiye.

Isse unauthorized access aur information leakage ka risk kam hota hai.

---

## 3.5 Email Normalize Karenge

Input:

```text
"  New@Test.COM "
```

Normalize hone ke baad:

```text
"new@test.com"
```

Code:

```ts
const email = input.email.trim().toLowerCase();
```

Isse leading/trailing spaces aur uppercase/lowercase differences handle hote hain.

Invitation accept karte waqt bhi email normalize karke compare ki jayegi.

---

## 3.6 Duplicate Invitations Prevent Karenge

Do checks honge:

### Check A: User Already Member Hai

Agar invited email wala user organization ka existing member hai, toh naya invitation create nahi karenge.

Expected response:

```text
This user is already a member
```

### Check B: Active Invitation Already Exists

Active invitation ka matlab:

```text
acceptedAt = null
expiresAt > current time
```

Agar same organization mein same email ke liye active invitation hai, toh duplicate invitation reject hoga.

Expected response:

```text
An active invitation already exists for this email
```

**Limitation:** Service-level `findFirst` check concurrent requests ke against complete duplicate prevention guarantee nahi karta. Do simultaneous requests dono check pass karke duplicate invitations create kar sakti hain. Strict prevention ke liye database-level partial unique index jaise solution ki zaroorat ho sakti hai.

---

## 3.7 Invitation Accept Karne Wale User Ki Email Match Honi Chahiye

Invitation mein email:

```text
new@test.com
```

Logged-in user ki database email:

```text
someone-else@test.com
```

Result:

```text
Invalid or expired invitation
```

Sirf token jaan lena sufficient nahi hai. Logged-in user ki email invitation ke email se match honi chahiye.

Email client input se nahi, database se read ki jayegi.

---

## 3.8 Accept Failures Ke Liye Generic Error

In cases mein same error return hoga:

- Token exist nahi karta.
- Token expire ho gaya.
- Token pehle use ho chuka hai.
- Logged-in user ki email match nahi karti.
- Kisi concurrent request ne invitation pehle claim kar liya.

Response:

```text
Invalid or expired invitation
```

Reason:

Alag-alag errors dene se attacker ko token ke status ke baare mein unnecessary information mil sakti hai.

---

## 3.9 Atomic Claim + Transaction

Invitation accept karne ke waqt do major operations honge:

1. Invitation ko accepted mark karna.
2. Organization membership create karna.

Dono ek database transaction ke andar execute honge.

```text
BEGIN TRANSACTION
       |
       v
Mark invitation accepted
       |
       v
Create organization membership
       |
       v
Both successful?
   /          \
 Yes           No
  |             |
COMMIT        ROLLBACK
```

Agar membership creation fail ho, toh invitation ka `acceptedAt` update bhi rollback hona chahiye.

Isse invitation accepted mark hokar waste nahi hota jabki membership create hi nahi hui.

---

# 🔄 4. Request Flow

## 4.1 `inviteMember` Flow

```text
Client
  |
  | Authorization: Bearer <accessToken>
  | organizationId, email, role
  v
JwtAuthGuard
  |
  v
InvitationsResolver
  |
  v
InvitationsService.inviteMember()
  |
  +--> Check caller membership
  |
  +--> Check caller role
  |
  +--> Check existing membership
  |
  +--> Check active invitation
  |
  +--> Generate random token
  |
  +--> Hash token
  |
  +--> Create invitation with 7-day expiry
  |
  v
Return invitation details
```

Expected behavior:

| Condition | Result |
|---|---|
| Caller organization member nahi hai | `403 Forbidden` |
| Caller EMPLOYEE hai | `403 Forbidden` |
| MANAGER ADMIN/MANAGER invite kar raha hai | `403 Forbidden` |
| Email already member hai | `409 Conflict` |
| Active invitation already hai | `409 Conflict` |
| All checks pass | Invitation create |

---

## 4.2 `acceptInvitation` Flow

```text
Client
  |
  | Authorization: Bearer <accessToken>
  | token
  v
JwtAuthGuard
  |
  v
InvitationsResolver
  |
  v
InvitationsService.acceptInvitation()
  |
  +--> Fetch logged-in user's email
  |
  +--> Hash received token
  |
  +--> Find invitation by tokenHash
  |
  +--> Check expiry
  |
  +--> Check acceptedAt
  |
  +--> Match normalized email
  |
  v
Database Transaction
  |
  +--> Atomic invitation claim
  |
  +--> Create organization membership
  |
  +--> Fetch organization
  |
  v
Return organization
```

Agar token invalid ho ya invitation expired ho:

```text
Invalid or expired invitation
```

Agar user already organization member ho aur membership creation unique constraint fail kare, toh `409 Conflict` return hoga aur transaction rollback hona chahiye.

---

# 🗄️ 5. Database Schema

## 5.1 `OrganizationInvitation` Model

File:

```text
prisma/schema.prisma
```

Add this model:

```prisma
model OrganizationInvitation {
  id             String    @id @default(uuid())
  organizationId String
  email          String
  role           Role
  tokenHash      String    @unique
  invitedById    String
  expiresAt      DateTime
  acceptedAt     DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  invitedBy    User         @relation("InvitationsSent", fields: [invitedById], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@index([email])
}
```

### Back-relations

Existing `Organization` model ke andar add karo:

```prisma
invitations OrganizationInvitation[]
```

Existing `User` model ke andar add karo:

```prisma
sentInvitations OrganizationInvitation[] @relation("InvitationsSent")
```

**Important:** In fields ko existing models ke andar add karna hai. `Organization` aur `User` ke duplicate models create nahi karne hain.

---

## 5.2 Field-by-Field Explanation

| Field | Purpose |
|---|---|
| `id` | Invitation ka unique identifier |
| `organizationId` | Kis organization ke liye invitation hai |
| `email` | Kis email ko invite kiya gaya hai |
| `role` | Accept hone par user ko kaunsa role milega |
| `tokenHash` | Raw token ka SHA-256 hash |
| `invitedById` | Kis user ne invitation create kiya |
| `expiresAt` | Invitation ki expiry timestamp |
| `acceptedAt` | Invitation accept hone ka timestamp; `null` means pending |
| `createdAt` | Record create hone ka time |
| `updatedAt` | Record last update hone ka time |
| `organization` | Organization ke saath relation |
| `invitedBy` | Invitation create karne wale user ke saath relation |

### Why `acceptedAt` Nullable Hai?

Initially:

```text
acceptedAt = null
```

Invitation pending hai.

Accept hone ke baad:

```text
acceptedAt = 2026-10-11T10:30:00.000Z
```

Invitation accept ho chuka hai.

Isse invitation lifecycle track kar sakte hain.

### Why `onDelete: Cascade`?

```prisma
onDelete: Cascade
```

Organization delete hone par usse associated invitations bhi delete ho jayengi.

Isi tarah, invitation create karne wale user ko delete karne par uske associated invitations bhi delete ho sakte hain.

**Design consideration:** Production systems mein user deletion aur audit history requirements ke according cascade behavior carefully choose karna chahiye.

### Why `@@index([organizationId])`?

Organization ke invitations ko organization ID se filter karne ke liye index useful hai.

### Why `@@index([email])`?

Email ke through invitations search karne ke liye index useful hai.

### Why `tokenHash` Unique Hai?

```prisma
tokenHash String @unique
```

Isse ek token hash ek hi invitation ko identify karega.

Prisma is field ke liye unique lookup support karta hai:

```ts
findUnique({
  where: { tokenHash: hashToken(token) },
});
```

---

## 5.3 Migration Commands

Schema update karne ke baad:

```bash
pnpm prisma validate
pnpm prisma migrate dev --name add_organization_invitations
```

Agar Prisma Client types updated nahi dikh rahe:

```bash
pnpm prisma generate
```

Phir VS Code mein:

```text
Ctrl + Shift + P
```

Search:

```text
TypeScript: Restart TS Server
```

### Migration vs Generate

| Command | Purpose |
|---|---|
| `pnpm prisma validate` | Prisma schema validate karta hai |
| `pnpm prisma migrate dev` | Development database ke liye migration create/apply karta hai |
| `pnpm prisma generate` | Prisma Client generate karta hai |

Migration database schema ko update karti hai. `generate` TypeScript/JavaScript code ke liye Prisma Client regenerate karta hai.

---

# 🧾 6. GraphQL DTOs and Entities

## 6.1 `InviteMemberInput`

File:

```text
src/organizations/dto/invite-member.input.ts
```

```ts
import { Field, ID, InputType } from '@nestjs/graphql';
import { Role } from '@prisma/client';
import { IsEmail, IsEnum, IsUUID } from 'class-validator';

@InputType()
export class InviteMemberInput {
  @Field(() => ID)
  @IsUUID()
  organizationId!: string;

  @Field()
  @IsEmail()
  email!: string;

  @Field(() => Role)
  @IsEnum(Role)
  role!: Role;
}
```

### Explanation

`@InputType()` class ko GraphQL input object banata hai.

`@Field(() => ID)` GraphQL schema mein field ko ID type ke roop mein expose karta hai.

`@IsUUID()` input validation ke liye use hota hai.

`@IsEmail()` email format validate karta hai.

`@IsEnum(Role)` ensure karta hai ki role valid enum value ho.

Example input:

```json
{
  "organizationId": "ORG_UUID_HERE",
  "email": "employee@example.com",
  "role": "EMPLOYEE"
}
```

**Important:** Validation decorators tabhi automatically execute honge jab application mein appropriate validation pipeline, jaise `ValidationPipe`, configure ho. Agar invalid inputs reject nahi ho rahe, toh global ya resolver-level validation configuration verify karna.

Validation aur authorization different hain:

- Validation check karti hai ki input format sahi hai ya nahi.
- Authorization check karti hai ki caller ko operation karne ki permission hai ya nahi.

---

## 6.2 `AcceptInvitationInput`

File:

```text
src/organizations/dto/accept-invitation.input.ts
```

```ts
import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

@InputType()
export class AcceptInvitationInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  token!: string;
}
```

### Why Only Token?

Client sirf token provide karega.

Client ko ye decide nahi karne dena chahiye:

```text
userId
organizationId
role
email
```

Ye values trusted database records se determine hongi.

Agar client apni taraf se `role: ADMIN` ya kisi doosre `userId` ko submit kar sake, toh authorization bypass ka risk badh sakta hai.

### Why `MaxLength(128)`?

Token input ki maximum length constrain hoti hai.

Hamare 32-byte hexadecimal token ki length:

```text
32 bytes × 2 hexadecimal characters = 64 characters
```

128-character limit expected token se badi hai, lekin unnecessarily huge input ko reject karti hai.

---

## 6.3 `OrganizationInvitation` GraphQL Entity

File:

```text
src/organizations/entities/organization-invitation.entity.ts
```

```ts
import { Field, ID, ObjectType } from '@nestjs/graphql';
import { Role } from '@prisma/client';

@ObjectType()
export class OrganizationInvitation {
  @Field(() => ID)
  id!: string;

  @Field()
  email!: string;

  @Field(() => Role)
  role!: Role;

  @Field()
  expiresAt!: Date;

  // Sirf dev me, invite create karte waqt ek baar.
  // Production me null; real app me token email se jayega.
  @Field(() => String, { nullable: true })
  inviteToken?: string | null;
}
```

### Why `inviteToken` Nullable Hai?

Development mein email service implement nahi hui hai.

Isliye testing ke liye raw token response mein return karte hain.

Production mein:

```json
{
  "inviteToken": null
}
```

Real application mein invitation link email service ke through bheja jayega.

### Important Security Note

Sirf response mein `null` return karna complete production security design nahi hai.

Production mein ensure karna hoga ki:

- Raw token logs mein accidentally print na ho.
- Token errors ya analytics events mein leak na ho.
- Invitation links HTTPS use karein.
- Token ko frontend URLs aur browser logs mein unnecessary exposure se bachaya jaye.
- Production email delivery aur token lifecycle securely handle ho.

### Role Enum Registration

Day 2 mein `Role` enum ko `organization-member.entity.ts` mein GraphQL ke liye register kiya ja chuka hai.

Isliye `Role` enum ko dobara register nahi karna hai.

---

# ⚙️ 7. Invitations Service

File:

```text
src/organizations/invitations.service.ts
```

Ye Day 3 ka main business-logic component hai.

Is service mein:

1. Invitation create hoga.
2. Role permissions check hongi.
3. Email normalize hogi.
4. Duplicate invitations prevent karne ki koshish hogi.
5. Secure token generate hoga.
6. Token hash database mein store hoga.
7. Invitation accept hoga.
8. Transaction ke andar membership create hogi.

### Complete Code

```ts
import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { InviteMemberInput } from './dto/invite-member.input.js';

const NOT_A_MEMBER = 'You are not a member of this organization';
const INVALID_INVITE = 'Invalid or expired invitation';
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 din

// Token high-entropy random hai, isliye fast SHA-256 kaafi hai.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class InvitationsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async inviteMember(callerId: string, input: InviteMemberInput) {
    const { organizationId, role } = input;
    const email = input.email.trim().toLowerCase();

    const caller = await this.prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: callerId,
          organizationId,
        },
      },
      select: { role: true },
    });

    if (!caller) {
      throw new ForbiddenException(NOT_A_MEMBER);
    }

    if (caller.role === Role.EMPLOYEE) {
      throw new ForbiddenException('Insufficient role');
    }

    if (caller.role === Role.MANAGER && role !== Role.EMPLOYEE) {
      throw new ForbiddenException(
        'Managers can only invite employees',
      );
    }

    const existingMember = await this.prisma.organizationMember.findFirst({
      where: {
        organizationId,
        user: {
          email: {
            equals: email,
            mode: 'insensitive',
          },
        },
      },
      select: { id: true },
    });

    if (existingMember) {
      throw new ConflictException('This user is already a member');
    }

    const pending = await this.prisma.organizationInvitation.findFirst({
      where: {
        organizationId,
        email,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });

    if (pending) {
      throw new ConflictException(
        'An active invitation already exists for this email',
      );
    }

    const token = randomBytes(32).toString('hex');

    const invitation = await this.prisma.organizationInvitation.create({
      data: {
        organizationId,
        email,
        role,
        tokenHash: hashToken(token),
        invitedById: callerId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
      },
    });

    const isProduction =
      this.config.get<string>('NODE_ENV') === 'production';

    return {
      ...invitation,
      inviteToken: isProduction ? null : token,
    };
  }

  async acceptInvitation(userId: string, token: string) {
    // Email hamesha DB se read karni hai.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      throw new BadRequestException(INVALID_INVITE);
    }

    const invitation =
      await this.prisma.organizationInvitation.findUnique({
        where: { tokenHash: hashToken(token) },
        select: {
          id: true,
          organizationId: true,
          email: true,
          role: true,
          expiresAt: true,
          acceptedAt: true,
        },
      });

    const now = new Date();

    // Sab failure cases ka same error.
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.expiresAt <= now ||
      invitation.email !== user.email.trim().toLowerCase()
    ) {
      throw new BadRequestException(INVALID_INVITE);
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomic claim: parallel requests me sirf ek successful claim karega.
      const claimed = await tx.organizationInvitation.updateMany({
        where: {
          id: invitation.id,
          acceptedAt: null,
          expiresAt: { gt: now },
        },
        data: { acceptedAt: now },
      });

      if (claimed.count === 0) {
        throw new BadRequestException(INVALID_INVITE);
      }

      try {
        await tx.organizationMember.create({
          data: {
            userId,
            organizationId: invitation.organizationId,
            role: invitation.role,
          },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          throw new ConflictException(
            'You are already a member of this organization',
          );
        }

        throw e;
      }

      return tx.organization.findUniqueOrThrow({
        where: { id: invitation.organizationId },
      });
    });
  }
}
```

---

## 7.1 Understanding `hashToken()`

```ts
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
```

Breakdown:

```ts
createHash('sha256')
```

SHA-256 hash operation initialize karta hai.

```ts
.update(token)
```

Token ko hash input ke roop mein deta hai.

```ts
.digest('hex')
```

Hash result ko hexadecimal string mein convert karta hai.

Example:

```ts
const token = 'example-secret-token';

const hash = hashToken(token);

console.log(hash);
```

Output ek fixed-length hexadecimal SHA-256 hash hoga.

**Important:** Actual security token `randomBytes(32)` se generate hota hai. Upar diya gaya example sirf hashing samjhane ke liye hai.

---

## 7.2 Understanding Token Generation

```ts
const token = randomBytes(32).toString('hex');
```

`randomBytes(32)` 32 random bytes generate karta hai.

Har byte hexadecimal mein represent karne par 2 characters leta hai.

Therefore:

```text
32 × 2 = 64 hex characters
```

Token example:

```text
a3f1...64-character-hex-string...
```

Actual token random hota hai; upar wala format illustrative hai.

---

## 7.3 Understanding Invitation Expiry

```ts
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
```

Calculation:

```text
7 days
× 24 hours
× 60 minutes
× 60 seconds
× 1000 milliseconds
```

Total:

```text
604,800,000 milliseconds
```

Expiry calculate hoti hai:

```ts
expiresAt: new Date(Date.now() + INVITE_TTL_MS)
```

Agar invitation create karte waqt current time Monday 10:00 AM hai, toh approximate expiry agle Monday 10:00 AM hogi.

---

## 7.4 Understanding Role Authorization

```ts
if (!caller) {
  throw new ForbiddenException(NOT_A_MEMBER);
}
```

Caller organization ka member nahi hai, toh request reject.

```ts
if (caller.role === Role.EMPLOYEE) {
  throw new ForbiddenException('Insufficient role');
}
```

EMPLOYEE invitation create nahi kar sakta.

```ts
if (caller.role === Role.MANAGER && role !== Role.EMPLOYEE) {
  throw new ForbiddenException(
    'Managers can only invite employees',
  );
}
```

MANAGER sirf EMPLOYEE invite kar sakta hai.

ADMIN par ye MANAGER-specific restriction apply nahi hoti.

---

## 7.5 Understanding Existing Member Check

```ts
const existingMember = await this.prisma.organizationMember.findFirst({
  where: {
    organizationId,
    user: {
      email: {
        equals: email,
        mode: 'insensitive',
      },
    },
  },
  select: { id: true },
});
```

Ye organization ke existing members mein normalized email ke corresponding user ko search karta hai.

Agar user already member hai:

```ts
if (existingMember) {
  throw new ConflictException('This user is already a member');
}
```

Yahan `findFirst()` use hua hai, kyunki query organization membership aur related user email ke basis par filter kar rahi hai.

---

## 7.6 Understanding Active Invitation Check

```ts
const pending = await this.prisma.organizationInvitation.findFirst({
  where: {
    organizationId,
    email,
    acceptedAt: null,
    expiresAt: { gt: new Date() },
  },
  select: { id: true },
});
```

Active invitation ke liye teen conditions hain:

```text
organizationId matches
AND email matches
AND acceptedAt is null
AND expiresAt is in the future
```

Agar active invitation milti hai, toh duplicate request reject hoti hai.

**Limitation:** Ye application-level pre-check hai. Strict concurrency-safe duplicate prevention ke liye database-level enforcement consider karna chahiye.

---

## 7.7 Understanding `findUnique()` by Token Hash

```ts
const invitation =
  await this.prisma.organizationInvitation.findUnique({
    where: { tokenHash: hashToken(token) },
  });
```

Client raw token send karta hai.

Backend:

```text
Raw token
    |
    v
SHA-256 hash
    |
    v
Database lookup by tokenHash
```

Raw token database query mein directly use nahi hota.

---

## 7.8 Understanding Atomic Claim

```ts
const claimed = await tx.organizationInvitation.updateMany({
  where: {
    id: invitation.id,
    acceptedAt: null,
    expiresAt: { gt: now },
  },
  data: { acceptedAt: now },
});
```

Ye operation conditionally invitation update karta hai.

Update tabhi successful hogi jab:

```text
acceptedAt IS NULL
AND expiresAt > now
```

Agar invitation pehle kisi aur request ne claim kar li, toh matching record update nahi hoga.

```ts
if (claimed.count === 0) {
  throw new BadRequestException(INVALID_INVITE);
}
```

`count === 0` ka matlab claim nahi hua.

### Race Condition Example

Maan lo same token ke saath do requests almost simultaneously aati hain.

```text
Request A                  Request B
    |                          |
    | Check invitation         | Check invitation
    | acceptedAt = null        | acceptedAt = null
    |                          |
    +------------+-------------+
                 |
                 v
         Atomic conditional update
                 |
           +-----+-----+
           |           |
       Request A   Request B
        count=1     count=0
           |           |
         Pass        Reject
```

Dono requests initial read mein invitation pending dekh sakti hain.

Lekin conditional database update ki wajah se dono successfully claim nahi kar sakti.

**Important:** Atomic claim ko transaction ke andar rakhna aur unique membership constraints maintain karna overall consistency ke liye zaroori hai.

---

## 7.9 Understanding Prisma Transaction

```ts
return this.prisma.$transaction(async (tx) => {
  // Claim invitation
  // Create membership
  // Return organization
});
```

Transaction ke andar `tx` transactional Prisma client hai.

Iske through:

```ts
tx.organizationInvitation.updateMany(...)
```

aur:

```ts
tx.organizationMember.create(...)
```

same transaction ka part bante hain.

Agar transaction ke andar error throw hota hai, toh transaction rollback ho jata hai.

Example:

```text
Invitation acceptedAt update successful
              |
              v
Membership creation fails
              |
              v
Transaction rollback
              |
              v
acceptedAt update bhi rollback
```

Isse invitation ko consumed mark karke membership create na hone wali inconsistent state avoid hoti hai.

---

## 7.10 Understanding Prisma Error `P2002`

```ts
if (
  e instanceof Prisma.PrismaClientKnownRequestError &&
  e.code === 'P2002'
) {
  throw new ConflictException(
    'You are already a member of this organization',
  );
}
```

`P2002` unique constraint violation indicate karta hai.

Is implementation mein membership create karte waqt user aur organization ka unique membership constraint violate ho sakta hai.

Example:

```text
userId = u1
organizationId = org1
```

Agar ye membership pehle se exist karti hai, toh duplicate membership create nahi honi chahiye.

Service conflict error return karti hai.

**Important:** Prisma errors ko unke actual context ke according map karna chahiye. Har `P2002` ko automatically "already a member" kehna tabhi correct hai jab failed operation ka relevant unique constraint wahi membership constraint ho.

---

# 🌐 8. GraphQL Resolver

File:

```text
src/organizations/invitations.resolver.ts
```

```ts
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { InvitationsService } from './invitations.service.js';
import { OrganizationInvitation } from './entities/organization-invitation.entity.js';
import { Organization } from './entities/organization.entity.js';
import { InviteMemberInput } from './dto/invite-member.input.js';
import { AcceptInvitationInput } from './dto/accept-invitation.input.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Resolver(() => OrganizationInvitation)
export class InvitationsResolver {
  constructor(private invitationsService: InvitationsService) {}

  @Mutation(() => OrganizationInvitation)
  @UseGuards(JwtAuthGuard)
  inviteMember(
    @CurrentUser() user: { id: string },
    @Args('input') input: InviteMemberInput,
  ) {
    return this.invitationsService.inviteMember(user.id, input);
  }

  @Mutation(() => Organization)
  @UseGuards(JwtAuthGuard)
  acceptInvitation(
    @CurrentUser() user: { id: string },
    @Args('input') input: AcceptInvitationInput,
  ) {
    return this.invitationsService.acceptInvitation(user.id, input.token);
  }
}
```

---

## 8.1 Resolver Responsibilities

Resolver GraphQL request receive karta hai aur service ko delegate karta hai.

Example:

```text
GraphQL Client
      |
      v
InvitationsResolver
      |
      v
InvitationsService
      |
      v
Prisma / Database
```

Resolver mein business logic bharne ke bajay service ko use karna code ko organized aur testable banata hai.

### `@Mutation()`

```ts
@Mutation(() => OrganizationInvitation)
```

GraphQL schema mein mutation register karta hai.

### `@UseGuards(JwtAuthGuard)`

```ts
@UseGuards(JwtAuthGuard)
```

Mutation execute hone se pehle authentication guard run karta hai.

### `@CurrentUser()`

```ts
@CurrentUser() user: { id: string }
```

Authenticated user ka context retrieve karta hai.

### `@Args('input')`

```ts
@Args('input') input: InviteMemberInput
```

GraphQL request se `input` argument receive karta hai.

---

## 8.2 Authentication vs Authorization

Ye difference important hai.

**Authentication:** User kaun hai?

Example:

```text
JWT valid hai?
```

**Authorization:** User ko operation karne ki permission hai?

Example:

```text
User organization ka ADMIN hai?
```

`JwtAuthGuard` authentication handle karta hai.

`InvitationsService` organization membership aur role checks ke through authorization enforce karta hai.

Sirf authenticated hone ka matlab ye nahi ki user kisi bhi organization mein invitations create kar sakta hai.

---

# 🧩 9. Organizations Module

File:

```text
src/organizations/organizations.module.ts
```

Day 3 ke liye module ka relevant structure:

```ts
import { Module } from '@nestjs/common';
import { OrganizationsService } from './organizations.service.js';
import { OrganizationsResolver } from './organizations.resolver.js';
import { OrganizationMembersResolver } from './organization-members.resolver.js';
import { InvitationsService } from './invitations.service.js';
import { InvitationsResolver } from './invitations.resolver.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  providers: [
    OrganizationsService,
    OrganizationsResolver,
    OrganizationMembersResolver,
    InvitationsService,
    InvitationsResolver,
  ],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
```

### Why Add `InvitationsService` and `InvitationsResolver`?

NestJS Dependency Injection system ko batana hota hai ki ye providers module ka part hain.

Agar service provider register nahi kiya, toh NestJS dependency resolution error de sakta hai.

### Why `PrismaModule`?

`InvitationsService` ko `PrismaService` chahiye.

```ts
constructor(private prisma: PrismaService, ...)
```

Isliye module ko `PrismaModule` import karna hota hai, assuming `PrismaModule` `PrismaService` ko export karta hai.

### What About `ConfigService`?

Is project setup mein `ConfigModule` global (`isGlobal: true`) configure hai.

Isliye `ConfigService` ko har feature module mein separately import karne ki zaroorat nahi hai.

Agar future mein global configuration remove karte ho, toh `ConfigModule` ko appropriate module mein import karna hoga.

---

# 🧪 10. Automated Testing

Day 3 mein do main test files hain:

```text
src/organizations/invitations.service.spec.ts
src/organizations/invitations.accept.spec.ts
```

Total:

```text
11 invite tests
+ 9 accept tests
= 20 invitation-related unit tests
```

---

## 10.1 Invite Service Tests

File:

```text
src/organizations/invitations.service.spec.ts
```

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  InvitationsService,
  hashToken,
} from './invitations.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('InvitationsService.inviteMember', () => {
  const memberFindUnique = vi.fn();
  const memberFindFirst = vi.fn();
  const inviteFindFirst = vi.fn();
  const inviteCreate = vi.fn();
  const configGet = vi.fn();

  const prisma = {
    organizationMember: {
      findUnique: memberFindUnique,
      findFirst: memberFindFirst,
    },
    organizationInvitation: {
      findFirst: inviteFindFirst,
      create: inviteCreate,
    },
  } as unknown as PrismaService;

  const config = {
    get: configGet,
  } as unknown as ConfigService;

  let service: InvitationsService;

  const input = (
    over: Partial<{ email: string; role: any }> = {},
  ) => ({
    organizationId: 'o1',
    email: 'new@test.com',
    role: 'EMPLOYEE' as any,
    ...over,
  });

  beforeEach(() => {
    vi.resetAllMocks();

    configGet.mockReturnValue('development');

    memberFindUnique.mockResolvedValue({ role: 'ADMIN' });
    memberFindFirst.mockResolvedValue(null);
    inviteFindFirst.mockResolvedValue(null);

    inviteCreate.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'i1',
        email: data.email,
        role: data.role,
        expiresAt: data.expiresAt,
      }),
    );

    service = new InvitationsService(prisma, config);
  });

  it('ADMIN can invite any role', async () => {
    const res = await service.inviteMember(
      'u1',
      input({ role: 'ADMIN' }),
    );

    expect(res.role).toBe('ADMIN');
  });

  it('MANAGER can invite an EMPLOYEE', async () => {
    memberFindUnique.mockResolvedValue({ role: 'MANAGER' });

    const res = await service.inviteMember(
      'u1',
      input({ role: 'EMPLOYEE' }),
    );

    expect(res.role).toBe('EMPLOYEE');
  });

  it('MANAGER cannot invite MANAGER or ADMIN', async () => {
    memberFindUnique.mockResolvedValue({ role: 'MANAGER' });

    await expect(
      service.inviteMember('u1', input({ role: 'MANAGER' })),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.inviteMember('u1', input({ role: 'ADMIN' })),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(inviteCreate).not.toHaveBeenCalled();
  });

  it('EMPLOYEE cannot invite', async () => {
    memberFindUnique.mockResolvedValue({ role: 'EMPLOYEE' });

    await expect(
      service.inviteMember('u1', input()),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(inviteCreate).not.toHaveBeenCalled();
  });

  it('non-member (cross-tenant) is rejected before anything is created', async () => {
    memberFindUnique.mockResolvedValue(null);

    await expect(
      service.inviteMember('u2', input()),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(memberFindFirst).not.toHaveBeenCalled();
    expect(inviteCreate).not.toHaveBeenCalled();
  });

  it('rejects an email that is already a member', async () => {
    memberFindFirst.mockResolvedValue({ id: 'm9' });

    await expect(
      service.inviteMember('u1', input()),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when an active invitation already exists', async () => {
    inviteFindFirst.mockResolvedValue({ id: 'i0' });

    await expect(
      service.inviteMember('u1', input()),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('normalizes the email to lowercase', async () => {
    await service.inviteMember(
      'u1',
      input({ email: '  New@Test.COM ' }),
    );

    expect(inviteCreate.mock.calls[0][0].data.email).toBe(
      'new@test.com',
    );
  });

  it('stores only the token hash, never the raw token', async () => {
    const res = await service.inviteMember('u1', input());

    const data = inviteCreate.mock.calls[0][0].data;

    expect(res.inviteToken).toBeTruthy();
    expect(data.tokenHash).toBe(
      hashToken(res.inviteToken as string),
    );
    expect(data.tokenHash).not.toBe(res.inviteToken);
    expect(JSON.stringify(data)).not.toContain(
      res.inviteToken as string,
    );
  });

  it('sets expiry about 7 days ahead', async () => {
    const before = Date.now();

    await service.inviteMember('u1', input());

    const exp =
      inviteCreate.mock.calls[0][0].data.expiresAt.getTime();

    const week = 7 * 24 * 60 * 60 * 1000;

    expect(exp - before).toBeGreaterThanOrEqual(week - 1000);
    expect(exp - before).toBeLessThanOrEqual(week + 5000);
  });

  it('does not return the raw token in production', async () => {
    configGet.mockReturnValue('production');

    const res = await service.inviteMember('u1', input());

    expect(res.inviteToken).toBeNull();
  });
});
```

### Test Concepts

#### `vi.fn()`

Vitest mock function create karta hai.

```ts
const inviteCreate = vi.fn();
```

Isse hum check kar sakte hain ki function call hua ya nahi, kis arguments ke saath call hua, aur usne kya return kiya.

#### `mockResolvedValue()`

```ts
memberFindUnique.mockResolvedValue({ role: 'ADMIN' });
```

Asynchronous mock ko successful resolved value deta hai.

#### `mockRejectedValue()`

Asynchronous mock ko reject karne ke liye use hota hai.

#### `beforeEach()`

Har test se pehle mocks reset aur default values configure karta hai.

#### `expect(...).rejects`

Asynchronous function ke rejection ko test karta hai.

Example:

```ts
await expect(
  service.inviteMember('u1', input()),
).rejects.toBeInstanceOf(ForbiddenException);
```

---

## 10.2 Invite Test Coverage

| Test | Expected Behavior |
|---|---|
| ADMIN invite karta hai | Allowed |
| MANAGER EMPLOYEE invite karta hai | Allowed |
| MANAGER ADMIN invite karta hai | Rejected |
| MANAGER MANAGER invite karta hai | Rejected |
| EMPLOYEE invite karta hai | Rejected |
| Non-member invite karta hai | Rejected |
| Email already member hai | Conflict |
| Active invitation already hai | Conflict |
| Email uppercase/spaces mein hai | Normalize hoti hai |
| Raw token store nahi hota | Sirf hash store hota hai |
| Expiry set hoti hai | Approx. 7 days |
| Production mode | Token response mein `null` |

**Note:** MANAGER ke do prohibited roles ek test case mein verify kiye gaye hain. Isliye test case count aur individual assertions ki count different ho sakti hai.

---

## 10.3 Accept Service Tests

File:

```text
src/organizations/invitations.accept.spec.ts
```

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  InvitationsService,
  hashToken,
} from './invitations.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('InvitationsService.acceptInvitation', () => {
  const userFindUnique = vi.fn();
  const inviteFindUnique = vi.fn();
  const transaction = vi.fn();
  const updateMany = vi.fn();
  const memberCreate = vi.fn();
  const orgFindUniqueOrThrow = vi.fn();

  const tx = {
    organizationInvitation: { updateMany },
    organizationMember: { create: memberCreate },
    organization: { findUniqueOrThrow: orgFindUniqueOrThrow },
  };

  const prisma = {
    user: { findUnique: userFindUnique },
    organizationInvitation: { findUnique: inviteFindUnique },
    $transaction: transaction,
  } as unknown as PrismaService;

  const config = {
    get: vi.fn(),
  } as unknown as ConfigService;

  let service: InvitationsService;

  const future = () =>
    new Date(Date.now() + 60 * 60 * 1000);

  const past = () =>
    new Date(Date.now() - 60 * 60 * 1000);

  const validInvite = () => ({
    id: 'i1',
    organizationId: 'o1',
    email: 'new@test.com',
    role: 'EMPLOYEE',
    expiresAt: future(),
    acceptedAt: null,
  });

  beforeEach(() => {
    vi.resetAllMocks();

    userFindUnique.mockResolvedValue({
      email: 'new@test.com',
    });

    inviteFindUnique.mockResolvedValue(validInvite());
    updateMany.mockResolvedValue({ count: 1 });
    memberCreate.mockResolvedValue({ id: 'm1' });

    orgFindUniqueOrThrow.mockResolvedValue({
      id: 'o1',
      name: 'Org',
      slug: 'org',
    });

    transaction.mockImplementation(
      (cb: (t: typeof tx) => unknown) => cb(tx),
    );

    service = new InvitationsService(prisma, config);
  });

  it('adds the user with the invited role and marks the invite accepted', async () => {
    const org = await service.acceptInvitation('u9', 'raw-token');

    expect(org).toEqual({
      id: 'o1',
      name: 'Org',
      slug: 'org',
    });

    expect(memberCreate).toHaveBeenCalledWith({
      data: {
        userId: 'u9',
        organizationId: 'o1',
        role: 'EMPLOYEE',
      },
    });

    expect(
      updateMany.mock.calls[0][0].data.acceptedAt,
    ).toBeInstanceOf(Date);
  });

  it('looks the invite up by hash, never by the raw token', async () => {
    await service.acceptInvitation('u9', 'raw-token');

    expect(inviteFindUnique.mock.calls[0][0].where).toEqual({
      tokenHash: hashToken('raw-token'),
    });
  });

  it('rejects an unknown token', async () => {
    inviteFindUnique.mockResolvedValue(null);

    await expect(
      service.acceptInvitation('u9', 'x'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects an expired invitation', async () => {
    inviteFindUnique.mockResolvedValue({
      ...validInvite(),
      expiresAt: past(),
    });

    await expect(
      service.acceptInvitation('u9', 't'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(memberCreate).not.toHaveBeenCalled();
  });

  it('rejects an already accepted invitation (no reuse)', async () => {
    inviteFindUnique.mockResolvedValue({
      ...validInvite(),
      acceptedAt: new Date(),
    });

    await expect(
      service.acceptInvitation('u9', 't'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(memberCreate).not.toHaveBeenCalled();
  });

  it('rejects when the logged-in email does not match the invite', async () => {
    userFindUnique.mockResolvedValue({
      email: 'someone-else@test.com',
    });

    await expect(
      service.acceptInvitation('u9', 't'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('matches the email case-insensitively', async () => {
    userFindUnique.mockResolvedValue({
      email: ' New@Test.COM ',
    });

    await expect(
      service.acceptInvitation('u9', 't'),
    ).resolves.toBeDefined();
  });

  it('rejects when another request claimed the invite first (race)', async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.acceptInvitation('u9', 't'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(memberCreate).not.toHaveBeenCalled();
  });

  it('returns Conflict when the user is already a member', async () => {
    memberCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint',
        {
          code: 'P2002',
          clientVersion: 'test',
        },
      ),
    );

    await expect(
      service.acceptInvitation('u9', 't'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
```

---

## 10.4 Accept Test Coverage

| Test | Expected Behavior |
|---|---|
| Valid invitation | Membership create hoti hai |
| Token lookup | Raw token ke badle hash use hota hai |
| Unknown token | Reject |
| Expired token | Reject |
| Already accepted token | Reject |
| Email mismatch | Reject |
| Case-insensitive email | Accept |
| Atomic claim fails | Reject |
| Membership unique constraint violation | Conflict |

### Important Testing Limitation

`transaction.mockImplementation((cb) => cb(tx))` ek simplified mock hai.

Ye actual database transaction ya rollback behavior simulate nahi karta.

Similarly, `updateMany` ka mocked `count` race condition ka result simulate karta hai; ye do real concurrent database requests execute nahi karta.

Actual concurrency aur rollback verify karne ke liye database integration tests bhi useful honge.

---

# 🧪 11. Commands and Project Setup

## 11.1 Create Files

Agar files pehle se create nahi hain, toh:

```bash
mkdir -p src/organizations/dto
mkdir -p src/organizations/entities

touch src/organizations/dto/invite-member.input.ts
touch src/organizations/dto/accept-invitation.input.ts

touch src/organizations/entities/organization-invitation.entity.ts

touch src/organizations/invitations.service.ts
touch src/organizations/invitations.resolver.ts

touch src/organizations/invitations.service.spec.ts
touch src/organizations/invitations.accept.spec.ts
```

**Important:** Agar ye files already exist karti hain, toh dobara create karne ki zaroorat nahi hai.

---

## 11.2 Format Code

```bash
pnpm prettier --write src/organizations
```

Prettier code formatting consistent rakhta hai.

---

## 11.3 Build

```bash
pnpm build
```

Build TypeScript compilation aur project ke configured build checks verify karta hai.

Expected result:

```text
No compilation errors
```

---

## 11.4 Run Tests

```bash
pnpm test
```

Expected:

- Existing tests pass.
- Invitation service tests pass.
- Invitation acceptance tests pass.

Source notes mein Day 3 ke liye 11 invite tests aur 9 accept tests documented hain.

---

## 11.5 Start Development Server

```bash
pnpm start:dev
```

Verify:

```text
Nest application successfully started
```

Server start karna important hai, kyunki build aur unit tests ke pass hone ke bawajood Dependency Injection wiring ya module configuration issue ho sakta hai.

---

# 🌐 12. Manual Testing — Apollo Sandbox

Automated unit tests ke baad GraphQL API ko manually test karna hai.

Manual testing verify karegi ki:

- JWT authentication work kar raha hai.
- GraphQL schema expose ho raha hai.
- Resolver service ko call kar raha hai.
- Database records create aur update ho rahe hain.
- Actual API expected errors return kar rahi hai.

## 12.1 Test Setup

Apollo Sandbox ke liye setup:

1. Tab 1 mein `RegisterMatrixThree` mutation run karo.
2. Email: `matrix3@test.com`
3. Organization name: `Matrix Org Three`
4. `LoginMatrixThree` run karo.
5. Teeno users ke access tokens note karo.
6. Organization IDs note karo.

Users:

```text
matrix1@test.com
matrix2@test.com
matrix3@test.com
```

Tokens ko distinguish karne ke liye:

```text
MATRIX1_TOKEN
MATRIX2_TOKEN
MATRIX3_TOKEN
```

Organization IDs:

```text
ORG1_ID
ORG2_ID
ORG3_ID
```

**Important:** Ye sirf local testing placeholders hain. Real UUIDs aur access tokens use karne hain.

Access tokens approximately 15 minutes mein expire hote hain, according to the existing project notes.

Register/login par 5 requests per minute ki limit hai. Throttle error aaye toh rate-limit window expire hone ka wait karo.

---

## 12.2 Authentication Headers

Apollo Sandbox ke HTTP Headers panel mein:

```json
{
  "Authorization": "Bearer YOUR_ACCESS_TOKEN"
}
```

`YOUR_ACCESS_TOKEN` ki jagah actual token paste karo.

Token ko angle brackets ke saath mat bhejna.

Incorrect:

```text
Bearer <YOUR_ACCESS_TOKEN>
```

Correct:

```text
Bearer eyJhbGciOi...
```

Agar header nahi diya:

```text
Missing access token
```

Expected behavior.

---

## 12.3 Mutation: `inviteMember`

GraphQL mutation:

```graphql
mutation InviteMember($input: InviteMemberInput!) {
  inviteMember(input: $input) {
    id
    email
    role
    expiresAt
    inviteToken
  }
}
```

Variables:

```json
{
  "input": {
    "organizationId": "ORG1_REAL_ID",
    "email": "matrix3@test.com",
    "role": "EMPLOYEE"
  }
}
```

Headers:

```json
{
  "Authorization": "Bearer MATRIX1_ACCESS_TOKEN"
}
```

Expected successful response ka shape:

```json
{
  "data": {
    "inviteMember": {
      "id": "INVITATION_ID",
      "email": "matrix3@test.com",
      "role": "EMPLOYEE",
      "expiresAt": "EXPIRY_TIMESTAMP",
      "inviteToken": "RAW_TOKEN_RETURNED_IN_DEVELOPMENT"
    }
  }
}
```

Actual ID, timestamp aur token generated values honge.

**Important:** Development mein `inviteToken` response se copy karo. Accept mutation mein isi token ka use hoga.

---

## 12.4 Mutation: `acceptInvitation`

GraphQL mutation:

```graphql
mutation AcceptInvitation($input: AcceptInvitationInput!) {
  acceptInvitation(input: $input) {
    id
    name
    slug
  }
}
```

Variables:

```json
{
  "input": {
    "token": "ACTUAL_INVITE_TOKEN"
  }
}
```

Headers:

```json
{
  "Authorization": "Bearer MATRIX3_ACCESS_TOKEN"
}
```

Expected successful response ka shape:

```json
{
  "data": {
    "acceptInvitation": {
      "id": "ORG1_REAL_ID",
      "name": "Matrix Org One",
      "slug": "matrix-org-one"
    }
  }
}
```

Organization ke actual values tumhare database par depend karenge.

---

# 📋 13. Manual Test Checklist

## 13.1 `inviteMember` Tests

Tab 7 mein `inviteMember` mutation use karo.

| ID | Test | Headers | Expected Result |
|---|---|---|---|
| I1 | `matrix1` invites `matrix3@test.com` as EMPLOYEE | Matrix1 token | Invitation ID, expiry aur dev token return ho |
| I2 | Wahi invitation dobara create karo | Matrix1 token | `An active invitation already exists for this email` |
| I3 | `matrix1@test.com` ko invite karo | Matrix1 token | `This user is already a member` |
| I4 | Matrix2 token se ORG1 mein invite create karo, jab matrix2 ORG1 ka member nahi hai | Matrix2 token | `You are not a member of this organization` |
| I5 | Invalid email `not-an-email` bhejo | Matrix1 token | Validation error, agar ValidationPipe configured hai |
| I6 | Header empty rakho | No token | `Missing access token` |
| I7 | Database mein token record check karo | N/A | `tokenHash` store ho; raw token database field mein na ho |

### I1 — Success

Verify:

- Invitation record create hui.
- Email normalized hai.
- Role EMPLOYEE hai.
- Expiry approximately 7 days future mein hai.
- Development mode mein `inviteToken` return hua.

### I2 — Duplicate Invitation

Same organization aur email ke liye second active invitation create karne ki koshish karo.

Expected:

```text
An active invitation already exists for this email
```

### I3 — Existing Member

Agar `matrix1@test.com` already ORG1 ka member hai, toh use dobara invite karne par conflict aana chahiye.

### I4 — Non-member

Matrix2 ka token use karo aur ORG1 mein invitation create karne ki koshish karo.

Agar matrix2 ORG1 ka member nahi hai, toh request reject honi chahiye.

### I5 — Invalid Email

```json
{
  "input": {
    "organizationId": "ORG1_REAL_ID",
    "email": "not-an-email",
    "role": "EMPLOYEE"
  }
}
```

`@IsEmail()` decorator input validate karta hai.

Lekin automatic rejection ke liye ValidationPipe configured hona zaroori hai.

### I6 — Missing Authentication

Authorization header remove kar do.

Expected:

```text
Missing access token
```

### I7 — Database Verification

Prisma Studio mein `OrganizationInvitation` model open karo.

Check:

```text
tokenHash
```

Stored value SHA-256 hash honi chahiye, raw token nahi.

---

## 13.2 `acceptInvitation` Tests

Tab 8 mein `acceptInvitation` mutation use karo.

**Order follow karna important hai**, kyunki successful acceptance token ko single-use bana deti hai.

| Order | ID | Headers | Variables | Expected |
|---|---|---|---|---|
| 1 | A1 | Matrix2 token | Valid invite token | `Invalid or expired invitation` |
| 2 | A4 | Matrix3 token | `{"input":{"token":"abc123"}}` | `Invalid or expired invitation` |
| 3 | A5 | Empty headers | Valid invite token | `Missing access token` |
| 4 | A2 | Matrix3 token | Valid invite token | Organization details |
| 5 | A3 | Matrix3 token | Same token again | `Invalid or expired invitation` |
| 6 | A6 | Matrix2 token | Expired invitation token | `Invalid or expired invitation` |

### A1 — Email Mismatch

Matrix2 ke access token ke saath matrix3 ke invitation token ko accept karne ki koshish karo.

Expected:

```text
Invalid or expired invitation
```

Logged-in user ki email invited email se match nahi karti.

### A4 — Invalid Token

```json
{
  "input": {
    "token": "abc123"
  }
}
```

Expected:

```text
Invalid or expired invitation
```

### A5 — Missing Authentication

Authorization header remove karo.

Expected:

```text
Missing access token
```

### A2 — Successful Acceptance

Matrix3 ke token se invitation accept karo.

Expected:

- Organization details return hon.
- `OrganizationInvitation.acceptedAt` set ho.
- Matrix3 organization ka member ban jaye.
- Membership role EMPLOYEE ho.

### A3 — Reuse Attempt

A2 successful hone ke baad same invitation token dobara use karo.

Expected:

```text
Invalid or expired invitation
```

### A6 — Expired Invitation

Prisma Studio mein test invitation ki `expiresAt` past mein set karo.

Phir invitation accept karne ki koshish karo.

Expected:

```text
Invalid or expired invitation
```

**Important:** Existing test records modify karte waqt correct invitation identify karna. Galat record edit karne se baaki tests affect ho sakte hain.

---

## 13.3 Database Checks After Successful Acceptance

A2 successful hone ke baad ye checks karo.

| ID | Location | Expected Result |
|---|---|---|
| D1 | Organization Members query | Matrix1 ADMIN aur Matrix3 EMPLOYEE, total 2 members |
| D2 | Prisma Studio → `OrganizationInvitation` | Matrix3 invitation ki `acceptedAt` filled ho |
| D3 | Matrix3 token se `inviteMember` try karo | `Insufficient role` |

### D1 — Membership Check

Matrix1 token se Organization Members query execute karo.

Expected:

```text
matrix1@test.com → ADMIN
matrix3@test.com → EMPLOYEE
```

### D2 — Invitation State

Prisma Studio mein invitation record check karo.

Before acceptance:

```text
acceptedAt = null
```

After acceptance:

```text
acceptedAt = timestamp
```

### D3 — Role Authorization

Matrix3 ab EMPLOYEE hai.

Uske token se invitation create karne ki koshish karo.

Expected:

```text
Insufficient role
```

Ye verify karta hai ki role restrictions sirf invitation create karte waqt nahi, balki actual caller role ke according enforce ho rahi hain.

---

# 🐛 14. Common Errors and Fixes

| Error | Possible Reason | Fix |
|---|---|---|
| `Property 'organizationInvitation' does not exist on type 'PrismaClient...'` | Prisma Client types outdated hain ya schema/client generation incomplete hai | `pnpm prisma generate` run karo, phir TypeScript server restart karo |
| `TS2610: 'organizationInvitation' is defined as an accessor...` | `PrismaService` mein manually `organizationInvitation: any;` add kar diya gaya | Manual property declaration delete karo |
| Paste karne par indentation kharab | Code formatting inconsistent hai | `pnpm prettier --write src/organizations` |
| `An active invitation already exists for this email` | Same email ke liye active invitation already hai | Existing invitation check karo; zaroorat par dedicated test record use karo |
| `Variable "$input" of required type ... was not provided` | GraphQL Variables panel empty hai ya variable shape galat hai | `{"input": {...}}` format use karo |
| `Missing access token` | Authorization header missing ya invalid hai | `Authorization: Bearer <actual-token>` set karo |
| Invitation accept karne ke baad same token fail | Token single-use hai | New invitation create karke new token use karo |
| Register/login throttle error | Rate limit exceed hui | Rate-limit window expire hone ka wait karo |
| `ConfigService` dependency error | Module/configuration wiring issue | `ConfigModule` global hai ya appropriate module mein imported hai, verify karo |
| GraphQL enum error | Role enum registration/schema configuration issue | Existing `Role` GraphQL enum registration verify karo |
| Invalid email accept ho rahi hai | ValidationPipe missing ho sakta hai | Global ya resolver-level validation configuration check karo |

---

## 14.1 Prisma Client Property Error

Agar error aaye:

```text
Property 'organizationInvitation' does not exist on type 'PrismaClient'
```

Pehle verify karo:

```bash
pnpm prisma validate
pnpm prisma generate
```

Phir VS Code:

```text
Ctrl + Shift + P
```

Search:

```text
TypeScript: Restart TS Server
```

### Important

`PrismaService` generally `PrismaClient` ko extend karta hai.

Isliye Prisma model delegates manually define nahi karne chahiye.

Incorrect workaround:

```ts
organizationInvitation: any;
```

Ye asli problem solve nahi karta aur generated Prisma Client ke saath conflict kar sakta hai.

---

# 🧠 15. Interview Questions and Answers

## Q1. How do you securely store invitation tokens?

**Answer:**

We generate a cryptographically secure random token using Node.js `randomBytes(32)`.

The raw token is returned only for development testing and is not stored in the database. Instead, we store its SHA-256 hash in a unique `tokenHash` column.

When the user accepts an invitation, the backend hashes the submitted token and looks up the invitation using that hash.

This reduces the risk of exposing usable invitation tokens if the database is leaked.

---

## Q2. Why SHA-256 instead of bcrypt for invitation tokens?

**Answer:**

Passwords may have low entropy and can be guessed using dictionary or brute-force attacks. Therefore, passwords should use a suitable password-hashing algorithm such as bcrypt or Argon2.

Our invitation token contains 32 cryptographically random bytes, providing 256 bits of randomness. Brute-forcing such a token is computationally infeasible under the assumed security of the random generator.

SHA-256 is therefore suitable for hashing these high-entropy tokens. It is also deterministic, allowing direct lookup by the token hash.

---

## Q3. What happens if two requests accept the same invitation simultaneously?

**Answer:**

Both requests may initially read the invitation while `acceptedAt` is still `null`.

To prevent both from claiming it, we perform a conditional atomic update:

```ts
updateMany({
  where: {
    id: invitation.id,
    acceptedAt: null,
    expiresAt: { gt: now },
  },
  data: {
    acceptedAt: now,
  },
});
```

Only a request that successfully matches and updates the pending invitation can proceed. A request that updates zero rows is rejected.

The membership creation and invitation claim occur in one transaction.

---

## Q4. Why do we use a database transaction?

**Answer:**

Accepting an invitation involves two related operations:

1. Marking the invitation as accepted.
2. Creating the organization membership.

If the first operation succeeds but the second fails, the invitation could otherwise be consumed without creating membership.

A transaction ensures that both operations succeed together or roll back together.

---

## Q5. Why return the same error for invalid, expired and used invitations?

**Answer:**

Different error messages can reveal whether a token exists, whether it has expired, or whether it has already been used.

Returning a generic message:

```text
Invalid or expired invitation
```

reduces unnecessary information disclosure.

---

## Q6. Why must the logged-in user's email match the invitation email?

**Answer:**

An invitation is intended for a specific email address.

Even if a token is exposed or forwarded accidentally, requiring the authenticated user's email to match the invitation email provides an additional restriction.

The email must be read from the database rather than trusted from client input.

---

## Q7. Why can a MANAGER invite only EMPLOYEES?

**Answer:**

This is an RBAC policy that prevents unauthorized privilege escalation.

If a MANAGER could invite another ADMIN, the MANAGER could potentially grant administrative privileges without authorization.

Therefore, only an ADMIN can invite users with ADMIN or MANAGER roles under the current policy.

---

## Q8. How are duplicate pending invitations prevented?

**Answer:**

Before creating an invitation, the service checks whether an unaccepted, unexpired invitation already exists for the same organization and normalized email.

If one exists, it returns a conflict error.

However, this service-level check alone does not fully prevent duplicates under simultaneous requests. A database-level partial unique index or another concurrency-safe design may be required for strict enforcement.

---

## Q9. Why does the development response contain the raw invitation token?

**Answer:**

The email delivery feature has not been implemented yet.

For development testing, the raw token is returned in the response so it can be used with the `acceptInvitation` mutation.

In production, the response returns `null`, and the token is intended to be delivered through an email invitation link.

The raw token should never be persisted in the invitation database record.

---

## Q10. What is the purpose of `acceptedAt`?

**Answer:**

`acceptedAt` tracks the invitation lifecycle.

Initially:

```text
acceptedAt = null
```

After successful acceptance:

```text
acceptedAt = timestamp
```

It helps prevent the same invitation from being reused.

---

## Q11. What is the difference between authentication and authorization?

**Answer:**

Authentication establishes who the caller is.

Authorization determines whether that caller is allowed to perform a specific operation.

In TaskForge:

- `JwtAuthGuard` handles authentication.
- `InvitationsService` checks organization membership and role-based permissions.

An authenticated user is not automatically authorized to invite users into every organization.

---

## Q12. What does Prisma error `P2002` mean?

**Answer:**

`P2002` indicates a unique constraint violation.

During invitation acceptance, creating membership may fail if the user is already a member of the organization.

The service maps the relevant membership uniqueness violation to a `ConflictException`.

---

## Q13. What is a race condition?

**Answer:**

A race condition occurs when concurrent operations interact in a way that can produce an incorrect result.

For example, two requests may both read an invitation as pending and attempt to accept it.

A conditional atomic database update ensures that only one request successfully claims the invitation.

---

## Q14. What is the purpose of `@UseGuards(JwtAuthGuard)`?

**Answer:**

It applies the JWT authentication guard to a resolver method.

The guard validates the request's authentication credentials and makes the authenticated user context available to the resolver.

The service still needs to enforce authorization rules based on organization membership and role.

---

## Q15. Why use a separate `InvitationsService`?

**Answer:**

It separates invitation-specific business logic from general organization management logic.

This improves modularity, readability and testability.

The resolver handles GraphQL requests, the service handles business rules, and Prisma handles database operations.

---

## Q16. Why normalize email addresses?

**Answer:**

Email input may contain leading/trailing spaces or different letter casing.

Applying:

```ts
email.trim().toLowerCase()
```

provides a consistent representation for invitation creation and email matching.

---

## Q17. What do the invitation unit tests cover?

**Answer:**

The invite tests cover role permissions, non-member rejection, existing membership, duplicate active invitations, email normalization, token hashing, expiry and production token handling.

The acceptance tests cover successful membership creation, hash lookup, invalid and expired tokens, single-use behavior, email matching, failed atomic claims and unique-constraint conflicts.

---

# ⚠️ 16. Important Implementation Notes

Ye points current implementation ko samajhne aur future mein improve karne ke liye important hain.

## 16.1 Production Token Delivery

Current implementation:

```ts
const isProduction =
  this.config.get<string>('NODE_ENV') === 'production';

return {
  ...invitation,
  inviteToken: isProduction ? null : token,
};
```

Ye development mein testing allow karta hai.

Production mein `null` return hota hai, lekin isse invitation delivery automatically implement nahi hoti.

Actual production flow mein:

```text
Create invitation
       |
       v
Store token hash
       |
       v
Build invitation URL
       |
       v
Send email
       |
       v
User opens invitation
       |
       v
Authenticated user accepts
```

Email delivery Phase 5 mein implement karni hai.

---

## 16.2 Duplicate Invitation Concurrency

Current implementation:

```text
findFirst()
    |
    v
No active invitation found
    |
    v
create()
```

Do simultaneous requests dono `findFirst()` mein no invitation dekh sakti hain.

Isliye strict database-level duplicate prevention ke liye additional constraints ya concurrency-safe logic consider karna chahiye.

---

## 16.3 Email Case Sensitivity

Invitation creation email ko lowercase karti hai:

```ts
const email = input.email.trim().toLowerCase();
```

Acceptance par current code:

```ts
invitation.email !== user.email.trim().toLowerCase()
```

Left side par stored invitation email use hoti hai, jo service ke through create hui invitation ke liye normalized honi chahiye.

Agar legacy ya manually inserted records mein uppercase email ho, toh stored invitation email ko bhi normalize karke compare karna safer hoga:

```ts
invitation.email.trim().toLowerCase() !==
  user.email.trim().toLowerCase()
```

Ye improvement especially tab useful hai jab database mein older records ya alternate creation paths exist karte hon.

---

## 16.4 Membership Unique Constraint

`OrganizationMember` model mein user aur organization combination uniquely constrained hona chahiye.

Conceptually:

```text
One user + one organization = one membership
```

Isse same user ki duplicate membership prevent hoti hai.

Exact Prisma constraint project ke existing schema ke according verify karna.

---

## 16.5 Authentication Token Expiry vs Invitation Expiry

Dono different hain.

| Token | Purpose | Expiry |
|---|---|---|
| JWT access token | API request authenticate karna | Project ke JWT configuration ke according |
| Invitation token | Organization invitation accept karna | Current implementation mein 7 days |

JWT expire ho jaane par user ko dobara login karna pad sakta hai.

Invitation token expire ho jaane par nayi invitation create karni pad sakti hai.

---

# 🧾 17. Day 3 Completion Checklist

## Database

- [x] `OrganizationInvitation` model add kiya.
- [x] `Organization` aur `User` back-relations add kiye.
- [x] `tokenHash` unique field configure ki.
- [x] `expiresAt` field add ki.
- [x] `acceptedAt` nullable field add ki.
- [x] Organization aur email indexes add kiye.
- [x] Migration create/apply ki.

## GraphQL

- [x] `InviteMemberInput` create kiya.
- [x] `AcceptInvitationInput` create kiya.
- [x] `OrganizationInvitation` entity create ki.
- [x] `inviteMember` mutation implement ki.
- [x] `acceptInvitation` mutation implement ki.
- [x] JWT authentication guard apply kiya.

## Business Logic

- [x] ADMIN invitation permissions.
- [x] MANAGER invitation restrictions.
- [x] EMPLOYEE invitation rejection.
- [x] Non-member rejection.
- [x] Existing member check.
- [x] Duplicate active invitation check.
- [x] Email normalization.
- [x] Secure random token generation.
- [x] SHA-256 token hashing.
- [x] Seven-day expiry.
- [x] Email-match validation.
- [x] Single-use invitation.
- [x] Atomic claim.
- [x] Transaction-based membership creation.

## Testing

- [x] Invite service unit tests.
- [x] Acceptance service unit tests.
- [x] Build verification.
- [x] Test suite verification.
- [x] Development server startup verification.
- [ ] All manual Sandbox invitation tests pass.
- [ ] All manual Sandbox acceptance tests pass.
- [ ] Database state verified after successful acceptance.
- [ ] EMPLOYEE invitation restriction verified manually.

## Git

- [x] Database migration commit.
- [x] Invitation feature commit.
- [x] Git push.
- [ ] Notes repository mein paste aur commit.

**Note:** Original Day 3 work log mein build, tests, server startup aur Git work complete mark kiye gaye hain. Sandbox checklist ko actual testing ke baad hi complete mark karna.

---

# 📝 18. Git Commands

Schema aur feature ko separate commits mein rakhna useful hai.

### Check Current Changes

```bash
git status
```

### Review Changes

```bash
git diff
```

### Stage Database Migration

```bash
git add .
git status
```

Schema aur migration changes verify karne ke baad:

```bash
git commit -m "feat(db): add OrganizationInvitation model and migration"
```

### Stage Feature Changes

```bash
git add .
git status
```

Phir:

```bash
git commit -m "feat(organizations): add invitations with hashed tokens and acceptInvitation"
```

### Push

```bash
git push
```

**Important:** `git add .` use karne se pehle `git status` check karna, taaki `.env`, access tokens, secrets ya unrelated files accidentally commit na ho jayein.

---

# 🔁 19. Quick Revision Notes

Agar interview ya revision se pehle sirf key points dekhne hain, toh ye section revise karo.

### Invitation Creation

```text
Authenticate caller
       |
       v
Check organization membership
       |
       v
Check role permissions
       |
       v
Check existing member
       |
       v
Check active invitation
       |
       v
Generate random token
       |
       v
Hash token using SHA-256
       |
       v
Store hash + expiry
       |
       v
Return development token
```

### Invitation Acceptance

```text
Authenticate user
       |
       v
Fetch user email from DB
       |
       v
Hash submitted token
       |
       v
Find invitation by hash
       |
       v
Check expiry + acceptedAt + email
       |
       v
Atomic conditional update
       |
       v
Create membership in transaction
       |
       v
Return organization
```

### Must-Remember Concepts

| Concept | Remember This |
|---|---|
| Token generation | `randomBytes(32)` |
| Token hashing | SHA-256 |
| Token storage | Hash only |
| Token expiry | 7 days |
| Single-use state | `acceptedAt` |
| Atomic claim | Conditional `updateMany()` |
| Membership consistency | Database transaction |
| Existing membership | Unique constraint |
| Role permissions | Service-level authorization |
| Authentication | `JwtAuthGuard` |
| Generic failure | `Invalid or expired invitation` |
| Prisma unique error | `P2002` |
| Unit testing | Vitest |
| Manual API testing | Apollo Sandbox |

---

# 🎯 20. Final Takeaway

Day 3 ka main objective sirf ek invitation mutation banana nahi tha.

Is implementation se humne real-world backend ke kuch important principles apply kiye:

1. **Security:** Raw invitation token database mein store nahi karna.
2. **Authorization:** User ko sirf uske role ke according permission dena.
3. **Validation:** Email aur token input validate karna.
4. **Data Integrity:** Duplicate membership ko database constraints se prevent karna.
5. **Concurrency:** Atomic conditional update se simultaneous acceptance requests handle karna.
6. **Consistency:** Invitation acceptance aur membership creation ko transaction mein execute karna.
7. **Testing:** Success aur failure cases ko unit tests se verify karna.
8. **Modularity:** GraphQL resolver aur business service ko separate rakhna.

Ye patterns sirf TaskForge ke liye nahi, balki team-management platforms, project-management tools aur multi-tenant SaaS applications mein bhi useful hain.

---

# ⏭️ 21. Next Step

Day 3 ko officially complete karne se pehle:

1. `pnpm build` verify karo.
2. `pnpm test` verify karo.
3. `pnpm start:dev` verify karo.
4. Apollo Sandbox mein I1–I7 run karo.
5. A1–A6 correct order mein run karo.
6. D1–D3 verify karo.
7. Git working tree check karo.
8. Ye notes apne repository mein save karo.

**Day 3 complete tab maana jayega jab implementation ke automated checks pass hon aur manual GraphQL testing bhi successfully verify ho jaye.**

Next day ka implementation tabhi start karna jab Day 3 ke required checks complete ho jayein.