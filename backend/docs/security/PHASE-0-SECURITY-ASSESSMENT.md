# TaskForge — Phase 0 Security Assessment

**Project:** TaskForge / work-bench  
**Assessment phase:** Phase 0 — Read-only Security Audit  
**Assessment status:** Findings documented; remediation not started  
**Scope:** Authentication, authorization, multi-tenancy, rate limiting, GraphQL configuration, Redis-related security considerations.

## 1. Executive Summary

TaskForge implements several sound security practices, including password hashing, hashed refresh-token storage, membership-based authorization, tenant-scoped resource access, input validation, security headers, and recipient-scoped notifications.

The reviewed code excerpts do not establish a confirmed critical vulnerability. However, some authentication lifecycle and production-hardening questions remain.

The most important confirmed design gap is that refresh-token consumption and replacement are separate database operations rather than one atomic refresh transaction.

Other findings require careful classification: missing refresh-token reuse detection is a capability gap, while distributed throttling and GraphQL resource limits remain unverified rather than proven absent throughout the application.

## 2. Findings Register

### AUTH-01 — Refresh-token rotation is not atomic

**Priority:** High  
**Status:** Confirmed design gap

**Evidence**

`TokenService.consumeRefreshToken()` reads a refresh-token record, deletes it using `deleteMany()`, and returns its user ID. `AuthService.refresh()` subsequently looks up the user, signs an access token, and creates a replacement refresh token.

These steps do not form one atomic database operation.

**Impact**

If the old token is deleted but a subsequent operation fails, the client may lose its refresh session without receiving a replacement token. Concurrent refresh requests can also produce inconsistent session outcomes.

The conditional deletion and deletion-count check are useful safeguards against consuming the same stored token more than once. The issue is that the entire refresh lifecycle is not atomic.

**Recommended remediation**

Design a transaction-based refresh flow that coordinates consumption of the existing token and persistence of its replacement. Preserve single-use semantics and explicitly handle expired tokens, missing users, transaction conflicts, and concurrent requests.

**Verification criteria**

- Concurrent submissions of the same refresh token cannot produce multiple successful rotations.
- A failed refresh operation does not silently leave the session in an unintended state.
- Expired, unknown, and already-consumed tokens are rejected.
- Automated tests cover concurrent refresh and transaction failure scenarios.

---

### AUTH-02 — Refresh-token reuse detection is not evident

**Priority:** Medium–High  
**Status:** Capability gap confirmed in the inspected implementation

**Evidence**

Consumed refresh-token records are deleted. The inspected implementation does not show token-family tracking or a mechanism for identifying reuse of a previously consumed token.

**Impact**

A reused token is rejected, but the server cannot distinguish that event from an ordinary invalid-token submission based on the inspected token lifecycle.

**Recommended remediation**

Decide whether refresh-token families and reuse detection are required for the application's threat model. If implemented, define the response to detected reuse carefully, including whether the associated session family should be revoked.

**Verification criteria**

- Reuse of a consumed token is distinguishable from an unknown token where the chosen design requires this.
- Any family-revocation behavior is tested.
- Legitimate concurrent requests do not trigger unintended session revocation.

**Qualification:** The absence of reuse detection does not, by itself, establish that account takeover is possible.

---

### AUTH-03 — Access-token revocation is not evident

**Priority:** Medium  
**Status:** Not implemented in the inspected authentication flow; broader application behavior not fully verified

**Evidence**

The inspected JWT payload contains the user's subject identifier. The logout method revokes the supplied refresh token, but no server-side access-token revocation check was evident in the reviewed excerpts.

**Impact**

If access tokens remain valid until expiry, logging out or revoking a refresh token does not immediately invalidate an already-issued access token.

**Recommended remediation**

Confirm and document the intended logout semantics. If immediate access-token revocation is required, choose a revocation strategy appropriate to the application's performance and operational requirements.

**Verification criteria**

- Access-token lifetime is explicitly configured and validated.
- Logout behavior is documented and tested.
- The application meets its intended revocation requirements.

---

### AUTH-04 — Refresh tokens are returned through GraphQL

**Priority:** High for review; exposure impact depends on the client and transport design  
**Status:** Confirmed in the inspected authentication response shape

**Evidence**

The authentication service returns both `accessToken` and `refreshToken`. The reviewed GraphQL context indicates an API consumed through GraphQL, and the earlier audit identified a GraphQL authentication payload exposing the refresh token.

