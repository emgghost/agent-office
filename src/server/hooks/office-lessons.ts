import type http from 'node:http';
import { LESSON_MAX } from '../../shared/lessons.js';
import type { Ctx } from '../office/context.js';
import { str } from '../office/input.js';
import { readBody, send } from '../http/util.js';

/**
 * The floor's lessons, for any agent on it (see lessons.ts, and `office-workers lesson`, which calls
 * this): GET lists them, POST records one the agent was taught. Agents only add: taking a lesson
 * off or rewording it is for people, in 🎓 Lessons. The worker's own hook token says who's asking.
 */
export async function officeLessons(ctx: Ctx, req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const workerId = url.searchParams.get('worker') ?? '';
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const floor = ctx.workerFloor(workerId);
  const me = floor?.workers.authenticate(workerId, token);
  if (!floor || !me) return send(res, 401, { error: 'Send your own AGENT_OFFICE_WORKER_ID as ?worker= and AGENT_OFFICE_HOOK_TOKEN as the bearer token' });
  const view = () => ({ lessons: floor.lessons.state().items.map((l) => ({ id: l.id, text: l.text, by: l.by })) });
  if (req.method === 'GET') return send(res, 200, view());
  if (req.method !== 'POST') return send(res, 405, { error: 'GET lists the lessons, POST {"text": "…"} records one' });
  let body: { text?: unknown };
  try {
    body = JSON.parse((await readBody(req, 64 * 1024)) || '{}');
  } catch {
    return send(res, 400, { error: 'Send JSON: {"text": "…"}' });
  }
  const r = floor.lessons.add(str(body?.text, LESSON_MAX * 2), me.name, true);
  if ('error' in r) return send(res, 400, { error: r.error });
  if (!r.known) ctx.toastFloor(floor, `🎓 ${me.name} learned: “${r.lesson.text.length > 60 ? `${r.lesson.text.slice(0, 59)}…` : r.lesson.text}”`);
  send(res, 200, { ok: true, known: !!r.known, lesson: { id: r.lesson.id, text: r.lesson.text, by: r.lesson.by }, ...view() });
}
