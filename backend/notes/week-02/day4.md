

```markdown
# Phase 2, Day 4: Membership Management (Role Change & Remove Member)

> Day 3 me naye log invite karke member bana sakte the. Day 4 me **existing members ko manage** karna banaya: unka role badalna aur unhe organization se hatana. Focus: sirf ADMIN ye kar sake, cross-tenant modification impossible ho, aur **organization kabhi bina ADMIN ke na rahe** (race condition me bhi).

---

## 1. Goal

1. `updateMemberRole(input)`: kisi member ka role badalna (sirf ADMIN)
2. `removeMember(organizationId, userId)`: member ko organization se hatana (sirf ADMIN)
3. **Last ADMIN** ko kabhi hata ya downgrade nahi kar sakte
4. Do ADMIN ek saath ek-doosre ko demote karein to bhi org bina ADMIN ke na bane
5. User account kabhi delete nahi hota (sirf membership)
6. Doosre tenant ke member ko modify nahi kar sakte
7. Tests + build + server start clean

**Koi schema change nahi, koi migration nahi.** Phase 1 ka `OrganizationMember` model reuse hua.

---

## 2. Definitions (easy language)

| Term | Meaning |
|---|---|
| **Membership** | `OrganizationMember` row: kaun user kis organization me kis role me hai |
| **Last-admin rule** | Har organization me kam se kam 1 ADMIN hona zaroori. Warna koi org ko manage hi nahi kar payega |
| **Privilege escalation** | Kam permission wala user khud ko ya kisi aur ko zyada permission de de. Isliye role change sirf ADMIN kar sakta hai |
| **Race condition** | Do requests ek saath chalein aur dono "pehle check, phir change" karein, to dono check pass kar sakte hain |
| **Write skew** | Race ka ek type: do transactions alag-alag rows badalte hain, dono apne check me sahi lagte hain, par milkar rule tod dete hain. Yahan: Admin A, B ko demote kare aur Admin B, A ko demote kare, dono dekhte hain "2 admins hain, theek hai", aur end me 0 admin |
| **Transaction** | Kai DB steps ek unit: ya sab hon, ya koi nahi |
| **Isolation level** | Transaction doosre transactions se kitna alag rahe, ye setting |
| **Serializable** | Sabse strict isolation level. Postgres aisa behave karta hai jaise transactions ek ke baad ek chale. Conflict pakadne par ek transaction fail kar deta hai |
| **P2034** | Prisma error code: transaction conflict / serialization failure. Retry karne se chal jata hai |
| **Scoping** | Query ko `organizationId` tak limit karna, taaki doosri org ke rows kabhi na aayein |
| **Compound unique key** | `userId_organizationId`: ek user ek org me ek hi baar member ho sakta hai, aur isi se indexed lookup hota hai |
| **Soft vs hard delete** | Hum sirf `OrganizationMember` row delete karte hain (membership). `User` row aur uske refresh tokens waise hi rehte hain |

---

## 3. Design decisions

1. **Sirf ADMIN.** MANAGER aur EMPLOYEE role badal ya member hata nahi sakte. Isse privilege escalation band.
2. **Pehle caller check, phir target.** Caller member nahi to `You are not a member of this organization`, member par ADMIN nahi to `Insufficient role`. Tabhi target dhoondte hain, taaki unauthorized caller ko member existence ka pata na chale.
3. **Target usi `organizationId` me.** Lookup `(userId, organizationId)` se hota hai, to doosri org ke member ko modify karna impossible. Nahi mila to `Member not found`.
4. **Last-admin check sirf zaroorat par.** Sirf tab jab target ADMIN hai aur ADMIN se kam role par ja raha hai (ya hat raha hai). Promote karne ya EMPLOYEE/MANAGER ko hatane par admin count ki zaroorat nahi.
5. **Serializable transaction.** Admin count check aur update/delete ek hi serializable transaction me. Isse write skew rukta hai: do ADMIN ek saath ek-doosre ko demote karein to Postgres ek ko `P2034` se fail kar deta hai, jise hum `Concurrent update detected, please retry` (409) banate hain.
6. **Self-demote / self-remove allowed, agar doosra ADMIN ho.** Rule "last admin" ka hai, "khud par" ka nahi.
7. **Sirf membership delete.** User account, refresh tokens, doosri organizations me membership waise hi rehte hain. Removed user ka access isliye turant band hota hai kyunki role/membership har request par DB se padhi jati hai (JWT me role nahi hota).
8. **Alag service** (`MemberManagementService`). Invitations aur read-queries se alag, single responsibility.
9. **`MEMBER_SELECT` reuse** (Day 2 se, ab `export`). Update ka response bhi sirf safe fields deta hai (`passwordHash` kabhi nahi).

---

## 4. Request flow

### updateMemberRole

```
Client (Authorization: Bearer <accessToken>) + { organizationId, userId, role }
        |
        v
JwtAuthGuard --> req.user = { id }
        |
        v
MemberManagementService.updateRole(callerId, input)
   $transaction (Serializable):
      1. assertAdmin: caller membership
           nahi mili --> 403 "You are not a member of this organization"
           ADMIN nahi --> 403 "Insufficient role"
      2. target = findUnique(userId_organizationId)
           nahi mila --> 404 "Member not found"
      3. target ADMIN hai aur naya role ADMIN nahi:
           admin count <= 1 --> 400 "An organization must have at least one admin"
      4. update role, return MEMBER_SELECT fields
   P2034 --> 409 "Concurrent update detected, please retry"
```

### removeMember

```
Client (Authorization: Bearer <accessToken>) + { organizationId, userId }
        |
        v
MemberManagementService.removeMember(callerId, organizationId, userId)
   $transaction (Serializable):
      1. assertAdmin (upar jaisa)
      2. target dhoondo (nahi mila --> 404)
      3. target ADMIN hai: admin count <= 1 --> 400 last admin
      4. organizationMember.delete(userId_organizationId)  // User row nahi chhoote
      5. return true
```

---

## 5. Commands

```bash
# Files (CLI sirf file banane ke liye)
touch src/organizations/dto/update-member-role.input.ts
touch src/organizations/member-management.service.ts
touch src/organizations/member-management.resolver.ts
touch src/organizations/member-management.service.spec.ts

# Format + verify
pnpm prettier --write src/organizations
pnpm build
pnpm test
pnpm start:dev

