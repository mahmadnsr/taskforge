#!/usr/bin/env bash
set -euo pipefail

# This wrapper never accepts a database URL. It uses only the local Compose stack.
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
state_dir="$script_dir/.state"
compose_file="$script_dir/compose.yaml"
project_name=taskforge_interview_stage
approval_flag=--approve-local-target

fail() { printf 'staging: %s\n' "$*" >&2; exit 1; }

write_mailpit_config() {
  [[ ! -e "$state_dir/mailpit.env" && ! -L "$state_dir/mailpit.env" ]] ||
    fail 'Mailpit staging configuration already exists; preserving it'
  umask 077
  local smtp_password
  smtp_password="$(openssl rand -hex 24)"
  cp "$state_dir/app.env" "$state_dir/app.env.mailpit.tmp"
  cat >> "$state_dir/app.env.mailpit.tmp" <<EOF
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_USER=stage_mailer
SMTP_PASS=${smtp_password}
SMTP_FROM=TaskForge Staging <noreply@example.test>
EOF
  cat > "$state_dir/mailpit.env.tmp" <<EOF
MP_DATABASE=/data/mailpit.db
MP_SMTP_AUTH=stage_mailer:${smtp_password}
MP_SMTP_AUTH_ALLOW_INSECURE=true
MP_DISABLE_VERSION_CHECK=true
MP_MAX_MESSAGES=500
EOF
  mv "$state_dir/mailpit.env.tmp" "$state_dir/mailpit.env"
  mv "$state_dir/app.env.mailpit.tmp" "$state_dir/app.env"
  printf 'Local Mailpit SMTP configuration created. Credentials were not displayed.\n'
}

write_observability_config() {
  [[ -f "$state_dir/app.env" && ! -L "$state_dir/app.env" ]] ||
    fail 'staging app configuration is missing or linked'
  if grep -q '^METRICS_ACCESS_TOKEN=' "$state_dir/app.env"; then
    fail 'staging observability configuration already exists; preserving it'
  fi
  umask 077
  local metrics_access_token
  metrics_access_token="$(openssl rand -hex 32)"
  cp "$state_dir/app.env" "$state_dir/app.env.observability.tmp"
  printf 'METRICS_ACCESS_TOKEN=%s\n' "$metrics_access_token" >> "$state_dir/app.env.observability.tmp"
  mv "$state_dir/app.env.observability.tmp" "$state_dir/app.env"
  printf 'Local staging observability configuration created. Token was not displayed.\n'
}

check_migrations() {
  local name
  for name in \
    20261119145513_add_subtasks_checklists_activity \
    20261120000000_enforce_task_subtask_integrity; do
    [[ -f "$script_dir/../backend/prisma/migrations/$name/migration.sql" ]] ||
      fail "required local migration $name is missing"
  done
}

init_config() {
  check_migrations
  if [[ -e "$state_dir" || -L "$state_dir" ]]; then
    fail 'staging state already exists; existing configuration was preserved'
  fi
  umask 077
  mkdir -m 700 "$state_dir"
  local postgres_password redis_password jwt_secret metrics_access_token
  postgres_password="$(openssl rand -hex 24)"
  redis_password="$(openssl rand -hex 24)"
  jwt_secret="$(openssl rand -hex 32)"
  metrics_access_token="$(openssl rand -hex 32)"
  cat > "$state_dir/postgres.env" <<EOF
POSTGRES_DB=taskforge_stage
POSTGRES_USER=taskforge_stage
POSTGRES_PASSWORD=${postgres_password}
EOF
  cat > "$state_dir/redis.env" <<EOF
REDIS_PASSWORD=${redis_password}
EOF
  cat > "$state_dir/app.env" <<EOF
DATABASE_URL=postgresql://taskforge_stage:${postgres_password}@postgres:5432/taskforge_stage?schema=public
DATABASE_URL_UNPOOLED=postgresql://taskforge_stage:${postgres_password}@postgres:5432/taskforge_stage?schema=public
JWT_ACCESS_SECRET=${jwt_secret}
METRICS_ACCESS_TOKEN=${metrics_access_token}
NODE_ENV=development
PORT=3000
CORS_ORIGINS=http://127.0.0.1:8088,http://localhost:8088
FRONTEND_URL=http://127.0.0.1:8088
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=${redis_password}
REDIS_TLS=false
TEST_REDIS_HOST=redis
TEST_REDIS_PORT=6379
TEST_REDIS_PASSWORD=${redis_password}
EOF
  write_mailpit_config
  printf 'Local staging configuration created. Secrets were not displayed.\n'
}

