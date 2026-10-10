// Right-to-left text (Persian, Arabic, Hebrew) in the terminals. xterm.js keeps every row in the
// order the program wrote it, left to right, and its renderer splits a row into separate pieces
// (at a zero-width non-joiner, at a wide character), so the browser can't put an RTL sentence in
// order or join its letters across them: «چرا تست‌ها» comes out in scrambled pieces. Joining each
// RTL run into one piece (xterm's character joiner, which is there for ligatures) hands the browser
// the whole run at once: it reads right to left, its letters join, and the row stays left to right
// around it, the way the Unicode bidi algorithm lays out an RTL phrase in a left-to-right line.
import type { Terminal } from '@xterm/xterm';

/** A letter of a right-to-left script: Hebrew, Arabic, Syriac, Thaana, N'Ko and their presentation forms. */
const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
/**
 * What an RTL run carries on across: more RTL letters, and the spaces, digits, joiners and
 * punctuation between its words. A Latin letter ends it.
 */
const INSIDE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u200C\u200D\u200E\u200F\s0-9.,:;!?()[\]{}'"\u00AB\u00BB\-\u2013\u2014_/%+*=#@&]/;

/** Brackets and quotes that open and close, which the browser pairs only within one piece. */
const PAIRS = [['(', ')'], ['[', ']'], ['{', '}'], ['«', '»']] as const;

/**
 * The runs of right-to-left text in `text`, as [start, end) string offsets: each from its first RTL
 * letter to its last, with whatever lies between them, so a run never starts or ends on a space.
 */
export function rtlRuns(text: string): [number, number][] {
  const runs: [number, number][] = [];
  let i = 0;
  while (i < text.length) {
    if (!RTL.test(text[i])) {
      i++;
      continue;
    }
    let last = i;
    let j = i + 1;
    while (j < text.length && INSIDE.test(text[j])) {
      if (RTL.test(text[j])) last = j;
      j++;
    }
    // A combining mark or joiner right after the last letter belongs to it.
    while (last + 1 < text.length && /[\u064B-\u065F\u0670\u06D6-\u06ED\u200C\u200D]/.test(text[last + 1])) last++;
    // A bracket or quote opened in the run closes in it, or the browser can't pair them.
    for (const [open, close] of PAIRS) {
      let depth = 0;
      for (let k = i; k <= last; k++) depth += text[k] === open ? 1 : text[k] === close ? -1 : 0;
      while (depth > 0 && last + 1 < j && text[last + 1] !== close && !RTL.test(text[last + 1])) last++;
      if (depth > 0 && text[last + 1] === close) last++;
    }
    // One letter on its own needs nothing joining.
    if (last > i) runs.push([i, last + 1]);
    i = j;
  }
  return runs;
}

/** Shows right-to-left text in `term` in reading order, with its letters joined. Needs `allowProposedApi`. */
export function joinRtl(term: Terminal): void {
  try {
    term.registerCharacterJoiner(rtlRuns);
  } catch {
    // an xterm without joiners: RTL text shows as it did
  }
}
