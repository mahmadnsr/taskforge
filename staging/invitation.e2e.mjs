import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const api = 'http://127.0.0.1:3300/graphql';
const frontend = 'http://127.0.0.1:8088';
const mailpit = 'http://127.0.0.1:8025';
const suffix = randomUUID();
const adminEmail = `stage-admin-${suffix}@example.test`;
const employeeEmail = `stage-employee-${suffix}@example.test`;
const adminPassword = randomBytes(24).toString('hex');
const employeePassword = randomBytes(24).toString('hex');

async function graphql(step, query, variables, accessToken) {
  const response = await fetch(api, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!response.ok || result.errors?.length || !result.data) {
    const code = result.errors?.[0]?.extensions?.code ?? response.status;
    throw new Error(`${step} failed (${code})`);
  }
  return result.data;
}

async function invitationMessage() {
  const query = new URLSearchParams({ query: `to:${employeeEmail}` });
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await fetch(`${mailpit}/view/latest.txt?${query}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) return response.text();
    if (response.status !== 404) throw new Error('Mailpit inbox lookup failed');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Invitation email did not arrive in Mailpit');
}

async function run() {
  await graphql(
    'admin registration',
    'mutation($input:RegisterInput!){register(input:$input){id}}',
    { input: {
      name: 'Staging Invite Admin',
      email: adminEmail,
      password: adminPassword,
      organizationName: `Staging Invitation ${suffix}`,
    } },
  );
  const adminLogin = await graphql(
    'admin login',
    'mutation($input:LoginInput!){login(input:$input){accessToken}}',
    { input: { email: adminEmail, password: adminPassword } },
  );
  const adminToken = adminLogin.login.accessToken;
  const organizations = await graphql(
    'admin organizations',
    'query{myOrganizations{id}}',
    {},
    adminToken,
  );
  const organizationId = organizations.myOrganizations[0]?.id;
  if (!organizationId) throw new Error('Admin organization was not created');

  const invitation = await graphql(
    'employee invitation',
    'mutation($input:InviteMemberInput!){inviteMember(input:$input){id email role}}',
    { input: { organizationId, email: employeeEmail, role: 'EMPLOYEE' } },
    adminToken,
  );
  if (invitation.inviteMember.email !== employeeEmail ||
      invitation.inviteMember.role !== 'EMPLOYEE' ||
      'inviteToken' in invitation.inviteMember) {
    throw new Error('Invitation response was incorrect');
  }

  const message = await invitationMessage();
  if (!message.includes('Assigned role: EMPLOYEE')) {
    throw new Error('Invitation email has the wrong role');
  }
  const link = message.match(/http:\/\/127\.0\.0\.1:8088\/accept-invitation\?token=[a-f0-9]{64}/)?.[0];
  if (!link) throw new Error('Invitation email has no valid staging frontend link');
  const token = new URL(link).searchParams.get('token');
  if (!token) throw new Error('Invitation link has no token');

  const invitationPage = await fetch(link, { signal: AbortSignal.timeout(10000) });
  if (!invitationPage.ok || !(await invitationPage.text()).includes('id="root"')) {
    throw new Error('Employee invitation page did not open');
  }

  const employee = await graphql(
    'employee invitation acceptance',
    'mutation($input:RegisterWithInvitationInput!){registerWithInvitation(input:$input){id email}}',
    { input: {
      name: 'Staging Invite Employee',
      email: employeeEmail,
      password: employeePassword,
      invitationToken: token,
    } },
  );
  if (employee.registerWithInvitation.email !== employeeEmail ||
      JSON.stringify(employee).includes(token)) {
    throw new Error('Employee registration response was incorrect');
  }
  const employeeLogin = await graphql(
    'employee login',
    'mutation($input:LoginInput!){login(input:$input){accessToken}}',
    { input: { email: employeeEmail, password: employeePassword } },
  );
  const employeeOrganizations = await graphql(
    'employee organizations',
    'query{myOrganizations{id}}',
    {},
    employeeLogin.login.accessToken,
  );
  if (!employeeOrganizations.myOrganizations.some((organization) => organization.id === organizationId)) {
    throw new Error('Employee cannot access the invited organization');
  }
  const members = await graphql(
    'organization membership',
    'query($organizationId:ID!){organizationMembers(organizationId:$organizationId){role user{email}}}',
    { organizationId },
    adminToken,
  );
  if (!members.organizationMembers.some((member) =>
    member.user.email === employeeEmail && member.role === 'EMPLOYEE')) {
    throw new Error('Employee membership or role is incorrect');
  }

  const logs = spawnSync('docker', [
    'compose', '-p', 'taskforge_interview_stage', '-f', 'staging/compose.yaml',
    'logs', '--no-color', '--tail=200', 'backend', 'worker', 'frontend',
  ], { encoding: 'utf8' });
  if (logs.status !== 0 || logs.stdout.includes(token) || logs.stderr.includes(token)) {
    throw new Error('Invitation token appeared in application logs or logs could not be checked');
  }
  console.log('Invitation E2E passed: Mailpit delivery, localhost link, acceptance, and EMPLOYEE membership.');
}

run().catch((error) => {
  console.error(`Invitation E2E failed: ${error.message}`);
  process.exitCode = 1;
});
