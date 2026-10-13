import pkg from '@prisma/client';

const { PrismaClient } = pkg;
const prisma = new PrismaClient();
const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

let passed = 0;
let failed = 0;

function report(ok, name, detail = '') {
  if (ok) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name} ${detail}`);
  }
}

async function expectOk(name, fn) {
  try {
    await fn();
    report(true, name);
  } catch (e) {
    report(false, name, `-> ${e?.code ?? e?.message}`);
  }
}

// DB ko error dena hi chahiye, warna guarantee kaam nahi kar rahi
async function expectDbError(name, code, fn) {
  try {
    await fn();
    report(false, name, '-> expected a DB error but the insert succeeded');
  } catch (e) {
    report(e?.code === code, name, `-> got ${e?.code ?? e?.message}, expected ${code}`);
  }
}

async function main() {
  const orgIds = [];
  const userIds = [];

  const mkUser = async (n) => {
    const u = await prisma.user.create({
      data: {
        name: `tmp-${n}`,
        email: `tmp-${n}-${tag}@example.test`,
        passwordHash: 'not-a-real-hash',
      },
    });
    userIds.push(u.id);
    return u;
  };

  const mkOrg = async (n) => {
    const o = await prisma.organization.create({
      data: { name: `tmp-org-${n}`, slug: `tmp-org-${n}-${tag}` },
    });
    orgIds.push(o.id);
    return o;
  };

  try {
    // Setup: orgA (uA ADMIN, uC EMPLOYEE), orgB (uB ADMIN)
    const orgA = await mkOrg('a');
    const orgB = await mkOrg('b');
    const uA = await mkUser('a');
    const uB = await mkUser('b');
    const uC = await mkUser('c');

    await prisma.organizationMember.createMany({
      data: [
        { userId: uA.id, organizationId: orgA.id, role: 'ADMIN' },
        { userId: uC.id, organizationId: orgA.id, role: 'EMPLOYEE' },
        { userId: uB.id, organizationId: orgB.id, role: 'ADMIN' },
      ],
    });

    const project = await prisma.project.create({
      data: { name: 'tmp-project', organizationId: orgA.id, createdById: uA.id },
    });

    console.log('--- DB integrity checks ---');

    // 1. Sahi case: orgA ka member, orgA ke project me
    await expectOk('1. member of the same org can be added to the project', () =>
      prisma.projectMember.create({
        data: { projectId: project.id, userId: uA.id, organizationId: orgA.id },
      }),
    );

    // 2. uB orgA ka member nahi hai
    await expectDbError(
      '2. a user who is NOT a member of the org is rejected (P2003)',
      'P2003',
      () =>
        prisma.projectMember.create({
          data: { projectId: project.id, userId: uB.id, organizationId: orgA.id },
        }),
    );

    // 3. Project orgA ka hai, par row me orgB likha
    await expectDbError(
      '3. a project cannot be linked with a different organizationId (P2003)',
      'P2003',
      () =>
        prisma.projectMember.create({
          data: { projectId: project.id, userId: uB.id, organizationId: orgB.id },
        }),
    );

    // 4. Same user same project me do baar
    await expectDbError(
      '4. the same user cannot join the same project twice (P2002)',
      'P2002',
      () =>
        prisma.projectMember.create({
          data: { projectId: project.id, userId: uA.id, organizationId: orgA.id },
        }),
    );

    // 5. Org se member hatao to uska project membership apne aap hate, user account na hate
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: uC.id, organizationId: orgA.id },
    });
    await prisma.organizationMember.delete({
      where: { userId_organizationId: { userId: uC.id, organizationId: orgA.id } },
    });
    const leftover = await prisma.projectMember.count({
      where: { projectId: project.id, userId: uC.id },
    });
    const userStillExists = await prisma.user.findUnique({ where: { id: uC.id } });
    report(
      leftover === 0 && userStillExists !== null,
      '5. removing an org member cascades their project membership, user account stays',
      `-> leftover=${leftover}, userExists=${userStillExists !== null}`,
    );

    // 6. Project delete ho to uske project members apne aap hate
    await prisma.project.delete({ where: { id: project.id } });
    const orphans = await prisma.projectMember.count({
      where: { projectId: project.id },
    });
    report(
      orphans === 0,
      '6. deleting a project cascades its project members',
      `-> orphans=${orphans}`,
    );
  } finally {
    // Sirf apna temp data hatao (order foreign keys ke hisaab se)
    await prisma.projectMember.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.project.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.organizationMember.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    console.log('--- temp data cleaned up ---');
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error('Script error:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());