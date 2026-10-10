import { randomBytes } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MAX_LESSONS, cleanLesson, lessonList, sameLesson, type Lesson, type LessonsState } from '../shared/lessons.js';
import { officePrompt, type PromptSource } from './prompts.js';

/** What adding a lesson came to: the new one, the one already there that says the same, or why it can't be. */
export type Added = { lesson: Lesson; known?: boolean } | { error: string };

/**
 * A floor's lessons (see shared/lessons.ts), kept in its .agent-office/lessons.json: the standing rules
 * every worker hired on the floor starts with.
 */
export class Lessons {
  private items: Lesson[] = [];
  private file: string;

  constructor(
    dataDir: string,
    private onChange: (state: LessonsState) => void,
  ) {
    this.file = path.join(dataDir, 'lessons.json');
    this.load();
  }

  state(): LessonsState {
    return { items: this.items.map((l) => ({ ...l })) };
  }

  /** A new lesson from `by`; `worker` when a worker recorded it. One that says what another already does isn't added twice. */
  add(raw: unknown, by: string, worker = false): Added {
    const clean = cleanLesson(raw);
    if ('error' in clean) return clean;
    const known = this.items.find((l) => sameLesson(l.text, clean.text));
    if (known) return { lesson: { ...known }, known: true };
    if (this.items.length >= MAX_LESSONS) return { error: `This floor has ${MAX_LESSONS} lessons, as many as a worker is given: take one off or fold two together first` };
    const lesson: Lesson = { id: randomBytes(5).toString('hex'), text: clean.text, by, ...(worker ? { worker: true } : {}), at: Date.now() };
    this.items.push(lesson);
    this.changed();
    return { lesson: { ...lesson } };
  }

  /** New words for a lesson. Returns why it can't, if it can't. */
  edit(id: string, raw: unknown): string | undefined {
    const lesson = this.items.find((l) => l.id === id);
    if (!lesson) return 'Someone already took that lesson off';
    const clean = cleanLesson(raw);
    if ('error' in clean) return clean.error;
    if (this.items.some((l) => l !== lesson && sameLesson(l.text, clean.text))) return 'Another lesson already says that';
    if (clean.text === lesson.text) return undefined;
    lesson.text = clean.text;
    lesson.editedAt = Date.now();
    this.changed();
    return undefined;
  }

  remove(id: string): Lesson | undefined {
    const i = this.items.findIndex((l) => l.id === id);
    if (i < 0) return undefined;
    const [gone] = this.items.splice(i, 1);
    this.changed();
    return gone;
  }

  /**
   * A new worker's first prompt with the lessons ahead of it, as the 'worker.lessons' prompt words
   * them; just the prompt when the floor has none, or that prompt was emptied in ⚙️ Settings.
   */
  brief(prompt: string, prompts?: PromptSource): string {
    if (!this.items.length) return prompt;
    const intro = officePrompt(prompts, 'worker.lessons', { lessons: lessonList(this.items) });
    return intro ? `${intro}\n\n${prompt}` : prompt;
  }

  private changed() {
    this.save();
    this.onChange(this.state());
  }

  private load() {
    let saved: unknown;
    try {
      saved = JSON.parse(readFileSync(this.file, 'utf8'));
    } catch {
      return; // none yet, or a broken file: no lessons
    }
    for (const s of Array.isArray(saved) ? (saved as Partial<Lesson>[]) : []) {
      const clean = cleanLesson(s?.text);
      if ('error' in clean || typeof s.id !== 'string' || this.items.length >= MAX_LESSONS) continue;
      this.items.push({
        id: s.id,
        text: clean.text,
        by: typeof s.by === 'string' && s.by ? s.by : '?',
        ...(s.worker === true ? { worker: true } : {}),
        at: typeof s.at === 'number' ? s.at : Date.now(),
        ...(typeof s.editedAt === 'number' ? { editedAt: s.editedAt } : {}),
      });
    }
  }

  /** Written whole and then swapped in, so a crash halfway never leaves half a file. */
  private save() {
    const tmp = `${this.file}.tmp`;
    try {
      writeFileSync(tmp, JSON.stringify(this.items, null, 2), { mode: 0o600 });
      renameSync(tmp, this.file);
    } catch {
      // disk issues shouldn't take the office down
    }
  }
}
