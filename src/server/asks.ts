import { randomBytes } from 'node:crypto';
import type { WorkerInfo } from '../shared/protocol.js';
import { officePrompt, type PromptSource } from './prompts.js';

// Questions between workers: one worker asks another something it can't find out itself (ask_worker,
// `office-workers ask`), the office types the question into the other's terminal once it's free to
// take it, and the answer (answer_question, `office-workers answer`) goes back to the one asking:
// straight to its waiting call when it comes within a few seconds, else typed into its terminal too.

/** Answers longer than this are cut: an answer, not a report. */
export const ANSWER_MAX = 8000;
export const QUESTION_MAX = 4000;
/** How long an asking call waits for its answer before the answer has to come by terminal (ms). */
export const WAIT_MS = 45_000;
/** Questions a floor keeps, answered or not, before the oldest go. */
const KEEP = 200;

export type AskStatus = 'waiting' | 'asked' | 'answered' | 'gone';

export interface Ask {
  id: string;
  from: string;
  fromName: string;
  to: string;
  toName: string;
  question: string;
  status: AskStatus;
  answer?: string;
  at: number;
  answeredAt?: number;
  /** The answer still has to reach the one asking, through its terminal. */
  owed?: boolean;
}

/** What a floor's questions need of its workers. */
export interface AskWorkers {
  get(id: string): WorkerInfo | undefined;
  /** Types a prompt into a running worker; says why it can't. */
  prompt(id: string, text: string, by?: string): string | undefined;
  /** Wakes a stopped one with it. */
  resume(id: string, prompt?: string): string | undefined;
}

/** Whether a worker can be typed a prompt now: not on its way up, and not in the middle of a question of its own (which it would answer). */
const free = (w: WorkerInfo) => w.status !== 'needs_input' && w.status !== 'starting';

export class Asks {
  private asks = new Map<string, Ask>();
  private waiters = new Map<string, Set<(a: Ask) => void>>();

  constructor(
    private workers: AskWorkers,
    private prompts: PromptSource | undefined,
    private toast: (text: string) => void,
  ) {}

  get(id: string): Ask | undefined {
    const a = this.asks.get(id);
    return a && { ...a };
  }

  /** Questions to or from a worker, newest first. */
  of(workerId: string): Ask[] {
    return [...this.asks.values()].filter((a) => a.from === workerId || a.to === workerId).reverse().map((a) => ({ ...a }));
  }

  /** `from` asks `to`. Returns the question, or why it can't be asked. */
  ask(from: WorkerInfo, to: WorkerInfo, raw: string): Ask | string {
    if (from.id === to.id) return "That's you: ask someone else";
    if (to.kind !== 'agent') return `${to.name} is a shell, not an agent`;
    const question = raw.replace(/\r\n?/g, '\n').trim().slice(0, QUESTION_MAX);
    if (!question) return 'Say what you want to know: question';
    const a: Ask = { id: `q${randomBytes(3).toString('hex')}`, from: from.id, fromName: from.name, to: to.id, toName: to.name, question, status: 'waiting', at: Date.now() };
    this.asks.set(a.id, a);
    while (this.asks.size > KEEP) this.asks.delete(this.asks.keys().next().value!);
    this.toast(`💬 ${from.name} asked ${to.name}: “${gist(question)}”`);
    this.deliver(a);
    return { ...a };
  }

  /**
   * `from` asks someone `hire` is about to hire for it, there being nobody to ask yet (a department
   * with nobody in it): the question is the new worker's first task, so it's asked as it starts.
   * Returns the question, or why it can't be asked (`hire`'s own reason, when it can't hire).
   */
  askHiring(from: WorkerInfo, raw: string, hire: (prompt: string) => WorkerInfo | string): Ask | string {
    const question = raw.replace(/\r\n?/g, '\n').trim().slice(0, QUESTION_MAX);
    if (!question) return 'Say what you want to know: question';
    const id = `q${randomBytes(3).toString('hex')}`;
    const hired = hire(officePrompt(this.prompts, 'worker.question', { from: from.name, id, question }));
    if (typeof hired === 'string') return hired;
    const a: Ask = { id, from: from.id, fromName: from.name, to: hired.id, toName: hired.name, question, status: 'asked', at: Date.now() };
    this.asks.set(a.id, a);
    while (this.asks.size > KEEP) this.asks.delete(this.asks.keys().next().value!);
    this.toast(`💬 ${from.name} asked ${hired.name}: “${gist(question)}”`);
    return { ...a };
  }

