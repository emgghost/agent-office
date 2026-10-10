// A floor's lessons: the store that keeps them, the first prompt every new worker gets with them, the
// loopback endpoint workers record them on, and `office-workers lesson` and its MCP tools.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Lessons } from '../src/server/lessons.js';
import { officeLessons } from '../src/server/hooks/office-lessons.js';
import { LESSON_MAX, MAX_LESSONS, cleanLesson, sameLesson, type LessonsState } from '../src/shared/lessons.js';
import { PROMPTS } from '../src/shared/prompts.js';
import { WorkerManager, type WorkerEvents } from '../src/server/workers.js';
import { Ledger } from '../src/server/usage.js';
import type { Pty, SpawnOpts } from '../src/server/ptys.js';
import type { PromptSource } from '../src/server/prompts.js';
// @ts-expect-error plain JS, no types
import { handleMcp, main, parseArgs } from '../bin/office-workers.js';

function tmp(t: test.TestContext): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'office-lessons-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('a lesson is one tidy line, and the same rule twice is one rule', () => {
  assert.deepEqual(cleanLesson('  - Run   the tests\nbefore a PR  '), { text: 'Run the tests before a PR' });
  assert.deepEqual(cleanLesson('• Use pnpm'), { text: 'Use pnpm' });
  assert.ok('error' in cleanLesson('   '));
  assert.ok('error' in cleanLesson(42));
  assert.ok('error' in cleanLesson('x'.repeat(LESSON_MAX + 1)));
  assert.ok(sameLesson('Run the tests first.', 'run THE tests  first'));
  assert.ok(!sameLesson('Run the tests first', 'Run the linter first'));
  // Persian rules are rules too.
  assert.deepEqual(cleanLesson('همیشه تست بنویس'), { text: 'همیشه تست بنویس' });
  assert.ok(sameLesson('همیشه تست بنویس.', 'همیشه  تست بنویس'));
});

test('the store adds, rewords and takes off lessons, says so each time, and keeps them through a restart', (t) => {
  const dir = tmp(t);
  const heard: LessonsState[] = [];
  const lessons = new Lessons(dir, (s) => heard.push(s));
  const a = lessons.add('Run npm test before opening a PR', 'Ada');
  assert.ok('lesson' in a && !a.known);
  const b = lessons.add('Never edit src/api by hand', 'Mochi', true);
  assert.ok('lesson' in b && b.lesson.worker === true);
  // Said again, it's the one already there, and nothing changes.
  const again = lessons.add('run npm test before opening a PR.', 'Bolt', true);
  assert.ok('lesson' in again && again.known && again.lesson.id === a.lesson.id);
  assert.equal(heard.length, 2);

  assert.equal(lessons.edit(a.lesson.id, 'Run npm test and npm run typecheck before opening a PR'), undefined);
  assert.equal(lessons.edit(a.lesson.id, 'Never edit src/api by hand'), 'Another lesson already says that');
  assert.equal(lessons.edit('nope', 'x'), 'Someone already took that lesson off');
  assert.ok(lessons.edit(b.lesson.id, ' ')?.length);
  assert.ok(lessons.state().items[0].editedAt);

  assert.equal(lessons.remove(b.lesson.id)?.text, 'Never edit src/api by hand');
  assert.equal(lessons.remove(b.lesson.id), undefined);
  assert.equal(heard.length, 4);
  // What the browser gets is a copy: changing it changes nothing kept.
  heard.at(-1)!.items[0].text = 'tampered';

  const back = new Lessons(dir, () => {});
  assert.deepEqual(back.state().items.map((l) => [l.text, l.by]), [['Run npm test and npm run typecheck before opening a PR', 'Ada']]);
  assert.deepEqual(readFileSync(path.join(dir, 'lessons.json'), 'utf8').includes('tampered'), false);
});

