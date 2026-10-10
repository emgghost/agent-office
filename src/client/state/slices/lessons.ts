import type { LessonsState } from '../../../shared/lessons';
import type { Slice } from '../store';

declare module '../store' {
  interface Store {
    /** The standing rules this floor's workers have learned (🎓 Lessons). */
    lessons: LessonsState;
  }
  interface Topics {
    lessons: true;
  }
}

export const lessons: Slice = {
  init(s) {
    s.lessons = { items: [] };
  },
  on: {
    lessons(s, m) {
      s.lessons = m.state;
      return ['lessons'];
    },
  },
  enter(s, v) {
    s.lessons = v.lessons;
    return ['lessons'];
  },
};