# Git (Sandbox testing ke baad)
git add .
git status
git commit -m "feat(organizations): add updateMemberRole and removeMember with last-admin protection"
git push
```

`touch` ke baad file khali hoti hai, code paste karna mat bhoolna.

### Commands ka WHY

- `touch`: Required source files create karne ke liye. Ye implementation code generate nahi karta.
- `pnpm prettier --write src/organizations`: Organization directory ke supported files ko configured Prettier rules ke according format karta hai.
- `pnpm build`: TypeScript compilation aur configured build process verify karta hai.
- `pnpm test`: Vitest/unit tests run karta hai.
- `pnpm start:dev`: Development server start karta hai aur NestJS dependency injection/module wiring verify karne mein help karta hai.
- `git add .`: Current directory ke changes staging area mein add karta hai. Commit karne se pehle staged files review karna zaroori hai.
- `git status`: Modified, untracked aur staged files dikhata hai.
- `git commit`: Staged changes ka local snapshot banata hai.
- `git push`: Commit ko configured remote repository par bhejta hai.

**Security:** `.env`, database credentials, passwords, access tokens aur private keys ko Git mein commit nahi karna chahiye.

---

## 6. Code

### 6.0 `src/organizations/organizations.service.ts`: ek line change

Day 2 ke `MEMBER_SELECT` ko naye service me use karne ke liye `export` lagana:

```ts
export const MEMBER_SELECT = {
```

(Pehle `const MEMBER_SELECT = {` tha. Baaki file waisi hi.) Ye bhoolne par `MEMBER_SELECT is declared but not exported` jaisa TypeScript error aata hai.

**WHY?**

ES modules mein doosri file se kisi variable ko import karne ke liye use export karna padta hai.

```ts
import { MEMBER_SELECT } from './organizations.service.js';
```

Yahan named import use hua hai. Exported constant ko reuse karne se multiple services mein member response ke selected fields consistent rehte hain.

Prisma ke `select` ka purpose decide karna hai ki query se kaun se fields return honge. Agar `MEMBER_SELECT` mein `passwordHash` include nahi hai, to us selection ke through password hash response mein nahi aayega.

---

### 6.1 `src/organizations/dto/update-member-role.input.ts`

```ts
import { Field, ID, InputType } from '@nestjs/graphql';
import { Role } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';

@InputType()
export class UpdateMemberRoleInput {
  @Field(() => ID)
  @IsUUID()
  organizationId!: string;

  @Field(() => ID)
  @IsUUID()
  userId!: string;

  @Field(() => Role)
  @IsEnum(Role)
  role!: Role;
}
```

#### WHY har decorator use hua?

**`@InputType()`**

NestJS GraphQL ke code-first approach mein class ko GraphQL input object ke roop mein register karta hai.

Mutation ko multiple structured values chahiye, isliye ek input class use ki gayi hai.

**`@Field(() => ID)`**

GraphQL schema ko batata hai ki field ka type `ID` hai.

GraphQL ka `ID` identifier ke liye hai. Ye apne aap UUID format validate nahi karta.

**`@IsUUID()`**

`organizationId` aur `userId` ko UUID format ke according validate karne ke liye.

Ye validation tabhi execute hogi jab project ka validation setup, jaise `ValidationPipe`, correctly configured ho.

**`@Field(() => Role)`**

GraphQL schema mein `role` ko role enum se map karta hai.

**`@IsEnum(Role)`**

Incoming role allowed enum values mein se hai ya nahi, ye validate karne ke liye.

**`role!: Role`**

TypeScript ka definite-assignment assertion `!` compiler ko batata hai ki framework/runtime is property ko populate karega.

**DTO ka role authorization nahi hai.** DTO input shape aur validation rules define karta hai. Caller ADMIN hai ya nahi, last ADMIN ko remove kiya ja raha hai ya nahi, aur target same organization mein hai ya nahi — ye checks service layer karti hai.

---

### 6.2 `src/organizations/member-management.service.ts`

```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { MEMBER_SELECT } from './organizations.service.js';
import { UpdateMemberRoleInput } from './dto/update-member-role.input.js';

const NOT_A_MEMBER = 'You are not a member of this organization';
const LAST_ADMIN = 'An organization must have at least one admin';

@Injectable()
export class MemberManagementService {
  constructor(private prisma: PrismaService) {}

  // Serializable: do ADMIN ek saath last-admin rule tod na sakein
  private async runSerializable<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2034'
      ) {
        throw new ConflictException('Concurrent update detected, please retry');
      }
      throw e;
    }
  }

  private async assertAdmin(
    tx: Prisma.TransactionClient,
    callerId: string,
    organizationId: string,
  ) {
    const caller = await tx.organizationMember.findUnique({
      where: { userId_organizationId: { userId: callerId, organizationId } },
      select: { role: true },
    });

    if (!caller) {
      throw new ForbiddenException(NOT_A_MEMBER);
    }

    if (caller.role !== Role.ADMIN) {
      throw new ForbiddenException('Insufficient role');
    }
  }

  private async assertNotLastAdmin(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const admins = await tx.organizationMember.count({
      where: { organizationId, role: Role.ADMIN },
    });

    if (admins <= 1) {
      throw new BadRequestException(LAST_ADMIN);
    }
  }

  async updateRole(callerId: string, input: UpdateMemberRoleInput) {
    const { organizationId, userId, role } = input;

    return this.runSerializable(async (tx) => {
      await this.assertAdmin(tx, callerId, organizationId);

      // organizationId se scoped: doosri org ka member yahan nahi milega
      const target = await tx.organizationMember.findUnique({
        where: { userId_organizationId: { userId, organizationId } },
        select: { role: true },
      });

      if (!target) {
        throw new NotFoundException('Member not found');
      }

      if (target.role === Role.ADMIN && role !== Role.ADMIN) {
        await this.assertNotLastAdmin(tx, organizationId);
      }

      return tx.organizationMember.update({
        where: { userId_organizationId: { userId, organizationId } },
        data: { role },
        select: MEMBER_SELECT,
      });
    });
  }

  async removeMember(
    callerId: string,
    organizationId: string,
    userId: string,
  ) {
    return this.runSerializable(async (tx) => {
      await this.assertAdmin(tx, callerId, organizationId);

      const target = await tx.organizationMember.findUnique({
        where: { userId_organizationId: { userId, organizationId } },
        select: { role: true },
      });

      if (!target) {
        throw new NotFoundException('Member not found');
      }

      if (target.role === Role.ADMIN) {
        await this.assertNotLastAdmin(tx, organizationId);
      }

      // Sirf membership delete. User account aur uske refresh tokens wahi rehte hain.
      await tx.organizationMember.delete({
        where: { userId_organizationId: { userId, organizationId } },
      });

      return true;
    });
  }
}
```

#### WHY `@Injectable()`?

NestJS dependency-injection container ko batata hai ki class ko provider ke roop mein manage kiya ja sakta hai.

#### WHY constructor injection?

```ts
constructor(private prisma: PrismaService) {}
```

NestJS configured `PrismaService` instance inject karta hai. Isse har method mein naya Prisma client create karne ki zaroorat nahi hoti aur tests mein dependency mock karna aasaan hota hai.

#### WHY `NOT_A_MEMBER` aur `LAST_ADMIN` constants?

Same error messages ko ek jagah rakhne ke liye. Agar message update karna ho to ek central constant change kiya ja sakta hai.

#### WHY `runSerializable<T>()`?

`updateRole()` member object return karta hai, jabki `removeMember()` boolean return karta hai. Generic type `T` dono operations ka return type preserve karne deta hai.

`fn` callback ko transaction-scoped Prisma client milta hai. Callback ke andar ki database queries usi transaction ka part hoti hain.

#### WHY transaction?

Last-admin count check aur update/delete ek logically connected operation hain. Agar count check ke baad concurrent request state badal de, to normal independent queries invariant tod sakti hain.

Transaction related database operations ko ek atomic boundary mein execute karti hai.

#### WHY Serializable isolation?

Serializable isolation concurrent transactions ke result ko serial execution ke equivalent banane ki koshish karti hai. Agar conflicting operations ko saath commit karna safe na ho, PostgreSQL ek transaction abort kar sakta hai.

Example:

- ORG1 mein ADMIN A aur ADMIN B hain.
- A, B ko demote karta hai.
- B, A ko demote karta hai.
- Dono requests agar independently `2 admins` dekh kar commit kar dein, to organization mein zero ADMIN bach sakte hain.

Serializable isolation is type ke conflict ko detect karne mein help karti hai.

#### WHY `P2034` catch kiya?

Prisma ka `P2034` transaction write conflict/deadlock jaise retryable conflict ko represent kar sakta hai.

Is code mein known conflict ko NestJS `ConflictException` mein map kiya gaya hai:

```ts
throw new ConflictException('Concurrent update detected, please retry');
```

**Important:** Is implementation mein automatic retry loop nahi hai. Error client ko retry karne ko kehta hai. Actual retry client ya future server-side retry policy ko implement karna hoga.

GraphQL response ka `extensions.code` zaroori nahi ki HTTP status `409` ke naam se hi aaye. Actual GraphQL error format application ke exception integration aur `formatError` configuration par depend karta hai.

#### WHY baaki errors ko rethrow kiya?

```ts
throw e;
```

Har error concurrency conflict nahi hota. Unexpected errors ko same conflict message mein convert karne se debugging aur correct error handling mushkil ho sakti hai.

#### WHY `assertAdmin()`?

```ts
const caller = await tx.organizationMember.findUnique({
  where: { userId_organizationId: { userId: callerId, organizationId } },
  select: { role: true },
});
```

Compound key caller ko specific organization ke context mein identify karti hai.

`select: { role: true }` isliye use hua kyunki authorization ke liye sirf role chahiye.

Agar membership nahi milti:

```ts
throw new ForbiddenException(NOT_A_MEMBER);
```

Agar caller ADMIN nahi hai:

```ts
throw new ForbiddenException('Insufficient role');
```

Caller ko pehle check karne se unauthorized user ko target membership ki existence ke baare mein unnecessary information nahi milti.

#### WHY `assertNotLastAdmin()`?

```ts
const admins = await tx.organizationMember.count({
  where: { organizationId, role: Role.ADMIN },
});
```

Count ko `organizationId` se scope kiya gaya hai kyunki har organization ka ADMIN set alag hai.

`role: Role.ADMIN` se sirf ADMIN memberships count hoti hain.

```ts
if (admins <= 1) {
  throw new BadRequestException(LAST_ADMIN);
}
```

Agar sirf ek ADMIN hai, usko demote/remove karne se zero ADMIN bachenge. Isliye operation reject hota hai.

#### WHY role update mein conditional count?

```ts
if (target.role === Role.ADMIN && role !== Role.ADMIN) {
  await this.assertNotLastAdmin(tx, organizationId);
}
```

Count tabhi zaroori hai jab existing ADMIN ko ADMIN se neeche role diya ja raha ho.

EMPLOYEE ko MANAGER ya ADMIN promote karne se ADMIN count kam nahi hota. Isi tarah EMPLOYEE/MANAGER ko remove karne se ADMIN count change nahi hota.

#### WHY target lookup mein compound key?

```ts
where: { userId_organizationId: { userId, organizationId } }
```

Isse target usi organization ki membership tak limited rehta hai. Sirf user ID ke basis par operation karne se cross-tenant mistakes ka risk badh sakta tha.

#### WHY `MEMBER_SELECT`?

```ts
select: MEMBER_SELECT
```

Update response ke fields ko centrally defined selection ke according limit karta hai. Isse response shape consistent rehta hai aur sensitive fields return hone ka risk kam hota hai, provided selection mein woh fields included nahi hain.

#### WHY membership delete, user delete nahi?

```ts
await tx.organizationMember.delete({
  where: { userId_organizationId: { userId, organizationId } },
});
```

Ek user multiple organizations ka member ho sakta hai. Ek organization se remove karne ka matlab poora account delete karna nahi hai.

Ye method sirf `OrganizationMember` row delete karta hai.

**Token behavior note:** Original design ke mutabik role/membership relevant requests par database se check hota hai. Isliye removed user ki organization membership ke basis par access reject hona chahiye. Har protected endpoint par membership/authorization check hona zaroori hai; sirf token valid hona organization access ka proof nahi hai.

---

### 6.3 `src/organizations/member-management.resolver.ts`

```ts
import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Resolver } from '@nestjs/graphql';
import { MemberManagementService } from './member-management.service.js';
import { OrganizationMember } from './entities/organization-member.entity.js';
import { UpdateMemberRoleInput } from './dto/update-member-role.input.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Resolver(() => OrganizationMember)
export class MemberManagementResolver {
  constructor(private memberManagement: MemberManagementService) {}

  @Mutation(() => OrganizationMember)
  @UseGuards(JwtAuthGuard)
  updateMemberRole(
    @CurrentUser() user: { id: string },
    @Args('input') input: UpdateMemberRoleInput,
  ) {
    return this.memberManagement.updateRole(user.id, input);
  }

