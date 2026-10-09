
# 📘 Day 5 — Authentication: Login + JWT + Refresh Token Rotation

> **Project:** TaskForge  
> **Phase:** Backend Development  
> **Module:** Authentication & Session Management  
> **Tech Stack:** NestJS + GraphQL + Prisma + PostgreSQL + JWT + bcrypt

## 🎯 1. Day 5 ka Objective

Day 4 mein humne user registration aur organization creation ka foundation banaya. Day 5 mein hum authentication ko extend karenge, taaki registered user securely login kar sake aur apne account ko baar-baar password enter kiye bina access kar sake.

### Day 5 ke baad kya implement hoga?

- Login using email and password.
- JWT-based access token generation.
- Cryptographically secure refresh token generation.
- Database mein refresh token ka hash store karna.
- Access token expire hone par session refresh karna.
- Refresh token rotation.
- Logout and refresh token revocation.
- Invalid credentials aur token reuse se protection.
- GraphQL mutations ke through authentication.

### Complete authentication flow

```text
                    REGISTERED USER
                           |
                           v
                  Login(email, password)
                           |
                           v
                  Find User by Email
                           |
                           v
                 Compare Password Hash
                           |
                 +---------+---------+
                 |                   |
             Invalid               Valid
                 |                   |
                 v                   v
          Unauthorized Error    Generate Tokens
                                     |
                          +----------+----------+
                          |                     |
                          v                     v
                    Access Token          Refresh Token
                       (JWT)              (Random String)
                          |                     |
                          |                     v
                          |                SHA-256 Hash
                          |                     |
                          |                     v
                          |                Store in DB
                          |                     |
                          +----------+----------+
                                     |
                                     v
                           Return AuthPayload
```

---

## 🧠 2. Authentication vs Authorization

Sabse pehle dono concepts ka difference samajh.

### Authentication kya hai?

**Authentication is the process of verifying the identity of a user.**

Simple words mein: system check karta hai ki user wahi hai hone ka claim kar raha hai.

Examples:
- Email aur password verify karna.
- Login ke baad JWT verify karna.
- Refresh token validate karna.

### Authorization kya hai?

**Authorization is the process of determining what an authenticated user is allowed to do.**

Examples:
- Kya user organization ka member hai?
- Kya user project delete kar sakta hai?
- Kya user organization ka ADMIN hai?
- Kya user kisi private task ko access kar sakta hai?

### TaskForge mein difference

| Feature | Authentication | Authorization |
|---|---|---|
| Login | Yes | No |
| JWT verification | Yes | No |
| `me` query mein current user identify karna | Yes | Usually basic access check |
| Organization membership check | No | Yes |
| Admin-only operation | No | Yes |
| Project deletion permission | No | Yes |

**Day 5:** Authentication ka login aur token foundation.

**Day 6:** JWT authentication guard, `@CurrentUser()`, `me` query aur RBAC ki shuruaat.

---

## 🔑 3. Important Definitions

| Term | Definition |
|---|---|
| Authentication | User ki identity verify karne ki process. |
| Authorization | User ke permissions determine karne ki process. |
| Session | User ke authenticated state aur usse related session information ka representation. |
| Access Token | Short-lived credential jo protected resources access karne ke liye use hota hai. |
| Refresh Token | Credential jo naya access token issue karwane ke liye use hota hai. |
| JWT | JSON Web Token, ek compact format jo claims ko digitally sign karke represent kar sakta hai. |
| Payload | Token ke andar rakhi gayi claims ya information. |
| Signature | Token ki integrity aur authenticity verify karne ke liye cryptographic signature. |
| Token Expiration | Woh time jiske baad token accept nahi kiya jaana chahiye. |
| Token Rotation | Purane refresh token ko consume karke naya refresh token issue karna. |
| Token Revocation | Kisi token ya session ko uski normal expiry se pehle invalid karna. |
| Hashing | Input ko one-way mathematical transformation se fixed-length representation mein convert karna. |
| Password Hash | Password ka stored hash, jisse password ko directly store kiye bina verification ki ja sakti hai. |
| DTO | Data Transfer Object; input data ka expected structure define karta hai. |
| Resolver | GraphQL operation ko handle karne wala component. |
| Service | Business logic implement karne wala component. |
| Guard | Request ko allow ya reject karne wala NestJS component. |
| RBAC | Role-Based Access Control; roles ke basis par permissions manage karna. |

---

