// The departments: their four desks each in the Departments hall, the hall's rooms (clear of each
// other, with the lift, and a way in and out of each through its door), the role a worker there starts
// with, and asking a department.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { DEPARTMENTS, DEPARTMENT_IDS, DEPARTMENT_SEATS, ROOM_DOOR, departmentOf, findDepartment } from '../src/shared/departments.js';
import { HALL, HALL_BOUNDS, HALL_CORRIDOR, HALL_DESKS, HALL_LIFT, HALL_LOBBY, HALL_ROOMS, inHall, isHallDesk } from '../src/shared/hall-plan.js';
import { hallKit, hallNav, hallRoomWalls, hallWayHome, hallWayIn } from '../src/shared/hall.js';
import { DESKS, DESK_BY_ID, SEATS, deskSeat } from '../src/shared/layout.js';
import { PROMPTS, PROMPT_GROUPS } from '../src/shared/prompts.js';
import { WAITING, departmentWorker, firstPrompt, freeDepartmentDesk, roleOf, withRole } from '../src/server/departments.js';
import { Asks } from '../src/server/asks.js';
import { officeAsks } from '../src/server/hooks/office-asks.js';
import type { WorkerInfo, WorkerStatus } from '../src/shared/protocol.js';
import type { PromptSource } from '../src/server/prompts.js';
// @ts-expect-error plain JS, no types
import { TOOLS, parseArgs } from '../bin/office-workers.js';

const worker = (id: string, deskId: string, status: WorkerStatus = 'idle', kind: 'agent' | 'shell' = 'agent') => ({ id, name: id[0].toUpperCase() + id.slice(1), deskId, status, kind }) as WorkerInfo;
const inRoom = (x: number, z: number, r: (typeof HALL_ROOMS)[number], m = 0) => x > r.minX - m && x < r.maxX + m && z > r.minZ - m && z < r.maxZ + m;

test('ten departments, four desks each in the Departments hall, and the office’s own desks are anyone’s', () => {
  assert.deepEqual([...DEPARTMENT_IDS].sort(), ['backend', 'content', 'design', 'devops', 'docs', 'frontend', 'po', 'qa', 'security', 'techlead']);
  assert.equal(DEPARTMENT_SEATS, 4);
  const desks = Object.values(DEPARTMENTS).flatMap((d) => [...d.desks]);
  assert.equal(new Set(desks).size, 40);
  assert.deepEqual([...desks].sort(), HALL_DESKS.map((d) => d.id).sort());
  for (const id of desks) assert.ok(DESK_BY_ID.has(id) && isHallDesk(id), id);
  assert.equal(departmentOf('hall-security-1')?.id, 'security');
  assert.equal(departmentOf('hall-techlead-4')?.name, 'Tech Lead');
  for (const d of DESKS) assert.equal(departmentOf(d.id), undefined, `${d.id} is anyone's again`);
  assert.equal(departmentOf('hall-nope-1'), undefined);
  // The hall's desks aren't seats anyone's hired at by default: only a department hires there.
  assert.ok(!SEATS.some((s) => isHallDesk(s.id)));
  for (const [said, id] of [['security', 'security'], ['Product Owner', 'po'], ['QA', 'qa'], ['ux', 'design'], ['DevOps', 'devops'], ['release', 'devops'], ['l10n', 'content'], ['Persian', 'content'], ['Technical Writer', 'docs'], ['architect', 'techlead'], ['Tech Lead', 'techlead'], ['privacy', 'security'], ['FE', 'frontend']] as const) assert.equal(findDepartment(said)?.id, id, said);
  for (const gone of ['Project Manager', 'pm', 'scrum', 'Scrum Master', 'accounting']) assert.equal(findDepartment(gone), undefined, gone);
});

