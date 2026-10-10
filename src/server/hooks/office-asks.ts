import type http from 'node:http';
import { ANSWER_MAX, QUESTION_MAX, WAIT_MS, type Ask } from '../asks.js';
import { findWorker } from '../office-workers.js';
import type { Ctx } from '../office/context.js';
import { str } from '../office/input.js';
import { readBody, send } from '../http/util.js';

/** A question as a worker sees it. */
const view = (a: Ask) => ({
  id: a.id,
  from: a.fromName,
  to: a.toName,
  question: a.question,
  status: a.status,
  ...(a.answer !== undefined ? { answer: a.answer } : {}),
});

/**
 * Questions between a floor's workers (see asks.ts, and `office-workers ask` / `answer`): POST
 * /office/workers/ask {worker, question, wait?} asks one and waits up to `wait` seconds (45 at most)
 * for the answer, POST /office/workers/ask/answer {id, answer} answers one asked of you, and GET
 * lists the ones asked of you and by you. The worker's own hook token says who's asking.
 */
export async function officeAsks(ctx: Ctx, req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const workerId = url.searchParams.get('worker') ?? '';
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const floor = ctx.workerFloor(workerId);
  const me = floor?.workers.authenticate(workerId, token);
  if (!floor || !me) return send(res, 401, { error: 'Send your own AGENT_OFFICE_WORKER_ID as ?worker= and AGENT_OFFICE_HOOK_TOKEN as the bearer token' });
  const action = url.pathname.slice('/office/workers/ask'.length);
  if (req.method === 'GET' && !action) {
    const all = floor.asks.of(me.id);
    return send(res, 200, { askedOfYou: all.filter((a) => a.to === me.id).map(view), askedByYou: all.filter((a) => a.from === me.id).map(view) });
  }
  if (req.method !== 'POST' || (action && action !== '/answer')) return send(res, 405, { error: 'GET or POST /office/workers/ask, or POST /office/workers/ask/answer' });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse((await readBody(req, 64 * 1024)) || '{}');
  } catch {
    return send(res, 400, { error: 'Send JSON' });
  }
  if (action === '/answer') {
    const a = floor.asks.answer(str(body?.id, 32), me, str(body?.answer, ANSWER_MAX * 2));
    return typeof a === 'string' ? send(res, 400, { error: a }) : send(res, 200, { ok: true, question: view(a) });
  }
  const to = findWorker(floor.workers.list(), str(body?.worker, 64));
  if (typeof to === 'string') return send(res, 404, { error: to });
  const asked = floor.asks.ask(me, to, str(body?.question, QUESTION_MAX * 2));
  if (typeof asked === 'string') return send(res, 400, { error: asked });
  const seconds = typeof body?.wait === 'number' && Number.isFinite(body.wait) ? Math.max(0, Math.min(body.wait, WAIT_MS / 1000)) : WAIT_MS / 1000;
  // The call can go before the answer comes (an agent's tool timeout): the answer is typed into the asker's terminal then.
  const left = new AbortController();
  res.on('close', () => left.abort());
  const got = seconds > 0 ? await floor.asks.wait(asked.id, seconds * 1000, left.signal) : asked;
  if (left.signal.aborted) return;
  send(res, 200, { question: view(got ?? asked) });
}