# 🔐 4. Access Token vs Refresh Token

## Access Token kya hai?

Access token ek short-lived credential hai jo authenticated user ko protected API operations access karne deta hai.

TaskForge mein access token JWT format mein generate hota hai.

Example payload:

```json
{
  "sub": "user-123"
}
```

JWT standard ke according `sub` ka matlab **subject** hai. Hum ise user ki ID represent karne ke liye use kar rahe hain.

Token mein expiration bhi ho sakta hai, jo JWT library automatically add karti hai jab expiry configure hoti hai.

### Access token ki properties

- Short lifetime: 15 minutes.
- JWT format.
- Digitally signed.
- Protected requests mein use hota hai.
- Database mein store karna necessary nahi hai.
- Expire hone par naya access token lena padta hai.

**Important:** JWT ka payload normally encoded hota hai, encrypted nahi. Isliye JWT payload mein password, password hash, secret ya sensitive personal information nahi rakhni chahiye.

JWT ka signature payload ko secretly hide nahi karta.

## Refresh Token kya hai?

Refresh token ek credential hai jo valid hone par naya access token issue karwane ki permission deta hai.

TaskForge mein refresh token ek cryptographically secure random string hai.

Example format:

```text
a1b2c3d4...64 hexadecimal characters...
```

Yeh sirf illustrative format hai, actual token nahi.

### Refresh token ki properties

- Longer lifetime: 7 days.
- Random opaque string.
- Database mein iska hash store hota hai.
- Refresh endpoint par validate hota hai.
- Logout par revoke kiya ja sakta hai.
- Rotation ke baad purana token dobara use nahi kiya ja sakta.

### Comparison

| Property | Access Token | Refresh Token |
|---|---|---|
| Format | JWT | Random opaque string |
| Purpose | API access | New access token obtain karna |
| Lifetime | 15 minutes | 7 days |
| Database storage | Normally unnecessary | Hash store hota hai |
| Validation | JWT signature + expiry | Hash lookup + expiry + session checks |
| Rotation | Usually nahi | Har refresh par |
| Logout | Expiry tak valid reh sakta hai | Database se revoke ho sakta hai |

### Do tokens kyun use karte hain?

Suppose hum sirf ek JWT issue karte hain jo 7 days tak valid hai.

Agar attacker ko token mil gaya, toh woh uski expiry tak use kar sakta hai.

Agar JWT sirf 15 minutes valid hai, toh uske compromise hone ka exposure comparatively kam ho jata hai.

Refresh token user ko har 15 minutes mein password dobara enter karne se bachata hai.

**Security trade-off:** Short-lived access tokens aur revocable refresh tokens milkar security aur user convenience ke beech balance banate hain.

---

# 🪪 5. JWT Internals

JWT ka full form hai **JSON Web Token**.

JWT compact representation mein claims carry karta hai aur digitally signed ho sakta hai.

### JWT structure

```text
HEADER.PAYLOAD.SIGNATURE
```

Example structure:

```text
xxxxx.yyyyy.zzzzz
```

### Part 1: Header

Header token ka type aur signing algorithm identify karta hai.

Example:

```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

`HS256` HMAC-SHA-256 based signing algorithm hai.

### Part 2: Payload

Payload mein claims hoti hain.

Example:

```json
{
  "sub": "user-123",
  "iat": 1791500000,
  "exp": 1791500900
}
```

- `sub`: Subject, yahan user ID.
- `iat`: Issued-at timestamp.
- `exp`: Expiration timestamp.

JWT library `iat` aur `exp` jaise claims automatically add kar sakti hai, configuration ke according.

### Part 3: Signature

Signature ensure karne mein help karti hai ki token ke signed parts ko modify nahi kiya gaya aur token trusted secret/key se sign hua tha.

Agar attacker payload modify kare, toh signature verification fail ho jaani chahiye.

### JWT verification kaise hoti hai?

```text
Client sends JWT
       |
       v
Extract token
       |
       v
Verify signature
       |
       v
Check expiration
       |
       +------ Invalid ------> Reject
       |
       v
Extract user ID from sub
       |
       v
