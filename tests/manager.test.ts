// The Manager: its desk in the office (and on maps that don't give it one), its brief, hiring in a
// department, and the reports it gets about the workers it hired.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DESK_BY_ID, STATIONS, STATION_AGENT, deskSeat } from '../src/shared/layout.js';
import { MANAGER_BOOTH, ROOMS, ROOM_DOOR, boothWalls } from '../src/shared/departments.js';
import { kioskCollider } from '../src/client/world/office/kiosk.js';
import { FLOOR, LOFT, MEETING_ROOM, SPAWN, STAIRS, plantsAt } from '../src/shared/layout.js';
import { route, walkable } from '../src/shared/nav.js';
import { planOf } from '../src/shared/maps/index.js';
import { PROMPTS } from '../src/shared/prompts.js';
import { MANAGER_DESK, ManagerReports, hiredVia } from '../src/server/manager.js';
import { readHireRequest } from '../src/server/office-workers.js';
import type { WorkerInfo, WorkerStatus } from '../src/shared/protocol.js';
// @ts-expect-error plain JS, no types
import { TOOLS, parseArgs } from '../bin/office-workers.js';

const worker = (id: string, deskId: string, status: WorkerStatus = 'working', extra: Partial<WorkerInfo> = {}) => ({ id, name: id[0].toUpperCase() + id.slice(1), deskId, status, kind: 'agent', ...extra }) as WorkerInfo;

test("the Manager has a desk of its own in the office, out in the open, with room to walk up to it", () => {
  const desk = DESK_BY_ID.get(MANAGER_DESK)!;
  assert.equal(desk.station, 'manager');
  assert.deepEqual(STATION_AGENT.manager, { name: 'Manager', color: '#ffb703' });
  assert.equal(STATIONS.filter((s) => s.station === 'manager').length, 1);
  for (const r of ROOMS) assert.ok(desk.x < r.minX - 1 || desk.x > r.maxX + 1 || desk.z < r.minZ - 1 || desk.z > r.maxZ + 1, `clear of ${r.dept.name}'s room`);
  // Where you stand to talk to it, in front of the kiosk, and where it stands, behind it.
  const front = { x: desk.x - Math.sin(desk.rotY) * 0.9, z: desk.z - Math.cos(desk.rotY) * 0.9 };
  assert.ok(walkable(front.x, front.z), 'open floor in front of it');
  assert.ok(route([0, 0], [front.x, front.z]).length >= 2, 'you can walk up to it');
  const stands = deskSeat(desk, 0.55);
  assert.ok(stands.z > desk.z, 'it stands on the far side, facing into the room');
});

test("a map that doesn't say where the Manager stands puts it beside the Queue agent; one that does, there", () => {
  for (const id of ['castle', 'station']) {
    const plan = planOf(id);
    const queue = plan.stations.find((s) => s.station === 'queue')!;
    const boss = plan.stations.find((s) => s.station === 'manager');
    assert.ok(boss, `${id} has the Manager's lectern`);
    assert.equal(boss!.id, 'station-manager');
    const apart = Math.hypot(boss!.x - queue.x, boss!.z - queue.z);
    assert.ok(apart > 1.2 && apart < 2.5, `${id}: beside the Queue agent (${apart.toFixed(2)} m)`);
    assert.equal(boss!.rotY, queue.rotY);
  }
});

