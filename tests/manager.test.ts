// The Manager: its desk in the office (and on maps that don't give it one), its brief, hiring in a
// department, and the reports it gets about the workers it hired.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DESK_BY_ID, STATIONS, STATION_AGENT, deskSeat } from '../src/shared/layout.js';
import { ROOMS } from '../src/shared/departments.js';
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