test('a floor has only so many lessons, and a broken or tampered file is no lessons', (t) => {
  const dir = tmp(t);
  const lessons = new Lessons(dir, () => {});
  for (let i = 0; i < MAX_LESSONS; i++) assert.ok('lesson' in lessons.add(`Rule number ${i}`, 'Ada'));
  const over = lessons.add('One rule too many', 'Ada');
  assert.ok('error' in over && /take one off/.test(over.error));

  writeFileSync(path.join(dir, 'lessons.json'), '{not json');
  assert.deepEqual(new Lessons(dir, () => {}).state(), { items: [] });
  writeFileSync(path.join(dir, 'lessons.json'), JSON.stringify([{ id: 'a', text: 'Keep it', by: 'Ada', at: 5 }, { id: 'b', text: '' }, { text: 'no id' }, { id: 'c', text: 'x'.repeat(LESSON_MAX + 1) }, null]));
  assert.deepEqual(new Lessons(dir, () => {}).state(), { items: [{ id: 'a', text: 'Keep it', by: 'Ada', at: 5 }] });
});

test("a new worker's first prompt has the floor's lessons ahead of its task, as the office words it", (t) => {
  const lessons = new Lessons(tmp(t), () => {});
  assert.equal(lessons.brief('Fix the login bug'), 'Fix the login bug', 'no lessons, nothing added');
  lessons.add('Run npm test before opening a PR', 'Ada');
  lessons.add('Use pnpm, never npm install', 'Mochi', true);
  const brief = lessons.brief('Fix the login bug');
  assert.ok(brief.startsWith(PROMPTS['worker.lessons'].text.split('\n')[0]));
  assert.match(brief, /^- Run npm test before opening a PR\n- Use pnpm, never npm install$/m);
  assert.match(brief, /office-workers lesson add/);
  assert.ok(brief.endsWith('Your task:\n\nFix the login bug'));

  const source = (text: string): PromptSource => ({ text: (id) => (id === 'worker.lessons' ? text : PROMPTS[id].text), agent: () => undefined });
  assert.equal(lessons.brief('Fix it', source('House rules:\n{{lessons}}')), 'House rules:\n- Run npm test before opening a PR\n- Use pnpm, never npm install\n\nFix it');
  // Emptied in ⚙️ Settings: workers aren't told.
  assert.equal(lessons.brief('Fix it', source('')), 'Fix it');
});

test('the worker manager sends a hired agent its brief with its first task, and nothing else changes', (t) => {
  const root = tmp(t);
  const file = path.join(root, 'pi');
  writeFileSync(file, '#!/bin/sh\n', { mode: 0o700 });
  const data = path.join(root, 'data');
  mkdirSync(data);
  const launches: SpawnOpts[] = [];
  const events: WorkerEvents = { update() {}, remove() {}, data() {}, screen() {}, toast() {} };
  const workers = new WorkerManager(root, data, file, [], { url: 'http://127.0.0.1:1', token: '' }, events, new Ledger(data, { pauseHiring: false }, () => {}, () => {}));
  t.after(() => workers.shutdown());
  (workers as unknown as { host: { spawn(opts: SpawnOpts): Pty } }).host = {
    spawn(opts: SpawnOpts) {
      launches.push(opts);
      return { pid: 1, write() {}, resize() {}, kill() {}, onData() {}, onExit() {} };
    },
    stop() {},
    detach() {},
  } as any;
  const briefed: (string | undefined)[] = [];
  workers.brief = (prompt) => (briefed.push(prompt), prompt && `LESSONS\n\n${prompt}`);

  const hired = workers.spawn('desk-1', 'Ada', 'Fix login', false, 'agent', 'pi');
  assert.ok(typeof hired === 'object');
  assert.equal(launches[0].args.at(-1), 'LESSONS\n\nFix login');
  // The card, the task and its name are still the task alone.
  assert.equal(hired.prompt, 'Fix login');

  const idle = workers.spawn('desk-2', 'Ada', undefined, false, 'agent', 'pi');
  assert.ok(typeof idle === 'object');
  // Hired without a task, the floor still gets a say (a department's worker starts in its role), here none.
  assert.deepEqual(briefed, ['Fix login', undefined]);
  assert.ok(!launches[1].args.some((a) => a.includes('LESSONS')), 'hired without a task: nothing to put it ahead of');
});

