// The departments: which desks are whose, their rooms round them (clear of everything else, with a way
// in and out through the door), the role a worker there starts with, and asking a department.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { DEPARTMENTS, DEPARTMENT_IDS, ROOMS, ROOM_DOOR, departmentOf, findDepartment, roomDoor, roomKit, roomWalls } from '../src/shared/departments.js';
import { BEANBAGS, DESKS, SPAWN, STATIONS, WHITEBOARD, deskSeat, plantsAt } from '../src/shared/layout.js';
import { route, walkable, wayHome, wayIn } from '../src/shared/nav.js';
import { PROMPTS, PROMPT_GROUPS } from '../src/shared/prompts.js';
import { WAITING, departmentWorker, firstPrompt, freeDepartmentDesk, roleOf, withRole } from '../src/server/departments.js';
import { Asks } from '../src/server/asks.js';
import { officeAsks } from '../src/server/hooks/office-asks.js';
import type { WorkerInfo, WorkerStatus } from '../src/shared/protocol.js';
import type { PromptSource } from '../src/server/prompts.js';
// @ts-expect-error plain JS, no types
import { TOOLS, parseArgs } from '../bin/office-workers.js';

const worker = (id: string, deskId: string, status: WorkerStatus = 'idle', kind: 'agent' | 'shell' = 'agent') => ({ id, name: id[0].toUpperCase() + id.slice(1), deskId, status, kind }) as WorkerInfo;
const inRoom = (x: number, z: number, r: (typeof ROOMS)[number], m = 0) => x > r.minX - m && x < r.maxX + m && z > r.minZ - m && z < r.maxZ + m;

test('the eight departments have the sixteen desks between them, two each', () => {
  assert.equal(DEPARTMENT_IDS.length, 8);
  const desks = Object.values(DEPARTMENTS).flatMap((d) => [...d.desks]);
  assert.deepEqual([...desks].sort(), DESKS.map((d) => d.id).sort());
  assert.equal(departmentOf('desk-1')?.id, 'security');
  assert.equal(departmentOf('desk-16')?.id, 'scrum');
  assert.equal(departmentOf('desk-17'), undefined, 'the back office is everyone’s');
  assert.equal(departmentOf('station-queue'), undefined);
  for (const [said, id] of [['security', 'security'], ['Product Owner', 'po'], ['QA', 'qa'], ['ux', 'design'], ['Scrum Master', 'scrum'], ['backend', 'backend'], ['FE', 'frontend']] as const) assert.equal(findDepartment(said)?.id, id, said);
  assert.equal(findDepartment('accounting'), undefined);
});

test('each room is round its own two desks and their chairs, its door behind them, and keeps clear of everything else', () => {
  for (const r of ROOMS) {
    for (const id of r.dept.desks) {
      const d = DESKS.find((x) => x.id === id)!;
      assert.ok(inRoom(d.x, d.z, r), `${id} is in ${r.dept.name}'s room`);
      const seat = deskSeat(d);
      assert.ok(inRoom(seat.x, seat.z, r), `${id}'s chair is in the room`);
      // Room to walk up behind the chair before the door's wall.
      assert.ok(Math.abs(r.doorZ - seat.z) > 1.4, `${id} has room behind its chair`);
    }
    const door = roomDoor(r);
    assert.ok(door.x - ROOM_DOOR / 2 > r.minX + 1 && door.x + ROOM_DOOR / 2 < r.maxX - 1);
    for (const other of ROOMS) if (other !== r) assert.ok(other.maxX <= r.minX || other.minX >= r.maxX || other.maxZ <= r.minZ || other.minZ >= r.maxZ, `${r.dept.name} and ${other.dept.name} don't overlap`);
    const things: [string, number, number][] = [
      ...BEANBAGS.map((b): [string, number, number] => [b.id, b.x, b.z]),
      ...STATIONS.map((s): [string, number, number] => [s.id, s.x, s.z]),
      ...plantsAt(0).map(([x, z], i): [string, number, number] => [`plant ${i}`, x, z]),
      ['the spawn', SPAWN.x, SPAWN.z],
      ['the whiteboard', WHITEBOARD.x - 2, WHITEBOARD.z],
    ];
    for (const [what, x, z] of things) assert.ok(!inRoom(x, z, r, 0.4), `${what} stands clear of ${r.dept.name}'s room`);
    const kit = roomKit(r);
    assert.ok(inRoom(kit.x, kit.z, r, -kit.half), `${r.dept.name}'s kit is inside its room`);
    for (const id of r.dept.desks) {
      const d = DESKS.find((x) => x.id === id)!;
      assert.ok(Math.abs(kit.x - d.x) > 1.1 + kit.half, `${r.dept.name}'s kit is clear of ${id}`);
    }
  }
});

