import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const DATABASE_URL = process.env.DATABASE_URL;

function validateDatabaseUrl(value: string | undefined): string {
  if (!value) {
    throw new Error('DATABASE_URL is required.');
  }

  const url = new URL(value);

  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== '127.0.0.1' ||
    url.port !== '5433' ||
    url.pathname !== '/taskforge_performance' ||
    decodeURIComponent(url.username) !== 'taskforge_perf'
  ) {
    throw new Error(
      'Safety check failed: benchmark only permits the local taskforge_performance database on 127.0.0.1:5433.',
    );
  }

  return value;
}

const databaseUrl = validateDatabaseUrl(DATABASE_URL);

const prisma = new PrismaClient({
  datasources: {
    db: { url: databaseUrl },
  },
});

const CONFIG = {
  warmupRuns: 5,
  measuredRuns: 50,
  projectId: '04154f56-999a-4f61-a821-291a3b7036f3',
  organizationId: '3d6df636-4f02-4e9e-9a5c-5237806de61c',
  taskId: '004268ab-1ca3-46ea-ad2c-de8294d7a8fa',
  pageSize: 11,
};

type Measurement = {
  name: string;
  samplesMs: number[];
  resultRows: number[];
  expectedRows: number;
};

type CommentCursor = {
  id: string;
  createdAt: Date;
  position: number;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;

  const index = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, index)]!;
}

function summarize(measurement: Measurement) {
  const sorted = [...measurement.samplesMs].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);

  return {
    name: measurement.name,
    runs: sorted.length,
    resultRows: measurement.resultRows.at(-1) ?? 0,
    expectedRows: measurement.expectedRows,
    minMs: Number((sorted[0] ?? 0).toFixed(3)),
    medianMs: Number(percentile(sorted, 0.5).toFixed(3)),
    p95Ms: Number(percentile(sorted, 0.95).toFixed(3)),
    maxMs: Number((sorted.at(-1) ?? 0).toFixed(3)),
    meanMs: Number((sum / Math.max(sorted.length, 1)).toFixed(3)),
  };
}

async function measure(
  name: string,
  expectedRows: number,
  query: () => Promise<number>,
): Promise<Measurement> {
  const samplesMs: number[] = [];
  const resultRows: number[] = [];

  for (let i = 0; i < CONFIG.warmupRuns; i++) {
    const rows = await query();

    if (rows !== expectedRows) {
      throw new Error(
        `${name}: warm-up returned ${rows} rows; expected ${expectedRows}.`,
      );
    }
  }

  for (let i = 0; i < CONFIG.measuredRuns; i++) {
    const started = performance.now();
    const rows = await query();
    const elapsedMs = performance.now() - started;

    if (rows !== expectedRows) {
      throw new Error(
        `${name}: run ${i + 1} returned ${rows} rows; expected ${expectedRows}.`,
      );
    }

    samplesMs.push(elapsedMs);
    resultRows.push(rows);
  }

  return { name, samplesMs, resultRows, expectedRows };
}