  @Mutation(() => Boolean)
  @UseGuards(JwtAuthGuard)
  removeMember(
    @CurrentUser() user: { id: string },
    @Args('organizationId', { type: () => ID }) organizationId: string,
    @Args('userId', { type: () => ID }) userId: string,
  ) {
    return this.memberManagement.removeMember(user.id, organizationId, userId);
  }
}
```

#### WHY resolver alag hai?

Resolver GraphQL request aur application service ke beech connection hai. Business rules service mein rehte hain, jabki resolver GraphQL arguments aur return types define karta hai.

#### WHY `@Resolver(() => OrganizationMember)`?

NestJS GraphQL ko resolver ke object context ke baare mein batata hai.

#### WHY `@Mutation()`?

GraphQL schema mein operation ko mutation ke roop mein expose karta hai. Mutation data change karne ke liye hoti hai.

#### WHY `@UseGuards(JwtAuthGuard)`?

Mutation run hone se pehle authentication guard execute hota hai. Ye request ko authenticated user se associate karne mein help karta hai.

Guard ye prove nahi karta ki user ADMIN hai. Organization-specific role authorization service mein `assertAdmin()` karta hai.

#### WHY `@CurrentUser()`?

Custom decorator authenticated request context se current user ko resolver mein provide karta hai.

Caller ID client se arbitrary argument ke roop mein lene ke bajay authenticated context se lena security ke liye important hai.

#### WHY `@Args()`?

GraphQL arguments ko resolver method tak pahunchata hai.

- `input` mein role update ki required values hain.
- `organizationId` aur `userId` remove mutation ke separate arguments hain.

#### WHY different return types?

```ts
@Mutation(() => OrganizationMember)
```

Role update ke baad member object return hota hai.

```ts
@Mutation(() => Boolean)
```

Removal ke baad service `true` return karti hai.

GraphQL `ID` declaration apne aap UUID format validation nahi karti. Required validation DTO aur configured validation pipeline ke through verify karni chahiye.

---

### 6.4 `src/organizations/organizations.module.ts`

```ts
import { Module } from '@nestjs/common';
import { OrganizationsService } from './organizations.service.js';
import { OrganizationsResolver } from './organizations.resolver.js';
import { OrganizationMembersResolver } from './organization-members.resolver.js';
import { InvitationsService } from './invitations.service.js';
import { InvitationsResolver } from './invitations.resolver.js';
import { MemberManagementService } from './member-management.service.js';
import { MemberManagementResolver } from './member-management.resolver.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  providers: [
    OrganizationsService,
    OrganizationsResolver,
    OrganizationMembersResolver,
    InvitationsService,
    InvitationsResolver,
    MemberManagementService,
    MemberManagementResolver,
  ],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
```

#### WHY module update karna zaroori hai?

NestJS modules providers aur dependencies ko organize karte hain.

- `MemberManagementService` business logic provide karti hai.
- `MemberManagementResolver` GraphQL mutations expose karta hai.
- `PrismaModule` database access provider available karata hai.
- Existing organization/invitation providers ko preserve kiya gaya hai.

Agar service ko `providers` mein register nahi kiya, to NestJS dependency injection fail ho sakti hai.

Agar `PrismaModule` required Prisma provider expose nahi karta, ya module imports incorrectly configured hain, to application startup par dependency-resolution error aa sakta hai.

---

### 6.5 `src/organizations/member-management.service.spec.ts` (14 tests)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MemberManagementService } from './member-management.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('MemberManagementService', () => {
  const findUnique = vi.fn();
  const count = vi.fn();
  const update = vi.fn();
  const del = vi.fn();
  const transaction = vi.fn();

  const tx = { organizationMember: { findUnique, count, update, delete: del } };
  const prisma = { $transaction: transaction } as unknown as PrismaService;

  let service: MemberManagementService;

  const roleInput = (role: any, userId = 'u2') => ({
    organizationId: 'o1',
    userId,
    role,
  });

  // findUnique pehli call caller ke liye, doosri target ke liye
  const mockCallerAndTarget = (caller: any, target: any) => {
    findUnique.mockResolvedValueOnce(caller).mockResolvedValueOnce(target);
  };

  beforeEach(() => {
    vi.resetAllMocks();
    transaction.mockImplementation((cb: (t: typeof tx) => unknown) => cb(tx));
    update.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'm1', ...data }),
    );
    del.mockResolvedValue({});
    service = new MemberManagementService(prisma);
  });

  describe('updateRole', () => {
    it('ADMIN can change an EMPLOYEE to MANAGER', async () => {
      mockCallerAndTarget({ role: 'ADMIN' }, { role: 'EMPLOYEE' });
      const res = await service.updateRole('u1', roleInput('MANAGER'));
      expect(res.role).toBe('MANAGER');
      expect(count).not.toHaveBeenCalled();
    });

    it('MANAGER and EMPLOYEE cannot change roles', async () => {
      for (const role of ['MANAGER', 'EMPLOYEE']) {
        findUnique.mockResolvedValueOnce({ role });
        await expect(
          service.updateRole('u1', roleInput('ADMIN')),
        ).rejects.toBeInstanceOf(ForbiddenException);
      }
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects a caller who is not a member (cross-tenant)', async () => {
      findUnique.mockResolvedValueOnce(null);
      await expect(
        service.updateRole('u9', roleInput('ADMIN')),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(update).not.toHaveBeenCalled();
    });

    it('target outside the organization is Not Found, lookup is scoped', async () => {
      mockCallerAndTarget({ role: 'ADMIN' }, null);
      await expect(
        service.updateRole('u1', roleInput('MANAGER', 'stranger')),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(findUnique).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            userId_organizationId: { userId: 'stranger', organizationId: 'o1' },
          },
        }),
      );
    });

    it('blocks demoting the last ADMIN', async () => {
      mockCallerAndTarget({ role: 'ADMIN' }, { role: 'ADMIN' });
      count.mockResolvedValue(1);
      await expect(
        service.updateRole('u1', roleInput('EMPLOYEE', 'u1')),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });

    it('allows demoting an ADMIN when another ADMIN exists', async () => {
      mockCallerAndTarget({ role: 'ADMIN' }, { role: 'ADMIN' });
      count.mockResolvedValue(2);
      const res = await service.updateRole('u1', roleInput('MANAGER'));
      expect(res.role).toBe('MANAGER');
    });

    it('promoting to ADMIN never needs the admin count', async () => {
      mockCallerAndTarget({ role: 'ADMIN' }, { role: 'EMPLOYEE' });
      await service.updateRole('u1', roleInput('ADMIN'));
      expect(count).not.toHaveBeenCalled();
    });

    it('runs in a Serializable transaction', async () => {
      mockCallerAndTarget({ role: 'ADMIN' }, { role: 'EMPLOYEE' });
      await service.updateRole('u1', roleInput('MANAGER'));
      expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    });

    it('turns a serialization failure into a Conflict', async () => {
      transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('conflict', {
          code: 'P2034',
          clientVersion: 'test',
        }),
      );
      await expect(
        service.updateRole('u1', roleInput('MANAGER')),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('removeMember', () => {
    it('ADMIN removes an EMPLOYEE membership only', async () => {
      mockCallerAndTarget({ role: 'ADMIN' }, { role: 'EMPLOYEE' });
      await expect(service.removeMember('u1', 'o1', 'u2')).resolves.toBe(true);
      expect(del).toHaveBeenCalledWith({
        where: {
          userId_organizationId: { userId: 'u2', organizationId: 'o1' },
        },
      });
    });

    it('non-admin cannot remove', async () => {
      findUnique.mockResolvedValueOnce({ role: 'MANAGER' });
      await expect(
        service.removeMember('u1', 'o1', 'u2'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(del).not.toHaveBeenCalled();
    });

    it('blocks removing the last ADMIN (including self)', async () => {
      mockCallerAndTarget({ role: 'ADMIN' }, { role: 'ADMIN' });
      count.mockResolvedValue(1);
      await expect(
        service.removeMember('u1', 'o1', 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(del).not.toHaveBeenCalled();
    });

    it('allows removing an ADMIN when another ADMIN exists', async () => {
      mockCallerAndTarget({ role: 'ADMIN' }, { role: 'ADMIN' });
      count.mockResolvedValue(2);
      await expect(service.removeMember('u1', 'o1', 'u2')).resolves.toBe(true);
    });

    it('target not in this organization is Not Found', async () => {
      mockCallerAndTarget({ role: 'ADMIN' }, null);
      await expect(
        service.removeMember('u1', 'o1', 'ghost'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(del).not.toHaveBeenCalled();
    });
  });
});
```

#### Testing concepts ka WHY

**`vi.fn()`**

Mock function create karta hai. Isse test control kar sakta hai ki database operation kya return kare aur function call hua ya nahi.

**`mockResolvedValueOnce()`**

Ek specific call ke liye resolved Promise ka result set karta hai. Yahan pehli `findUnique` call caller aur doosri target ko represent karti hai.

**`vi.resetAllMocks()`**

Har test se pehle mock state reset karta hai, taaki ek test ka call history ya mock setup doosre test ko affect na kare.

**`transaction.mockImplementation((cb) => cb(tx))`**

Transaction mock callback ko mock transaction object ke saath execute karta hai. Isse service logic test ho sakta hai, lekin ye actual PostgreSQL Serializable isolation ya real concurrent transactions simulate nahi karta.

**`expect(...).rejects.toBeInstanceOf(...)`**

Verify karta hai ki Promise expected exception class ke saath reject hui.

**`expect(update).not.toHaveBeenCalled()`**

Verify karta hai ki invalid/unauthorized request ke baad write operation execute nahi hui.

**Important testing limitation:** Unit tests mocked database operations ke saath service logic cover karte hain. Real PostgreSQL concurrency guarantee ko confidently verify karne ke liye separate integration/concurrency test useful hoga.

---

## 7. Testing

### 7.1 Automated

`pnpm build` clean. `pnpm test`: **12 files** (naya: `member-management.service.spec.ts`, 14 tests). Total tests Day 3 ke baad 48 the, ab 62 expected.