test('a worker walks in and out of its room through the door, never the glass', () => {
  const crossesGlass = (a: number[], b: number[]) =>
    ROOMS.some((r) =>
      roomWalls(r, 0.02).some(([x0, x1, z0, z1]) => {
        for (let k = 0; k <= 40; k++) {
          const x = a[0] + ((b[0] - a[0]) * k) / 40;
          const z = a[1] + ((b[1] - a[1]) * k) / 40;
          if (x > x0 && x < x1 && z > z0 && z < z1) return true;
        }
        return false;
      }),
    );
  for (const d of DESKS) {
    for (const way of [wayHome(d), wayIn(d)]) for (let i = 1; i < way.length; i++) assert.ok(!crossesGlass(way[i - 1], way[i]), `${d.id} keeps to the door`);
  }
  // The walkway between the two rows of rooms is open floor.
  for (const x of [-12, -9, -1.5]) assert.ok(walkable(x, 0), `open at (${x}, 0)`);
  assert.ok(route([-12, 0], [0, 0]).length >= 2);
});

test('every department has a role prompt, under 🏢 Departments in Settings, telling it how to ask the others', () => {
  assert.equal(PROMPT_GROUPS.departments, '🏢 Departments');
  for (const id of DEPARTMENT_IDS) {
    const p = PROMPTS[`dept.${id}`];
    assert.equal(p.group, 'departments');
    assert.ok(p.optional);
    assert.match(p.text, new RegExp(`department of this software company's office`));
    assert.match(p.text, /ask_worker tool with department/);
    assert.match(p.label, new RegExp(DEPARTMENTS[id].name));
  }
});

test("a worker at a department's desk starts in its role, then the lessons, then its task; one hired without a task still starts in it", () => {
  const lessons = { brief: (p: string) => `LESSONS\n\n${p}` };
  const brief = firstPrompt(lessons);
  const sec = worker('sam', 'desk-1');
  const out = brief('Audit the login flow', sec)!;
  assert.ok(out.startsWith(PROMPTS['dept.security'].text));
  assert.ok(out.endsWith('\n\nLESSONS\n\nAudit the login flow'));
  assert.equal(brief(undefined, sec), `${PROMPTS['dept.security'].text}\n\nLESSONS\n\n${WAITING}`);
  // Elsewhere: no role, and nothing at all without a task.
  const plain = worker('pat', 'desk-17');
  assert.equal(brief('Fix it', plain), 'LESSONS\n\nFix it');
  assert.equal(brief(undefined, plain), undefined);
  // A shell at a department's desk is just a shell.
  assert.equal(brief(undefined, worker('pip', 'desk-1', 'idle', 'shell')), undefined);
  // A role emptied in ⚙️ Settings: like any other desk.
  const none: PromptSource = { text: (id) => (id === 'dept.security' ? '' : PROMPTS[id].text), agent: () => undefined };
  assert.equal(roleOf(sec, none), '');
  assert.equal(withRole(sec, 'Fix it', none), 'Fix it');
  assert.equal(firstPrompt(lessons, none)(undefined, sec), undefined);
});

test('who in a department takes a question: the readiest one there, never the one asking', () => {
  const qa = DEPARTMENTS.qa;
  const busy = worker('busy', 'desk-3', 'working');
  const free = worker('free', 'desk-4', 'idle');
  assert.equal(departmentWorker([busy, free], qa)?.id, 'free');
  assert.equal(departmentWorker([busy, free], qa, 'free')?.id, 'busy');
  assert.equal(departmentWorker([worker('asking', 'desk-3', 'needs_input'), busy], DEPARTMENTS.security), undefined);
  assert.equal(departmentWorker([worker('shell', 'desk-3', 'idle', 'shell')], qa), undefined);
  assert.equal(freeDepartmentDesk(qa, (id) => id === 'desk-3'), 'desk-4');
  assert.equal(freeDepartmentDesk(qa, () => true), undefined);
});

