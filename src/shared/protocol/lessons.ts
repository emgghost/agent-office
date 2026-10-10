import type { LessonsState } from '../lessons.js';

export type LessonsClientMsg =
  /** Write in a lesson of your own for the floor you're on. */
  | { t: 'lessons.add'; text: string }
  /** Change a lesson's words. */
  | { t: 'lessons.edit'; id: string; text: string }
  /** Unlearn one: no worker hired after this starts with it. */
  | { t: 'lessons.remove'; id: string };

export type LessonsServerMsg =
  /** Your floor's lessons, whenever one is added, changed or taken off. */
  { t: 'lessons'; state: LessonsState };
