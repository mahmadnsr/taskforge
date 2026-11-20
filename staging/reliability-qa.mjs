import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Runs only against the dedicated local Compose project and its ignored synthetic fixture.
execFileSync('bash', ['staging/stage.sh', 'target'], { stdio: 'ignore' });
const fixture = JSON.parse(
  readFileSync('staging/.state/performance-fixture.json', 'utf8'),
);
if (fixture.status && fixture.status !== 'ready')
  throw new Error('Synthetic fixture is incomplete');
if (
  ![fixture.organizationId, fixture.projectId].every((value) =>
    /^[a-f0-9-]{36}$/.test(value),
  )
) {
  throw new Error('Invalid synthetic fixture identifiers');
}

function compose(...args) {
  const result = spawnSync(
    'docker',
    ['compose', '-f', 'staging/compose.yaml', ...args],
    { encoding: 'utf8' },
  );
  if (result.status !== 0)
    throw new Error(`Isolated staging Compose ${args[0]} failed`);
}

function sql(query) {
  const result = spawnSync(
    'docker',
    [
      'compose',
      '-f',
      'staging/compose.yaml',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'taskforge_stage',
      '-d',
      'taskforge_stage',
      '-At',
    ],
    { input: query, encoding: 'utf8' },
  );
  if (result.status !== 0)
    throw new Error('Isolated staging read-only SQL check failed');
  return result.stdout.trim();
}

if (
  sql('SELECT current_database(), current_user;') !==
  'taskforge_stage|taskforge_stage'
) {
  throw new Error('Unexpected database target');
}

async function graphql(query, variables, token) {
  const response = await fetch('http://127.0.0.1:3300/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15_000),
  });
  const value = await response.json();
  if (!response.ok || value.errors?.length)
    throw new Error(
      `Staging API rejected operation (${value.errors?.[0]?.extensions?.code ?? response.status})`,
    );
  return value.data;
}

const login = await graphql(
  'mutation($input:LoginInput!){login(input:$input){accessToken}}',
  { input: { email: fixture.email, password: fixture.password } },
);
const token = login.login.accessToken;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const state = (taskId) =>
  sql(`SELECT CASE WHEN "publishedAt" IS NULL THEN 'pending' ELSE 'published' END
  FROM "OutboxEvent" WHERE "eventType"='TASK_CREATED' AND payload->>'taskId'='${taskId}';`);

async function createSyntheticTask(label) {
  const result = await graphql(
    'mutation($input:CreateTaskInput!){createTask(input:$input){id}}',
    {
      input: {
        organizationId: fixture.organizationId,
        projectId: fixture.projectId,
        title: `Reliability QA ${label} ${randomUUID()}`,
      },
    },
    token,
  );
  const taskId = result.createTask.id;
  if (!/^[a-f0-9-]{36}$/.test(taskId)) throw new Error('Unexpected task ID');
  return taskId;
}

async function waitForPublication(taskId) {
  for (let attempt = 0; attempt < 40; attempt++) {
    if (state(taskId) === 'published') return;
    await pause(1000);
  }
  throw new Error('Outbox event was not published after recovery');
}

let workerStopped = false;
let redisStopped = false;
try {
  compose('stop', 'worker');
  workerStopped = true;
  const crashTask = await createSyntheticTask('worker restart');
  if (state(crashTask) !== 'pending')
    throw new Error('Worker outage did not preserve a pending outbox event');
  compose('start', 'worker');
  workerStopped = false;
  await waitForPublication(crashTask);
  console.log(
    'Worker restart: committed event remained pending and was published after restart.',
  );

  compose('stop', 'redis');
  redisStopped = true;
  const redisTask = await createSyntheticTask('Redis outage');
  if (state(redisTask) !== 'pending')
    throw new Error('Redis outage did not preserve a pending outbox event');
  compose('start', 'redis');
  redisStopped = false;
  await waitForPublication(redisTask);
  console.log(
    'Redis outage: database mutation and outbox persisted; event published after reconnect.',
  );
} finally {
  if (redisStopped) compose('start', 'redis');
  if (workerStopped) compose('start', 'worker');
}