**WHY build aur test dono?**

- Build TypeScript/compiler aur configured build errors detect karta hai.
- Unit tests expected business logic aur error branches verify karte hain.
- Tests pass hone se real database concurrency ya full GraphQL integration automatically prove nahi hota.

### 7.2 Server start

`pnpm start:dev` -> `OrganizationsModule dependencies initialized` aur `Nest application successfully started`. Naye providers ki DI wiring yahin verify hoti hai.

**WHY?**

Unit tests mein service manually instantiate ki ja sakti hai, isliye tests pass hone ke bawajood NestJS module registration galat ho sakta hai. Server startup provider registration aur dependency injection issues pakadne mein help karta hai.

### 7.3 Manual test (Apollo Sandbox, Tab 9)

Pehle ORG1 me **matrix1 = ADMIN, matrix3 = EMPLOYEE** hona chahiye (Day 3 ke accept se). Tab 4 (`OrganizationMembers`) se confirm karo.

**Headers:**

```json
{
  "Authorization": "Bearer <real accessToken>"
}
```

Har test mein appropriate user ka actual access token use karo. `<real accessToken>` placeholder ko actual token se replace karo; angle brackets literal value ka part nahi hain.

**GraphQL mutations:**

```graphql
mutation UpdateMemberRole($input: UpdateMemberRoleInput!) {
  updateMemberRole(input: $input) {
    id
    role
    user {
      id
      name
      email
    }
  }
}

mutation RemoveMember($organizationId: ID!, $userId: ID!) {
  removeMember(organizationId: $organizationId, userId: $userId)
}
```

**WHY variables?**

GraphQL operation aur actual values separate rehti hain. Isse same query ko different target IDs/roles ke saath reuse kar sakte ho.

**Variables example:**

```json
{
  "input": {
    "organizationId": "5cb6f8e6-f915-4715-9094-da37626b2d72",
    "userId": "<target userId>",
    "role": "MANAGER"
  },
  "organizationId": "5cb6f8e6-f915-4715-9094-da37626b2d72",
  "userId": "<target userId>"
}
```

Ye combined example dono mutations ke variables dikhata hai. Har execution mein currently selected operation ke required variables dena clearer hai.

- `UpdateMemberRole` ke liye `input` object required hai.
- `RemoveMember` ke liye `organizationId` aur `userId` required hain.

matrix1 / matrix3 ke user IDs `LoginMatrixOne` / `LoginMatrixThree` response ke `user.id` mein hain.

**Important:** `user.id` aur `OrganizationMember.id` alag identifiers ho sakte hain. Mutation mein correct user ID use karo.

Is order me chalao (state step-by-step badalti hai):

| # | Token | Operation | Target | Expected | Result |
|---|---|---|---|---|---|
| 1 | **matrix3** (EMPLOYEE) | `UpdateMemberRole`, role ADMIN | matrix3 khud | `Insufficient role` (self-promotion nahi) | ☐ |
| 2 | **matrix2** | `UpdateMemberRole` | koi bhi | `You are not a member of this organization` | ☐ |
| 3 | matrix1 | `UpdateMemberRole` | `00000000-0000-0000-0000-000000000000` | `Member not found` | ☐ |
| 4 | matrix1 | `UpdateMemberRole`, role EMPLOYEE | **matrix1 khud** | `An organization must have at least one admin` | ☐ |
| 5 | matrix1 | `RemoveMember` | **matrix1 khud** | `An organization must have at least one admin` | ☐ |
| 6 | matrix1 | `UpdateMemberRole`, role MANAGER | matrix3 | `role: MANAGER` | ☐ |
| 7 | matrix1 | `RemoveMember` | matrix3 | `true` | ☐ |
| 8 | **matrix3** | Tab 3 `OrganizationById` ORG1 | - | `You are not a member of this organization` | ☐ |
| 9 | header khali | `RemoveMember` | - | `Missing access token` | ☐ |

**Row 7 ke baad 2 checks:**

| Check | Kahan | Expected | Result |
|---|---|---|---|
| C1 | Tab 3 `MyOrganizations`, matrix3 token | Sirf **Matrix Org Three** (matrix3 ab bhi login kar sakta hai) | ☐ |
| C2 | Prisma Studio | `User` table me matrix3 ki row **maujood** (account delete nahi hua), `OrganizationMember` me ORG1 wali row gayab | ☐ |

Row 4 aur 5 sabse important hain (last-admin protection). Final state me ORG1 me sirf matrix1 (ADMIN) bachega, jo aage ke phases ke liye theek hai. matrix3 ko wapas lana ho to Day 3 ka invite flow dobara chalao.

**WHY C1 aur C2 dono?**

- C1 verify karta hai ki user ORG1 se remove hone ke baad bhi doosri organization ka member reh sakta hai.
- C2 database state directly verify karta hai: user account row present hai aur ORG1 ki membership row delete ho chuki hai.

**WHY sequence repeat karne se pehle reset?**

Row 7 ke baad matrix3 ORG1 ka member nahi rahega. Same state par tests dobara chalane se expected outcomes badal sakte hain. Repeat karne ke liye Day 3 invitation flow se membership restore karo ya known test fixture use karo.

Production database par destructive manual tests mat chalao.

---

## 8. Errors / observations

| Error / observation | Reason | Fix |
|---|---|---|
| `Module './organizations.service.js' declares 'MEMBER_SELECT' locally, but it is not exported` | Day 2 ka `MEMBER_SELECT` `export` nahi tha | `export const MEMBER_SELECT = {` |
| `touch` ke baad file khali, `has no exported member` | Code paste nahi hua | Nayi file banane ke turant baad code paste karo |
| `Variable "$input" of required type ... was not provided` | Variables panel khali | `{ "input": { ... } }` |
| `Missing access token` | Header nahi gaya | `Authorization` header, bina `<` `>` ke |
| Last admin tests me `userId` galat | `matrix1` ka id `matrix3` ke saath mix | `Login...` response ke `user.id` alag-alag note karo |

### Additional explanation

**`MEMBER_SELECT` export error:** ES module mein named symbol ko doosri file se import karne ke liye export zaroori hai. Export name aur import name exact match hone chahiye.

**`touch` error:** `touch` file create karta hai, code generate nahi karta. File banane ke baad implementation paste/save karo.

**GraphQL variable error:** `$input: UpdateMemberRoleInput!` required variable hai. Variables JSON mein `input` key aur required fields honi chahiye.

**Missing token:** Authorization header mein correct key, `Bearer` prefix aur valid token check karo. Expired token bhi fail ho sakta hai.

**Wrong user ID:** Login response ka `user.id` use karo, membership row ka ID nahi.

**Observation (production issue, abhi fix nahi kiya):** GraphQL response me Nest ke `ConflictException` (409) jaise errors ka `extensions.code` `INTERNAL_SERVER_ERROR` aata hai (`ForbiddenException` ka `FORBIDDEN`). Hamara Phase 1 ka `formatError` production me `INTERNAL_SERVER_ERROR` ko mask karke generic "Internal server error" bana deta hai. Matlab production me `Concurrent update detected` aur `An active invitation already exists` jaise 409 messages client ko nahi dikhenge. Dev me koi dikkat nahi. Fix idea: `formatError` me `originalError.statusCode < 500` ho to message mask na karo. Ye Phase 2 ke audit (Day 7) me sahi kiya jayega.

**Additional WHY:**

Production error formatting ka purpose internal stack traces aur sensitive details expose hone se rokna hai. Lekin expected client-facing errors ko safely preserve karne ke liye explicit error mapping chahiye.

NestJS `ConflictException` throw hone se GraphQL response ka `extensions.code` automatically `CONFLICT` hoga, ye guarantee nahi hai. Actual response GraphQL integration aur configured `formatError` par depend karta hai.

### Learning

1. Jis constant ko doosri file me import karna ho use `export` karna zaroori hai.
2. Role/membership ko JWT me nahi, DB se har request padho. Isse removed ya demoted user ka access turant band ho jata hai, token expire hone ka intezaar nahi.
3. Nayi file `touch` ke baad khali hoti hai, code paste karna mat bhoolna.

**Extra learning:**

4. Authentication aur authorization alag hain: valid token hona ADMIN permission hone ka proof nahi hai.
5. Tenant-scoped queries mein organization identity ko include karna zaroori hai.
6. Mocked unit tests actual PostgreSQL concurrency ko simulate nahi karte.
7. Serializable transaction conflicts ko handle karna bhi design ka part hai; strict isolation ka matlab conflict-free execution nahi hai.

---

## 9. Interview Q&A

**Q1. "Last admin" rule kyun, aur kaise enforce karte ho?**

Agar org me koi ADMIN na bache to koi roles, members ya invites manage nahi kar sakta, org lock ho jata hai. Service me, jab target ADMIN hai aur uska role kam ho raha hai (ya wo hat raha hai), to `count({ organizationId, role: ADMIN })` dekhte hain. Count 1 ya kam ho to reject.

**Q2. Do ADMIN ek saath ek-doosre ko demote karein to kya hoga? Sirf count check kaafi hai?**

Nahi, ye race condition (write skew) hai. A, B ko demote karta hai aur B, A ko, dono transactions dekhte hain "2 admins hain" aur dono commit ho jate hain, end me 0 admin. Isliye poora check + change **Serializable** transaction me hota hai. Postgres conflict pakadta hai aur ek transaction `P2034` se fail hoti hai, jise hum 409 `Concurrent update detected, please retry` banate hain. Client retry kar sakta hai.

**Q3. Serializable ke alawa kya options the?**

(a) `SELECT ... FOR UPDATE` se admin rows lock karna (raw SQL chahiye, table name pe depend). (b) Org row par lock/version column. (c) DB constraint ya trigger. Serializable ka fayda: Prisma me ek option se ho jata hai, raw SQL nahi. Nuksaan: kabhi-kabhi false conflicts aur retry ki zaroorat.