check_config() {
  check_migrations
  [[ -d "$state_dir" && ! -L "$state_dir" ]] || fail 'run init first'
  if [[ "${1:-}" != allow-missing-mailpit ]]; then
    [[ -f "$state_dir/mailpit.env" && ! -L "$state_dir/mailpit.env" ]] ||
      fail 'run configure-mailpit first'
  fi
  local file
  for file in app.env postgres.env redis.env; do
    [[ -f "$state_dir/$file" && ! -L "$state_dir/$file" ]] ||
      fail "missing or linked staging $file"
  done
  if ! node - "$state_dir" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const dir = process.argv[2];
if (fs.statSync(dir).mode & 0o077) process.exit(1);
function readEnv(file) {
  if (fs.statSync(path.join(dir, file)).mode & 0o077) process.exit(1);
  const entries = new Map();
  for (const line of fs.readFileSync(path.join(dir, file), 'utf8').split('\n')) {
    if (!line) continue;
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (!match || entries.has(match[1])) process.exit(1);
    entries.set(match[1], match[2]);
  }
  return entries;
}
const entries = readEnv('app.env');
const postgres = readEnv('postgres.env');
const redis = readEnv('redis.env');
const pgPassword = postgres.get('POSTGRES_PASSWORD');
const redisPassword = redis.get('REDIS_PASSWORD');
if (postgres.size !== 3 || redis.size !== 1 ||
    postgres.get('POSTGRES_DB') !== 'taskforge_stage' ||
    postgres.get('POSTGRES_USER') !== 'taskforge_stage') process.exit(1);
const expectedUrl = `postgresql://taskforge_stage:${pgPassword}@postgres:5432/taskforge_stage?schema=public`;
const expected = {
  DATABASE_URL: expectedUrl,
  DATABASE_URL_UNPOOLED: expectedUrl,
  NODE_ENV: 'development',
  PORT: '3000',
  CORS_ORIGINS: 'http://127.0.0.1:8088,http://localhost:8088',
  FRONTEND_URL: 'http://127.0.0.1:8088',
  REDIS_HOST: 'redis',
  REDIS_PORT: '6379',
  REDIS_PASSWORD: redisPassword,
  REDIS_TLS: 'false',
  TEST_REDIS_HOST: 'redis',
  TEST_REDIS_PORT: '6379',
  TEST_REDIS_PASSWORD: redisPassword,
};
const metricsAccessToken = entries.get('METRICS_ACCESS_TOKEN');
if (metricsAccessToken !== undefined) {
  if (!/^[a-f0-9]{64}$/.test(metricsAccessToken)) process.exit(1);
  expected.METRICS_ACCESS_TOKEN = metricsAccessToken;
}
if (fs.existsSync(path.join(dir, 'mailpit.env'))) {
  const mailpit = readEnv('mailpit.env');
  const auth = /^stage_mailer:([a-f0-9]{48})$/.exec(mailpit.get('MP_SMTP_AUTH') ?? '');
  if (!auth || mailpit.size !== 5 ||
      mailpit.get('MP_DATABASE') !== '/data/mailpit.db' ||
      mailpit.get('MP_SMTP_AUTH_ALLOW_INSECURE') !== 'true' ||
      mailpit.get('MP_DISABLE_VERSION_CHECK') !== 'true' ||
      mailpit.get('MP_MAX_MESSAGES') !== '500') process.exit(1);
  Object.assign(expected, {
    SMTP_HOST: 'mailpit',
    SMTP_PORT: '1025',
    SMTP_USER: 'stage_mailer',
    SMTP_PASS: auth[1],
    SMTP_FROM: 'TaskForge Staging <noreply@example.test>',
  });
}
if (!/^[a-f0-9]{48}$/.test(pgPassword) || !/^[a-f0-9]{48}$/.test(redisPassword)) process.exit(1);
if (entries.size !== Object.keys(expected).length + 1) process.exit(1);
for (const [key, value] of Object.entries(expected)) {
  if (entries.get(key) !== value) process.exit(1);
}
if (!/^[a-f0-9]{64}$/.test(entries.get('JWT_ACCESS_SECRET') ?? '')) process.exit(1);
NODE
  then
    fail 'staging target configuration failed validation'
  fi
  printf 'Target: local Compose postgres/taskforge_stage, redis, and Mailpit; no external database URL.\n'
}