Authenticated Request
```

**Important:** JWT decode karna aur JWT verify karna alag operations hain.

- Decode: Payload read karna.
- Verify: Signature aur configured validation rules check karna.

Sirf decoded payload dekhkar token ko trusted nahi maana ja sakta.

---

# 🛡️ 6. Password Hashing vs Token Hashing

Yeh difference samajhna important hai, kyunki dono ka purpose alag hai.

## Password hashing

Passwords user choose karta hai, isliye unmein predictable patterns ho sakte hain.

Examples:

```text
password123
hello123
MyName@123
```

Agar database leak ho jaye, toh attacker common passwords try kar sakta hai.

Isliye passwords ke liye bcrypt jaise deliberately slow password-hashing algorithms use kiye jaate hain.

TaskForge:

```ts
const passwordHash = await bcrypt.hash(input.password, 12);
```

Yahan `12` bcrypt ka cost factor hai.

Higher cost generally computation ko expensive banata hai. Production mein ise target hardware par benchmark karke choose karna chahiye.

Verification:

```ts
const valid = await bcrypt.compare(
  input.password,
  user.passwordHash,
);
```

Original password database mein store nahi hota.

## Refresh token hashing

Refresh token user-created password nahi hai.

Hum ise cryptographically secure random generator se create karte hain:

```ts
const token = randomBytes(32).toString('hex');
```

32 random bytes = 256 bits of randomness.

Hex encoding se string 64 characters ki banti hai.

Is token ko SHA-256 se hash kar sakte hain:

```ts
private hash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
```

### SHA-256 kyun?

SHA-256 ek cryptographic hash function hai.

Iski properties:

- Same input se same hash milta hai.
- Output fixed length ka hota hai.
- Original input ko hash se practically recover karna feasible nahi hona chahiye.
- Token ko database mein plaintext store karne ki zaroorat nahi hoti.

### bcrypt vs SHA-256

| Property | bcrypt | SHA-256 |
|---|---|---|
| Main use | Password hashing | General-purpose cryptographic hashing |
| Computation | Deliberately expensive | Fast |
| Random salt | Built-in handling | Automatically nahi |
| Password storage | Suitable | Alone generally unsuitable |
| High-entropy random token | Usually unnecessary overhead | Suitable |
| Database lookup | Direct deterministic lookup ke liye awkward | Same token ka same hash milta hai |

**Note:** SHA-256 password hashing ka replacement nahi hai. Yeh distinction specifically high-entropy random refresh tokens ke context mein hai.

---

# 🔄 7. Refresh Token Rotation

### Definition

**Refresh token rotation is a security mechanism in which an existing refresh token is invalidated when a new refresh token is issued.**

Har successful refresh ke baad client ko naya refresh token milta hai.

### Example

Initially:

```text
Client: Token A
Database: Hash(A)
```

First refresh:

```text
refresh(Token A)
       |
       v
Validate Token A
       |
       v
Delete Hash(A)
       |
       v
Generate Token B
       |
       v
Store Hash(B)
       |
       v
Return Token B
```

Ab:

```text
Token A → Invalid
Token B → Valid
```

Agar client dobara Token A bhejta hai:

```text
refresh(Token A)
       |
       v
Hash(A) database mein nahi mila
       |
       v