**Q4. Role change sirf ADMIN ko kyun?**

Warna privilege escalation: MANAGER ya EMPLOYEE khud ko ya dost ko ADMIN bana sakta hai. Test me bhi check hota hai ki EMPLOYEE khud ko ADMIN nahi bana sakta.

**Q5. Doosre tenant ke member ko modify karne se kaise rokte ho?**

Do layer: (1) Caller ko usi `organizationId` ka ADMIN hona padta hai. (2) Target ka lookup `(userId, organizationId)` compound key se hota hai, to doosri org ka member milta hi nahi (`Member not found`).

**Q6. Member remove karne par user account kyun delete nahi karte?**

Account ki doosri organizations me bhi membership ho sakti hai, aur account user ka apna hai, kisi ek org ke ADMIN ka nahi. Isliye sirf `OrganizationMember` row delete hoti hai.

**Q7. Removed user ke refresh/access token ka kya? Wo abhi bhi valid hai.**

Token valid rehta hai, par uska koi asar nahi. Role aur membership har request par DB se padhi jati hai (JWT me role nahi hota), to org ke queries me `You are not a member of this organization` aata hai. Isliye access turant band hota hai.

**Important qualification:** Ye behavior tabhi sahi hai jab relevant protected operations har request par membership/role verify karte hain. Agar koi endpoint sirf valid token check karta hai aur membership re-check nahi karta, to us endpoint ko separately fix/audit karna hoga.

**Q8. Pehle caller ka check, phir target ka, kyun?**

Agar pehle target dhoondte aur "Member not found" bolte, to unauthorized caller ko pata chal jata ki kaun se user IDs us org me hain. Pehle caller verify karne se wo information sirf authorized ADMIN ko milti hai.

**Q9. Kya ADMIN khud ko demote ya remove kar sakta hai?**

Haan, agar koi doosra ADMIN hai. Rule "last admin" ka hai, "khud par" ka nahi. Agar wo akela ADMIN hai to reject.

**Q10. Tests me kya cover kiya?**

14 unit tests: ADMIN role change, MANAGER/EMPLOYEE reject, non-member (cross-tenant) reject, target scoped lookup aur NotFound, last-admin demote block, doosra admin ho to demote allowed, promote me count nahi chahiye, Serializable isolation use hota hai, `P2034` to Conflict, remove ke 5 cases (ADMIN removes EMPLOYEE, non-admin reject, last admin block, doosra admin ho to allowed, target missing).

### Additional interview questions

**Q11. Authentication aur authorization mein difference kya hai?**

Authentication verify karta hai ki user kaun hai. Authorization decide karta hai ki authenticated user requested operation kar sakta hai ya nahi. Is implementation mein JWT guard authentication karta hai aur service ka `assertAdmin()` organization-specific authorization karta hai.

**Q12. DTO aur service ka role alag kyun hai?**

DTO request ka shape aur validation rules define karta hai. Service business rules enforce karti hai. Valid UUID bhejna ye prove nahi karta ki caller ADMIN hai ya target same organization ka member hai.

**Q13. Compound unique key ka kya benefit hai?**

`userId` aur `organizationId` ko ek saath uniquely identify karne se user ki membership ko specific organization ke context mein retrieve/update/delete kiya ja sakta hai. Ye cross-tenant mistakes ke risk ko kam karta hai.

**Q14. Unit tests Serializable isolation ko prove karte hain?**

Nahi. Is file mein transaction mock callback execute karta hai. Unit test verify kar sakta hai ki service Serializable option pass karti hai, lekin actual PostgreSQL concurrent transactions aur write-skew behavior verify karne ke liye integration/concurrency testing chahiye.

**Q15. Kya `P2034` par code automatically retry karta hai?**

Nahi. Current implementation error ko `ConflictException` mein map karti hai. Automatic retry loop nahi hai. Retry policy add karni ho to limited retries, backoff aur operation safety consider karni hogi.

**Q16. `MEMBER_SELECT` reuse kyun?**

Consistent response shape, duplicate selection logic kam karne aur sensitive fields accidentally return hone ka risk kam karne ke liye. Actual selected fields review karna phir bhi zaroori hai.

**Q17. `removeMember()` `true` kyun return karta hai?**

Resolver ka GraphQL return type `Boolean` hai. Successful deletion par `true` return hota hai. Deleted member ka object return karna is API contract ka part nahi hai.

---

## 10. Day 4 completion criteria

- [x] `updateMemberRole` aur `removeMember` ka code
- [x] Sirf ADMIN, caller check pehle, target scoped
- [x] Last-admin protection
- [x] Serializable transaction + `P2034` to Conflict
- [x] 14 unit tests
- [x] `pnpm build` aur `pnpm test`
- [x] `pnpm start:dev` DI check
- [ ] Sandbox rows 1 se 9
- [ ] Checks C1, C2
- [ ] Git commit aur push
- [ ] Notes repo me paste + commit

---

## 11. Next

Day 4 ke Sandbox rows aur commit ke baad Day 4 officially finish. Agla din tab hi shuru hoga jab tum permission doge.

---

## 12. Detailed Explanation — WHY each part exists

> Ye section original notes ke baad add kiya gaya hai. Iska purpose implementation ke decisions, execution flow, security rules aur testing limitations ko aur deeply explain karna hai.

### 12.1 Big picture: Day 4 exactly kya build karta hai?

Day 4 organization ke existing members ko manage karne wali functionality add karta hai. Day 3 ka invitation flow kisi naye user ko organization ka member banane ke kaam aata tha. Day 4 mein member already organization ka hissa hai; ab ADMIN uska role change kar sakta hai ya uski membership remove kar sakta hai.

Is feature mein teen alag cheezein distinguish karna zaroori hai:

1. **Authentication:** Request bhejne wala user kaun hai? `JwtAuthGuard` access token verify karne ke baad authenticated user ki identity request context mein available karata hai.
2. **Authorization:** Kya ye user is organization mein ye action kar sakta hai? `MemberManagementService.assertAdmin()` database se membership aur role check karta hai.
3. **Target validation:** Kya jis member ko update/remove karna hai, woh isi organization ka member hai? Compound key `userId_organizationId` se target lookup isi organization tak limited rehta hai.

Sirf logged-in hona ADMIN hone ke barabar nahi hai. Isi tarah kisi organization ka ADMIN hona doosri organization ke members ko manage karne ka permission nahi deta.

#### Example

Maan lo:

- `matrix1` = ORG1 ka ADMIN
- `matrix3` = ORG1 ka EMPLOYEE
- `matrix2` = ORG1 ka member nahi
- ORG2 mein bhi kuch members hain

Expected behavior:

- `matrix1`, `matrix3` ko MANAGER bana sakta hai, kyunki woh ORG1 ka ADMIN hai.
- `matrix3`, khud ko ADMIN nahi bana sakta, kyunki woh EMPLOYEE hai.
- `matrix2`, ORG1 ke members ko manage nahi kar sakta, kyunki woh ORG1 ka member hi nahi hai.
- ORG1 ka ADMIN, ORG2 ke member ko ORG1 ke target ki tarah update nahi kar sakta. Target lookup mein ORG1 ka `organizationId` bhi required hai.
- Agar ORG1 ka ek hi ADMIN hai, to usko demote ya remove nahi kar sakte.

Ye checks service layer mein hain, sirf GraphQL resolver mein nahi. Iska fayda hai ki authorization rules business logic ke paas rehte hain aur future mein same service kisi doosre entry point se call ho tab bhi rules apply ho sakte hain.

### 12.2 `updateMemberRole` aur `removeMember` mein difference

| Operation | Kya badalta hai? | Kya delete hota hai? | Example |
|---|---|---|---|
| `updateMemberRole` | `OrganizationMember.role` | Kuch delete nahi hota | EMPLOYEE → MANAGER |
| `removeMember` | Organization se membership hatata hai | Sirf `OrganizationMember` row | User ORG1 se remove hota hai |
| Account deletion | User ka account | `User` row aur related data, schema/cascade rules ke mutabik | Ye Day 4 ka feature nahi hai |

`OrganizationMember` ko relationship/junction table samjho. Ye batata hai ki kaunsa user kis organization mein hai aur us organization mein uska role kya hai. Ek user multiple organizations ka member ho sakta hai. Isi liye ek organization se membership delete karne ka matlab user ka poora account delete karna nahi hai.

### 12.3 DTO: `UpdateMemberRoleInput` kyun banaya?

Original file:

`src/organizations/dto/update-member-role.input.ts`

```ts
import { Field, ID, InputType } from '@nestjs/graphql';
import { Role } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';

@InputType()
export class UpdateMemberRoleInput {
  @Field(() => ID)
  @IsUUID()
  organizationId!: string;

  @Field(() => ID)
  @IsUUID()
  userId!: string;

  @Field(() => Role)
  @IsEnum(Role)
  role!: Role;
}
```

#### Har import ka purpose

- `InputType`: NestJS GraphQL ko batata hai ki ye class GraphQL input object ke roop mein expose hogi.
- `Field`: class ke property ko GraphQL schema ka field banata hai.
- `ID`: GraphQL schema mein identifier ke liye semantic scalar hai. Iska use apne aap UUID validation nahi karta.
- `Role`: Prisma schema se generated role enum. Isse application ke role names database schema ke role definitions ke saath aligned rehte hain.
- `IsUUID`: `organizationId` aur `userId` ko UUID format mein validate karne ke liye.
- `IsEnum`: incoming `role` allowed `Role` enum value hai ya nahi, check karne ke liye.

#### `@InputType()` kya karta hai?

