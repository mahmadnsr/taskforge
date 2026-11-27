import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';

const profile = mkdtempSync(join(tmpdir(), 'taskforge-browser-'));
const chrome = spawn('google-chrome', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--disable-background-networking', '--no-first-run',
  '--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE 127.0.0.1',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
try {
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  if (!existsSync(portFile)) throw new Error('Headless Chrome did not start');
  const port = Number(readFileSync(portFile, 'utf8').split('\n')[0]);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((target) => target.type === 'page');
  if (!page) throw new Error('Chrome page target is unavailable');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data.toString());
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error('Browser evaluation failed');
    return result.result.value;
  };
  const waitFor = async (expression) => {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return;
      await sleep(100);
    }
    throw new Error('Browser interaction did not reach the expected state');
  };
  await command('Page.enable');
  await command('Page.navigate', { url: 'http://127.0.0.1:8088/login' });
  await waitFor("Boolean(document.querySelector('a[href=\"/register\"]'))");
  if (!(await evaluate("getComputedStyle(document.querySelector('button[type=\"submit\"]')).cursor === 'pointer'"))) {
    throw new Error('Login submit button lacks a pointer cursor');
  }
  await evaluate("document.querySelector('a[href=\"/register\"]').click()");
  await waitFor("location.pathname === '/register' && Boolean(document.querySelector('a[href=\"/login\"]'))");
  await evaluate("document.querySelector('a[href=\"/login\"]').click()");
  await waitFor("location.pathname === '/login'");

  // Seed only isolated staging records, then exercise the actual React task UI.
  const email = `browser-${randomUUID()}@example.test`;
  const password = randomBytes(24).toString('hex');
  const graphql = async (query, variables, token) => {
    const response = await fetch('http://127.0.0.1:3300/graphql', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ query, variables }),
    });
    const result = await response.json();
    if (!response.ok || result.errors?.length) {
      const codes = (result.errors ?? []).map(error =>
        error.extensions?.code ?? 'UNKNOWN'
      );
      throw new Error(
        `Local staging browser fixture setup failed: HTTP ${response.status}; codes=${codes.join(',')}`
      );
    }
    return result.data;
  };
  await graphql('mutation($input:RegisterInput!){register(input:$input){id}}',
    { input: { name: 'Browser QA Admin', email, password, organizationName: `Browser QA ${randomUUID()}` } });
  const login = await graphql('mutation($input:LoginInput!){login(input:$input){accessToken}}', { input: { email, password } });
  const token = login.login.accessToken;
  const organizations = await graphql('query{myOrganizations{id}}', {}, token);
  const organizationId = organizations.myOrganizations[0].id;
  const project = await graphql('mutation($input:CreateProjectInput!){createProject(input:$input){id}}',
    { input: { organizationId, name: 'Browser QA Project' } }, token);
  const tasks = [];
  for (const title of ['Browser QA blocker', 'Browser QA dependent']) {
    const created = await graphql('mutation($input:CreateTaskInput!){createTask(input:$input){id}}',
      { input: { organizationId, projectId: project.createProject.id, title } }, token);
    tasks.push(created.createTask.id);
  }
  const admin = await graphql('query{me{id}}', {}, token);
  const addMember = 'mutation($organizationId:ID!,$projectId:ID!,$userId:ID!){addProjectMember(organizationId:$organizationId,projectId:$projectId,userId:$userId){id}}';
  await graphql(addMember, { organizationId, projectId: project.createProject.id, userId: admin.me.id }, token);
  await graphql('mutation($input:AssignTaskInput!){assignTask(input:$input){id}}',
    { input: { organizationId, taskId: tasks[0], assigneeId: admin.me.id } }, token);
  const employeeEmail = `browser-employee-${randomUUID()}@example.test`;
  const employeePassword = randomBytes(24).toString('hex');
  await graphql('mutation($input:InviteMemberInput!){inviteMember(input:$input){id}}',
    { input: { organizationId, email: employeeEmail, role: 'EMPLOYEE' } }, token);
  let invitationToken;
  for (let i = 0; i < 30 && !invitationToken; i++) {
    const search = new URLSearchParams({ query: `to:${employeeEmail}` });
    const message = await fetch(`http://127.0.0.1:8025/view/latest.txt?${search}`);
    if (message.ok) invitationToken = (await message.text()).match(/\/accept-invitation\?token=([a-f0-9]{64})/)?.[1];
    else await sleep(500);
  }
  if (!invitationToken) throw new Error('Local staging employee invitation did not arrive');
  const employee = await graphql('mutation($input:RegisterWithInvitationInput!){registerWithInvitation(input:$input){id}}',
    { input: { name: 'Browser QA Employee', email: employeeEmail, password: employeePassword, invitationToken } });
  const employeeLogin = await graphql('mutation($input:LoginInput!){login(input:$input){accessToken}}',
    { input: { email: employeeEmail, password: employeePassword } });
  await graphql(addMember, { organizationId, projectId: project.createProject.id, userId: employee.registerWithInvitation.id }, token);
  const fill = async (selector, value) => evaluate(`(() => {
    const field = document.querySelector(${JSON.stringify(selector)});
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await fill('#email', email);
  await fill('#password', password);
  await evaluate("document.querySelector('form').requestSubmit()");
  await waitFor("Boolean(document.querySelector('a[href=\"/tasks\"]'))");
  await evaluate("document.querySelector('a[href=\"/tasks\"]').click()");
  await waitFor("location.pathname === '/tasks' && [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Details')");
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Details').click()");
  await waitFor("Boolean(document.querySelector('select[aria-label=\"Blocking task\"] option[value]:not([value=\"\"])'))");
  await evaluate(`(() => {
    const select = document.querySelector('select[aria-label="Blocking task"]');
    select.value = select.querySelector('option[value]:not([value=""])').value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor("![...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Add dependency').disabled");
  await evaluate("[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Add dependency').click()");
  await waitFor("Boolean(document.querySelector('section[aria-label=\"Dependencies\"]')?.textContent.includes('Blocking'))");
  await evaluate("[...document.querySelector('section[aria-label=\"Dependencies\"]').querySelectorAll('button')].find(button => button.textContent.trim() === 'Remove').click()");
  await waitFor("document.querySelector('section[aria-label=\"Dependencies\"]')?.textContent.includes('No dependencies yet.')");
  await graphql('mutation($input:CreateTaskCommentInput!){createTaskComment(input:$input){id}}',
    { input: { organizationId, taskId: tasks[0], content: 'Browser QA notification' } }, employeeLogin.login.accessToken);
  await waitFor("Boolean(document.querySelector('[aria-label=\"New notifications\"]'))");
  await evaluate("document.querySelector('a[aria-label=\"New notifications\"]').click()");
  await waitFor("location.pathname === '/inbox' && document.body.textContent.includes('New comment on task')");
  console.log('Browser smoke passed: Chrome login, dependency add/remove, and live comment notification indicator without refresh.');
} finally {
  socket?.close();
  if (chrome.exitCode === null) {
    const exited = new Promise((resolve) => chrome.once('exit', resolve));
    chrome.kill('SIGTERM');
    await Promise.race([exited, sleep(2000)]);
    if (chrome.exitCode === null) chrome.kill('SIGKILL');
  }
  rmSync(profile, { recursive: true, force: true });
}