test('asking a department finds someone there, or hires someone at a free desk of its for the question', async (t) => {
  const all = new Map<string, WorkerInfo>();
  const typed: [string, string][] = [];
  const spawned: { desk: string; prompt?: string }[] = [];
  const toasts: string[] = [];
  const asks = new Asks(
    { get: (id) => all.get(id), prompt: (id, text) => void typed.push([id, text]), resume: () => undefined },
    undefined,
    (text) => toasts.push(text),
  );
  const me = worker('mochi', 'desk-17');
  all.set(me.id, me);
  const floor = {
    asks,
    workers: {
      list: () => [...all.values()],
      authenticate: (id: string, token: string) => (token === 'tok' ? all.get(id) : undefined),
      deskOccupied: (desk: string) => [...all.values()].some((w) => w.deskId === desk),
      ownerOf: () => undefined,
      spawn(desk: string, _by: string, prompt?: string) {
        spawned.push({ desk, prompt });
        const w = { ...worker(`hire${spawned.length}`, desk, 'starting'), name: `Hire${spawned.length}` };
        all.set(w.id, w);
        return w;
      },
    },
  };
  const ctx = { workerFloor: () => floor, toastFloor: (_f: unknown, text: string) => toasts.push(text) } as any;
  const server = http.createServer((req, res) => void officeAsks(ctx, req, res, new URL(req.url ?? '/', 'http://127.0.0.1')));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/office/workers/ask?worker=mochi`;
  const ask = (body: unknown) => fetch(base, { method: 'POST', headers: { authorization: 'Bearer tok' }, body: JSON.stringify({ wait: 0, ...(body as object) }) });

  // Nobody in Security: someone's hired at its first desk, with the question as its first task.
  const first = await (await ask({ department: 'security', question: 'Is the session cookie HttpOnly?' })).json();
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].desk, 'desk-1');
  assert.match(spawned[0].prompt!, /Mochi, another worker in this office, has a question for you/);
  assert.match(spawned[0].prompt!, /Is the session cookie HttpOnly\?/);
  assert.equal(first.question.to, 'Hire1');
  assert.equal(first.question.status, 'asked');
  assert.ok(toasts.includes('🛡️ Mochi hired Hire1 in Security to answer a question'), toasts.join(' | '));

  // Now it's there: the next question goes to it, typed once it's up, and nobody else is hired.
  const second = await (await ask({ department: 'Security', question: 'And CSRF?' })).json();
  assert.equal(second.question.to, 'Hire1');
  assert.equal(spawned.length, 1);
  all.get('hire1')!.status = 'idle';
  asks.onWorker(all.get('hire1')!);
  assert.equal(typed.at(-1)?.[0], 'hire1');

  // Both desks taken by shells: nobody to ask, and nowhere to hire.
  all.set('s1', worker('s1', 'desk-3', 'idle', 'shell'));
  all.set('s2', worker('s2', 'desk-4', 'idle', 'shell'));
  const full = await ask({ department: 'qa', question: 'Tests green?' });
  assert.equal(full.status, 409);
  assert.match((await full.json()).error, /Nobody else in 🧪 QA can take a question/);
  assert.equal((await ask({ department: 'accounting', question: '?' })).status, 404);
});

test('the command and the MCP tool ask a department too', () => {
  assert.deepEqual(parseArgs(['ask', '--department', 'qa', '--question', 'Green?']), { cmd: 'ask', department: 'qa', json: false, question: 'Green?' });
  assert.throws(() => parseArgs(['ask', 'Bolt', '--department', 'qa']), /one worker/);
  const tool = TOOLS.find((x: { name: string }) => x.name === 'ask_worker');
  assert.deepEqual(tool.inputSchema.properties.department.enum, [...DEPARTMENT_IDS]);
  assert.deepEqual(tool.inputSchema.required, ['question']);
});
