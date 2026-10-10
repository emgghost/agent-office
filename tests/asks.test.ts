// Questions between workers: the floor's Asks (who gets typed what, and when), the loopback endpoint
// the asking worker waits on, and `office-workers ask` / `answer` and their MCP tools.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Asks, type AskWorkers } from '../src/server/asks.js';
import { officeAsks } from '../src/server/hooks/office-asks.js';
import type { WorkerInfo, WorkerStatus } from '../src/shared/protocol.js';
// @ts-expect-error plain JS, no types
import { handleMcp, main, parseArgs } from '../bin/office-workers.js';

const worker = (id: string, name: string, status: WorkerStatus = 'idle', kind: 'agent' | 'shell' = 'agent') => ({ id, name, status, kind, deskId: `desk-${id}` }) as WorkerInfo;

/** A floor's workers that keep what was typed to each. */
function floorOf(...ws: WorkerInfo[]) {
  const all = new Map(ws.map((w) => [w.id, w]));
  const typed: [string, string][] = [];
  const running = new Set(ws.filter((w) => w.status !== 'exited').map((w) => w.id));
  const workers: AskWorkers = {
    get: (id) => all.get(id),
    prompt: (id, text) => (running.has(id) ? void typed.push([id, text]) : 'Worker is not running'),
    resume: (id, text) => {
      running.add(id);
      typed.push([id, `(woken) ${text}`]);
      return undefined;
    },
  };
  const toasts: string[] = [];
  return { all, typed, toasts, asks: new Asks(workers, undefined, (t) => toasts.push(t)) };
}

test('a question is typed to the worker asked, and its answer goes straight back to the call waiting on it', async () => {
  const mochi = worker('m', 'Mochi');
  const bolt = worker('b', 'Bolt', 'working');
  const f = floorOf(mochi, bolt);
  const q = f.asks.ask(mochi, bolt, 'Which port does the API server listen on?');
  assert.ok(typeof q === 'object');
  assert.equal(f.typed.length, 1);
  assert.equal(f.typed[0][0], 'b');
  assert.match(f.typed[0][1], /Mochi, another worker in this office, has a question for you \(question q[0-9a-f]{6}\)/);
  assert.match(f.typed[0][1], /Which port does the API server listen on\?/);
  assert.match(f.typed[0][1], new RegExp(`answer_question tool \\(id ${q.id}\\)`));
  assert.equal(f.asks.get(q.id)?.status, 'asked');

  const waiting = f.asks.wait(q.id, 5000);
  assert.equal(f.asks.answer(q.id, mochi, '4600'), `Question ${q.id} was asked of Bolt, not you`);
  const answered = f.asks.answer(q.id, bolt, '  4600, set in config.ts  ');
  assert.ok(typeof answered === 'object');
  assert.equal((await waiting)?.answer, '4600, set in config.ts');
  // The call had it: nothing typed to Mochi.
  assert.equal(f.typed.length, 1);
  assert.equal(f.asks.answer(q.id, bolt, 'again'), `You already answered question ${q.id}`);
  assert.deepEqual(f.toasts, ['💬 Mochi asked Bolt: “Which port does the API server listen on?”', '💬 Bolt answered Mochi']);
});

test("a worker in the middle of a question of its own isn't typed another until it's free", () => {
  const mochi = worker('m', 'Mochi');
  const bolt = worker('b', 'Bolt', 'needs_input');
  const f = floorOf(mochi, bolt);
  const q = f.asks.ask(mochi, bolt, 'Did you change the schema?');
  assert.ok(typeof q === 'object');
  assert.equal(f.typed.length, 0, 'it would have answered its permission prompt');
  assert.equal(f.asks.get(q.id)?.status, 'waiting');
  f.asks.onWorker(bolt);
  assert.equal(f.typed.length, 0);
  bolt.status = 'working';
  f.asks.onWorker(bolt);
  assert.equal(f.typed.length, 1);
  f.asks.onWorker(bolt);
  assert.equal(f.typed.length, 1, 'once');
});

test('an answer after the asker stopped waiting is typed into its terminal, once it is free; a stopped asker is woken with it', async () => {
  const mochi = worker('m', 'Mochi', 'needs_input');
  const bolt = worker('b', 'Bolt');
  const f = floorOf(mochi, bolt);
  const q = f.asks.ask(mochi, bolt, 'What did you name the new table?');
  assert.ok(typeof q === 'object');
  assert.equal((await f.asks.wait(q.id, 10))?.status, 'asked', 'timed out unanswered');
  f.asks.answer(q.id, bolt, 'user_sessions');
  assert.equal(f.typed.length, 1, 'Mochi is in the middle of a question of its own');
  mochi.status = 'idle';
  f.asks.onWorker(mochi);
  assert.deepEqual(f.typed[1], ['m', `💬 Bolt answered your question ${q.id} ("What did you name the new table?"):\n\nuser_sessions`]);
  f.asks.onWorker(mochi);
  assert.equal(f.typed.length, 2);

  // An asking call cut off (a tool timeout) lets go too, so its answer still arrives.
  const sleepy = worker('s', 'Sleepy', 'exited');
  const g = floorOf(sleepy, bolt);
  const q2 = g.asks.ask(sleepy, bolt, 'Ready?');
  assert.ok(typeof q2 === 'object');
  const cut = new AbortController();
  const waited = g.asks.wait(q2.id, 60_000, cut.signal);
  cut.abort();
  assert.equal((await waited)?.status, 'asked');
  g.asks.answer(q2.id, bolt, 'Yes');
  assert.match(g.typed.at(-1)![1], /^\(woken\) 💬 Bolt answered your question/);
});

