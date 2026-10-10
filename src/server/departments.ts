import type { WorkerInfo } from '../shared/protocol.js';
import { departmentOf, type DepartmentDef } from '../shared/departments.js';
import { officePrompt, type PromptSource } from './prompts.js';

// The departments on the server (see shared/departments.ts): the role a worker at one of their desks
// starts with, and who in a department answers when another worker asks it something.

/**
 * A worker's first prompt with its department's role ahead of it (the 'dept.<id>' prompt), when it
 * sits at a department's desk; just `prompt` anywhere else, or when that prompt was emptied.
 */
export function withRole(info: WorkerInfo, prompt: string, prompts?: PromptSource): string {
  const role = roleOf(info, prompts);
  return role ? `${role}\n\n${prompt}` : prompt;
}

/** The role of the department an agent's desk belongs to, as the office words it now; '' for none. */
export function roleOf(info: WorkerInfo, prompts?: PromptSource): string {
  const dept = info.kind === 'agent' ? departmentOf(info.deskId) : undefined;
  return dept ? officePrompt(prompts, `dept.${dept.id}`) : '';
}

/**
 * What an agent hired at a department's desk with no task is told after its role, so it starts out in
 * it: the role only goes with a first message.
 */
export const WAITING = "You don't have a task yet. Say in one line that you're ready, then wait for one.";

/**
 * A new agent's first prompt, as the floor sends it (WorkerManager.brief): its department's role,
 * then the floor's lessons, then its task. Hired without a task, a department's agent still starts in
 * its role (with WAITING for a task); anyone else just waits, with nothing sent.
 */
export function firstPrompt(lessons: { brief(prompt: string, prompts?: PromptSource): string }, prompts?: PromptSource) {
  return (prompt: string | undefined, info: WorkerInfo): string | undefined => {
    if (prompt) return withRole(info, lessons.brief(prompt, prompts), prompts);
    const role = roleOf(info, prompts);
    return role ? `${role}\n\n${lessons.brief(WAITING, prompts)}` : undefined;
  };
}

/** How ready a worker is to take a question: one that's free first, then one at work, never a shell. */
const READY: Record<string, number> = { idle: 0, done: 0, working: 1, starting: 2, needs_input: 3, exited: 4 };

/**
 * Who in `dept` should answer a question: the agent at its desks readiest to take one (see READY),
 * not `asker` itself. Undefined when nobody else is there.
 */
export function departmentWorker(workers: readonly WorkerInfo[], dept: DepartmentDef, asker?: string): WorkerInfo | undefined {
  return workers
    .filter((w) => w.kind === 'agent' && w.id !== asker && (dept.desks as readonly string[]).includes(w.deskId))
    .sort((a, b) => (READY[a.status] ?? 5) - (READY[b.status] ?? 5))[0];
}

/** A desk of `dept`'s nobody sits at, to hire someone at. */
export function freeDepartmentDesk(dept: DepartmentDef, occupied: (deskId: string) => boolean): string | undefined {
  return dept.desks.find((id) => !occupied(id));
}