test("the hall: its rooms are the departments', each with its four desks and their chairs, clear of each other, the corridor and the lobby", () => {
  assert.deepEqual(HALL_ROOMS.map((r) => r.dept).sort(), [...DEPARTMENT_IDS].sort());
  assert.ok(Math.hypot(HALL.x, HALL.z) > 500, 'out past the city');
  for (const r of HALL_ROOMS) {
    assert.ok(r.minX >= HALL_BOUNDS.minX && r.maxX <= HALL_BOUNDS.maxX && r.minZ >= HALL_BOUNDS.minZ && r.maxZ <= HALL_BOUNDS.maxZ, `${r.dept} is in the hall`);
    assert.ok(r.minX > HALL_LOBBY.maxX, `${r.dept} is past the lobby`);
    assert.ok(r.maxZ <= HALL_CORRIDOR.minZ || r.minZ >= HALL_CORRIDOR.maxZ, `${r.dept} leaves the corridor clear`);
    for (const other of HALL_ROOMS) if (other !== r) assert.ok(other.maxX <= r.minX || other.minX >= r.maxX || other.maxZ <= r.minZ || other.minZ >= r.maxZ, `${r.dept} and ${other.dept} don't overlap`);
    const mine = HALL_DESKS.filter((d) => departmentOf(d.id)?.id === r.dept);
    assert.equal(mine.length, 4);
    for (const d of mine) {
      assert.ok(inRoom(d.x, d.z, r, -1), `${d.id} is in its room`);
      const seat = deskSeat(d);
      assert.ok(inRoom(seat.x, seat.z, r, -1), `${d.id}'s chair is in its room, with room behind it`);
    }
    assert.ok(r.podX - ROOM_DOOR / 2 > r.minX + 1 && r.podX + ROOM_DOOR / 2 < r.maxX - 1);
    const kit = hallKit(r);
    assert.ok(inRoom(kit.x, kit.z, r, -kit.half), `${r.dept}'s kit is in its room`);
    for (const d of mine) assert.ok(Math.abs(kit.x - d.x) > 1.1 + kit.half || Math.abs(kit.z - d.z) > 0.55 + kit.half, `${r.dept}'s kit is clear of ${d.id}`);
  }
  assert.ok(inHall(HALL_LIFT.arrive.x, HALL_LIFT.arrive.z) && HALL_LIFT.arrive.x < HALL_LOBBY.maxX, 'you step out of the lift into the lobby');
  assert.ok(hallNav().walkable(HALL_LIFT.arrive.x, HALL_LIFT.arrive.z));
  assert.ok(!inHall(0, 0), 'the office is not the hall');
});

test('a worker at a hall desk comes in from the lift and goes home by it, through its room’s door, never the glass', () => {
  const glass = HALL_ROOMS.flatMap((r) => hallRoomWalls(r, 0.02));
  const through = (a: number[], b: number[]) => {
    for (let k = 0; k <= 40; k++) {
      const x = a[0] + ((b[0] - a[0]) * k) / 40;
      const z = a[1] + ((b[1] - a[1]) * k) / 40;
      if (glass.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1)) return true;
    }
    return false;
  };
  for (const d of HALL_DESKS) {
    const way = hallWayIn(d);
    const out = hallWayHome(d);
    assert.ok(way.length >= 3 && out.length >= 3, d.id);
    for (const w of [way, out]) for (let i = 1; i < w.length; i++) assert.ok(!through(w[i - 1], w[i]), `${d.id} keeps to the doors`);
    assert.ok(way[0][0] < HALL_LIFT.arrive.x && out[out.length - 1][0] < HALL_LIFT.arrive.x, `${d.id} comes and goes by the lift`);
    assert.ok(way.every(([x, z]) => inHall(x, z)) && out.every(([x, z]) => inHall(x, z)), `${d.id} stays in the hall`);
  }
});

