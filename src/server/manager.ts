import { departmentOf } from '../shared/departments.js';
import { DESK_BY_ID } from '../shared/layout.js';
import type { WorkerInfo, WorkerStatus } from '../shared/protocol.js';
import { alertDetail } from '../shared/status.js';
import { officePrompt, type PromptSource } from './prompts.js';

// The Manager (the 'manager' board agent): the agent the person running the office talks to, who runs
// the departments for them (see shared/manager-prompts.ts). The workers it hires are marked as its
// own (WorkerInfo.via), and here it hears how they get on: when one finishes its turn, stops to ask
// its person something, or stops altogether, a line goes in a report typed into the Manager's
// terminal, as soon as it can take one (never while it's in the middle of a question of its own).

/** The Manager's desk. */
export const MANAGER_DESK = 'station-manager';

/** How a worker the `asker` hires is marked: as the Manager's, when the Manager is asking. */
export function hiredVia(asker: WorkerInfo): WorkerInfo['via'] {
  return DESK_BY_ID.get(asker.deskId)?.station === 'manager' ? 'manager' : undefined;
}

/** What a floor's Manager reports need of its workers. */
export interface ReportWorkers {
  list(): WorkerInfo[];
  /** Types a prompt into a running worker; says why it can't. */
  prompt(id: string, text: string, by?: string): string | undefined;
  /** Wakes a stopped one with it. */
  resume(id: string, prompt?: string): string | undefined;
}

/** A worker clipped to a line: its task, or the prompt it was given. */
const clip = (s: string | undefined, n = 140) => {
  const one = (s ?? '').replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};

/** What happened to a worker that's worth the Manager hearing, going from `was` to its status now; undefined when nothing is. */
function news(w: WorkerInfo, was: WorkerStatus | undefined): string | undefined {
  if (w.status === was) return undefined;
  if (w.status === 'done') return 'finished its turn';
  if (w.status === 'needs_input') return `is waiting on a person: ${alertDetail(w) ?? 'a question in its terminal'} (only your employer can answer it, in its terminal)`;
  if (w.status === 'exited' && was && was !== 'offline') return `stopped${w.exitCode ? ` (exit code ${w.exitCode})` : ''}: it needs waking up (tell_worker) or sending home`;
  return undefined;
}

export class ManagerReports {
  private seen = new Map<string, WorkerStatus>();
  private pending = new Map<string, string>();
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private workers: ReportWorkers,
    private prompts: PromptSource | undefined,
    /** Its pull request, in words ("PR #12 open https://…"), if it has one. */
    private prOf: (w: WorkerInfo) => string | undefined,
    /** How long to gather lines that come together into one report (ms). */
    private gather = 1500,
  ) {}

  /** A worker changed: one of the Manager's has news for it, or the Manager may be free to take what's waiting. */
  onWorker(w: WorkerInfo) {
    const was = this.seen.get(w.id);
    this.seen.set(w.id, w.status);
    if (w.deskId === MANAGER_DESK) return this.soon();
    if (w.via !== 'manager') return;
    const what = news(w, was);
    if (!what) return;
    // One line a worker: only the latest about it.
    this.pending.set(w.id, this.line(w, what));
    this.soon();
  }

  /** A worker went home: nothing to tell about it any more. */
  onWorkerGone(id: string) {
    this.seen.delete(id);
    this.pending.delete(id);
  }

  stop() {
    clearTimeout(this.timer);
  }

  private line(w: WorkerInfo, what: string): string {
    const dept = departmentOf(w.deskId);
    const where = dept ? `${dept.emoji} ${dept.name}` : (DESK_BY_ID.get(w.deskId)?.label ?? w.deskId);
    const task = clip(w.task ? `${w.task.name}: ${w.task.summary}` : w.prompt);
    const pr = this.prOf(w);
    return `- ${w.name} (${where}) ${what}.${task ? ` Its task: ${task}.` : ''}${pr ? ` ${pr}.` : ''}`;
  }

  private soon() {
    if (!this.pending.size || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, this.gather);
  }

  /** Types what's waiting to the Manager, if there is one and it can take it now. */
  private flush() {
    if (!this.pending.size) return;
    const manager = this.workers.list().find((w) => w.deskId === MANAGER_DESK);
    // Nobody to tell: the Manager was sent home. Whoever's hired next starts afresh.
    if (!manager) return this.pending.clear();
    if (manager.status === 'needs_input' || manager.status === 'starting') return;
    const text = officePrompt(this.prompts, 'manager.report', { reports: [...this.pending.values()].join('\n') });
    this.pending.clear();
    if (!text) return;
    let err = this.workers.prompt(manager.id, text, 'Agent Office');
    if (err === 'Worker is not running') err = this.workers.resume(manager.id, text);
    if (err) console.warn(`  couldn't report to the Manager: ${err}`);
  }
}