GraphQL mein mutation ko structured input dena ho, to input object type define kiya jata hai. `@InputType()` NestJS GraphQL code-first approach ko class se input type generate karne deta hai. Iske bina class automatically expected GraphQL input type nahi banegi.

#### `@Field(() => ID)` kyun?

GraphQL schema ko batana hota hai ki field ka type kya hai. `() => ID` explicit type function hai. TypeScript ka `string` type akela ye guarantee nahi karta ki GraphQL field schema mein `ID` hi banega.

#### `@IsUUID()` aur `@Field()` ek hi kaam kyun nahi karte?

Nahi. `@Field()` GraphQL schema banane mein help karta hai. `@IsUUID()` validation rule define karta hai. Schema field ko `ID` kehne ka matlab ye nahi ki incoming value valid UUID hai.

Validation decorators tabhi runtime par execute honge jab project mein DTO validation pipeline configured ho, jaise `ValidationPipe` aur appropriate GraphQL/Nest validation setup. Agar validation pipe configured nahi hai, to sirf decorator likhne se request automatically reject hone ki guarantee nahi hoti. Isliye project ke global validation setup ko bhi verify karna chahiye.

#### `role!: Role` mein `!` kyun hai?

TypeScript ka definite-assignment assertion (`!`) compiler ko batata hai ki property initialization class constructor mein visibly na hone ke bawajood framework request se value populate karega. Ye runtime validation ka substitute nahi hai.

#### Kya DTO mein authorization check hota hai?

Nahi. DTO input ka shape/type validate karta hai. Caller ADMIN hai ya nahi, last ADMIN rule, aur target same organization ka hai ya nahi — ye service layer ke checks hain.

### 12.4 `MEMBER_SELECT` export aur reuse kyun?

Day 2 mein `MEMBER_SELECT` safe member fields select karne ke liye banaya gaya tha. Day 4 mein usi constant ko reuse karne ke liye `export` kiya gaya.

```ts
export const MEMBER_SELECT = {
```

#### `export` ka matlab

ES module mein bina `export` declare kiya gaya variable us module ke bahar directly import nahi kiya ja sakta. `export` us symbol ko doosri file ke liye available banata hai.

```ts
import { MEMBER_SELECT } from './organizations.service.js';
```

Ye named import hai; import ka naam exported symbol ke naam se match karna chahiye.

#### Select object reuse karne ka benefit

- Multiple service methods mein member response ka shape consistent rehta hai.
- Har query mein safe fields manually repeat nahi karne padte.
- Password hash jaise sensitive fields accidental response mein bhejne ka risk kam hota hai, agar select object mein woh fields included nahi hain.
- Response fields badalne par central selection object update karna aasaan hota hai.

**Security note:** `MEMBER_SELECT` ko dekh kar confirm karo ki usmein sirf intended public fields hain. Kisi select object ko safe keh dena enough nahi; actual fields inspect karna zaroori hai. Prisma ka explicit `select` response mein kaun se fields return honge, use control karta hai.

### 12.5 Service layer: business rules yahan kyun hain?

`MemberManagementService` business logic ka owner hai. Resolver GraphQL request receive karta hai aur service call karta hai; service permission, tenant scope, last-admin rule aur database operations execute karti hai.

Is separation ke benefits:

- Resolver thin aur easy-to-read rehta hai.
- Business rules ek jagah rehte hain.
- Unit tests ko GraphQL server start kiye bina service behavior test karne mein aasani hoti hai.
- Future mein REST endpoint ya background job add ho, to same service reuse ki ja sakti hai — lekin entry point ke authentication/authorization requirements ko phir bhi carefully enforce karna hoga.

#### `@Injectable()` kya karta hai?

NestJS dependency-injection container ko batata hai ki class provider ke roop mein manage/inject ki ja sakti hai.

#### Constructor injection kyun?

```ts
constructor(private prisma: PrismaService) {}
```

NestJS configured `PrismaService` instance ko service ke constructor mein inject karta hai. Isse har method mein naya Prisma client banane ki zaroorat nahi hoti, aur tests mein dependency ko mock karna easier hota hai.

`PrismaService` ko module/provider configuration ke through NestJS ko available hona chahiye. Is Day 4 implementation mein `OrganizationsModule` `PrismaModule` import karta hai.

### 12.6 `runSerializable()` ko detail mein samjho

Original code:

```ts
private async runSerializable<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  try {
    return await this.prisma.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === 'P2034'
    ) {
      throw new ConflictException('Concurrent update detected, please retry');
    }
    throw e;
  }
}
```

#### Generic `<T>` kyun?

`T` generic return type hai. `updateRole()` member object return karta hai, jabki `removeMember()` boolean return karta hai. Generic helper dono operations ko reuse kar sakta hai aur caller ka return type preserve kar sakta hai.

#### `fn: (tx: Prisma.TransactionClient) => Promise<T>` ka meaning

Helper ek callback accept karta hai. Callback ko transaction-scoped Prisma client `tx` milta hai aur woh asynchronously result `T` return karta hai. Callback ke andar ki database queries isi transaction ka part hoti hain.

#### `$transaction()` kyun?

Last-admin protection mein sirf count dekhna enough nahi hai. Count aur actual role update/delete logically ek unit hain. Transaction ka purpose ye hai ki database changes atomic boundary ke andar hon. Agar operation fail ho, transaction ke changes commit nahi hone chahiye.

#### `Serializable` kyun?

Serializable isolation database ko concurrent transactions ka result aise behave karne ke liye constrain karta hai jaise unka koi serial order ho. Ye high-level guarantee last-admin rule jaise concurrent invariants protect karne mein help karti hai.

Simple example:

- Starting state: ADMIN A aur ADMIN B.
- Request 1: A, B ko demote karna chahta hai.
- Request 2: B, A ko demote karna chahta hai.
- Dono agar independent count checks mein 2 ADMIN dekhein aur bina concurrency protection ke changes commit kar dein, to zero ADMIN bach sakte hain.
- Serializable isolation mein conflicting transactions mein se ek fail ho sakti hai; application us failure ko handle karti hai.

Serializable isolation ka matlab ye nahi ki transaction kabhi fail nahi hogi. Concurrency conflicts expected possibility hain, isliye client ko retry karna pad sakta hai.

#### `P2034` ko `ConflictException` kyun banaya?

Prisma `P2034` transaction write conflict/deadlock jaise retryable conflict situations ko represent kar sakta hai. Is code mein us known error ko NestJS `ConflictException` mein map kiya gaya hai. Isse application conflict ko HTTP-style 409 category mein represent karne ka intention rakhti hai.

**Important:** GraphQL response ka actual `extensions.code` HTTP 409 ke barabar zaroori nahi hai. GraphQL clients ko error format `formatError` aur exception integration ke hisaab se mil sakta hai. Original notes ke section 8 mein ye production observation already documented hai.

#### Kya code automatically retry karta hai?

Nahi. Is helper mein `P2034` catch karke conflict response throw hota hai. Automatic retry loop implement nahi hai. Error message client ko retry karne ko kehta hai; actual retry client ya future server-side retry policy implement karegi.

Automatic retries add karte waqt retry limit, backoff aur operation idempotency ka dhyan rakhna chahiye. Infinite retry loop nahi banana chahiye.

#### Har error ko 409 kyun nahi banaya?

Catch block sirf recognized Prisma request error aur code `P2034` ko map karta hai. Baaki errors `throw e` se propagate hote hain. Isse programming errors, unexpected database errors aur unrelated failures galat tarah se concurrency conflicts label nahi hote.

### 12.7 `assertAdmin()` — caller ko pehle verify karna kyun?

```ts
private async assertAdmin(
  tx: Prisma.TransactionClient,
  callerId: string,
  organizationId: string,
) {
  const caller = await tx.organizationMember.findUnique({
    where: { userId_organizationId: { userId: callerId, organizationId } },
    select: { role: true },
  });

  if (!caller) {
    throw new ForbiddenException(NOT_A_MEMBER);
  }

  if (caller.role !== Role.ADMIN) {
    throw new ForbiddenException('Insufficient role');
  }
}
```

#### Compound key ka use

`userId_organizationId` Prisma ka compound unique selector hai, jo schema mein corresponding compound unique constraint se generate hota hai. Is lookup mein dono values zaroori hain:

- `userId`: kaunsa user?
- `organizationId`: kis organization ke context mein?

Sirf `userId` se lookup karne par application galat organization ki membership ko relevant samajh sakti thi. Compound key dono identity dimensions ko saath bind karti hai.

#### `select: { role: true }` kyun?

Authorization check ke liye sirf role chahiye. Poora membership object fetch karna unnecessary hai. Narrow select intent clear karta hai aur unnecessary data fetch kam karta hai.

#### Pehle caller, baad mein target kyun?

Agar caller authorized hi nahi hai, to target member ki existence reveal karne ki zaroorat nahi. Pehle caller check karne se unauthorized caller ko `Member not found` aur doosre member ki existence ke beech farq se unnecessary information milne ka risk kam hota hai.

Ye information-disclosure reduction hai; har application mein errors ka exact wording threat model ke hisaab se decide hota hai.

#### `ForbiddenException` aur `NotFoundException` ka difference

- `ForbiddenException`: caller authenticated ho sakta hai, lekin action allowed nahi hai — ya is implementation mein organization ka member nahi hai.
- `NotFoundException`: authorized ADMIN ke context mein requested target membership nahi mili.

Actual GraphQL response mein error code/message ka appearance framework configuration se affect ho sakta hai.

### 12.8 `assertNotLastAdmin()` — count check ka exact logic

```ts
private async assertNotLastAdmin(
  tx: Prisma.TransactionClient,
  organizationId: string,
) {
  const admins = await tx.organizationMember.count({
    where: { organizationId, role: Role.ADMIN },
  });

  if (admins <= 1) {
    throw new BadRequestException(LAST_ADMIN);
  }
}
```