**Impact**

A refresh token is a bearer credential. Anyone who obtains a valid token may be able to use it until it expires or is revoked.

Returning it in a GraphQL response is not inherently a vulnerability: clients need a mechanism to receive and retain credentials. The risk depends on storage, transport, logging, and client behavior.

**Recommended remediation**

Review the client-side storage model, HTTPS enforcement, response logging, and any intermediary caching. Do not log token values. Consider whether an alternative session transport would better fit the intended client architecture.

**Verification criteria**

- Tokens are never written to application logs.
- Production traffic uses HTTPS.
- Client storage and session handling are documented.
- Responses containing credentials are not inadvertently cached or exposed.

---

### AUTH-05 — Refresh tokens are supplied through GraphQL input

**Priority:** Medium; design review required  
**Status:** Interface pattern identified; exploitability not established

**Evidence**

The reviewed refresh flow accepts a refresh-token string as input. The earlier audit identified a corresponding GraphQL input type.

**Impact**

The token must be supplied to the server to refresh the session. Its presence in a request is not automatically insecure. The relevant risks are accidental logging, telemetry capture, browser exposure, and inappropriate retention.

**Recommended remediation**

Review GraphQL request logging, error reporting, observability tools, and client-side credential handling. Ensure sensitive request fields are redacted wherever applicable.

**Verification criteria**

- Refresh-token values do not appear in logs or traces.
- Error responses do not disclose credentials.
- The selected token-transport approach is documented.

---

### AUTH-06 — Logout revokes refresh credentials but does not visibly revoke access credentials

**Priority:** Medium  
**Status:** Behavior identified; intended session semantics need documentation

**Evidence**

`AuthService.logout()` calls `revokeRefreshToken()` and returns `true`. The inspected implementation does not show an associated access-token revocation operation.

**Impact**

Existing access tokens may remain usable until expiry if no separate revocation mechanism exists.

**Recommended remediation**

Align logout behavior with the application's session policy and the decision made for AUTH-03. Avoid implementing duplicate mechanisms without a clear requirement.

**Verification criteria**

- Logout behavior is consistent across authentication endpoints.
- The documented policy matches observed behavior.
- Tests cover logout followed by use of previously issued credentials.

---

### AUTH-07 — JWT verification policy requires confirmation

**Priority:** Medium  
**Status:** Unverified

**Evidence**

The inspected token service signs access tokens with a subject identifier. The available excerpts do not establish the complete JWT verification configuration.

**Recommended remediation**

Verify the JWT module and guard configuration for:
- An explicitly configured signing secret or key.
- An explicit allowed algorithm policy.
- Token expiration validation.
- Appropriate issuer and audience validation where used by the system's trust model.
- Rejection of malformed tokens and tokens with invalid claims.

**Verification criteria**

Tests demonstrate rejection of invalid signatures, expired tokens, and tokens that violate the configured verification policy.

Do not treat issuer/audience checks as universally mandatory without considering the actual deployment and token trust model.

---

### RATE-01 — Shared production rate limiting is unverified

**Priority:** Medium  
**Status:** Partially verified

**Evidence**

The inspected application configures a default throttling limit of 100 requests per 60 seconds. Authentication operations were previously identified as having tighter limits of 5 requests per 60 seconds.

The integration test confirms that the guard throttles requests in its test application and uses different buckets for different forwarded client IPs. That test explicitly enables proxy trust in the test environment.

**Uncertainty**

The test does not establish that production throttling uses shared storage across multiple application instances. It also does not establish the actual production proxy-trust configuration or throttling behavior during storage failures.

**Recommended remediation**

Verify the deployed throttler storage configuration, the application's actual deployment topology, proxy trust boundaries, and the behavior when the throttling store is unavailable.

**Verification criteria**

- Limits behave as intended across production instances.
- Client IP identification cannot be manipulated by untrusted forwarding headers.
- Authentication endpoints retain their intended tighter limits.
- Failure behavior is explicit and tested.

---

### GRAPHQL-01 — Query depth and complexity protection are unverified

**Priority:** Medium  
**Status:** Configuration gap suspected; full absence not proven

**Evidence**

The inspected GraphQL module configuration does not visibly specify query depth or query complexity limits.

**Impact**

