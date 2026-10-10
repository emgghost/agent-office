// A floor's lessons: standing rules its workers have learned, mostly from being corrected ("run the
// tests before opening a PR", "never touch the generated client"). Every worker hired on the floor
// starts with them (the 'worker.lessons' prompt), a worker records one with `office-workers lesson`
// when someone corrects how it works for good, and people add, change and delete them in 🎓 Lessons.

/** One standing rule. */
export interface Lesson {
  id: string;
  text: string;
  /** Who it's from: a person's name, or the worker that recorded it. */
  by: string;
  /** A worker recorded it, rather than a person writing it in. */
  worker?: boolean;
  at: number;
  /** When someone last changed its words. */
  editedAt?: number;
}

export interface LessonsState {
  items: Lesson[];
}

/** Each one is a rule, not an essay: a sentence or two. */
export const LESSON_MAX = 400;
/** Every one goes into every worker's first prompt, so there are only so many. */
export const MAX_LESSONS = 40;

/** A lesson's words, tidied: one line, trimmed, or why they can't be one. */
export function cleanLesson(raw: unknown): { text: string } | { error: string } {
  const text = (typeof raw === 'string' ? raw : '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-*•]\s+/, '');
  if (!text) return { error: 'Write the lesson first' };
  if (text.length > LESSON_MAX) return { error: `A lesson is ${LESSON_MAX} characters at most: make it a rule, not an essay` };
  return { text };
}

/** The same rule twice, near enough: the same words, whatever the case, spacing and punctuation. */
export function sameLesson(a: string, b: string): boolean {
  const key = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  return key(a) === key(b);
}

/** The lessons as the bullet list a worker's prompt gets (the 'worker.lessons' prompt's {{lessons}}). */
export function lessonList(items: readonly Lesson[]): string {
  return items.map((l) => `- ${l.text}`).join('\n');
}