test("the Manager's brief: it runs the departments for its employer, and doesn't do the work itself", () => {
  const brief = PROMPTS['station.manager'].text;
  assert.match(brief, /^You're the Manager of this software company's office/);
  assert.match(brief, /you're the only one they talk to/);
  assert.match(brief, /You don't do the work yourself/);
  for (const d of ['security', 'qa', 'backend', 'frontend', 'po', 'pm', 'design', 'scrum']) assert.match(brief, new RegExp(`- ${d}`));
  assert.match(brief, /hire_worker with department/);
  assert.match(brief, /📣 report/);
  assert.match(brief, /permission prompt is waiting for your employer/);
  assert.ok(brief.endsWith('The request:'));
  assert.equal(PROMPTS['station.manager'].group, 'stations');
  assert.deepEqual(PROMPTS['manager.report'].needs, ['reports']);
});

test('a worker can be hired in a department, which picks the desk; not both', () => {
  const ok = readHireRequest({ prompt: 'Write the stories', department: 'Product Owner' }, ['claude']);
  assert.ok(typeof ok === 'object' && ok.department === 'po');
  assert.match(readHireRequest({ prompt: 'x', department: 'accounting' }, ['claude']) as string, /department is one of security, qa/);
  assert.equal(readHireRequest({ prompt: 'x', department: 'qa', desk: 'desk-3' }, ['claude']), 'Give desk or department, not both');
  assert.deepEqual(parseArgs(['hire', '--department', 'qa', '--prompt', 'Test it']), { cmd: 'hire', json: false, prompt: 'Test it', department: 'qa' });
  const hire = TOOLS.find((x: { name: string }) => x.name === 'hire_worker');
  assert.ok(hire.inputSchema.properties.department.enum.includes('security'));
  // What the Manager hires is its own; anyone else's isn't.
  assert.equal(hiredVia(worker('boss', MANAGER_DESK)), 'manager');
  assert.equal(hiredVia(worker('mochi', 'desk-17')), undefined);
  assert.equal(hiredVia(worker('q', 'station-queue')), undefined);
});

/** A floor's workers, with the Manager among them, that keep what was typed to whom. */
function floor(...ws: WorkerInfo[]) {
  const all = new Map(ws.map((w) => [w.id, w]));
  const typed: [string, string][] = [];
  const reports = new ManagerReports(
    {
      list: () => [...all.values()],
      prompt: (id, text) => (all.get(id)?.status === 'exited' ? 'Worker is not running' : void typed.push([id, text])),
      resume: (id, text) => void typed.push([id, `(woken) ${text}`]),
    },
    undefined,
    (w) => (w.id === 'bolt' ? 'PR #12 is open' : undefined),
    0,
  );
  const tick = () => new Promise((r) => setTimeout(r, 5));
  return { all, typed, reports, tick };
}

test("the Manager hears when one of its workers finishes or needs a person, in one report, once it's free to take it", async () => {
  const boss = worker('boss', MANAGER_DESK, 'idle');
  const bolt = worker('bolt', 'desk-5', 'working', { via: 'manager', task: { name: 'Reset Endpoint', summary: 'Adding the password reset API' } });
  const pip = worker('pip', 'desk-3', 'working', { via: 'manager', prompt: 'Test the reset flow' });
  const other = worker('ada', 'desk-17', 'working');
  const f = floor(boss, bolt, pip, other);
  for (const w of [boss, bolt, pip, other]) f.reports.onWorker(w);
  await f.tick();
  assert.equal(f.typed.length, 0, 'nothing worth telling yet');

  bolt.status = 'done';
  pip.status = 'needs_input';
  pip.question = 'Bash: npm test';
  other.status = 'done';
  for (const w of [bolt, pip, other]) f.reports.onWorker(w);
  await f.tick();
  assert.equal(f.typed.length, 1, 'one report for both');
  const [to, text] = f.typed[0];
  assert.equal(to, 'boss');
  assert.match(text, /^📣 Report from the office about the workers you hired:/);
  assert.match(text, /- Bolt \(⚙️ Backend\) finished its turn\. Its task: Reset Endpoint: Adding the password reset API\. PR #12 is open\./);
  assert.match(text, /- Pip \(🧪 QA\) is waiting on a person: .*only your employer can answer it/);
  assert.doesNotMatch(text, /Ada/, "not about a worker someone else hired");

  // The same news twice is news once.
  f.reports.onWorker(bolt);
  await f.tick();
  assert.equal(f.typed.length, 1);
});

test('a Manager in the middle of a question of its own hears later; a stopped one is woken with it; none, and it goes unsaid', async () => {
  const boss = worker('boss', MANAGER_DESK, 'needs_input');
  const bolt = worker('bolt', 'desk-5', 'working', { via: 'manager' });
  const f = floor(boss, bolt);
  f.reports.onWorker(boss);
  f.reports.onWorker(bolt);
  bolt.status = 'done';
  f.reports.onWorker(bolt);
  await f.tick();
  assert.equal(f.typed.length, 0, "it would answer the Manager's own prompt");
  boss.status = 'working';
  f.reports.onWorker(boss);
  await f.tick();
  assert.equal(f.typed.length, 1);

  boss.status = 'exited';
  f.reports.onWorker(boss);
  bolt.status = 'working';
  f.reports.onWorker(bolt);
  bolt.status = 'exited';
  f.reports.onWorker(bolt);
  await f.tick();
  assert.match(f.typed.at(-1)![1], /^\(woken\) 📣 Report[\s\S]*Bolt \(⚙️ Backend\) stopped: it needs waking up/);

  // The Manager sent home: nobody to tell.
  f.all.delete('boss');
  f.reports.onWorkerGone('boss');
  bolt.status = 'done';
  f.reports.onWorker(bolt);
  await f.tick();
  assert.equal(f.typed.length, 2);
});

test("only the board agents' kiosks by the north wall block the floor back to it; the Manager's is just the kiosk", () => {
  for (const def of STATIONS) {
    const c = kioskCollider(def);
    if (def.station === 'manager') {
      // It used to run all the way back to the north wall: an invisible wall across the room.
      assert.ok(c.minZ > def.z - 0.5 && c.maxZ < def.z + 1.2, `the Manager's is ${c.minZ.toFixed(2)}..${c.maxZ.toFixed(2)}`);
      assert.ok(c.maxX - c.minX < 1);
    } else assert.equal(c.minZ, FLOOR.minZ, `${def.id} goes back to the wall`);
  }
  // Walking past in front of the booth, from one side of the room to the other, is open floor.
  for (const x of [2, 4, 5.5, 7, 8.5]) assert.ok(walkable(x, MANAGER_BOOTH.minZ - 0.7), `open at (${x}, ${(MANAGER_BOOTH.minZ - 0.7).toFixed(1)})`);
});

test("the Manager's booth is round its kiosk, with room inside, its door toward the room, and clear of everything", () => {
  const b = MANAGER_BOOTH;
  const desk = DESK_BY_ID.get(MANAGER_DESK)!;
  const inside = (x: number, z: number, m = 0) => x > b.minX + m && x < b.maxX - m && z > b.minZ + m && z < b.maxZ - m;
  assert.ok(inside(desk.x, desk.z, 0.5), 'the kiosk');
  const stands = deskSeat(desk, 0.55);
  assert.ok(inside(stands.x, stands.z, 0.3), 'where the Manager stands');
  const front = { x: desk.x - Math.sin(desk.rotY) * 0.9, z: desk.z - Math.cos(desk.rotY) * 0.9 };
  assert.ok(inside(front.x, front.z, 0.3) && walkable(front.x, front.z), 'room to stand in front of it');
  assert.ok(b.doorX - ROOM_DOOR / 2 > b.minX + 0.5 && b.doorX + ROOM_DOOR / 2 < b.maxX - 0.5);
  // Clear of the meeting room, the loft's posts, the stairs, where people arrive, the plants and the departments.
  assert.ok(b.maxX < MEETING_ROOM.minX - 1 && b.maxX < LOFT.minX - 1);
  assert.ok(b.maxZ < STAIRS.minZ - 0.5);
  assert.ok(!inside(SPAWN.x, SPAWN.z, -0.6), 'not where people arrive');
  for (const [x, z] of plantsAt(0)) assert.ok(!inside(x, z, -0.5), `the plant at (${x}, ${z})`);
  for (const r of ROOMS) assert.ok(b.minX > r.maxX + 1 || b.maxX < r.minX - 1 || b.minZ > r.maxZ + 1 || b.maxZ < r.minZ - 1, `${r.dept.name}'s room`);
  // In through the door, never the glass.
  const way = route([0, 0], [front.x, front.z]);
  const glass = boothWalls(0.02);
  for (let i = 1; i < way.length; i++) {
    for (let k = 0; k <= 40; k++) {
      const x = way[i - 1][0] + ((way[i][0] - way[i - 1][0]) * k) / 40;
      const z = way[i - 1][1] + ((way[i][1] - way[i - 1][1]) * k) / 40;
      assert.ok(!glass.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1), `the way in goes through the door, not the glass at (${x.toFixed(2)}, ${z.toFixed(2)})`);
    }
  }
});

