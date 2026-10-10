// 🎓 Lessons: the standing rules the floor's workers have learned, mostly from being corrected. Every
// worker hired on the floor starts with them (see server/lessons.ts); a worker records one itself with
// `office-workers lesson add`, and here anyone can write one in, reword it or take it off.
import './lessons.css';
import type { Net } from '../net';
import { LESSON_MAX, MAX_LESSONS, cleanLesson, type Lesson } from '../../shared/lessons';
import { store } from '../state';
import { h, openModal, timeAgo } from './dom';

/** One textarea's Enter sends it (Shift+Enter is a new line, though a lesson is one). */
function onEnter(input: HTMLTextAreaElement, go: () => void) {
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    go();
  });
}

const ASK = 'A rule every worker here should follow, e.g. “Run npm test before opening a pull request.”';

export function openLessons(net: Net) {
  /** The lesson being reworded, if one is. */
  let editing: string | null = null;
  const list = h('ol.lesson-list');
  const count = h('span.lesson-count');
  const input = h('textarea.lesson-input', { rows: 2, maxLength: LESSON_MAX, placeholder: ASK, 'aria-label': 'New lesson' });
  const teach = h('button.btn.primary', { type: 'button' }, '🎓 Teach');
  const error = h('p.lesson-error.hidden');
  const el = h(
    'div.modal.lessons',
    { role: 'dialog', 'aria-label': 'Lessons', style: 'width:min(680px,100%)' },
    h('header', {}, h('h2', {}, '🎓 Lessons'), count),
    h(
      'div.body',
      {},
      h(
        'p.note',
        {},
        'What this project’s workers have learned. Every worker hired on this floor starts with these in its first prompt. A worker adds one itself when you correct how it works for good; ',
        'anything a worker learned wrong, reword or take off here.',
      ),
      list,
      h('div.lesson-new', {}, input, teach),
      error,
    ),
  );

  const say = (why: string | undefined) => {
    error.textContent = why ?? '';
    error.classList.toggle('hidden', !why);
  };
  const add = () => {
    const clean = cleanLesson(input.value);
    if ('error' in clean) return say(clean.error);
    say(undefined);
    net.send({ t: 'lessons.add', text: clean.text });
    input.value = '';
    input.focus();
  };
  teach.addEventListener('click', add);
  onEnter(input, add);

  const row = (l: Lesson, n: number): HTMLElement => {
    const meta = h('div.lesson-meta', {}, `${l.worker ? '🤖' : '🧑'} ${l.by} · ${timeAgo(l.at)}${l.editedAt ? ' · reworded' : ''}`);
    if (editing !== l.id) {
      return h(
        'li.lesson',
        {},
        h('span.lesson-n', {}, String(n)),
        h('div.lesson-main', {}, h('div.lesson-text', { dir: 'auto' }, l.text), meta),
        h('div.lesson-acts', {}, h('button.btn', { type: 'button', title: 'Reword it', 'aria-label': 'Reword it', onclick: () => ((editing = l.id), render()) }, '✏️'), h('button.btn', { type: 'button', title: 'Take it off: workers hired from now on won’t start with it', 'aria-label': 'Take it off', onclick: () => net.send({ t: 'lessons.remove', id: l.id }) }, '🗑️')),
      );
    }
    const box = h('textarea.lesson-input', { rows: 2, maxLength: LESSON_MAX, 'aria-label': 'Reword the lesson' });
    box.value = l.text;
    const save = () => {
      const clean = cleanLesson(box.value);
      if ('error' in clean) return say(clean.error);
      say(undefined);
      if (clean.text !== l.text) net.send({ t: 'lessons.edit', id: l.id, text: clean.text });
      editing = null;
      render();
    };
    onEnter(box, save);
    setTimeout(() => box.focus(), 0);
    return h(
      'li.lesson.editing',
      {},
      h('span.lesson-n', {}, String(n)),
      h('div.lesson-main', {}, box, meta),
      h('div.lesson-acts', {}, h('button.btn.primary', { type: 'button', onclick: save }, 'Save'), h('button.btn', { type: 'button', onclick: () => ((editing = null), say(undefined), render()) }, 'Cancel')),
    );
  };

  const render = () => {
    const items = store.lessons.items;
    if (editing && !items.some((l) => l.id === editing)) editing = null;
    count.textContent = `${items.length}/${MAX_LESSONS}`;
    const full = items.length >= MAX_LESSONS;
    input.disabled = teach.disabled = full;
    input.placeholder = full ? `${MAX_LESSONS} lessons is as many as a worker is given: take one off or fold two together first` : ASK;
    list.replaceChildren(
      ...(items.length
        ? items.map((l, i) => row(l, i + 1))
        : [h('li.lesson-empty', {}, h('p', {}, 'No lessons yet.'), h('p.note', {}, 'Correct a worker about how this project does things (“always add a test”, “we use pnpm”) and it records the rule here for every worker after it. Or write one in below.'))]),
    );
  };

  const off = store.on('lessons', render);
  openModal(el, { doing: '🎓 reading the lessons', onClose: off });
  render();
  input.focus();
}
