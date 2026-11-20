import { randomBytes, randomUUID } from 'node:crypto';

const api = 'http://127.0.0.1:3300/graphql';
const frontend = 'http://127.0.0.1:8088';
const mailpit = 'http://127.0.0.1:8025';
const suffix = randomUUID();

const accounts = {
  admin: account('admin'),
  manager: account('manager'),
  employee: account('employee'),
  outsider: account('outsider'),
};

function account(label) {
  return {
    email: `qa-${label}-${suffix}@example.test`,
    password: randomBytes(24).toString('hex'),
    name: `QA ${label}`,
  };
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(step, query, variables = {}, accessToken) {
  const response = await fetch(api, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json();
  if (!response.ok || result.errors?.length || !result.data) {
    const code = result.errors?.[0]?.extensions?.code ?? response.status;
    throw new Error(`${step} failed (${code})`);
  }
  return result.data;
}

async function rejected(step, query, variables = {}, accessToken) {
  const response = await fetch(api, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json();
  if (result.data && !result.errors?.length) {
    throw new Error(`${step} unexpectedly succeeded`);
  }
  return {
    code: result.errors?.[0]?.extensions?.code,
    status: result.errors?.[0]?.extensions?.originalError?.statusCode,
  };
}

async function forbidden(step, query, variables, accessToken) {
  const result = await rejected(step, query, variables, accessToken);
  check(result.code === 'FORBIDDEN' || result.status === 403, `${step} did not return an authorization error`);
}

async function invitationToken(email) {
  const query = new URLSearchParams({ query: `to:${email}` });
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await fetch(`${mailpit}/view/latest.txt?${query}`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (response.ok) {
      const message = await response.text();
      const match = message.match(/\/accept-invitation\?token=([a-f0-9]{64})/);
      if (match) return match[1];
      throw new Error('Invitation email did not contain a valid local acceptance link');
    }
    if (response.status !== 404) throw new Error('Mailpit invitation lookup failed');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Invitation email did not arrive in Mailpit');
}

async function register(accountValue, organizationName) {
  return request(
    `${accountValue.name} registration`,
    'mutation($input:RegisterInput!){register(input:$input){id email}}',
    { input: { ...accountValue, organizationName } },
  );
}

async function login(accountValue) {
  const data = await request(
    `${accountValue.name} login`,
    'mutation($input:LoginInput!){login(input:$input){accessToken user{id email}}}',
    { input: { email: accountValue.email, password: accountValue.password } },
  );
  check(data.login.user.email === accountValue.email, 'Login returned the wrong user');
  return { id: data.login.user.id, token: data.login.accessToken };
}

async function registerInvitation(accountValue, token) {
  const data = await request(
    `${accountValue.name} invitation acceptance`,
    'mutation($input:RegisterWithInvitationInput!){registerWithInvitation(input:$input){id email}}',
    { input: {
      name: accountValue.name,
      email: accountValue.email,
      password: accountValue.password,
      invitationToken: token,
    } },
  );
  check(data.registerWithInvitation.email === accountValue.email, 'Invitation registered the wrong email');
}

async function run() {
  for (const route of ['/', '/login', '/register', '/accept-invitation', '/dashboard', '/projects', '/tasks', '/members']) {
    const page = await fetch(`${frontend}${route}`, { signal: AbortSignal.timeout(10_000) });
    check(page.ok && (await page.text()).includes('id="root"'), `Frontend route ${route} is unavailable`);
  }

  await register(accounts.admin, `QA Organization ${suffix}`);
  const admin = await login(accounts.admin);
  const organizations = await request('organization creation', 'query{myOrganizations{id name}}', {}, admin.token);
  const organizationId = organizations.myOrganizations[0]?.id;
  check(organizationId, 'Admin registration did not create an organization');

  await request(
    'manager invitation',
    'mutation($input:InviteMemberInput!){inviteMember(input:$input){id email role}}',
    { input: { organizationId, email: accounts.manager.email, role: 'MANAGER' } },
    admin.token,
  );
  const managerInvitation = await invitationToken(accounts.manager.email);

  await rejected(
    'invalid invitation token validation',
    'mutation($input:RegisterWithInvitationInput!){registerWithInvitation(input:$input){id}}',
    { input: {
      name: 'Invalid invitation',
      email: `qa-invalid-${suffix}@example.test`,
      password: randomBytes(24).toString('hex'),
      invitationToken: randomBytes(32).toString('hex'),
    } },
  );
  await rejected(
    'invitation email binding',
    'mutation($input:RegisterWithInvitationInput!){registerWithInvitation(input:$input){id}}',
    { input: {
      name: accounts.employee.name,
      email: accounts.employee.email,
      password: accounts.employee.password,
      invitationToken: managerInvitation,
    } },
  );
  await registerInvitation(accounts.manager, managerInvitation);

  await request(
    'employee invitation',
    'mutation($input:InviteMemberInput!){inviteMember(input:$input){id email role}}',
    { input: { organizationId, email: accounts.employee.email, role: 'EMPLOYEE' } },
    admin.token,
  );
  const employeeInvitation = await invitationToken(accounts.employee.email);
  await registerInvitation(accounts.employee, employeeInvitation);
  await rejected(
    'consumed invitation replay',
    'mutation($input:RegisterWithInvitationInput!){registerWithInvitation(input:$input){id}}',
    { input: {
      name: accounts.manager.name,
      email: accounts.manager.email,
      password: accounts.manager.password,
      invitationToken: managerInvitation,
    } },
  );

  await register(accounts.outsider, `QA Outsider Organization ${suffix}`);
  const [manager, employee, outsider] = await Promise.all([
    login(accounts.manager),
    login(accounts.employee),
    login(accounts.outsider),
  ]);

  const members = await request(
    'accepted organization memberships',
    'query($organizationId:ID!){organizationMembers(organizationId:$organizationId){role user{id email}}}',
    { organizationId },
    admin.token,
  );
  check(members.organizationMembers.some((member) => member.user.id === manager.id && member.role === 'MANAGER'), 'Manager membership is missing');
  check(members.organizationMembers.some((member) => member.user.id === employee.id && member.role === 'EMPLOYEE'), 'Employee membership is missing');

  await forbidden(
    'manager organization invitation restriction',
    'mutation($input:InviteMemberInput!){inviteMember(input:$input){id}}',
    { input: { organizationId, email: `qa-manager-denied-${suffix}@example.test`, role: 'EMPLOYEE' } },
    manager.token,
  );
  await forbidden(
    'employee organization invitation restriction',
    'mutation($input:InviteMemberInput!){inviteMember(input:$input){id}}',
    { input: { organizationId, email: `qa-employee-denied-${suffix}@example.test`, role: 'EMPLOYEE' } },
    employee.token,
  );
  await forbidden(
    'manager organization role promotion restriction',
    'mutation($input:UpdateMemberRoleInput!){updateMemberRole(input:$input){id}}',
    { input: { organizationId, userId: employee.id, role: 'MANAGER' } },
    manager.token,
  );

  const projectOne = (await request(
    'project creation',
    'mutation($input:CreateProjectInput!){createProject(input:$input){id name status}}',
    { input: { organizationId, name: `QA Delivery ${suffix}`, description: 'Functional QA project' } },
    admin.token,
  )).createProject;
  const projectTwo = (await request(
    'second project creation',
    'mutation($input:CreateProjectInput!){createProject(input:$input){id name}}',
    { input: { organizationId, name: `QA Restricted ${suffix}` } },
    admin.token,
  )).createProject;

  const addProjectMember = 'mutation($organizationId:ID!,$projectId:ID!,$userId:ID!){addProjectMember(organizationId:$organizationId,projectId:$projectId,userId:$userId){id userId projectId}}';
  const removeProjectMember = 'mutation($organizationId:ID!,$projectId:ID!,$userId:ID!){removeProjectMember(organizationId:$organizationId,projectId:$projectId,userId:$userId)}';
  await request('admin appoints project manager', addProjectMember,
    { organizationId, projectId: projectOne.id, userId: manager.id }, admin.token);
  await request('manager adds existing employee to project team', addProjectMember,
    { organizationId, projectId: projectOne.id, userId: employee.id }, manager.token);
  await forbidden('manager cannot add another manager to team', addProjectMember,
    { organizationId, projectId: projectOne.id, userId: manager.id }, manager.token);
  await forbidden('manager cannot remove the appointed project manager', removeProjectMember,
    { organizationId, projectId: projectOne.id, userId: manager.id }, manager.token);
  const crossOrganizationTeamAdd = await rejected('cross-organization project team target', addProjectMember,
    { organizationId, projectId: projectOne.id, userId: outsider.id }, manager.token);
  check(crossOrganizationTeamAdd.code === 'NOT_FOUND' || crossOrganizationTeamAdd.status === 404,
    'Cross-organization project team target did not return not found');
  await forbidden('manager cannot add employee to another project', addProjectMember,
    { organizationId, projectId: projectTwo.id, userId: employee.id }, manager.token);
  await forbidden('employee cannot manage project team', addProjectMember,
    { organizationId, projectId: projectOne.id, userId: employee.id }, employee.token);
  await forbidden('employee cannot remove project team members', removeProjectMember,
    { organizationId, projectId: projectOne.id, userId: employee.id }, employee.token);
  await request('manager removes unassigned employee from project team', removeProjectMember,
    { organizationId, projectId: projectOne.id, userId: employee.id }, manager.token);
  await request('manager restores employee to project team', addProjectMember,
    { organizationId, projectId: projectOne.id, userId: employee.id }, manager.token);
  await request('admin joins project team for administrative assignment check', addProjectMember,
    { organizationId, projectId: projectOne.id, userId: admin.id }, admin.token);
  await forbidden('manager cannot add admin to project team', addProjectMember,
    { organizationId, projectId: projectOne.id, userId: admin.id }, manager.token);
  await forbidden('manager cannot remove admin from project team', removeProjectMember,
    { organizationId, projectId: projectOne.id, userId: admin.id }, manager.token);

  await rejected(
    'manager project creation restriction',
    'mutation($input:CreateProjectInput!){createProject(input:$input){id}}',
    { input: { organizationId, name: 'Unauthorized project' } },
    manager.token,
  );

  const primaryTask = (await request(
    'manager task creation',
    'mutation($input:CreateTaskInput!){createTask(input:$input){id status assigneeId projectId}}',
    { input: { organizationId, projectId: projectOne.id, title: 'QA primary task', priority: 'HIGH' } },
    manager.token,
  )).createTask;
  const unassignedTask = (await request(
    'unassigned task creation',
    'mutation($input:CreateTaskInput!){createTask(input:$input){id status}}',
    { input: { organizationId, projectId: projectOne.id, title: 'QA unassigned task' } },
    manager.token,
  )).createTask;
  const restrictedTask = (await request(
    'restricted project task creation',
    'mutation($input:CreateTaskInput!){createTask(input:$input){id}}',
    { input: { organizationId, projectId: projectTwo.id, title: 'QA restricted task' } },
    admin.token,
  )).createTask;

  const addDependency = 'mutation($organizationId:ID!,$taskId:ID!,$blockingTaskId:ID!){addTaskDependency(organizationId:$organizationId,taskId:$taskId,blockingTaskId:$blockingTaskId){taskId blockingTaskId}}';
  const removeDependency = 'mutation($organizationId:ID!,$taskId:ID!,$blockingTaskId:ID!){removeTaskDependency(organizationId:$organizationId,taskId:$taskId,blockingTaskId:$blockingTaskId)}';
  const dependencyQuery = 'query($organizationId:ID!,$taskId:ID!){taskDependencies(organizationId:$organizationId,taskId:$taskId){blockingTaskId blockingTitle blockingStatus}}';
  const forward = { organizationId, taskId: primaryTask.id, blockingTaskId: unassignedTask.id };
  const reverse = { organizationId, taskId: unassignedTask.id, blockingTaskId: primaryTask.id };
  const concurrent = await Promise.allSettled([
    request('concurrent forward dependency', addDependency, forward, manager.token),
    request('concurrent reverse dependency', addDependency, reverse, manager.token),
  ]);
  check(concurrent.filter((result) => result.status === 'fulfilled').length === 1,
    'Concurrent opposite dependencies did not produce exactly one edge');
  const concurrentFailure = concurrent.find((result) => result.status === 'rejected');
  check(concurrentFailure?.reason instanceof Error && concurrentFailure.reason.message.includes('(BAD_REQUEST)'),
    'Concurrent opposite dependency was rejected for a reason other than cycle validation');
  const winning = concurrent[0].status === 'fulfilled' ? forward : reverse;
  await request('remove concurrent dependency', removeDependency, winning, manager.token);
  await request('manager adds task dependency', addDependency, forward, manager.token);
  const dependencyRows = (await request('employee views task dependencies', dependencyQuery,
    { organizationId, taskId: primaryTask.id }, employee.token)).taskDependencies;
  check(dependencyRows.length === 1 && dependencyRows[0].blockingTaskId === unassignedTask.id &&
    dependencyRows[0].blockingStatus === 'TODO', 'Task dependency was not visible to an authorized employee');
  await rejected('duplicate dependency', addDependency, forward, manager.token);
  await rejected('direct dependency cycle', addDependency, reverse, manager.token);
  await rejected('self dependency', addDependency,
    { ...forward, blockingTaskId: primaryTask.id }, manager.token);
  await rejected('cross-project dependency', addDependency,
    { ...forward, blockingTaskId: restrictedTask.id }, manager.token);
  await forbidden('employee cannot add dependency', addDependency, reverse, employee.token);
  await forbidden('employee cannot remove dependency', removeDependency, forward, employee.token);
  await forbidden('manager cannot manage another project dependency', addDependency,
    { organizationId, taskId: restrictedTask.id, blockingTaskId: primaryTask.id }, manager.token);
  await rejected('cross-organization dependency access', dependencyQuery,
    { organizationId, taskId: primaryTask.id }, outsider.token);
  await rejected('cross-project dependency access', dependencyQuery,
    { organizationId, taskId: restrictedTask.id }, manager.token);
  await rejected('blocked task cannot start',
    'mutation($input:ChangeTaskStatusInput!){changeTaskStatus(input:$input){id}}',
    { input: { organizationId, taskId: primaryTask.id, status: 'IN_PROGRESS' } }, manager.token);
  await request('manager removes task dependency', removeDependency, forward, manager.token);

  await forbidden('manager cannot create a task assigned to an admin',
    'mutation($input:CreateTaskInput!){createTask(input:$input){id}}',
    { input: { organizationId, projectId: projectOne.id, title: 'Unauthorized manager assignment', assigneeId: admin.id } },
    manager.token);
  await forbidden('manager cannot assign a task to an admin project member',
    'mutation($input:AssignTaskInput!){assignTask(input:$input){id}}',
    { input: { organizationId, taskId: primaryTask.id, assigneeId: admin.id } },
    manager.token);
  const outsiderAssignment = await rejected('non-project assignee restriction',
    'mutation($input:AssignTaskInput!){assignTask(input:$input){id}}',
    { input: { organizationId, taskId: primaryTask.id, assigneeId: outsider.id } },
    manager.token);
  check(outsiderAssignment.code === 'BAD_REQUEST' || outsiderAssignment.status === 400,
    'Non-project assignee did not return a validation error');
  await request('admin may assign a project manager',
    'mutation($input:AssignTaskInput!){assignTask(input:$input){id assigneeId}}',
    { input: { organizationId, taskId: unassignedTask.id, assigneeId: manager.id } }, admin.token);
  await request('admin restores unassigned task',
    'mutation($input:AssignTaskInput!){assignTask(input:$input){id assigneeId}}',
    { input: { organizationId, taskId: unassignedTask.id, assigneeId: null } }, admin.token);

  const assignedTask = (await request(
    'employee task assignment',
    'mutation($input:AssignTaskInput!){assignTask(input:$input){id assigneeId}}',
    { input: { organizationId, taskId: primaryTask.id, assigneeId: employee.id } },
    manager.token,
  )).assignTask;
  check(assignedTask.assigneeId === employee.id, 'Task assignment was not persisted');
  const assignedTeamRemoval = await rejected('assigned project member removal restriction', removeProjectMember,
    { organizationId, projectId: projectOne.id, userId: employee.id }, manager.token);
  check(assignedTeamRemoval.code === 'CONFLICT' || assignedTeamRemoval.status === 409,
    'Removing an assigned employee did not return a conflict');
  const assignmentAfterRemovalAttempt = (await request('assignment preserved after rejected team removal',
    'query($organizationId:ID!,$taskId:ID!){task(organizationId:$organizationId,taskId:$taskId){assigneeId}}',
    { organizationId, taskId: primaryTask.id }, manager.token)).task;
  check(assignmentAfterRemovalAttempt.assigneeId === employee.id, 'Rejected team removal changed task ownership');

  for (const [role, assigneeId] of [
    ['unassigned', undefined],
    ['ADMIN', admin.id],
    ['MANAGER', manager.id],
    ['EMPLOYEE', employee.id],
  ]) {
    await forbidden(
      `employee direct GraphQL task creation with ${role} assignee`,
      'mutation($input:CreateTaskInput!){createTask(input:$input){id}}',
      { input: { organizationId, projectId: projectOne.id, title: 'Unauthorized task', ...(assigneeId ? { assigneeId } : {}) } },
      employee.token,
    );
  }
  for (const [role, assigneeId] of [
    ['ADMIN', admin.id],
    ['MANAGER', manager.id],
    ['EMPLOYEE', employee.id],
  ]) {
    await forbidden(
      `employee direct GraphQL assignment to ${role}`,
      'mutation($input:AssignTaskInput!){assignTask(input:$input){id}}',
      { input: { organizationId, taskId: primaryTask.id, assigneeId } },
      employee.token,
    );
    await forbidden(
      `employee direct GraphQL ownership update to ${role}`,
      'mutation($input:UpdateTaskInput!){updateTask(input:$input){id}}',
      { input: { organizationId, taskId: primaryTask.id, assigneeId } },
      employee.token,
    );
  }
  await forbidden(
    'employee direct GraphQL subtask creation',
    'mutation($input:CreateSubtaskInput!){createSubtask(input:$input){id}}',
    { input: { organizationId, projectId: projectOne.id, parentId: primaryTask.id, title: 'Unauthorized subtask' } },
    employee.token,
  );
  await forbidden(
    'manager cross-project task creation',
    'mutation($input:CreateTaskInput!){createTask(input:$input){id}}',
    { input: { organizationId, projectId: projectTwo.id, title: 'Unauthorized cross-project task' } },
    manager.token,
  );

  const subtask = (await request(
    'subtask creation',
    'mutation($input:CreateSubtaskInput!){createSubtask(input:$input){id parentId status assigneeId}}',
    { input: {
      organizationId,
      projectId: projectOne.id,
      parentId: primaryTask.id,
      title: 'QA subtask',
      assigneeId: employee.id,
    } },
    manager.token,
  )).createSubtask;
  check(subtask.parentId === primaryTask.id, 'Subtask parent was not persisted');

  const checklistItem = (await request(
    'checklist creation',
    'mutation($input:AddChecklistItemInput!){addChecklistItem(input:$input){id completed position}}',
    { input: { organizationId, taskId: primaryTask.id, content: 'QA checklist item' } },
    manager.token,
  )).addChecklistItem;

  await rejected(
    'employee checklist structure restriction',
    'mutation($input:AddChecklistItemInput!){addChecklistItem(input:$input){id}}',
    { input: { organizationId, taskId: primaryTask.id, content: 'Unauthorized item' } },
    employee.token,
  );
  await request(
    'employee checklist completion',
    'mutation($input:SetChecklistItemCompletedInput!){setChecklistItemCompleted(input:$input){id completed}}',
    { input: { organizationId, taskId: primaryTask.id, itemId: checklistItem.id, completed: true } },
    employee.token,
  );

  const halfProgress = (await request(
    'automatic partial progress',
    'query($input:TaskProgressInput!){taskProgress(input:$input){percent checklistPercent subtaskPercent}}',
    { input: { organizationId, taskId: primaryTask.id } },
    manager.token,
  )).taskProgress;
  check(halfProgress.percent === 50 && halfProgress.checklistPercent === 100 && halfProgress.subtaskPercent === 0, 'Partial task progress was inaccurate');

  await rejected(
    'invalid status transition',
    'mutation($input:ChangeTaskStatusInput!){changeTaskStatus(input:$input){id}}',
    { input: { organizationId, taskId: primaryTask.id, status: 'DONE' } },
    employee.token,
  );
  await rejected(
    'employee unassigned task status restriction',
    'mutation($input:ChangeTaskStatusInput!){changeTaskStatus(input:$input){id}}',
    { input: { organizationId, taskId: unassignedTask.id, status: 'IN_PROGRESS' } },
    employee.token,
  );
  await rejected(
    'employee task detail restriction',
    'mutation($input:UpdateTaskInput!){updateTask(input:$input){id}}',
    { input: { organizationId, taskId: primaryTask.id, title: 'Unauthorized change' } },
    employee.token,
  );
  await rejected(
    'employee task assignment restriction',
    'mutation($input:AssignTaskInput!){assignTask(input:$input){id}}',
    { input: { organizationId, taskId: primaryTask.id, assigneeId: manager.id } },
    employee.token,
  );
  await rejected(
    'employee task deletion restriction',
    'mutation($organizationId:ID!,$taskId:ID!){deleteTask(organizationId:$organizationId,taskId:$taskId)}',
    { organizationId, taskId: primaryTask.id },
    employee.token,
  );

  for (const status of ['IN_PROGRESS', 'IN_REVIEW']) {
    await request(
      `subtask status ${status}`,
      'mutation($input:ChangeTaskStatusInput!){changeSubtaskStatus(input:$input){id status}}',
      { input: { organizationId, taskId: subtask.id, status } },
      employee.token,
    );
  }
  await forbidden(
    'employee cannot approve assigned subtask',
    'mutation($input:ChangeTaskStatusInput!){changeSubtaskStatus(input:$input){id}}',
    { input: { organizationId, taskId: subtask.id, status: 'DONE' } },
    employee.token,
  );
  await request(
    'manager approves submitted subtask',
    'mutation($input:ChangeTaskStatusInput!){changeSubtaskStatus(input:$input){id status}}',
    { input: { organizationId, taskId: subtask.id, status: 'DONE' } },
    manager.token,
  );
  const fullProgress = (await request(
    'automatic completed component progress',
    'query($input:TaskProgressInput!){taskProgress(input:$input){percent checklistCompleted checklistTotal subtasksCompleted subtasksTotal}}',
    { input: { organizationId, taskId: primaryTask.id } },
    employee.token,
  )).taskProgress;
  check(fullProgress.percent === 100 && fullProgress.checklistCompleted === 1 && fullProgress.subtasksCompleted === 1, 'Completed task component progress was inaccurate');

  for (const status of ['IN_PROGRESS', 'IN_REVIEW']) {
    await request(
      `task status ${status}`,
      'mutation($input:ChangeTaskStatusInput!){changeTaskStatus(input:$input){id status}}',
      { input: { organizationId, taskId: primaryTask.id, status } },
      employee.token,
    );
  }
  await forbidden(
    'employee cannot approve assigned task',
    'mutation($input:ChangeTaskStatusInput!){changeTaskStatus(input:$input){id}}',
    { input: { organizationId, taskId: primaryTask.id, status: 'DONE' } },
    employee.token,
  );
  await request(
    'manager requests changes on submitted task',
    'mutation($input:ChangeTaskStatusInput!){changeTaskStatus(input:$input){id status}}',
    { input: { organizationId, taskId: primaryTask.id, status: 'IN_PROGRESS' } },
    manager.token,
  );
  await request(
    'employee resubmits task for review',
    'mutation($input:ChangeTaskStatusInput!){changeTaskStatus(input:$input){id status}}',
    { input: { organizationId, taskId: primaryTask.id, status: 'IN_REVIEW' } },
    employee.token,
  );
  await request(
    'manager approves submitted task',
    'mutation($input:ChangeTaskStatusInput!){changeTaskStatus(input:$input){id status}}',
    { input: { organizationId, taskId: primaryTask.id, status: 'DONE' } },
    manager.token,
  );

  const unauthenticatedStream = await fetch('http://127.0.0.1:3300/notifications/stream', {
    signal: AbortSignal.timeout(5000),
  });
  check(unauthenticatedStream.status === 401, 'Notification stream accepted an anonymous request');
  const employeeStreamAbort = new AbortController();
  const employeeStream = await fetch('http://127.0.0.1:3300/notifications/stream', {
    headers: { Authorization: `Bearer ${employee.token}` }, signal: employeeStreamAbort.signal,
  });
  check(employeeStream.ok && employeeStream.headers.get('content-type')?.includes('text/event-stream'),
    'Authenticated notification stream was unavailable');
  const employeeReader = employeeStream.body.getReader();
  check((new TextDecoder().decode((await employeeReader.read()).value)).includes('event: sync'),
    'Notification stream did not synchronize on connection');
  const outsiderStreamAbort = new AbortController();
  const outsiderStream = await fetch('http://127.0.0.1:3300/notifications/stream', {
    headers: { Authorization: `Bearer ${outsider.token}` }, signal: outsiderStreamAbort.signal,
  });
  check(outsiderStream.ok, 'Second tenant notification stream was unavailable');
  const outsiderReader = outsiderStream.body.getReader();
  await outsiderReader.read();

  const comment = (await request(
    'manager comment creation',
    'mutation($input:CreateTaskCommentInput!){createTaskComment(input:$input){id content author{id}}}',
    { input: { organizationId, taskId: primaryTask.id, content: 'QA manager comment' } },
    manager.token,
  )).createTaskComment;
  const streamDeadline = setTimeout(() => employeeStreamAbort.abort(), 7000);
  let employeeChanged = false;
  try {
    while (!employeeChanged) {
      const chunk = await employeeReader.read();
      if (chunk.done) break;
      employeeChanged = new TextDecoder().decode(chunk.value).includes('event: changed');
    }
  } catch { /* timeout means delivery failed */ }
  clearTimeout(streamDeadline);
  employeeStreamAbort.abort();
  check(employeeChanged, 'Recipient did not receive a real-time comment notification');
  const outsiderChunk = await Promise.race([
    outsiderReader.read(), new Promise((resolve) => setTimeout(() => resolve({ value: new Uint8Array(), done: false }), 3100)),
  ]);
  outsiderStreamAbort.abort();
  check(!new TextDecoder().decode(outsiderChunk.value).includes('event: changed'),
    'Notification stream delivered another tenant’s event');
  const employeeComment = (await request(
    'employee comment creation',
    'mutation($input:CreateTaskCommentInput!){createTaskComment(input:$input){id content}}',
    { input: { organizationId, taskId: primaryTask.id, content: 'QA employee comment' } },
    employee.token,
  )).createTaskComment;
  await rejected(
    'employee foreign comment modification restriction',
    'mutation($input:UpdateTaskCommentInput!){updateTaskComment(input:$input){id}}',
    { input: { organizationId, taskId: primaryTask.id, commentId: comment.id, content: 'Unauthorized comment edit' } },
    employee.token,
  );
  await request(
    'employee own comment update',
    'mutation($input:UpdateTaskCommentInput!){updateTaskComment(input:$input){id content}}',
    { input: { organizationId, taskId: primaryTask.id, commentId: employeeComment.id, content: 'QA employee comment updated' } },
    employee.token,
  );
  const comments = (await request(
    'comment history',
    'query($input:TaskCommentsPaginationInput!){taskComments(input:$input){items{id content} hasMore}}',
    { input: { organizationId, taskId: primaryTask.id, first: 10 } },
    employee.token,
  )).taskComments;
  check(comments.items.length === 2, 'Comment history count was inaccurate');

  const activity = (await request(
    'activity history',
    'query($input:TaskActivityInput!){taskActivity(input:$input){items{type} hasMore}}',
    { input: { organizationId, taskId: primaryTask.id, first: 100 } },
    manager.token,
  )).taskActivity;
  const activityTypes = new Set(activity.items.map((item) => item.type));
  for (const type of ['TASK_CREATED', 'TASK_ASSIGNED', 'SUBTASK_CREATED', 'CHECKLIST_ITEM_CREATED', 'CHECKLIST_ITEM_COMPLETED', 'TASK_STATUS_CHANGED']) {
    check(activityTypes.has(type), `Activity history is missing ${type}`);
  }

  const employeeNotifications = (await request(
    'employee notifications',
    'query($input:NotificationsPaginationInput!){myNotifications(input:$input){items{id type readAt} hasMore}}',
    { input: { organizationId, first: 20 } },
    employee.token,
  )).myNotifications;
  const notificationTypes = new Set(employeeNotifications.items.map((item) => item.type));
  check(notificationTypes.has('TASK_ASSIGNED') && notificationTypes.has('TASK_COMMENTED'), 'Expected assignment and comment notifications were not delivered');
  const unreadBefore = (await request(
    'unread notification count',
    'query($organizationId:String!){unreadNotificationCount(organizationId:$organizationId)}',
    { organizationId },
    employee.token,
  )).unreadNotificationCount;
  check(unreadBefore >= 2, 'Unread notification count was lower than expected');
  await request(
    'mark notification as read',
    'mutation($input:MarkNotificationReadInput!){markNotificationAsRead(input:$input){id readAt}}',
    { input: { organizationId, notificationId: employeeNotifications.items[0].id } },
    employee.token,
  );
  await request(
    'mark all notifications as read',
    'mutation($input:MarkAllNotificationsReadInput!){markAllNotificationsAsRead(input:$input)}',
    { input: { organizationId } },
    employee.token,
  );
  const unreadAfter = (await request(
    'cleared unread notification count',
    'query($organizationId:String!){unreadNotificationCount(organizationId:$organizationId)}',
    { organizationId },
    employee.token,
  )).unreadNotificationCount;
  check(unreadAfter === 0, 'Unread notifications were not cleared');

  const employeeAnalytics = (await request(
    'employee analytics',
    'query($input:EmployeeAnalyticsInput!){employeeAnalytics(input:$input){assigned completed pending inProgress completionRate workloadByProject{projectId assigned completed}}}',
    { input: { organizationId, employeeId: employee.id, projectId: projectOne.id } },
    manager.token,
  )).employeeAnalytics;
  check(employeeAnalytics.assigned === 2 && employeeAnalytics.completed === 2 && employeeAnalytics.completionRate === 100, 'Employee analytics were inaccurate');
  await rejected(
    'employee foreign analytics restriction',
    'query($input:EmployeeAnalyticsInput!){employeeAnalytics(input:$input){assigned}}',
    { input: { organizationId, employeeId: manager.id } },
    employee.token,
  );

  const projectAnalytics = (await request(
    'project analytics',
    'query($input:ProjectAnalyticsInput!){projectAnalytics(input:$input){progress{taskCount percent} statusDistribution{status count} overdueTasks health memberWorkload{userId assigned completed} recentActivity{type}}}',
    { input: { organizationId, projectId: projectOne.id } },
    manager.token,
  )).projectAnalytics;
  check(projectAnalytics.progress.taskCount === 2 && projectAnalytics.progress.percent === 50, 'Project progress was inaccurate');
  check(projectAnalytics.health === 'ON_TRACK' && projectAnalytics.overdueTasks === 0, 'Project health was inaccurate');
  const statusCounts = new Map(projectAnalytics.statusDistribution.map((item) => [item.status, item.count]));
  check(statusCounts.get('DONE') === 2 && statusCounts.get('TODO') === 1, 'Project status distribution was inaccurate');

  const dashboard = (await request(
    'dashboard analytics',
    'query($organizationId:ID!){dashboardSummary(organizationId:$organizationId){totalProjects totalTasks pendingTasks inProgressTasks completedTasks overdueTasks}}',
    { organizationId },
    admin.token,
  )).dashboardSummary;
  check(dashboard.totalProjects === 2 && dashboard.totalTasks === 3 && dashboard.pendingTasks === 2 && dashboard.completedTasks === 1, 'Dashboard root-task summary was inaccurate');

  await rejected(
    'cross-organization access denial',
    'query($id:ID!){organization(id:$id){id}}',
    { id: organizationId },
    outsider.token,
  );
  await rejected(
    'cross-organization task denial',
    'query($organizationId:ID!,$taskId:ID!){task(organizationId:$organizationId,taskId:$taskId){id}}',
    { organizationId, taskId: primaryTask.id },
    outsider.token,
  );
  await rejected(
    'cross-project project denial',
    'query($organizationId:ID!,$projectId:ID!){project(organizationId:$organizationId,projectId:$projectId){id}}',
    { organizationId, projectId: projectTwo.id },
    manager.token,
  );
  await rejected(
    'cross-project task denial',
    'query($organizationId:ID!,$taskId:ID!){task(organizationId:$organizationId,taskId:$taskId){id}}',
    { organizationId, taskId: restrictedTask.id },
    manager.token,
  );

  await request('completed task can be a blocker', addDependency, reverse, manager.token);
  await rejected('linked task cannot be deleted',
    'mutation($organizationId:ID!,$taskId:ID!){deleteTask(organizationId:$organizationId,taskId:$taskId)}',
    { organizationId, taskId: primaryTask.id }, manager.token);
  await request('unlink completed blocker', removeDependency, reverse, manager.token);
  await request(
    'task soft deletion',
    'mutation($organizationId:ID!,$taskId:ID!){deleteTask(organizationId:$organizationId,taskId:$taskId)}',
    { organizationId, taskId: primaryTask.id },
    manager.token,
  );
  await rejected(
    'deleted task direct access restriction',
    'query($organizationId:ID!,$taskId:ID!){task(organizationId:$organizationId,taskId:$taskId){id}}',
    { organizationId, taskId: primaryTask.id },
    manager.token,
  );
  await rejected('deleted task cannot become a dependency', addDependency, reverse, manager.token);
  await rejected(
    'deleted task comment access restriction',
    'query($input:TaskCommentsPaginationInput!){taskComments(input:$input){items{id}}}',
    { input: { organizationId, taskId: primaryTask.id, first: 10 } },
    manager.token,
  );
  await rejected(
    'deleted task checklist access restriction',
    'query($input:ChecklistTaskInput!){taskChecklist(input:$input){totalCount}}',
    { input: { organizationId, taskId: primaryTask.id } },
    manager.token,
  );
  const remainingTasks = (await request(
    'soft-deleted task list exclusion',
    'query($organizationId:ID!,$projectId:ID!){projectTasks(organizationId:$organizationId,projectId:$projectId){id}}',
    { organizationId, projectId: projectOne.id },
    manager.token,
  )).projectTasks;
  check(!remainingTasks.some((task) => task.id === primaryTask.id || task.id === subtask.id), 'Soft-deleted task or child remained in project results');
  const deletedActivity = (await request(
    'retained deleted task audit history',
    'query($input:TaskActivityInput!){taskActivity(input:$input){items{type}}}',
    { input: { organizationId, taskId: primaryTask.id, first: 100 } },
    manager.token,
  )).taskActivity;
  check(deletedActivity.items.some((item) => item.type === 'TASK_DELETED'), 'Deleted task audit history was not retained');
  const hiddenNotifications = (await request(
    'deleted task notification filtering',
    'query($input:NotificationsPaginationInput!){myNotifications(input:$input){items{taskId}}}',
    { input: { organizationId, first: 20 } },
    employee.token,
  )).myNotifications;
  check(!hiddenNotifications.items.some((item) => item.taskId === primaryTask.id), 'Notifications for a deleted task remained visible');

  console.log('Functional QA passed: complete workflow, analytics, notifications, soft deletion, and authorization boundaries.');
}

run().catch((error) => {
  console.error(`Functional QA failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