async function main() {
  await prisma.$connect();

  const databaseInfo = await prisma.$queryRaw<
    Array<{
      database_name: string;
      database_user: string;
      postgres_version: string;
    }>
  >`
    SELECT
      current_database() AS database_name,
      current_user AS database_user,
      version() AS postgres_version
  `;

  if (
    databaseInfo[0]?.database_name !== 'taskforge_performance' ||
    databaseInfo[0]?.database_user !== 'taskforge_perf'
  ) {
    throw new Error(
      'Connected database identity did not match the local benchmark database.',
    );
  }

  const projectTasks = await prisma.task.count({
    where: {
      organizationId: CONFIG.organizationId,
      projectId: CONFIG.projectId,
    },
  });

  const selectedTask = await prisma.task.findFirst({
    where: {
      id: CONFIG.taskId,
      organizationId: CONFIG.organizationId,
      projectId: CONFIG.projectId,
    },
    select: { id: true },
  });

  if (!selectedTask || projectTasks === 0) {
    throw new Error(
      `Expected benchmark project/task was not found. Project tasks=${projectTasks}.`,
    );
  }

  const comments = await prisma.taskComment.findMany({
    where: {
      organizationId: CONFIG.organizationId,
      taskId: CONFIG.taskId,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      createdAt: true,
    },
  });

  if (comments.length < CONFIG.pageSize + 1) {
    throw new Error(
      `Not enough comments for cursor benchmarking: found ${comments.length}; need at least ${CONFIG.pageSize + 1}.`,
    );
  }

  const cursorAt = (position: number): CommentCursor => {
    const comment = comments[position - 1];

    if (!comment) {
      throw new Error(`Cursor position ${position} does not exist.`);
    }

    return {
      id: comment.id,
      createdAt: comment.createdAt,
      position,
    };
  };

  const cursorDefinitions = [
    { name: 'comment-cursor-first-page', cursor: cursorAt(1) },
    {
      name: 'comment-cursor-middle-page',
      cursor: cursorAt(Math.floor(comments.length / 2)),
    },
    {
      name: 'comment-cursor-later-page',
      cursor: cursorAt(Math.floor(comments.length * 0.75)),
    },
  ];

  const measurements: Measurement[] = [];

  const addMeasurement = async (
    name: string,
    expectedRows: number,
    query: () => Promise<number>,
  ) => {
    measurements.push(await measure(name, expectedRows, query));
  };

  console.log('Local database safety checks passed.');
  console.log(`Project task count: ${projectTasks}`);
  console.log(`Selected task comment count: ${comments.length}`);
  console.log(
    `Running ${CONFIG.measuredRuns} measured runs per query after ${CONFIG.warmupRuns} warm-up runs.`,
  );

  await addMeasurement('task-listing', projectTasks, async () => {
    const rows = await prisma.task.findMany({
      where: {
        organizationId: CONFIG.organizationId,
        projectId: CONFIG.projectId,
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.length;
  });

  const searchRows = await prisma.task.findMany({
    where: {
      organizationId: CONFIG.organizationId,
      projectId: CONFIG.projectId,
      OR: [
        { title: { contains: 'task', mode: 'insensitive' } },
        { description: { contains: 'task', mode: 'insensitive' } },
      ],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 20,
    skip: 0,
    select: { id: true },
  });

  await addMeasurement(
    'task-search-pagination',
    searchRows.length,
    async () => {
      const rows = await prisma.task.findMany({
        where: {
          organizationId: CONFIG.organizationId,
          projectId: CONFIG.projectId,
          OR: [
            { title: { contains: 'task', mode: 'insensitive' } },
            { description: { contains: 'task', mode: 'insensitive' } },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 20,
        skip: 0,
        select: { id: true },
      });

      return rows.length;
    },
  );

  await addMeasurement('task-count', projectTasks, async () => {
    return prisma.task.count({
      where: {
        organizationId: CONFIG.organizationId,
        projectId: CONFIG.projectId,
      },
    });
  });

  const firstPageExpected = Math.min(CONFIG.pageSize, comments.length);

  await addMeasurement(
    'comment-first-page',
    firstPageExpected,
    async () => {
      const rows = await prisma.taskComment.findMany({
        where: {
          organizationId: CONFIG.organizationId,
          taskId: CONFIG.taskId,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: CONFIG.pageSize,
        select: { id: true },
      });

      return rows.length;
    },
  );

  for (const definition of cursorDefinitions) {
    const { name, cursor } = definition;
    const expectedRows = Math.min(
      CONFIG.pageSize,
      comments.length - cursor.position,
    );

    if (expectedRows <= 0) {
      throw new Error(
        `${name}: cursor position ${cursor.position} has no following comments.`,
      );
    }

    await addMeasurement(name, expectedRows, async () => {
      const rows = await prisma.taskComment.findMany({
        where: {
          organizationId: CONFIG.organizationId,
          taskId: CONFIG.taskId,
          OR: [
            { createdAt: { gt: cursor.createdAt } },
            {
              createdAt: cursor.createdAt,
              id: { gt: cursor.id },
            },
          ],
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: CONFIG.pageSize,
        select: { id: true },
      });

      return rows.length;
    });
  }

  const report = {
    reportId: randomUUID(),
    generatedAt: new Date().toISOString(),
    database: {
      name: databaseInfo[0]!.database_name,
      user: databaseInfo[0]!.database_user,
      version: databaseInfo[0]!.postgres_version,
    },
    configuration: {
      ...CONFIG,
      projectTaskCount: projectTasks,
      selectedTaskCommentCount: comments.length,
      cursorPositions: cursorDefinitions.map(({ name, cursor }) => ({
        name,
        position: cursor.position,
        id: cursor.id,
        createdAt: cursor.createdAt.toISOString(),
      })),
    },
    note:
      'Prisma Client wall-clock timings include client-side overhead and are not pure database execution times. Each workload validates its result count on warm-up and measured runs. Cursor pagination uses the (createdAt, id) ordering.',
    results: measurements.map(summarize),
  };

  const outputDirectory = 'artifacts/performance';
  await mkdir(outputDirectory, { recursive: true });

  const outputPath = `${outputDirectory}/benchmark-${report.reportId}.json`;

  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, {
    flag: 'wx',
  });

  console.table(report.results);
  console.log(`\nReport written to: ${outputPath}`);
}

main()
  .catch((error: unknown) => {
    console.error('Performance benchmark failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