check_local_docker() {
  [[ -z "${DOCKER_HOST:-}" && -z "${DOCKER_CONTEXT:-}" ]] ||
    fail 'DOCKER_HOST and DOCKER_CONTEXT must be unset'
  [[ "$(docker context show)" == default ]] || fail 'Docker context must be default'
  local endpoint
  endpoint="$(docker context inspect default --format '{{(index .Endpoints "docker").Host}}')"
  [[ "$endpoint" == unix://* ]] || fail 'Docker endpoint must be a local Unix socket'
}

compose() {
  docker compose -p "$project_name" -f "$compose_file" "$@"
}

check_fresh_resources() {
  local volume
  for volume in "${project_name}_stage_postgres" "${project_name}_stage_redis" "${project_name}_stage_mailpit"; do
    if docker volume inspect "$volume" >/dev/null 2>&1; then
      fail 'a staging volume already exists; refusing to adopt existing database data'
    fi
  done
  if [[ -n "$(docker ps -a --filter "label=com.docker.compose.project=$project_name" --format '{{.ID}}')" ]]; then
    fail 'staging containers already exist; refusing to adopt an existing stack'
  fi
}

require_approval() {
  [[ "${2:-}" == "$approval_flag" && $# -eq 2 ]] ||
    fail "usage: $0 $1 $approval_flag (run only after approving the local target)"
  check_config
  check_local_docker
}

case "${1:-}" in
  init)
    [[ $# -eq 1 ]] || fail "usage: $0 init"
    init_config
    ;;
  configure-mailpit)
    [[ $# -eq 1 ]] || fail "usage: $0 configure-mailpit"
    check_config allow-missing-mailpit
    write_mailpit_config
    check_config
    ;;
  configure-observability)
    [[ $# -eq 1 ]] || fail "usage: $0 configure-observability"
    check_config
    write_observability_config
    check_config
    ;;
  target)
    [[ $# -eq 1 ]] || fail "usage: $0 target"
    check_config
    ;;
  build)
    require_approval "$@"
    compose build tools backend worker frontend
    ;;
  start-services)
    require_approval "$@"
    check_fresh_resources
    compose up -d --no-build postgres redis mailpit
    ;;
  status)
    require_approval "$@"
    compose run --rm --no-deps tools pnpm exec prisma migrate status --schema prisma/schema.prisma
    ;;
  migrate)
    require_approval "$@"
    # Rebuild to include the two local migration directories, even if untracked.
    compose build tools
    compose run --rm --no-deps tools pnpm exec prisma migrate deploy --schema prisma/schema.prisma
    ;;
  history)
    require_approval "$@"
    compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U taskforge_stage -d taskforge_stage \
      -c 'SELECT migration_name, finished_at IS NOT NULL AS applied, rolled_back_at IS NOT NULL AS rolled_back FROM "_prisma_migrations" ORDER BY started_at, migration_name;'
    ;;
  constraints)
    require_approval "$@"
    compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U taskforge_stage -d taskforge_stage \
      < "$script_dir/verify-constraints.sql"
    ;;
  test)
    require_approval "$@"
    # The builder image holds the generated client at the workspace root, while
    # Vitest resolves @prisma/client through pnpm's nested package directory.
    # Copy into that directory only in this disposable test container.
    client_fix='const fs=require("node:fs");const path=require("node:path");const dir=path.dirname(require.resolve("@prisma/client"));fs.cpSync("/app/node_modules/.prisma/client",path.resolve(dir,"../../.prisma/client"),{recursive:true,force:true})'
    compose run --rm --no-deps tools sh -ec \
      "node -e '$client_fix' && pnpm exec vitest run src/task-reminders/task-reminder.integration.spec.ts"
    ;;
  start-app)
    require_approval "$@"
    compose run --rm --no-deps tools pnpm exec prisma migrate status --schema prisma/schema.prisma
    compose up -d --no-build backend worker frontend
    ;;
  smoke)
    require_approval "$@"
    node <<'NODE'