Unauthorized
```

### Rotation ka security benefit

Agar kisi attacker ko purana refresh token mil jata hai, toh successful rotation ke baad woh token dobara use nahi kar sakta.

Lekin ek important limitation hai:

**Rotation akela har refresh-token theft scenario ko automatically detect nahi karta.**

Agar attacker purane token ko legitimate user se pehle use kar le, toh additional session tracking aur token-family reuse detection ke bina attack identify karna difficult ho sakta hai.

Production-grade systems mein token families, reuse detection aur suspicious-session revocation jaise mechanisms consider kiye ja sakte hain.

---

# 🗃️ 8. Database Design — RefreshToken

```prisma
model RefreshToken {
  id        String   @id @default(uuid())
  userId    String
  tokenHash String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
}
```

### Har field ka purpose

| Field | Definition |
|---|---|
| `id` | Har refresh-token record ki unique identifier. |
| `userId` | Us user ki ID jiske saath token associated hai. |
| `tokenHash` | Original refresh token ka SHA-256 hash. |
| `expiresAt` | Token ki expiration date and time. |
| `createdAt` | Token record create hone ka timestamp. |
| `user` | Prisma relation jo token ko user record se connect karti hai. |

### `@unique` ka purpose

```prisma
tokenHash String @unique
```

Isse database mein `tokenHash` par unique constraint create hota hai.

Prisma Client bhi is field ko unique lookup ke liye identify kar sakta hai.

Example:

```ts
const row = await this.prisma.refreshToken.findUnique({
  where: { tokenHash },
});
```

Agar generated Prisma Client purane schema par based hai, toh `tokenHash` ko unique field ke roop mein recognize nahi karega.

Schema change ke baad:

```bash
pnpm prisma migrate dev --name refresh_token_hash_unique
```

Agar migration already applied hai aur sirf generated client outdated hai:

```bash
pnpm prisma generate
```

Uske baad zaroorat pade toh VS Code mein TypeScript server restart karo.

---

# ⚙️ 9. `TokenService` ki Responsibilities

`TokenService` ka purpose token-related logic ko ek dedicated service mein organize karna hai.

Isse `AuthService` ko JWT internals, random token generation aur hashing implementation directly manage nahi karni padti.

### Main methods

| Method | Responsibility |
|---|---|
| `signAccessToken()` | JWT access token generate karna. |
| `hash()` | Refresh token ko SHA-256 se hash karna. |
| `issueRefreshToken()` | Random refresh token generate karna aur uska hash database mein store karna. |
| `consumeRefreshToken()` | Refresh token validate karke use ek baar consume karna. |
| `revokeRefreshToken()` | Refresh token revoke karna. |

### `randomBytes(32)` kaise kaam karta hai?

```ts
const token = randomBytes(32).toString('hex');
```

- `randomBytes(32)` 32 cryptographically secure random bytes generate karta hai.
- `.toString('hex')` bytes ko hexadecimal string mein convert karta hai.
- 32 bytes × 2 hexadecimal characters = 64 characters.

### `consumeRefreshToken()` ka logic

```ts
const tokenHash = this.hash(token);

const row = await this.prisma.refreshToken.findUnique({
  where: { tokenHash },
});

if (!row) return null;
```

Yahan database mein incoming token ka hash search hota hai.

Agar matching record nahi milta, toh token invalid maana jata hai.

Uske baad:

```ts
const { count } = await this.prisma.refreshToken.deleteMany({
  where: { tokenHash },
});

if (count === 0 || row.expiresAt < new Date()) {
  return null;
}
```

`deleteMany()` matching records delete karta hai aur batata hai kitne records delete hue.

`count === 0` ka matlab ho sakta hai ki kisi concurrent request ne token ko pehle hi consume kar liya.

**Important technical correction:** `findUnique()` ke baad `deleteMany()` aur count check concurrent token consumption ko handle karne mein help karte hain, lekin complete refresh-token rotation flow abhi bhi multiple database operations aur token issuance se milkar banta hai. Strong concurrency guarantees ke liye consumption aur related database changes ko appropriate transaction/locking strategy ke saath design karna chahiye.

Expired token bhi database se remove ho sakta hai.

### `revokeRefreshToken()`

```ts
async revokeRefreshToken(token: string) {
  await this.prisma.refreshToken.deleteMany({
    where: { tokenHash: this.hash(token) },
  });
}
```

Is method se matching token record delete hota hai.

Agar token pehle hi delete ho chuka hai, toh method dobara call karne par bhi unnecessary error nahi deta.

Is property ko **idempotent behavior** kehte hain.

---

# 🔌 10. NestJS Dependency Injection

NestJS mein services aur modules dependency injection ka use karte hain.

### Dependency Injection kya hai?

Dependency Injection (DI) ek design technique hai jahan class apni dependencies khud construct karne ke bajaye framework se receive karti hai.

Example:

```ts
constructor(
  private jwt: JwtService,
  private config: ConfigService,
  private prisma: PrismaService,
) {}
```

Yahan `TokenService` ko teen dependencies chahiye:

- `JwtService`
- `ConfigService`
- `PrismaService`

NestJS in dependencies ko resolve karke constructor mein provide karta hai.

### Iska benefit

- Loose coupling.
- Testing easier.
- Dependencies centrally manage hoti hain.
- Code modular aur maintainable rehta hai.

### `JwtModule.registerAsync()`

```ts
JwtModule.registerAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    secret: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    signOptions: {
      expiresIn: (config.get<string>('JWT_ACCESS_TOKEN_EXPIRES_IN') ??
        '15m') as JwtSignOptions['expiresIn'],
    },
  }),
})
```

**Note:** Tere original `.env` variable ka naam `JWT_ACCESS_EXPIRES_IN` tha. Code mein wahi naam use karna; example mein naming consistency maintain karna zaroori hai.

`registerAsync()` tab useful hai jab module configuration runtime par dependencies se read karni ho.

`getOrThrow()` missing configuration par exception throw karta hai, jisse missing secret ka issue startup par identify kiya ja sake.

### ESM imports mein `.js` extension

Tere project mein ESM use ho raha hai, isliye compiled JavaScript ke compatible import paths important hain.

Example:

```ts
import { TokenService } from './token.service.js';
```

TypeScript source file ka naam `.ts` hone ke bawajood `.js` extension intentional ho sakta hai, depending on TypeScript configuration.

---

# 🧩 11. DTO, Service, Resolver — Responsibilities

NestJS + GraphQL application mein responsibilities separate rakhna useful hai.

| Component | Responsibility |
|---|---|
| DTO / Input Type | Incoming input ka expected structure aur validation rules define karna. |
| Resolver | GraphQL queries aur mutations handle karna. |
| Service | Authentication business logic execute karna. |
| TokenService | Token creation, hashing, validation aur revocation. |
| PrismaService | Database access. |
| Prisma Schema | Database models aur relations define karna. |
| AuthModule | Authentication-related providers aur dependencies ko organize karna. |

### Example: Login request

```text
GraphQL Mutation
       |
       v
