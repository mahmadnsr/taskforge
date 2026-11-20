import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const mode = process.argv[2];
if (
  ![
    'seed',
    'grow',
    'spread',
    'measure',
    'plan',
    'plan-forced',
    'plan-nosort',
  ].includes(mode)
)
  throw new Error(
    'Usage: node staging/performance-benchmark.mjs seed|grow|spread|measure|plan|plan-forced|plan-nosort',
  );
execFileSync('bash', ['staging/stage.sh', 'target'], { stdio: 'ignore' });
const stateFile = 'staging/.state/performance-fixture.json';
const api = 'http://127.0.0.1:3300/graphql';
const samplesPerWorkload = Number(process.env.TASKFORGE_BENCH_SAMPLES ?? 30);
if (
  !Number.isInteger(samplesPerWorkload) ||
  samplesPerWorkload < 20 ||
  samplesPerWorkload > 100 ||
  samplesPerWorkload % 2 !== 0
) {
  throw new Error(
    'TASKFORGE_BENCH_SAMPLES must be an even integer between 20 and 100',
  );
}
function saveFixture(fixture, first = false) {
  if (first) {
    writeFileSync(stateFile, JSON.stringify(fixture), {
      mode: 0o600,
      flag: 'wx',
    });
    return;
  }
  const temporary = `${stateFile}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(fixture), {
    mode: 0o600,
    flag: 'wx',
  });
  renameSync(temporary, stateFile);
}
const percentile = (sorted, fraction) =>
  sorted[Math.ceil(sorted.length * fraction) - 1];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  if (result.status !== 0) throw new Error('Local staging SQL command failed');
  return result.stdout.trim();
}
if (
  sql('SELECT current_database(), current_user;') !==
  'taskforge_stage|taskforge_stage'
) {
  throw new Error('Unexpected database target');
}

async function graphql(query, variables, token) {
  const response = await fetch(api, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15000),
  });
  const value = await response.json();
  if (!response.ok || value.errors?.length)
    throw new Error(
      `Benchmark GraphQL request failed (${value.errors?.[0]?.extensions?.code ?? response.status})`,
    );
  return value.data;
}

if (mode === 'seed') {
  if (existsSync(stateFile))
    throw new Error(
      'Existing benchmark fixture found; refusing to overwrite it',
    );
  const email = `perf-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString('hex');
  const fixture = {
    email,
    password,
    organizationId: '',
    userId: '',
    projectId: '',
    taskId: '',
    status: 'seeding',
  };
  // Persist credentials before registration so a failed seed never strands an inaccessible fixture.
  saveFixture(fixture, true);
  const registered = await graphql(
    'mutation($input:RegisterInput!){register(input:$input){id}}',
    {
      input: {
        name: 'Performance QA',
        email,
        password,
        organizationName: `Performance QA ${randomUUID()}`,
      },
    },
  );
  const login = await graphql(
    'mutation($input:LoginInput!){login(input:$input){accessToken}}',
    { input: { email, password } },
  );
  const token = login.login.accessToken;
  const organizations = await graphql('query{myOrganizations{id}}', {}, token);
  const organizationId = organizations.myOrganizations[0].id;
  const userId = registered.register.id;
  Object.assign(fixture, { organizationId, userId });
  saveFixture(fixture);
  const project = await graphql(
    'mutation($input:CreateProjectInput!){createProject(input:$input){id}}',
    { input: { organizationId, name: 'Benchmark primary project' } },
    token,
  );
  const projectId = project.createProject.id;
  const uuid = /^[a-f0-9-]{36}$/;
  if (![organizationId, userId, projectId].every((id) => uuid.test(id)))
    throw new Error('Invalid fixture identifiers');
  const ids = { organizationId, userId, projectId };
  Object.assign(fixture, ids);
  saveFixture(fixture);
  // Small first batch, then a bounded increase after target verification.
  const insertTasks = (start, end) =>
    sql(`INSERT INTO "Task" (id,"organizationId","projectId",title,"createdById","createdAt","updatedAt")
    SELECT gen_random_uuid()::text,'${organizationId}','${projectId}','Benchmark task '||g,'${userId}',
    NOW()-g*INTERVAL '1 minute',NOW() FROM generate_series(${start},${end}) g;`);
  insertTasks(1, 50);
  const firstCount = Number(
    sql(
      `SELECT count(*) FROM "Task" WHERE "organizationId"='${organizationId}';`,
    ),
  );
  if (firstCount !== 50)
    throw new Error('Small fixture batch was not verified');
  insertTasks(51, 500);
  sql(`INSERT INTO "Project" (id,"organizationId",name,"createdById","createdAt","updatedAt")
    SELECT gen_random_uuid()::text,'${organizationId}','Benchmark project '||g,'${userId}',NOW()-g*INTERVAL '1 day',NOW()
    FROM generate_series(1,19) g;`);
  sql(`WITH selected AS (SELECT id,row_number() OVER (ORDER BY title) rn FROM "Task" WHERE "organizationId"='${organizationId}')
    INSERT INTO "TaskChecklistItem" (id,"taskId","organizationId",content,completed,position,"createdAt","updatedAt")
    SELECT gen_random_uuid()::text,id,'${organizationId}','Benchmark requirement',rn%2=0,0,NOW(),NOW() FROM selected WHERE rn<=200;
    WITH selected AS (SELECT id,row_number() OVER (ORDER BY title) rn FROM "Task" WHERE "organizationId"='${organizationId}')
    INSERT INTO "TaskActivity" (id,"taskId","organizationId","actorId",type,"createdAt")
    SELECT gen_random_uuid()::text,id,'${organizationId}','${userId}','TASK_CREATED',NOW()-rn*INTERVAL '1 minute' FROM selected WHERE rn<=200;
    WITH selected AS (SELECT id,row_number() OVER (ORDER BY title) rn FROM "Task" WHERE "organizationId"='${organizationId}')
    INSERT INTO "Notification" (id,"organizationId","recipientId","taskId",type,message,"createdAt")
    SELECT gen_random_uuid()::text,'${organizationId}','${userId}',id,'TASK_STATUS_CHANGED','Benchmark notification',NOW()-rn*INTERVAL '1 minute'
    FROM selected WHERE rn<=100;
    WITH numbered AS (SELECT id,row_number() OVER (ORDER BY title) rn FROM "Task" WHERE "organizationId"='${organizationId}')
    INSERT INTO "TaskDependency" ("organizationId","projectId","taskId","blockingTaskId")
    SELECT '${organizationId}','${projectId}',a.id,b.id FROM numbered a JOIN numbered b ON b.rn=a.rn+1 WHERE a.rn<=100 AND a.rn%2=1;`);
  fixture.taskId = sql(
    `SELECT id FROM "Task" WHERE "organizationId"='${organizationId}' AND title='Benchmark task 1';`,
  );
  if (
    Number(
      sql(
        `SELECT count(*) FROM "Task" WHERE "organizationId"='${organizationId}';`,
      ),
    ) !== 500
  )
    throw new Error('Fixture size mismatch');
  fixture.status = 'ready';
  saveFixture(fixture);
  console.log(
    'Synthetic staging fixture created: 1 organization, 20 projects, 500 tasks, 200 checklist items, 200 activities, 100 notifications, 50 dependencies.',
  );
} else if (mode === 'grow') {
  const fixture = JSON.parse(readFileSync(stateFile, 'utf8'));
  const { organizationId, projectId, userId } = fixture;
  if (
    ![organizationId, projectId, userId].every((id) =>
      /^[a-f0-9-]{36}$/.test(id),
    )
  )
    throw new Error('Invalid fixture identifiers');
  const existing = Number(
    sql(
      `SELECT count(*) FROM "Task" WHERE "organizationId"='${organizationId}';`,
    ),
  );
  if (existing !== 500)
    throw new Error('Unexpected benchmark fixture size; refusing to grow it');
  sql(`INSERT INTO "Task" (id,"organizationId","projectId",title,"createdById","createdAt","updatedAt")
    SELECT gen_random_uuid()::text,'${organizationId}','${projectId}','Benchmark task '||g,'${userId}',
    NOW()-g*INTERVAL '1 minute',NOW() FROM generate_series(501,5000) g;`);
  if (
    Number(
      sql(
        `SELECT count(*) FROM "Task" WHERE "organizationId"='${organizationId}';`,
      ),
    ) !== 5000
  )
    throw new Error('Fixture growth verification failed');
  console.log(
    'Synthetic staging fixture grown to 5,000 tasks; no existing records changed.',
  );
} else if (mode === 'spread') {
  const fixture = JSON.parse(readFileSync(stateFile, 'utf8'));
  const { organizationId, userId } = fixture;
  if (![organizationId, userId].every((id) => /^[a-f0-9-]{36}$/.test(id)))
    throw new Error('Invalid fixture identifiers');
  if (
    Number(
      sql(
        `SELECT count(*) FROM "Task" WHERE "organizationId"='${organizationId}';`,
      ),
    ) !== 5000
  ) {
    throw new Error('Unexpected benchmark fixture size; refusing to spread it');
  }
  if (
    Number(
      sql(
        `SELECT count(*) FROM "Project" WHERE "organizationId"='${organizationId}' AND name LIKE 'Benchmark project %';`,
      ),
    ) !== 19
  ) {
    throw new Error('Unexpected benchmark project count');
  }
  sql(`INSERT INTO "Task" (id,"organizationId","projectId",title,"createdById","createdAt","updatedAt")
    SELECT gen_random_uuid()::text,'${organizationId}',p.id,'Benchmark secondary task '||g,'${userId}',
    NOW()-g*INTERVAL '1 minute',NOW() FROM "Project" p CROSS JOIN generate_series(1,500) g
    WHERE p."organizationId"='${organizationId}' AND p.name LIKE 'Benchmark project %';`);
  if (
    Number(
      sql(
        `SELECT count(*) FROM "Task" WHERE "organizationId"='${organizationId}';`,
      ),
    ) !== 14500
  )
    throw new Error('Spread verification failed');
  console.log(
    'Synthetic staging fixture spread to 14,500 tasks across 20 projects; no existing records changed.',
  );
} else if (
  mode === 'plan' ||
  mode === 'plan-forced' ||
  mode === 'plan-nosort'
) {
  const fixture = JSON.parse(readFileSync(stateFile, 'utf8'));
  const { organizationId, projectId, taskId, userId } = fixture;
  const secondaryProjectId = sql(
    `SELECT id FROM "Project" WHERE "organizationId"='${organizationId}' AND name='Benchmark project 1';`,
  );
  const plans = {
    tasks: `SELECT id,title,status FROM "Task" WHERE "organizationId"='${organizationId}' AND "projectId"='${projectId}' AND "deletedAt" IS NULL ORDER BY "createdAt" DESC,id ASC LIMIT 20`,
    filteredTasks: `SELECT id,title,status FROM "Task" WHERE "organizationId"='${organizationId}' AND "projectId"='${projectId}' AND "deletedAt" IS NULL AND status='TODO' ORDER BY "createdAt" DESC,id ASC LIMIT 20`,
    secondaryTasks: `SELECT id,title,status FROM "Task" WHERE "organizationId"='${organizationId}' AND "projectId"='${secondaryProjectId}' AND "deletedAt" IS NULL ORDER BY "createdAt" DESC,id ASC LIMIT 20`,
    secondaryCreatedOnly: `SELECT id,title,status FROM "Task" WHERE "organizationId"='${organizationId}' AND "projectId"='${secondaryProjectId}' AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 20`,
    projects: `SELECT id,name FROM "Project" WHERE "organizationId"='${organizationId}' AND status='ACTIVE' ORDER BY "createdAt" DESC`,
    dashboard: `SELECT status,count(*) FROM "Task" WHERE "organizationId"='${organizationId}' AND "deletedAt" IS NULL AND "parentId" IS NULL GROUP BY status`,
    inbox: `SELECT n.id,n.type FROM "Notification" n JOIN "Task" t ON t.id=n."taskId" AND t."organizationId"=n."organizationId" WHERE n."recipientId"='${userId}' AND n."organizationId"='${organizationId}' AND t."deletedAt" IS NULL ORDER BY n."createdAt" DESC,n.id DESC LIMIT 16`,
    activity: `SELECT id,type FROM "TaskActivity" WHERE "organizationId"='${organizationId}' AND "taskId"='${taskId}' ORDER BY "createdAt" DESC,id DESC LIMIT 21`,
    dependencies: `SELECT d."blockingTaskId",t.status FROM "TaskDependency" d JOIN "Task" t ON t.id=d."blockingTaskId" AND t."organizationId"=d."organizationId" AND t."projectId"=d."projectId" WHERE d."organizationId"='${organizationId}' AND d."projectId"='${projectId}' AND d."taskId"='${taskId}' AND t."deletedAt" IS NULL ORDER BY d."createdAt"`,
  };
  for (const [name, query] of Object.entries(plans)) {
    const plan = sql(
      mode === 'plan-forced'
        ? `BEGIN; SET LOCAL enable_seqscan=off; SET LOCAL enable_bitmapscan=off; EXPLAIN (ANALYZE, BUFFERS) ${query}; ROLLBACK;`
        : mode === 'plan-nosort'
          ? `BEGIN; SET LOCAL enable_sort=off; EXPLAIN (ANALYZE, BUFFERS) ${query}; ROLLBACK;`
          : `EXPLAIN (ANALYZE, BUFFERS) ${query};`,
    )
      .replaceAll(organizationId, '<organization>')
      .replaceAll(projectId, '<project>')
      .replaceAll(secondaryProjectId, '<secondary-project>')
      .replaceAll(taskId, '<task>')
      .replaceAll(userId, '<user>');
    console.log(`=== ${name} ===\n${plan}`);
  }
} else {
  if (!existsSync(stateFile)) throw new Error('Run seed first');
  const fixture = JSON.parse(readFileSync(stateFile, 'utf8'));
  if (fixture.status && fixture.status !== 'ready')
    throw new Error(
      'Benchmark fixture is partial; inspect its manifest before measuring',
    );
  const { organizationId, projectId, taskId } = fixture;
  const login = await graphql(
    'mutation($input:LoginInput!){login(input:$input){accessToken}}',
    { input: { email: fixture.email, password: fixture.password } },
  );
  const token = login.login.accessToken;
  const workloads = {
    projects: [
      'query($organizationId:ID!){projects(organizationId:$organizationId){id name}}',
      { organizationId },
    ],
    tasks: [
      'query($organizationId:ID!,$projectId:ID!){searchProjectTasks(organizationId:$organizationId,projectId:$projectId,filters:{limit:20,offset:0}){tasks{id title status} totalCount}}',
      { organizationId, projectId },
    ],
    filteredTasks: [
      'query($organizationId:ID!,$projectId:ID!){searchProjectTasks(organizationId:$organizationId,projectId:$projectId,filters:{limit:20,offset:0,status:TODO}){tasks{id title status} totalCount}}',
      { organizationId, projectId },
    ],
    taskDetails: [
      'query($organizationId:ID!,$taskId:ID!){task(organizationId:$organizationId,taskId:$taskId){id title status}}',
      { organizationId, taskId },
    ],
    dashboard: [
      'query($organizationId:ID!){dashboardSummary(organizationId:$organizationId){totalProjects totalTasks completedTasks}}',
      { organizationId },
    ],
    inbox: [
      'query($input:NotificationsPaginationInput!){myNotifications(input:$input){items{id type} hasMore}}',
      { input: { organizationId, first: 15 } },
    ],
    activity: [
      'query($input:TaskActivityInput!){taskActivity(input:$input){items{id type} hasMore}}',
      { input: { organizationId, taskId, first: 20 } },
    ],
    dependencies: [
      'query($organizationId:ID!,$taskId:ID!){taskDependencies(organizationId:$organizationId,taskId:$taskId){blockingTaskId blockingStatus}}',
      { organizationId, taskId },
    ],
  };
  const results = {};
  for (const [name, [query, variables]] of Object.entries(workloads)) {
    await graphql(query, variables, token);
    const latencies = [];
    const start = performance.now();
    for (let batch = 0; batch < samplesPerWorkload / 2; batch++) {
      await Promise.all(
        [0, 1].map(async () => {
          const requestStart = performance.now();
          await graphql(query, variables, token);
          latencies.push(performance.now() - requestStart);
        }),
      );
      // Stay below the staging API's per-minute request throttle.
      await pause(1500);
    }
    const duration = performance.now() - start;
    latencies.sort((a, b) => a - b);
    results[name] = {
      samples: latencies.length,
      concurrency: 2,
      p50Ms: Number(percentile(latencies, 0.5).toFixed(2)),
      p95Ms: Number(percentile(latencies, 0.95).toFixed(2)),
      pacedThroughputRps: Number(
        ((latencies.length * 1000) / duration).toFixed(2),
      ),
      errors: 0,
    };
  }
  const taskCount = Number(
    sql(
      `SELECT count(*) FROM "Task" WHERE "organizationId"='${organizationId}';`,
    ),
  );
  console.log(
    JSON.stringify(
      {
        environment: 'isolated local Docker staging',
        dataset: {
          projects: 20,
          tasks: taskCount,
          checklistItems: 200,
          activities: 200,
          notifications: 100,
          dependencies: 50,
        },
        results,
      },
      null,
      2,
    ),
  );
}