async function check() {
  const base = 'http://127.0.0.1:3300';
  const readyResponse = await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(10000) });
  const ready = await readyResponse.json();
  if (!readyResponse.ok || ready.status !== 'ok' ||
      ready.checks?.database !== 'up' || ready.checks?.redis !== 'up') {
    throw new Error('API, PostgreSQL, or Redis readiness failed');
  }
  const workerResponse = await fetch(`${base}/health/worker`, { signal: AbortSignal.timeout(10000) });
  const worker = await workerResponse.json();
  if (!workerResponse.ok || worker.status !== 'active') throw new Error('worker heartbeat is inactive');
  const graphqlResponse = await fetch(`${base}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'query StagingSchemaSmoke { __schema { queryType { fields { name } } mutationType { fields { name } } } }' }),
    signal: AbortSignal.timeout(10000),
  });
  const graphql = await graphqlResponse.json();
  if (!graphqlResponse.ok || graphql.errors?.length || !graphql.data?.__schema) {
    throw new Error('GraphQL schema query failed');
  }
  const queries = new Set(graphql.data.__schema.queryType.fields.map((field) => field.name));
  const mutations = new Set(graphql.data.__schema.mutationType.fields.map((field) => field.name));
  for (const name of ['subtasks', 'taskChecklist', 'taskActivity']) {
    if (!queries.has(name)) throw new Error(`GraphQL query ${name} is missing`);
  }
  for (const name of ['createSubtask', 'addChecklistItem']) {
    if (!mutations.has(name)) throw new Error(`GraphQL mutation ${name} is missing`);
  }
  const frontendResponse = await fetch('http://127.0.0.1:8088/', { signal: AbortSignal.timeout(10000) });
  if (!frontendResponse.ok || !(await frontendResponse.text()).includes('id="root"')) {
    throw new Error('frontend HTML is unavailable');
  }
}
check().catch((error) => { console.error(`Staging smoke failed: ${error.message}`); process.exitCode = 1; });
NODE
    worker_state="$(docker inspect --format '{{.State.Health.Status}}' taskforge_interview_stage-worker-1)"
    [[ "$worker_state" == healthy ]] || fail "staging worker Docker health is $worker_state"
    printf 'Staging API, GraphQL schema, frontend, PostgreSQL, Redis, and worker checks passed.\n'
    ;;
  invitation-e2e)
    require_approval "$@"
    node "$script_dir/invitation.e2e.mjs"
    ;;
  *)
    fail "usage: $0 {init|configure-mailpit|target|build|start-services|status|migrate|history|constraints|test|start-app|smoke|invitation-e2e} [$approval_flag]"
    ;;
esac