/** The loopback endpoint, with one worker on one floor whose token is `good`. */
async function endpoint(t: test.TestContext) {
  const lessons = new Lessons(tmp(t), () => {});
  const toasts: string[] = [];
  const floor = { lessons, workers: { authenticate: (id: string, token: string) => (id === 'w1' && token === 'good' ? { id, name: 'Mochi' } : undefined) } };
  const ctx = { workerFloor: (id: string) => (id === 'w1' ? floor : undefined), toastFloor: (_f: unknown, text: string) => toasts.push(text) } as any;
  const server = http.createServer((req, res) => void officeLessons(ctx, req, res, new URL(req.url ?? '/', 'http://127.0.0.1')));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/office/lessons`;
  const call = (method: string, body?: unknown, token = 'good', worker = 'w1') =>
    fetch(`${base}?worker=${worker}`, { method, headers: { authorization: `Bearer ${token}` }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
  return { lessons, toasts, call, base };
}

test('a worker records a lesson on the loopback endpoint with its own token, and only adds', async (t) => {
  const { lessons, toasts, call } = await endpoint(t);
  assert.equal((await call('GET', undefined, 'bad')).status, 401);
  assert.equal((await call('GET', undefined, 'good', 'w2')).status, 401);
  assert.deepEqual(await (await call('GET')).json(), { lessons: [] });

  const r = await call('POST', { text: 'Always add a test with a fix' });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.known, false);
  assert.deepEqual(body.lessons.map((l: { text: string; by: string }) => [l.text, l.by]), [['Always add a test with a fix', 'Mochi']]);
  assert.equal(lessons.state().items[0].worker, true);
  assert.deepEqual(toasts, ['🎓 Mochi learned: “Always add a test with a fix”']);

  // Again: nothing new, no toast.
  assert.equal((await (await call('POST', { text: 'always add a test with a fix.' })).json()).known, true);
  assert.equal(toasts.length, 1);
  assert.equal((await call('POST', { text: '' })).status, 400);
  assert.equal((await call('POST', 'not json')).status, 400);
  // Taking one off is for people.
  assert.equal((await call('DELETE')).status, 405);
  assert.equal(lessons.state().items.length, 1);
});

test('office-workers lesson lists and records them, from a shell and as MCP tools', async (t) => {
  const { call, base } = await endpoint(t);
  await call('POST', { text: 'Use pnpm' });
  const env = { AGENT_OFFICE_HOOK_URL: base.replace('/office/lessons', ''), AGENT_OFFICE_WORKER_ID: 'w1', AGENT_OFFICE_HOOK_TOKEN: 'good' };
  const io = (out: string[], err: string[] = []) => ({ env, out: (s: string) => out.push(s), err: (s: string) => err.push(s), stdin: { isTTY: true } as any });

  assert.deepEqual(parseArgs(['lesson']), { cmd: 'lessons', json: false });
  assert.deepEqual(parseArgs(['lessons', '--json']), { cmd: 'lessons', json: true });
  assert.deepEqual(parseArgs(['lesson', 'add', 'Run', 'the', 'tests']), { cmd: 'learn', text: 'Run the tests', json: false });
  assert.throws(() => parseArgs(['lesson', 'remove', 'x']), /for people/);

  const listed: string[] = [];
  assert.equal(await main(['lesson'], io(listed)), 0);
  assert.deepEqual(listed, ['- Use pnpm (Mochi)']);
  const added: string[] = [];
  assert.equal(await main(['lesson', 'add', 'Run the tests first'], io(added)), 0);
  assert.match(added[0], /^Recorded: “Run the tests first”/);
  const err: string[] = [];
  assert.equal(await main(['lesson', 'add'], io([], err)), 2, 'nothing to record');

  const mcp = (name: string, args: unknown = {}) => handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, { env, fetch });
  assert.equal((await mcp('list_lessons')).result.content[0].text, '- Use pnpm (Mochi)\n- Run the tests first (Mochi)');
  assert.match((await mcp('record_lesson', { text: 'use PNPM' })).result.content[0].text, /already has that lesson/);
  const init = await handleMcp({ jsonrpc: '2.0', id: 2, method: 'initialize', params: {} }, { env, fetch });
  assert.match(init.result.instructions, /record_lesson/);
});
