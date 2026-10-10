// A floor's lessons (see lessons.ts): people write them in, change their words and take them off.
// Every change goes out to the floor by itself (the Lessons store's onChange, made in floor.ts).
import type { LessonsClientMsg } from '../../../shared/protocol.js';
import { LESSON_MAX } from '../../../shared/lessons.js';
import { str } from '../../office/input.js';
import { here } from './common.js';
import type { HandlerMap, ViewPieces } from './types.js';

export const lessonsView: ViewPieces['lessons'] = (_ctx, floor) => floor?.lessons.state() ?? { items: [] };

/** A lesson's first words, for a toast. */
const gist = (text: string) => (text.length > 60 ? `${text.slice(0, 59)}…` : text);

export const lessonsHandlers = {
  'lessons.add'(ctx, c, msg) {
    const floor = here(ctx, c);
    if (!floor) return;
    const r = floor.lessons.add(str(msg.text, LESSON_MAX * 2), c.peer.name);
    if ('error' in r) return ctx.warn(c, r.error);
    if (r.known) return ctx.warn(c, 'The workers already have that lesson');
    ctx.toastFloor(floor, `🎓 ${c.peer.name} taught the workers: “${gist(r.lesson.text)}”`);
  },
  'lessons.edit'(ctx, c, msg) {
    const floor = here(ctx, c);
    if (!floor) return;
    const err = floor.lessons.edit(str(msg.id, 32), str(msg.text, LESSON_MAX * 2));
    if (err) ctx.warn(c, err);
  },
  'lessons.remove'(ctx, c, msg) {
    const floor = here(ctx, c);
    if (!floor) return;
    const gone = floor.lessons.remove(str(msg.id, 32));
    if (gone) ctx.toastFloor(floor, `🎓 ${c.peer.name} took a lesson off: “${gist(gone.text)}”`);
  },
} satisfies HandlerMap<LessonsClientMsg>;
