# Security Policy

TaskForge is an actively developed project without published release versions.
Security fixes are applied to the current maintained code. Historical commits
and unmaintained forks should not be assumed to receive fixes.

## Reporting a vulnerability

Do not disclose a suspected vulnerability in a public issue, discussion,
screenshot, or log excerpt. Use GitHub private vulnerability reporting when it
is available for this repository. If it is unavailable, contact the repository
owner through a private channel and provide:

- the affected component and commit;
- a minimal reproduction using nonproduction data;
- the expected and observed security impact; and
- any suggested mitigation.

Do not access other users' data, degrade a service, use production credentials,
or retain data obtained during testing. Allow the maintainer time to reproduce
and address the report before public disclosure. No response or remediation
service-level agreement is currently published.

## Implemented controls

- Passwords are hashed with bcrypt. Login performs a dummy password check for
  unknown accounts to reduce simple timing differences.
- Short-lived access JWTs use an explicitly configured secret and algorithm.
  Refresh tokens are random values stored only as SHA-256 hashes in PostgreSQL.
- Refresh is one-time use: the stored token is conditionally deleted and its
  replacement is created in one database transaction.
- Authorization is enforced in backend guards and services using organization
  and project membership. Composite database constraints reinforce tenant and
  task hierarchy integrity.
- Registration, login, refresh, and logout are rate limited. Request bodies are
  limited, DTO input is allowlisted, and production GraphQL errors are filtered.
- Helmet headers, an explicit CORS origin allowlist, bounded trusted-proxy
  configuration, and a separate bearer token for `/metrics` are configured by
  the API.
- Logs redact common credential fields and avoid GraphQL variables and job
  payloads. Health responses do not expose connection details.
- CI uses frozen lockfiles and isolated PostgreSQL and Redis services. Local
  staging rejects external Docker targets and external database URLs.

These controls reduce risk; they are not a claim of formal certification or a
completed independent penetration test.

## Authentication and revocation boundaries

The browser keeps the access token in memory and the refresh token in
`sessionStorage`. A successful refresh rotates the token. Frontend requests
share one refresh operation and use a session generation to prevent an old
response from restoring a logged-out or newer session.

Logout deletes the exact refresh-token hash supplied to the backend. Access
JWTs are stateless and remain valid until their configured expiry; there is no
access-token denylist. The database does not currently model refresh-token
families or a server-side session identifier, so logout is not an account-wide
"revoke every session" operation. The frontend handles refresh/logout races by
revoking a returned replacement token, but if rotation succeeds and the
response and cleanup both fail, the replacement row can remain until its TTL.
It is not stored by the browser in that path, but guaranteed family-wide
revocation would require a backend session-family design.

Because browser tokens are readable by JavaScript, preventing script injection
is important. Deploy the frontend and API only over HTTPS, maintain restrictive
content and origin policies, and treat any script-execution vulnerability as a
credential-exposure issue.

## Secrets and operational data

- Keep `.env` files, `staging/.state/`, database dumps, invitation links, JWTs,
  refresh tokens, metrics tokens, and SMTP credentials out of Git and logs.
- Generate independent high-entropy values for JWT signing, metrics access,
  database, Redis, and SMTP credentials. Do not reuse local or staging values.
- Store deployment secrets in the platform's secret manager, restrict access,
  rotate exposed values, and restart affected processes after rotation.
- Back up PostgreSQL using encrypted, access-controlled storage and test
  restoration. Redis is queue infrastructure and is not the source of truth.
- Never point tests or the staging wrapper at production or shared databases.

See [secure deployment](docs/deployment.md) and
[testing](docs/testing.md) for operational procedures.
