// 🖥️ Graphics: what the browser draws the 3D office with, and how to have it use the computer's
// graphics card when it isn't (see ../gpu.ts for why the office can't just pick it itself).
import './gpu.css';
import { currentGpu, type GpuInfo, type GpuKind } from '../gpu';
import { h, openModal } from './dom';
import { copyButton } from './team';

const KIND: Record<GpuKind, { badge: string; say: string }> = {
  discrete: { badge: '✅ Graphics card', say: 'The office is drawn on this computer’s graphics card: as fast as it gets.' },
  integrated: {
    badge: '⚠️ Built-in graphics',
    say: 'The office is drawn on the graphics built into the processor. On a laptop with a graphics card of its own (NVIDIA, AMD Radeon RX, Intel Arc) as well, Windows gives the browser the built-in one unless you tell it otherwise, and the 3D office runs slower for it.',
  },
  software: {
    badge: '🐢 No graphics hardware',
    say: 'The browser is drawing the office in software, on the processor alone, so it will be slow on any computer. Usually hardware acceleration is switched off in the browser, or the graphics driver is missing or blocked.',
  },
  unknown: { badge: '❔ Unknown graphics', say: 'The browser doesn’t say which graphics it draws with.' },
};

/** Which browser this is, for its settings page. */
const edge = () => /\bEdg\//.test(navigator.userAgent);
const onWindows = () => /Windows/.test(navigator.userAgent);

/** A `chrome://` address, which a page can't open: shown to copy into the address bar. */
const address = (url: string) => h('span.gpu-addr', {}, h('code', {}, url), copyButton('Copy', () => url));

function windowsSteps(): HTMLElement {
  const browser = edge() ? 'Microsoft Edge' : 'Google Chrome';
  const exe = edge() ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  return h(
    'div.gpu-steps',
    {},
    h('h3', {}, '🪟 Have Windows give the browser the graphics card'),
    h(
      'ol',
      {},
      h('li', {}, 'Open ', h('b', {}, 'Settings → System → Display → Graphics'), ' (on Windows 10: ', h('b', {}, 'Display → Graphics settings'), ').'),
      h('li', {}, 'Find ', h('b', {}, browser), ' in the list of apps. If it isn’t there, add it: ', h('b', {}, 'Add desktop app / Browse'), ' and pick ', h('code', {}, exe), '.'),
      h('li', {}, 'Click it, then ', h('b', {}, 'Options'), ' (or the drop-down beside it), choose ', h('b', {}, 'High performance'), ' (it names your graphics card), and ', h('b', {}, 'Save'), '.'),
      h('li', {}, 'Close every ', browser, ' window, check it isn’t still running by the clock in the taskbar, open it again and reload the office. This window then says ✅ Graphics card.'),
    ),
    h('p.note', {}, 'With an NVIDIA card you can do the same in the ', h('b', {}, 'NVIDIA Control Panel → Manage 3D settings → Program settings'), ': add the browser and pick ', h('b', {}, 'High-performance NVIDIA processor'), '. A laptop on battery may still hold the card back: plug it in.'),
  );
}

function accelerationSteps(): HTMLElement {
  const settings = edge() ? 'edge://settings/system' : 'chrome://settings/system';
  return h(
    'div.gpu-steps',
    {},
    h('h3', {}, '⚡ Switch hardware acceleration on'),
    h(
      'ol',
      {},
      h('li', {}, 'Paste this into the address bar: ', address(settings)),
      h('li', {}, 'Turn on ', h('b', {}, 'Use graphics acceleration when available'), ' and press ', h('b', {}, 'Relaunch'), '.'),
      h('li', {}, 'Still drawing in software? ', address(edge() ? 'edge://gpu' : 'chrome://gpu'), ' says why: an old graphics driver is the usual reason, so update it from your graphics card maker’s site.'),
    ),
  );
}

/** Opens 🖥️ Graphics. */
export function openGpu() {
  const gpu = currentGpu();
  const kind = gpu?.kind ?? 'unknown';
  const steps: HTMLElement[] = [];
  if (kind === 'software') steps.push(accelerationSteps());
  if (kind !== 'discrete' && onWindows()) steps.push(windowsSteps());
  if (kind === 'integrated' && !onWindows()) {
    steps.push(h('p.note', {}, 'On a Mac with two graphics chips the browser switches to the card by itself when it’s asked for one, as the office asks. On Linux, start the browser with the card’s offload variables (for NVIDIA: ', h('code', {}, '__NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia'), ').'));
  }
  const el = h(
    'div.modal.gpu',
    { role: 'dialog', 'aria-label': 'Graphics', style: 'width:min(640px,100%)' },
    h('header', {}, h('h2', {}, '🖥️ Graphics')),
    h(
      'div.body',
      {},
      h('div.gpu-now', { class: kind }, h('span.gpu-badge', {}, KIND[kind].badge), h('span.gpu-name', {}, gpu?.name ?? 'The 3D office hasn’t started')),
      h('p', {}, KIND[kind].say),
      ...steps,
      kind === 'discrete' ? null : h('p.note', {}, 'Only built-in graphics on this computer? Then this is as fast as it gets here: the 📱 2D view in the ☰ menu has the workers, their terminals and the boards without the 3D.'),
    ),
  );
  openModal(el, { doing: '🖥️ checking the graphics' });
}

/** Whether `gpu` is worth telling about: drawing without the graphics card the browser could have. */
export function gpuHolding(gpu: GpuInfo | undefined = currentGpu()): boolean {
  return gpu?.kind === 'software' || (gpu?.kind === 'integrated' && onWindows());
}