#### Count mein `organizationId` kyun?

Har organization ka ADMIN set alag hai. ORG2 ke ADMIN ko ORG1 ke last-admin calculation mein count nahi karna chahiye. Isliye count tenant-scoped hai.

#### `role: Role.ADMIN` kyun?

Rule specifically ADMIN ke baare mein hai. MANAGER aur EMPLOYEE ko count karne se rule galat ho jayega.

#### `admins <= 1` kyun?

Agar count 1 hai, target hi last ADMIN ho sakta hai; usko demote/remove karne se zero ADMIN bachenge. Count 0 par bhi invariant already broken hai, isliye operation ko proceed nahi karna chahiye.

Ye helper sirf tab call hota hai jab target ADMIN ho aur uska role ADMIN se neeche ja raha ho, ya target ADMIN ko remove kiya ja raha ho. Kisi EMPLOYEE ko remove karne se ADMIN count change nahi hota, isliye unnecessary count query nahi chalti.

#### Promotion par count kyun nahi?

EMPLOYEE ko ADMIN promote karna ADMIN count ko kam nahi karta. Is operation se organization bina ADMIN ke hone ka risk nahi banta, isliye current code count query skip karta hai.

### 12.9 `updateRole()` ka execution sequence

1. Input se `organizationId`, `userId`, aur requested `role` nikale jaate hain.
2. `runSerializable()` callback ko serializable transaction mein chalata hai.
3. `assertAdmin()` caller ki membership aur ADMIN role verify karta hai.
4. Target ko `(userId, organizationId)` compound key se find kiya jata hai.
5. Target nahi mila to `NotFoundException` throw hota hai.
6. Target pehle se ADMIN hai aur requested role ADMIN nahi hai, tab last-admin count check hota hai.
7. `organizationMember.update()` target membership ki role field update karta hai.
8. `select: MEMBER_SELECT` response ko expected safe field set tak limit karta hai.
9. Transaction conflict `P2034` ho to helper usko conflict exception mein map karta hai.

#### ADMIN se ADMIN karne par count kyun nahi?

Condition `target.role === Role.ADMIN && role !== Role.ADMIN` hai. Agar current role aur requested role dono ADMIN hain, demotion nahi ho rahi; count check skip hota hai.

#### Target ka role pehle fetch kyun kiya?

Service ko pata hona chahiye ki target pehle ADMIN tha ya nahi. Last-admin guard sirf current ADMIN ko demote karne par relevant hai. Isi wajah se target lookup mein `select: { role: true }` hai; update ke baad response ke liye separate `MEMBER_SELECT` use hota hai.

### 12.10 `removeMember()` ka execution sequence

1. Serializable transaction start hoti hai.
2. Caller ka ADMIN role verify hota hai.
3. Target membership same organization mein lookup hoti hai.
4. Target nahi mila to `Member not found`.
5. Target ADMIN hai to `assertNotLastAdmin()` run hota hai.
6. `organizationMember.delete()` sirf membership row delete karta hai.
7. Method `true` return karta hai.

#### Delete ke baad `true` ka meaning

Is resolver mein mutation ka GraphQL return type `Boolean` hai. Successful deletion par service `true` return karti hai. Iska matlab operation successful hua; ye deleted member ka full record return nahi karta.

#### Kya user ka account aur refresh tokens delete hote hain?

Nahi. Current code `tx.organizationMember.delete()` call karta hai, `tx.user.delete()` nahi. Isliye Day 4 ka operation account deletion implement nahi karta.

Refresh tokens ka exact storage aur invalidation behavior project ke auth implementation par depend karta hai. Original design ke mutabik membership/role authorization har relevant request par DB se check hota hai, isliye organization membership removal ke baad org-scoped actions reject hone chahiye. Lekin agar kisi endpoint par membership dobara check nahi hoti, to us endpoint ko separately audit karna zaroori hai.

### 12.11 Resolver: GraphQL API layer

Original resolver mein do mutations expose ki gayi hain:

- `updateMemberRole(input: UpdateMemberRoleInput!): OrganizationMember`
- `removeMember(organizationId: ID!, userId: ID!): Boolean`

#### `@Resolver(() => OrganizationMember)` kyun?

NestJS GraphQL ko resolver class ke GraphQL object context ke baare mein batata hai. Mutation ka actual return type phir bhi `@Mutation(() => OrganizationMember)` ya `@Mutation(() => Boolean)` se explicitly define hai.

#### `@Mutation()` kyun?

GraphQL operation ko mutation ke roop mein schema mein register karta hai. Mutation data change karne wali operation ko represent karti hai.

#### `@UseGuards(JwtAuthGuard)` kyun?

Mutation execute hone se pehle access token authentication guard chalna chahiye. Guard authenticated identity establish karne mein help karta hai. Ye apne aap caller ko organization ADMIN nahi banata; service ka `assertAdmin()` role authorization karta hai.

#### `@CurrentUser()` kyun?

Ye custom decorator authenticated request context se current user ko resolver tak pahunchata hai. Isse caller ka ID client-provided `userId` se nahi liya jata. Ye security ke liye important hai: caller ki identity verified token/request context se aani chahiye.

#### `@Args()` kyun?

GraphQL arguments resolver method ko provide karta hai. `input` mutation ka DTO object hai; `organizationId` aur `userId` remove mutation ke separate arguments hain.

#### `ID` aur UUID ka relation

GraphQL `ID` identifier type hai, jabki UUID ek specific string format hai. Resolver mein `ID` declare karna UUID format validate karne ke barabar nahi hai. Input validation ko DTO/pipeline aur application rules se ensure karna hota hai.

### 12.12 `OrganizationsModule` mein provider registration kyun?

NestJS modules dependency-injection boundaries define karte hain. `providers` array mein service aur resolver register karne se NestJS unhe instantiate aur dependencies inject kar sakta hai.

- `MemberManagementService`: role update/remove ka business logic.
- `MemberManagementResolver`: GraphQL mutations expose karta hai.
- `PrismaModule`: database access ke liye Prisma provider available karata hai.
- Existing organizations/invitations providers ko preserve kiya gaya hai; Day 4 feature ko add karne ke liye purani functionality replace nahi ki gayi.

Agar service ko module ke `providers` mein register nahi kiya, to resolver constructor mein dependency injection fail ho sakti hai. Agar module ka required dependency import nahi hai, to NestJS startup par provider-resolution error aa sakta hai.

### 12.13 Unit tests ko kaise read karein?

Test file Vitest use karti hai aur Prisma behavior ko mocks ke through simulate karti hai. Isse tests fast rehte hain aur actual database ki requirement nahi hoti.

#### Mock functions

- `findUnique`: caller aur target membership lookup simulate karta hai.
- `count`: ADMIN count simulate karta hai.
- `update`: role update ka response simulate karta hai.
- `del`: membership delete simulate karta hai.
- `transaction`: callback ko mock transaction object ke saath execute kar sakta hai.

#### `transaction.mockImplementation((cb) => cb(tx))` ka meaning

Test mein transaction mock callback ko execute kar deta hai. Isse service ke andar ke branches test ho sakte hain. Lekin ye real PostgreSQL Serializable isolation, locks ya actual concurrent write-skew behavior simulate nahi karta. Real isolation guarantee ke liye integration/concurrency test bhi useful hoga.

#### `vi.resetAllMocks()` kyun?

Har test ke pehle mock call history aur configured mock behavior reset karne ke liye, taaki ek test ka setup doosre test ko accidentally affect na kare. Iske baad `beforeEach` mein common mock behavior dobara set kiya jata hai.

#### `mockResolvedValueOnce()` kyun?

Caller lookup pehli `findUnique` call hoti hai aur target lookup doosri. `mockResolvedValueOnce()` in calls ke expected results sequence mein configure karta hai. Isliye test order service ke actual lookup order se match karna chahiye.

#### `expect(...).rejects.toBeInstanceOf(...)` kya test karta hai?

Promise reject hone ki expectation aur rejection error class check karta hai. Ye test prove karta hai ki operation expected exception class ke saath fail hua. Ye apne aap exact message, GraphQL error shape, database isolation ya HTTP status verify nahi karta.

#### `expect(update).not.toHaveBeenCalled()` kyun?

Sirf error throw hona enough nahi; test ye bhi verify karta hai ki unauthorized/invalid request par write operation tak baat nahi pahunchi. Isi tarah delete test mein `del` ko not-called check karna ensure karta hai ki failed authorization ke baad membership delete nahi hui.

#### 14 unit tests ka scope

Original notes mein 14 unit tests listed hain. Ye service ke main success/failure branches cover karte hain. Unit tests ka pass hona real database constraints, real GraphQL validation, access-token integration aur concurrent transaction behavior ki full guarantee nahi hai. Isi liye build, server startup aur manual Sandbox checks bhi plan ka part hain.

### 12.14 Unit test aur manual GraphQL test mein difference

| Check | Kya verify karta hai? | Kya alone prove nahi karta? |
|---|---|---|
| Unit test | Service logic, branches, expected exceptions | Real PostgreSQL concurrency behavior |
| `pnpm build` | TypeScript/build-time issues | Runtime permissions correctness |
| `pnpm start:dev` | Nest modules/providers startup wiring | Har mutation ka correct behavior |
| Apollo Sandbox | Real GraphQL request, headers, resolver/service integration | Sab possible concurrent schedules |
| Prisma Studio | Stored rows ka actual state | API authorization by itself |

In sab checks ka purpose alag hai. Ek passing test ko doosre checks ka replacement nahi samajhna chahiye.

### 12.15 Apollo Sandbox variables aur headers ka WHY

#### Authorization header

```json
{
  "Authorization": "Bearer <real accessToken>"
}
```

`Bearer` token scheme hai. `<real accessToken>` placeholder ko actual token se replace karna hai; angle brackets ko literal value ke roop mein paste nahi karna.