test('every department has its role prompt under 🏢 Departments; the departments that went are gone', () => {
  assert.equal(PROMPT_GROUPS.departments, '🏢 Departments');
  for (const id of DEPARTMENT_IDS) {
    const p = PROMPTS[`dept.${id}`];
    assert.equal(p.group, 'departments');
    assert.ok(p.optional);
    assert.match(p.text, /department of this software company's office/);
    assert.match(p.text, /ask_worker tool with department/);
    assert.match(p.label, new RegExp(DEPARTMENTS[id].name));
  }
  for (const gone of ['dept.pm', 'dept.scrum']) assert.ok(!(gone in PROMPTS), gone);
  assert.match(PROMPTS['dept.devops'].text, /You never deploy, run anything against a live or pilot server/);
  assert.match(PROMPTS['dept.content'].text, /Persian first/);
  assert.match(PROMPTS['dept.security'].text, /privacy/);
  assert.match(PROMPTS['station.manager'].text, /- techlead \(Tech Lead\)/);
  assert.doesNotMatch(PROMPTS['station.manager'].text, /Scrum|Project Manager/);
});

test("a worker at a department's desk starts in its role, then the lessons, then its task; one hired without a task still starts in it", () => {
  const lessons = { brief: (p: string) => `LESSONS\n\n${p}` };
  const brief = firstPrompt(lessons);
  const sec = worker('sam', 'hall-security-1');
  const out = brief('Audit the login flow', sec)!;
  assert.ok(out.startsWith(PROMPTS['dept.security'].text));
  assert.ok(out.endsWith('\n\nLESSONS\n\nAudit the login flow'));
  assert.equal(brief(undefined, sec), `${PROMPTS['dept.security'].text}\n\nLESSONS\n\n${WAITING}`);
  const plain = worker('pat', 'desk-1');
  assert.equal(brief('Fix it', plain), 'LESSONS\n\nFix it');
  assert.equal(brief(undefined, plain), undefined);
  assert.equal(brief(undefined, worker('pip', 'hall-security-2', 'idle', 'shell')), undefined);
  const none: PromptSource = { text: (id) => (id === 'dept.security' ? '' : PROMPTS[id].text), agent: () => undefined };
  assert.equal(roleOf(sec, none), '');
  assert.equal(withRole(sec, 'Fix it', none), 'Fix it');
  assert.equal(firstPrompt(lessons, none)(undefined, sec), undefined);
});

test('who in a department takes a question: the readiest one there, never the one asking; and its free desks', () => {
  const qa = DEPARTMENTS.qa;
  const busy = worker('busy', 'hall-qa-1', 'working');
  const free = worker('free', 'hall-qa-2', 'idle');
  assert.equal(departmentWorker([busy, free], qa)?.id, 'free');
  assert.equal(departmentWorker([busy, free], qa, 'free')?.id, 'busy');
  assert.equal(departmentWorker([worker('asking', 'hall-qa-3', 'needs_input'), busy], DEPARTMENTS.security), undefined);
  assert.equal(departmentWorker([worker('shell', 'hall-qa-3', 'idle', 'shell')], qa), undefined);
  assert.equal(freeDepartmentDesk(qa, (id) => id === 'hall-qa-1' || id === 'hall-qa-2'), 'hall-qa-3');
  assert.equal(freeDepartmentDesk(qa, () => true), undefined);
});

test('asking a department finds someone there, or hires someone at a free desk of its in the hall for the question', async (t) => {
  const all = new Map<string, WorkerInfo>();
  const typed: [string, string][] = [];
  const spawned: { desk: string; prompt?: string }[] = [];
  const toasts: string[] = [];
  const asks = new Asks({ get: (id) => all.get(id), prompt: (id, text) => void typed.push([id, text]), resume: () => undefined }, undefined, (text) => toasts.push(text));
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

  const first = await (await ask({ department: 'security', question: 'Is the session cookie HttpOnly?' })).json();
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0].desk, 'hall-security-1');
  assert.match(spawned[0].prompt!, /Mochi, another worker in this office, has a question for you/);
  assert.equal(first.question.to, 'Hire1');
  assert.equal(first.question.status, 'asked');
  assert.ok(toasts.includes('🛡️ Mochi hired Hire1 in Security to answer a question'), toasts.join(' | '));

  const second = await (await ask({ department: 'Security', question: 'And CSRF?' })).json();
  assert.equal(second.question.to, 'Hire1');
  assert.equal(spawned.length, 1);
  all.get('hire1')!.status = 'idle';
  asks.onWorker(all.get('hire1')!);
  assert.equal(typed.at(-1)?.[0], 'hire1');

  // All four of QA's desks taken by shells: nobody to ask, and nowhere to hire.
  for (let i = 1; i <= 4; i++) all.set(`s${i}`, worker(`s${i}`, `hall-qa-${i}`, 'idle', 'shell'));
  const full = await ask({ department: 'qa', question: 'Tests green?' });
  assert.equal(full.status, 409);
  assert.match((await full.json()).error, /Nobody else in 🧪 QA can take a question/);
  assert.equal((await ask({ department: 'scrum', question: '?' })).status, 404, 'a department that went');
});

test('the command and the MCP tools take the ten departments', () => {
  assert.deepEqual(parseArgs(['ask', '--department', 'devops', '--question', 'Green?']), { cmd: 'ask', department: 'devops', json: false, question: 'Green?' });
  for (const name of ['ask_worker', 'hire_worker']) {
    const tool = TOOLS.find((x: { name: string }) => x.name === name);
    assert.deepEqual(tool.inputSchema.properties.department.enum, [...DEPARTMENT_IDS], name);
  }
});
