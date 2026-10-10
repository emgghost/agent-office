// Right-to-left text (Persian, Arabic, Hebrew) in the terminals. xterm.js keeps every row in the
// order the program wrote it, left to right, and its renderer splits a row into separate pieces
// (at a zero-width non-joiner, at a wide character), so the browser can't put an RTL sentence in
// order or join its letters across them: «چرا تست‌ها» comes out in scrambled pieces. Joining each
// RTL run into one piece (xterm's character joiner, which is there for ligatures) hands the browser
// the whole run at once: it reads right to left, its letters join, and the row stays left to right
// around it, the way the Unicode bidi algorithm lays out an RTL phrase in a left-to-right line.
//
// A joined piece then has to fill exactly its cells, or everything after it on the row moves. xterm
// does that for a ligature (one glyph) with letter-spacing, the difference between the cells' width
// and the text's; on a run of many letters that's added after every one, and a browser lays it out
// at the spaces between the words of a cursive script, spreading a Persian sentence across the row.
// So each RTL piece is made a box of its own exactly its cells wide, without the spacing, its text
// laid out right to left inside it (fitRtl).
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

/** Marks and joiners that take no cell of their own: xterm puts them in the cell of the letter before. */
const ZERO_WIDTH = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u200B-\u200F\u0591-\u05C7]/;

/** How many terminal cells a piece of right-to-left text takes: a cell a letter, none for its marks and joiners. */
export function rtlCells(text: string): number {
  let n = 0;
  for (const ch of text) if (!ZERO_WIDTH.test(ch)) n++;
  return n;
}

/**
 * Makes one span of RTL text exactly `width` px wide, its text unspaced and laid out right to left
 * inside, against its right edge: what's left over goes on its left, so its words stay together.
 * Text wider than its cells (a wide fallback font) is squeezed to fit rather than run over the cells
 * before it.
 */
function fit(span: HTMLElement, width: number) {
  const st = span.style;
  st.letterSpacing = '0px';
  st.display = 'inline-block';
  st.width = `${width}px`;
  st.direction = 'rtl';
  st.unicodeBidi = 'isolate';
  st.whiteSpace = 'pre';
  st.verticalAlign = 'top';
  const natural = span.scrollWidth;
  if (natural > width + 0.5) {
    st.transform = `scaleX(${width / natural})`;
    st.transformOrigin = 'right';
  }
}

/**
 * Keeps each RTL piece in `term`'s rows exactly as wide as its cells (see the top of this file), as
 * xterm draws them. Rows are drawn afresh every time they change, so this follows them as they are.
 */
function fitRtl(term: Terminal) {
  const rows = term.element?.querySelector('.xterm-rows');
  const screen = term.element?.querySelector<HTMLElement>('.xterm-screen');
  if (!rows || !screen) return;
  const fitAll = (root: ParentNode) => {
    const cell = screen.clientWidth / term.cols;
    if (!(cell > 0)) return;
    for (const span of root.querySelectorAll<HTMLElement>('span')) {
      const text = span.textContent ?? '';
      // A joined run starts on an RTL letter (see rtlRuns); a lone one among Latin text isn't one.
      if (text.length > 1 && RTL.test(text[0])) fit(span, rtlCells(text) * cell);
    }
  };
  new MutationObserver((changes) => {
    for (const c of changes) for (const n of c.addedNodes) if (n instanceof HTMLElement) n.tagName === 'SPAN' ? fitAll(n.parentElement ?? n) : fitAll(n);
  }).observe(rows, { childList: true, subtree: true });
  fitAll(rows);
}

/** Shows right-to-left text in `term` in reading order, with its letters joined. Needs `allowProposedApi`, and `term` open. */
export function joinRtl(term: Terminal): void {
  try {
    term.registerCharacterJoiner(rtlRuns);
  } catch {
    // an xterm without joiners: RTL text shows as it did
    return;
  }
  fitRtl(term);
}
