// Which graphics the browser draws the 3D office with. The renderer asks for the fast one
// (powerPreference: 'high-performance', core/scene.ts), but that's only a wish: on a Windows laptop
// with a graphics card beside the built-in graphics, Chrome and Edge run on whichever Windows gives
// them, the built-in one unless told otherwise, and a browser with hardware acceleration off draws
// in software. So the office looks at what it got, and says how to get the card (ui/gpu.ts).

export type GpuKind = 'discrete' | 'integrated' | 'software' | 'unknown';

export interface GpuInfo {
  /** The renderer as the browser names it, without ANGLE's wrapping: "Intel(R) UHD Graphics 620". */
  name: string;
  kind: GpuKind;
}

/** Drawing on the processor, with no graphics hardware at all. */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|basic render|software|lavapipe/i;
/** A graphics card of its own. */
const DISCRETE = /nvidia|geforce|quadro|\brtx\b|\bgtx\b|radeon\s*(rx|pro|r9|r7|vii)|\bfirepro\b|\barc(?:\(tm\))?\s*[ab]\d/i;
/** The graphics built into the processor. */
const INTEGRATED = /intel|\buhd\b|\biris\b|radeon\(tm\)\s*graphics|radeon\s*graphics|vega\s*\d+\s*graphics|apple|\bm\d\b|mali|adreno|powervr/i;

/** "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)" -> "Intel(R) UHD Graphics 620". */
export function gpuName(renderer: string): string {
  let name = renderer.trim();
  // ANGLE (vendor, the renderer, the backend), split at the commas outside brackets.
  if (/^ANGLE \(.*\)$/.test(name)) {
    const parts: string[] = [''];
    let depth = 0;
    for (const ch of name.slice('ANGLE ('.length, -1)) {
      if (ch === ',' && depth === 0) parts.push('');
      else {
        depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
        parts[parts.length - 1] += ch;
      }
    }
    name = (parts[1] ?? parts[0]).replace(/\s+Direct3D\S*(\s+[vp]s_\d_\d)*/i, '').replace(/\s*\(0x[0-9a-f]+\)/gi, '');
  }
  return name.replace(/\s+/g, ' ').trim();
}

/** What kind of graphics a renderer string names. */
export function gpuKind(renderer: string): GpuKind {
  if (!renderer) return 'unknown';
  if (SOFTWARE.test(renderer)) return 'software';
  if (DISCRETE.test(renderer)) return 'discrete';
  if (INTEGRATED.test(renderer)) return 'integrated';
  return 'unknown';
}

let seen: GpuInfo | undefined;

/** Reads what the browser is drawing with, once the 3D office's renderer is made. */
export function noteGpu(gl: WebGLRenderingContext | WebGL2RenderingContext): GpuInfo {
  let renderer = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    renderer = String((ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) ?? '');
  } catch {
    // a browser that won't say
  }
  seen = { name: gpuName(renderer) || 'Unknown graphics', kind: gpuKind(renderer) };
  return seen;
}

/** What the 3D office draws with, once it has started. */
export function currentGpu(): GpuInfo | undefined {
  return seen;
}