Har request ke liye correct user ka token use karna zaroori hai. Agar EMPLOYEE ka token bhej diya, to service us caller ko ADMIN nahi samjhegi. Agar header missing hai, `JwtAuthGuard` ke configuration ke mutabik authentication error aana chahiye.

#### Variables kyun use karte hain?

GraphQL query aur actual values ko separate rakhne ke liye. Isse same mutation ko different user IDs/roles ke saath repeat kar sakte hain, bina query text ko har baar edit kiye.

`UpdateMemberRole` ke liye variables mein `input` object dena zaroori hai, kyunki query `$input: UpdateMemberRoleInput!` declare karti hai. Agar variables panel empty hai ya key ka naam mismatch hai, GraphQL required variable missing error dega.

**Note:** Original combined JSON example mein update aur remove dono mutations ke variables ek saath dikhaye gaye hain. Har execution ke waqt sirf currently selected operation ke required variables dena clearer aur less error-prone hota hai. Agar Sandbox mein multiple operations query editor mein hain, operation selector se correct operation choose karo.

#### IDs carefully copy karo

`organizationId` ORG1 ka actual ID hona chahiye. `userId` target user ka actual `user.id` hona chahiye, membership row ka ID zaroori nahi. `matrix1` aur `matrix3` ke IDs login responses se separately note karo; IDs mix hone se valid authorization test bhi wrong target ko hit kar sakta hai.

### 12.16 Manual test sequence ko samjho

Original table ke steps state-dependent hain: har successful mutation database state badal sakti hai, isliye order important hai.

1. **EMPLOYEE self-promotion:** `matrix3` ka token use karo. Expected `Insufficient role`, kyunki caller ADMIN nahi hai.
2. **Non-member caller:** `matrix2` ka token use karo. Expected organization membership error, kyunki caller ORG1 ka member nahi hai.
3. **Missing target:** ADMIN token se invalid/non-existent target ID do. Expected `Member not found`.
4. **Last ADMIN demote:** ORG1 ka only ADMIN khud ko EMPLOYEE banane ki koshish kare. Expected last-admin error.
5. **Last ADMIN remove:** Wahi only ADMIN khud ko remove kare. Expected last-admin error.
6. **Role update success:** ADMIN, `matrix3` ko MANAGER banaye. Expected updated role `MANAGER`.
7. **Removal success:** ADMIN, `matrix3` ki ORG1 membership remove kare. Expected `true`.
8. **Removed membership verification:** `matrix3` ke token se ORG1 query try karo. Expected membership authorization failure.
9. **No-token request:** Header remove karke protected mutation run karo. Expected missing/invalid token error, exact wording guard/error formatting par depend kar sakti hai.

#### Row 7 ke baad C1 aur C2 kyun?

- **C1 — MyOrganizations:** Confirm karta hai ki user ka ORG1 se relation hat gaya, lekin uski doosri organization membership intact hai.
- **C2 — Prisma Studio:** Confirm karta hai ki `User` row abhi bhi hai aur ORG1 ka `OrganizationMember` row delete hua hai.

API response alone se database state ke har detail ka proof nahi milta; isliye persisted rows inspect karna useful hai.

#### Test sequence repeat karne se pehle reset kyun?

Row 7 ke baad `matrix3` ORG1 ka member nahi rahega. Same state par test sequence dobara run karoge to expected results badal sakte hain. Repeat test ke liye Day 3 invite flow se membership restore karo, ya known test fixture/database state reset karo. Production data par destructive manual tests kabhi mat chalao.

### 12.17 Errors aur troubleshooting ko deeper level par samjho

#### `MEMBER_SELECT` exported nahi hai

ES module import tabhi kaam karta hai jab symbol export ho. Declaration ko `export const MEMBER_SELECT = ...` banana required hai. Import path aur ESM extension conventions ko project ke existing code ke saath consistent rakho.

#### `touch` sirf empty file banata hai

Linux ka `touch` file create kar sakta hai ya existing file ka timestamp update karta hai. Ye code generate nahi karta. Isliye command ke baad code editor mein file open karke implementation paste/save karna zaroori hai.

#### Required GraphQL variable missing

Agar operation `$input: UpdateMemberRoleInput!` leta hai, to variables JSON mein `input` key aur required fields honi chahiye. GraphQL variable name, input property names aur resolver argument names ko exact match karo.

#### Missing access token

Headers tabhi request ke saath bheje jaate hain jab Sandbox ke headers panel mein set kiye gaye hon. Correct token, `Bearer` prefix aur header key check karo. Token expire ho gaya ho to bhi authentication fail ho sakti hai.

#### Wrong user ID

Login response ke `user.id` ko target `userId` ke roop mein use karo. `organizationMember.id` aur `user.id` alag identifiers ho sakte hain. Agar galat ID di gayi, target lookup `Member not found` de sakta hai.

#### GraphQL error code aur HTTP exception ka difference

NestJS exceptions ko GraphQL layer map karta hai. Isliye NestJS mein `ConflictException` throw hone ka matlab ye nahi ki Apollo response mein har environment mein `extensions.code: "CONFLICT"` hi aayega. Original notes ka `formatError` observation important hai: production masking client ko internal message se bachata hai, lekin expected client-facing errors ko intentionally preserve karne ke liye error mapping ko explicitly design karna hota hai.

Client ko safe, predictable error code/message dena aur internal stack/database details hide karna dono important hain. Sirf debugging ke liye sensitive internal error production client ko expose mat karo.

### 12.18 Security review checklist

Day 4 ke code ko review karte waqt ye questions check karo:

- [ ] Har mutation authenticated request require karti hai?
- [ ] Caller identity request/token se aa rahi hai, client-provided caller ID se nahi?
- [ ] Har action ke liye caller ka organization membership aur ADMIN role verify hota hai?
- [ ] Target lookup mein `organizationId` include hai?
- [ ] Last-admin count same organization aur ADMIN role tak scoped hai?
- [ ] Count + mutation same transaction mein hain?
- [ ] Transaction isolation explicitly Serializable set hai?
- [ ] `P2034` conflict ka predictable handling hai?
- [ ] Response mein sensitive fields, jaise password hash, return nahi hote?
- [ ] Remove operation sirf membership delete karti hai?
- [ ] Relevant authorization queries role/membership change ke baad database se fresh state check karti hain?
- [ ] Runtime validation pipeline configured hai?
- [ ] Unit tests ke saath manual/integration verification bhi ki gayi hai?
- [ ] Production GraphQL error formatting expected client-facing errors ko safely represent karti hai?

### 12.19 Interview concepts — short revision

| Concept | One-line explanation |
|---|---|
| Authentication | Request bhejne wale user ki identity verify karna |
| Authorization | Identity ke basis par requested action allow/deny karna |
| RBAC | Role, jaise ADMIN/MANAGER/EMPLOYEE, ke basis par permissions control karna |
| Multi-tenancy | Same application/database mein multiple organizations ka data logically isolate karna |
| Compound unique key | Ek se zyada columns/fields ke combination ko unique identify karna |
| Transaction | Related DB operations ko ek atomic unit mein execute karna |
| Serializable isolation | Concurrent transactions ko serial execution ke equivalent correctness dene ka strict isolation level |
| Race condition | Concurrent execution ki timing/order se incorrect result ka risk |
| Write skew | Transactions alag rows update karke milkar shared invariant violate kar sakti hain |
| Least privilege | Har user ko sirf required permissions dena |
| DTO | Request data ka declared shape aur validation rules define karna |
| Resolver | GraphQL operation ko application logic se connect karna |
| Service layer | Business rules aur operations ko organize karna |
| Dependency injection | Framework se class dependencies provide karwana |
| Unit test | Ek component/logic ko isolated dependencies ke saath test karna |
| Integration test | Multiple real components ko saath test karna |

### 12.20 Day 4 ke liye practical completion order

1. Original code ke saare files create/update karo.
2. `MEMBER_SELECT` export confirm karo.
3. `pnpm prettier --write src/organizations` run karo.
4. `pnpm build` run karo; errors aayein to pehle resolve karo.
5. `pnpm test` run karo aur actual pass count record karo.
6. `pnpm start:dev` se NestJS module/provider wiring verify karo.
7. Apollo Sandbox mein correct token aur ORG1 IDs ke saath rows 1–9 run karo.
8. C1 aur C2 checks complete karo.
9. `git status` inspect karo; unexpected files/secrets commit mat karo.
10. `git add`, `git commit`, aur `git push` karo.
11. README ko repository mein save/commit karo.
12. Day 4 complete hone ke baad hi next day start karo, project ke planned sequence ke mutabik.

**Git safety:** `.env`, real access tokens, passwords, database credentials aur private keys commit nahi karne chahiye. `git status` aur staged diff review karna commit se pehle achhi habit hai.

### 12.21 Final mental model

Is feature ka core pattern yaad rakho:

```text
JWT authentication
      ↓
Authenticated caller ID
      ↓
Serializable transaction
      ↓
Caller is this organization's ADMIN?
      ↓
Target belongs to this organization?
      ↓
Will this action remove/demote the last ADMIN?
      ↓
Update role OR delete membership
      ↓
Return safe result
```

**Sabse important distinction:** `JwtAuthGuard` batata hai ki request authenticated user se aayi hai; `assertAdmin()` batata hai ki woh user is organization mein authorized ADMIN hai; compound-key lookup tenant boundary enforce karta hai; aur Serializable transaction concurrent changes ke beech last-admin invariant protect karne mein help karti hai.

In layers ko ek doosre ka replacement mat samjho. Secure implementation in sabko sahi jagah combine karne se banti hai.
```

Bhai, ab poora content ek hi code block mein hai. Code block ke **Copy** button se copy karke apne existing `README.md` mein paste kar dena.