Expensive or deeply nested GraphQL operations may consume disproportionate CPU, memory, or database resources, depending on the exposed schema and resolver behavior.

**Recommended remediation**

Review the complete GraphQL configuration and schema. Determine whether query-depth, complexity, pagination, timeouts, and other resource controls are needed based on actual resolver cost and exposure.

**Verification criteria**

- The application has an explicit policy for expensive GraphQL operations.
- Pagination and input limits are enforced where appropriate.
- Resource-intensive operations have tests or documented operational safeguards.

---

### TENANT-01 — Multi-tenant authorization patterns reviewed positively

**Priority:** Informational  
**Status:** No confirmed issue in the reviewed excerpts

**Evidence**

The reviewed organization, project, task, comment, and notification services use organization membership checks and organization-scoped queries. Notification reads and updates are scoped by recipient and organization. Invitation acceptance uses a conditional update to claim an invitation before creating membership.

**Assessment**

These are sound authorization patterns. The reviewed excerpts did not establish a cross-tenant access vulnerability.

**Recommended maintenance**

Preserve organization-scoped database operations and cross-tenant regression tests when modifying these services.

---

### TENANT-02 — Membership removal and existing sessions

**Priority:** Informational / policy decision  
**Status:** Behavior observed; not a confirmed vulnerability

**Evidence**

Member removal deletes an organization membership without necessarily deleting the user's account or all refresh tokens.

**Assessment**

This can be correct for a multi-tenant application: removing a user from one organization should not necessarily invalidate their access to other organizations.

**Recommended maintenance**

Ensure every organization-specific operation checks current membership rather than relying solely on a valid JWT. Define account-wide revocation separately from organization-specific membership removal.

---

## 3. Positive Security Controls Observed

The reviewed implementation contains several useful protections:

- Passwords are hashed using bcrypt with 12 rounds.
- A dummy bcrypt hash is used to reduce obvious timing differences for nonexistent users during login.
- Refresh tokens are generated using cryptographically secure random bytes.
- Only SHA-256 hashes of refresh tokens are stored in the database.
- Refresh tokens have a configured lifetime, defaulting to seven days.
- Registration uses a database transaction for user and organization creation.
- Duplicate registration is handled using database uniqueness errors.
- Organization membership and role checks are applied in the reviewed services.
- Invitation tokens are stored as hashes and have an expiry.
- Invitation acceptance uses a conditional database update to prevent repeated acceptance.
- Notification queries and updates are scoped to the intended recipient and organization.
- Helmet and CORS are configured in the application bootstrap.
- GraphQL error handling and input validation are configured.

These controls reduce risk but do not substitute for the specific verification criteria listed above.

## 4. Prioritized Remediation Plan

### Priority 1 — Refresh-token lifecycle

Address AUTH-01 first. Define atomic rotation and its concurrency behavior. Decide whether refresh-token reuse detection is required, then test the complete lifecycle.

### Priority 2 — Production throttling

Resolve RATE-01 by confirming the real production storage and proxy configuration. Avoid assuming that a passing local integration test proves distributed enforcement.

### Priority 3 — GraphQL resource protection

Resolve GRAPHQL-01 by inspecting the effective production configuration and deciding on suitable resource controls.

### Priority 4 — Session and JWT policy

Resolve AUTH-03, AUTH-06, and AUTH-07 together where possible. Document token expiry, logout semantics, revocation expectations, and JWT verification requirements.

### Priority 5 — Credential exposure review

Resolve AUTH-04 and AUTH-05 by reviewing the client, logs, telemetry, and transport. Do not redesign credential transport without first understanding the actual client architecture.

## 5. Scope and Limitations

This document records an assessment based on code excerpts and test output supplied during the conversation. It is not a full penetration test, deployment review, or proof that every route and resolver is secure.

In particular:
- Production Redis-backed throttling was not verified.
- Complete JWT verification configuration was not supplied.
- Client-side token storage and logging behavior were not reviewed.
- GraphQL depth and complexity controls were not fully verified.
- No confirmed critical vulnerability was established by the reviewed evidence.

Findings marked unverified should remain unverified until supported by evidence. They should not be presented as confirmed vulnerabilities.

## 6. Change-Control Status

**Assessment documentation only.**

No repository changes, code edits, migrations, package installations, secret rotations, backup deletions, staging operations, or commits are part of this assessment.

Implementation should begin only after the relevant remediation scope is explicitly approved.