  /** `by` answers question `id`: only the worker it was asked of can. Returns the question, or why not. */
  answer(id: string, by: WorkerInfo, raw: string): Ask | string {
    const a = this.asks.get(id.trim());
    if (!a) return `No question ${id} here (list_questions shows the ones asked of you)`;
    if (a.to !== by.id) return `Question ${a.id} was asked of ${a.toName}, not you`;
    if (a.status === 'answered') return `You already answered question ${a.id}`;
    const answer = raw.replace(/\r\n?/g, '\n').trim().slice(0, ANSWER_MAX);
    if (!answer) return 'Say the answer: answer';
    a.status = 'answered';
    a.answer = answer;
    a.answeredAt = Date.now();
    this.toast(`💬 ${by.name} answered ${a.fromName}`);
    const waiting = this.waiters.get(a.id);
    if (waiting?.size) {
      for (const done of waiting) done({ ...a });
      this.waiters.delete(a.id);
    } else {
      a.owed = true;
      this.deliver(a);
    }
    return { ...a };
  }

  /**
   * Waits for question `id`'s answer, up to `ms`, or until `signal` says the one waiting went (the
   * call was cut off). An answer that comes after is typed into the asking worker's terminal instead
   * (see answer), so nothing waits on the call coming back.
   */
  wait(id: string, ms = WAIT_MS, signal?: AbortSignal): Promise<Ask | undefined> {
    const a = this.asks.get(id);
    if (!a || a.status === 'answered' || a.status === 'gone') return Promise.resolve(a && { ...a });
    return new Promise((resolve) => {
      const set = this.waiters.get(id) ?? new Set();
      this.waiters.set(id, set);
      const done = (got: Ask) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', stop);
        resolve(got);
      };
      const stop = () => {
        clearTimeout(timer);
        set.delete(done);
        if (!set.size) this.waiters.delete(id);
        resolve(this.get(id));
      };
      const timer = setTimeout(stop, ms);
      signal?.addEventListener('abort', stop, { once: true });
      set.add(done);
    });
  }

  /** A worker changed: whatever was waiting for it to be free to take may go now. */
  onWorker(w: WorkerInfo) {
    for (const a of this.asks.values()) if ((a.status === 'waiting' && a.to === w.id) || (a.owed && a.from === w.id)) this.deliver(a);
  }

  /** A worker went home: the questions it was asked never get answered, and the ones it asked have nobody to tell. */
  onWorkerGone(id: string) {
    for (const a of this.asks.values()) {
      if (a.from === id) a.owed = false;
      if (a.to !== id || a.status === 'answered' || a.status === 'gone') continue;
      a.status = 'gone';
      const waiting = this.waiters.get(a.id);
      if (waiting?.size) {
        for (const done of waiting) done({ ...a });
        this.waiters.delete(a.id);
      } else if (this.workers.get(a.from)) {
        this.type(a.from, `💬 ${a.toName} went home without answering your question ${a.id} ("${gist(a.question)}"). Ask someone else, or carry on without it.`);
      }
    }
  }

  /** Types the question to the worker asked, or a late answer to the one asking, if it's free to take it. */
  private deliver(a: Ask) {
    if (a.status === 'waiting') {
      const to = this.workers.get(a.to);
      if (!to || !free(to)) return;
      const text = officePrompt(this.prompts, 'worker.question', { from: a.fromName, id: a.id, question: a.question });
      if (!this.type(a.to, text)) a.status = 'asked';
      return;
    }
    if (a.owed) {
      const from = this.workers.get(a.from);
      if (!from || !free(from)) return;
      const text = officePrompt(this.prompts, 'worker.answer', { from: a.toName, id: a.id, question: gist(a.question), answer: a.answer ?? '' });
      if (!this.type(a.from, text)) a.owed = false;
    }
  }

  /** Types `text` to a worker, waking it with it when it's stopped. Returns why it couldn't. */
  private type(id: string, text: string): string | undefined {
    let err = this.workers.prompt(id, text, 'Agent Office');
    if (err === 'Worker is not running') err = this.workers.resume(id, text);
    return err;
  }
}

/** The first words of a question, for a toast. */
function gist(text: string): string {
  const one = text.replace(/\s+/g, ' ');
  return one.length > 60 ? `${one.slice(0, 59)}…` : one;
}