AuthResolver
       |
       v
AuthService.login()
       |
       +---- UsersService.findByEmail()
       |
       +---- bcrypt.compare()
       |
       +---- TokenService.signAccessToken()
       |
       +---- TokenService.issueRefreshToken()
       |
       v
Return AuthPayload
```

Is design se resolver thin rehta hai aur business logic service mein centralized hoti hai.

---

# 🧪 12. GraphQL Input Validation

Example:

```ts
@InputType()
export class LoginInput {
  @Field()
  @IsEmail()
  email: string;

  @Field()
  @IsNotEmpty()
  @MaxLength(72)
  password: string;
}
```

### Decorators ka purpose

| Decorator | Purpose |
|---|---|
| `@InputType()` | Class ko GraphQL input type ke roop mein register karta hai. |
| `@Field()` | Property ko GraphQL schema mein expose karta hai. |
| `@IsEmail()` | Email string ke format ko validate karta hai. |
| `@IsNotEmpty()` | Empty value ko reject karta hai. |
| `@MaxLength(72)` | Password ki input length limit karta hai. |

**Important:** `class-validator` decorators tabhi automatically execute honge jab application mein appropriate validation pipeline configured ho, jaise NestJS ka `ValidationPipe`.

Aur GraphQL mein field ko schema par expose karna aur uski value validate karna do alag responsibilities hain.

---

# 🚨 13. Login Security — User Enumeration aur Timing Attacks

## User Enumeration

User enumeration ek aisi situation hai jahan attacker identify kar sakta hai ki koi email account system mein registered hai ya nahi.

Unsafe responses:

```text
Email does not exist
```

Aur:

```text
Incorrect password
```

In dono messages se attacker registered emails discover kar sakta hai.

Better response:

```text
Invalid email or password
```

Same error message dono cases mein return hota hai.

## Timing Attack

Timing attack mein attacker response time ke differences observe karke internal behavior ke baare mein information infer karne ki koshish karta hai.

Example:

```text
Unknown email → Immediate response
Known email   → bcrypt comparison
```

Agar timing difference consistently observable ho, toh attacker ko user existence ka signal mil sakta hai.

Tere code mein:

```ts
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);
```

Aur:

```ts
const valid = await bcrypt.compare(
  input.password,
  user?.passwordHash ?? DUMMY_HASH,
);
```

Unknown user ke case mein bhi bcrypt comparison execute hota hai.

Isse response timing ko comparatively similar banane mein help milti hai.

**Note:** Dummy hash timing differences ko completely eliminate nahi karta. Network latency, database lookup, hashing cost aur implementation details bhi response time affect karte hain.

---

# 🔁 14. Refresh, Logout aur Session Lifecycle

### Refresh flow

```text
Client has Access Token A + Refresh Token A
                     |
                     v
             Access Token expires
                     |
                     v
             Send Refresh Token A
                     |
                     v
              Validate Token A
                     |
                     v
              Consume Token A
                     |
                     v
         Generate Access Token B
         Generate Refresh Token B
                     |
                     v
              Return New Tokens
```

### Logout flow

```text
Client sends Refresh Token
             |
             v
     Hash the token
             |
             v
    Delete matching DB row
             |
             v
      Return success
