import './litesuggest.css';
// Offering the 2D view (/lite) where the 3D office is hard going: on a phone, with no keys to walk
// with, or on a computer where frames come slowly (see framerate.ts).

import { h } from './dom';
import { gpuHolding, openGpu } from './gpu';
import { currentGpu } from '../gpu';

/** Said to stay in 3D: this browser isn't offered the 2D view again (it's in the ☰ menu). */
const DECLINED_KEY = 'agent-office.lite-declined';

/** A touch screen and no mouse: a phone or a tablet, which can't walk around the office anyway. */
export function touchOnly(): boolean {
  return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
}

function declined(): boolean {
  try {
    return localStorage.getItem(DECLINED_KEY) === '1';
  } catch {
    return false;
  }
}

let offered = false;

/** Offers the 2D view, at most once a page, unless this browser said to stay in 3D before. */
export function offerLite(why: 'touch' | 'slow') {
  if (offered || declined()) return;
  offered = true;
  const say =
    why === 'touch'
      ? '📱 On a phone? The 2D view is made for it: every worker and how it’s doing, its terminal, and the boards.'
      : '🐢 The 3D office is running slowly on this computer. The 2D view has the workers, their terminals and the boards, without the 3D.';
  const stay = h('button.btn', { type: 'button' }, 'Stay in 3D');
  // Slow because the browser isn't drawing on the graphics card: that can be fixed instead.
  const card = why === 'slow' && gpuHolding();
  const fix = card ? h('button.btn.primary', { type: 'button' }, '🖥️ Use the graphics card') : null;
  const el = h(
    'div.lite-offer.panel',
    { role: 'dialog', 'aria-label': 'Try the 2D view' },
    h('p', {}, say),
    card ? h('p.gpu-line', {}, `It’s drawn on ${currentGpu()?.kind === 'software' ? 'no graphics hardware at all' : `the built-in graphics (${currentGpu()?.name})`}: a graphics card, if this computer has one, would be much faster.`) : null,
    h('div.lite-offer-btns', {}, fix, h(`a.btn${card ? '' : '.primary'}`, { href: '/lite' }, 'Open the 2D view'), stay),
  );
  fix?.addEventListener('click', () => {
    el.remove();
    openGpu();
  });
  stay.addEventListener('click', () => {
    try {
      localStorage.setItem(DECLINED_KEY, '1');
    } catch {
      // storage blocked: it's only this page then
    }
    el.remove();
  });
  document.body.append(el);
}