test("who can't be asked, and a worker that goes home without answering", async () => {
  const mochi = worker('m', 'Mochi');
  const bolt = worker('b', 'Bolt');
  const shell = worker('sh', 'Pip 🐚', 'idle', 'shell');
  const f = floorOf(mochi, bolt, shell);
  assert.equal(f.asks.ask(mochi, mochi, 'hm?'), "That's you: ask someone else");
  assert.equal(f.asks.ask(mochi, shell, 'hm?'), 'Pip 🐚 is a shell, not an agent');
  assert.equal(f.asks.ask(mochi, bolt, '  '), 'Say what you want to know: question');

  const waited = f.asks.ask(mochi, bolt, 'Is the migration done?');
  const later = f.asks.ask(mochi, bolt, 'And the seed data?');
  assert.ok(typeof waited === 'object' && typeof later === 'object');
  const waiting = f.asks.wait(waited.id, 5000);
  f.all.delete('b');
  f.asks.onWorkerGone('b');
  assert.equal((await waiting)?.status, 'gone');
  // Nobody was waiting for the second: Mochi is told.
  assert.match(f.typed.at(-1)![1], new RegExp(`Bolt went home without answering your question ${later.id}`));
  assert.deepEqual(f.asks.of('m').map((a) => a.status), ['gone', 'gone']);
});

test('the loopback endpoint asks, waits for the answer, and answers, each with the worker’s own token', async (t) => {
  const mochi = worker('m', 'Mochi');
  const bolt = worker('b', 'Bolt');
  const f = floorOf(mochi, bolt);
  const floor = {
    asks: f.asks,
    workers: { list: () => [...f.all.values()], authenticate: (id: string, token: string) => (token === `tok-${id}` ? f.all.get(id) : undefined) },
  };
  const ctx = { workerFloor: () => floor } as any;
  const server = http.createServer((req, res) => void officeAsks(ctx, req, res, new URL(req.url ?? '/', 'http://127.0.0.1')));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const env = (id: string) => ({ AGENT_OFFICE_HOOK_URL: base, AGENT_OFFICE_WORKER_ID: id, AGENT_OFFICE_HOOK_TOKEN: `tok-${id}` });

  assert.equal((await fetch(`${base}/office/workers/ask?worker=m`, { headers: { authorization: 'Bearer nope' } })).status, 401);

  // Bolt answers a moment after Mochi asks, from its MCP tool.
  const mcp = (id: string, name: string, args: unknown) => handleMcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, { env: env(id), fetch });
  setTimeout(() => {
    const q = f.asks.of('b')[0];
    void mcp('b', 'answer_question', { id: q.id, answer: 'Port 4600' });
  }, 50);
  const asked = await mcp('m', 'ask_worker', { worker: 'Bolt', question: 'Which port?' });
  assert.match(asked.result.content[0].text, /^Bolt answered \(question q[0-9a-f]+\):\n\nPort 4600$/);

  // From a shell, not waiting: the answer will come by terminal.
  const out: string[] = [];
  const io = { env: env('m'), out: (s: string) => out.push(s), err: () => {}, stdin: { isTTY: true } as any };
  assert.equal(await main(['ask', 'Bolt', '--wait', '0', '--question', 'Anything else?'], io), 0);
  assert.match(out[0], /^Asked Bolt \(question q[0-9a-f]+\); no answer yet/);
  assert.equal(await main(['ask', 'Nobody', '--wait', '0', '--question', 'x'], { ...io, err: () => {} }), 1);

  const listed = await mcp('b', 'list_questions', {});
  assert.match(listed.result.content[0].text, /Asked of you\nq[0-9a-f]+ {2}from Mochi · asked: “Anything else\?”/);
  assert.deepEqual(parseArgs(['answer', 'q1', '--answer', 'ok']), { cmd: 'answer', id: 'q1', answer: 'ok' });
  assert.throws(() => parseArgs(['ask']), /one worker/);
  assert.throws(() => parseArgs(['ask', 'Bolt', '--wait', 'soon']), /--wait takes seconds/);
});