```

### Logout ke baad kya hota hai?

Refresh token revoke ho jata hai.

Lekin agar access token abhi expire nahi hua, toh woh independently valid reh sakta hai, jab tak application additional revocation checks implement na kare.

Yeh distinction important hai:

**Refresh token revoke karna automatically existing JWT access tokens ko revoke nahi karta.**

Isliye access tokens ki short lifetime useful hai.

Agar immediate access-token invalidation chahiye, toh token denylist, session-version checking ya kisi equivalent mechanism ki zaroorat ho sakti hai.

---

# 🧰 15. Testing Checklist — Apollo Sandbox

### Login

```graphql
mutation {
  login(input: {
    email: "ahmad@test.com"
    password: "Test@12345"
  }) {
    accessToken
    refreshToken
    user {
      id
      name
      email
    }
  }
}
```

### Refresh

```graphql
mutation {
  refresh(input: {
    refreshToken: "YOUR_REFRESH_TOKEN"
  }) {
    accessToken
    refreshToken
    user {
      id
      name
      email
    }
  }
}
```

### Logout

```graphql
mutation {
  logout(input: {
    refreshToken: "YOUR_REFRESH_TOKEN"
  })
}
```

### Expected behavior

| Test | Expected result |
|---|---|
| Correct credentials | Tokens aur user return hon. |
| Incorrect password | Generic authentication error. |
| Unknown email | Wahi generic authentication error. |
| Valid refresh token | New access aur refresh tokens. |
| Reuse old refresh token | Request reject ho. |
| Logout with valid refresh token | Token revoke ho. |
| Refresh after logout | Request reject ho. |
| Random refresh token | Request reject ho. |
| Expired refresh token | Request reject ho aur expired record clean up ho. |

**Security reminder:** Real production access tokens aur refresh tokens ko public websites, screenshots, logs ya Git repositories mein share mat karna.

---

# 📂 16. Day 5 ke baad Folder Structure

```text
src/
├── auth/
│   ├── dto/
│   │   ├── register.input.ts
│   │   ├── login.input.ts
│   │   └── refresh-token.input.ts
│   ├── entities/
│   │   └── auth-payload.entity.ts
│   ├── auth.module.ts
│   ├── auth.resolver.ts
│   ├── auth.service.ts
│   └── token.service.ts
├── users/
│   ├── entities/
│   │   └── user.entity.ts
│   ├── users.module.ts
│   └── users.service.ts
├── organizations/
├── prisma/
└── main.ts
```

---

# 🧠 17. Day 5 — Key Takeaways

1. **Authentication aur authorization alag concepts hain.** Login identity verify karta hai; authorization permissions determine karta hai.
2. **JWT signed hota hai, necessarily encrypted nahi.** Sensitive information payload mein mat rakho.
3. **Access token short-lived hota hai.** Isse stolen token ka exposure window reduce hota hai.
4. **Refresh token random aur high-entropy hona chahiye.** Database mein uska hash store karna better hai.
5. **Passwords ke liye bcrypt, random refresh tokens ke liye SHA-256** appropriate design choice hai.
6. **Token rotation purane refresh tokens ko invalidate karti hai.** Production systems ko token reuse detection bhi consider karna chahiye.
7. **`@unique` database constraint aur Prisma Client ke unique lookup ko enable karta hai.**
8. **Dependency Injection** NestJS services ko modular aur testable banata hai.
9. **Generic login errors** user enumeration ka risk reduce karte hain.
10. **Logout aur access-token revocation alag hain.** Refresh token revoke hone se existing JWT automatically invalidate nahi hota.

---

# 🚀 18. Next Step — Day 6

## Authentication Guard + Current User + RBAC

Day 5 mein humne tokens generate aur refresh karna seekha.

Ab Day 6 mein hum implement karenge ki protected GraphQL operations ko access karne se pehle JWT verify kaise kiya jata hai.

### Day 6 ke planned topics

- JWT verification.
- `AuthGuard` implementation.
- GraphQL execution context.
- Request mein authenticated user attach karna.
- `@CurrentUser()` custom decorator.
- Protected `me` query.
- `@Roles()` decorator.
- `RolesGuard`.
- Authentication vs authorization in actual code.
- Organization membership aur role-based access control ka foundation.

**Day 5 complete hone ka matlab:** TaskForge mein login, token issuance, refresh aur logout ka foundation ready hai. Day 6 mein hum in tokens ko protected resources access karne ke liye enforce karenge.