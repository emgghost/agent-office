import * as THREE from 'three';
import type { DepartmentDef, DepartmentId } from '../../../shared/departments';
import { mesh, toon, toonUnique } from '../../world/toon';

// What a department's workers wear over their own skin (which is the department's color, see
// WorkerManager.spawn): its emoji on a badge on the chest, and its own headwear or kit, in colors that
// stand out against that skin. Built in the
// worker's body space (world/character/worker.ts): a bean 0.28 round with its middle at y 0.55, eyes
// at y 0.7, the headset's band over the top at 0.72 and the antenna's status bulb up at 1.2, which
// every hat leaves showing.

const BEAN = { y: 0.55, half: 0.15, r: 0.28 } as const;
const UP = new THREE.Vector3(0, 0, 1);

/** Lays `m` on the bean's surface at height `y`, `a` round from the front (+z), `out` off it, facing out. */
function onBean<T extends THREE.Object3D>(m: T, y: number, a: number, out = 0): T {
  const c = THREE.MathUtils.clamp(y, BEAN.y - BEAN.half, BEAN.y + BEAN.half);
  const dy = y - c;
  const rr = Math.sqrt(Math.max(0, BEAN.r * BEAN.r - dy * dy));
  const normal = new THREE.Vector3(Math.sin(a) * rr, dy, Math.cos(a) * rr).normalize();
  m.position.set(Math.sin(a) * rr, y, Math.cos(a) * rr).addScaledVector(normal, out);
  m.quaternion.setFromUnitVectors(UP, normal);
  return m;
}

const badges = new Map<string, THREE.MeshBasicMaterial>();

/** The department's emoji on a white disc ringed in its color, as a texture, made once each. */
function badgeMaterial(d: DepartmentDef): THREE.MeshBasicMaterial {
  let m = badges.get(d.id);
  if (m) return m;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = d.color;
  g.beginPath();
  g.arc(64, 64, 62, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(64, 64, 50, 0, Math.PI * 2);
  g.fill();
  g.font = '64px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(d.emoji, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.1 });
  badges.set(d.id, m);
  return m;
}

/** A small material for details, drawn without the cartoon outline, which would swallow them. */
function detail(color: string): THREE.MeshToonMaterial {
  const m = toonUnique(color);
  m.userData.outlineParameters = { visible: false };
  return m;
}

/** A cap over the top of the head, as far down as `rim` (y), in `color`. The antenna pokes through its top. */
function dome(color: string, rim: number, r = 0.3): THREE.Mesh {
  const top = Math.acos(THREE.MathUtils.clamp((rim - (BEAN.y + BEAN.half)) / r, -1, 1));
  return mesh(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, top), toon(color), 0, BEAN.y + BEAN.half, 0);
}

const GEAR: Record<DepartmentId, (g: THREE.Group, d: DepartmentDef) => void> = {
  // Dark wraparound shades across the eyes.
  security: (g) => {
    const shades = mesh(new THREE.TorusGeometry(0.285, 0.045, 6, 24, Math.PI * 0.62), toon('#14213d'), 0, 0.71, 0, false);
    shades.rotation.set(Math.PI / 2, 0, Math.PI * 0.19);
    shades.scale.set(1, 1, 0.7);
    g.add(shades);
    g.add(mesh(new THREE.BoxGeometry(0.42, 0.012, 0.02), detail('#ffffff'), 0, 0.735, 0.255, false));
  },
  // Lab goggles pushed up on the forehead.
  qa: (g) => {
    const strap = mesh(new THREE.TorusGeometry(0.288, 0.018, 6, 28), toon('#264653'), 0, 0.86, 0, false);
    strap.rotation.x = Math.PI / 2;
    g.add(strap);
    for (const a of [-0.32, 0.32]) {
      const lens = onBean(new THREE.Group(), 0.86, a, 0.02);
      lens.add(mesh(new THREE.TorusGeometry(0.065, 0.02, 6, 16), toon('#264653'), 0, 0, 0, false));
      lens.add(mesh(new THREE.CircleGeometry(0.058, 16), detail('#bde0fe'), 0, 0, 0.004, false));
      g.add(lens);
    }
  },
  // A knitted beanie, with its turned-up band.
  backend: (g, d) => {
    g.add(dome('#1d3557', 0.82, 0.305));
    const band = mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 28), toon(d.color), 0, 0.83, 0, false);
    band.rotation.x = Math.PI / 2;
    g.add(band);
  },
  // A cap on backwards.
  frontend: (g) => {
    g.add(dome('#023047', 0.84, 0.3));
    const brim = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 20, 1, false, -Math.PI / 2, Math.PI), toon('#ffb703'), 0, 0.85, -0.24, false);
    brim.scale.z = 1.3;
    g.add(brim);
  },
  // A small gold crown: the product is theirs.
  po: (g) => {
    const gold = toon('#ffd166');
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.08, 18, 1, true), gold, 0, 0.99, 0, false));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(mesh(new THREE.ConeGeometry(0.035, 0.09, 6), gold, Math.sin(a) * 0.15, 1.07, Math.cos(a) * 0.15, false));
    }
  },
  // A tie, and a pencil behind the ear.
  pm: (g) => {
    const tie = onBean(new THREE.Group(), 0.43, 0, 0.005);
    tie.add(mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), toon('#ffd166'), 0, 0.04, 0, false));
    const blade = mesh(new THREE.ConeGeometry(0.05, 0.2, 4), toon('#ffd166'), 0, -0.08, 0, false);
    blade.rotation.set(Math.PI, Math.PI / 4, 0);
    tie.add(blade);
    g.add(tie);
    const pencil = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6), toon('#ffb703'), 0.3, 0.8, -0.02, false);
    pencil.rotation.z = Math.PI / 2.6;
    g.add(pencil);
  },
  // A beret, tipped to one side, with its little stalk.
  design: (g, d) => {
    // A squashed ball over the top of the head, overhanging it the way a beret does.
    const beret = mesh(new THREE.SphereGeometry(0.26, 20, 12), toon('#2b2d42'), 0.05, 0.93, 0);
    beret.scale.y = 0.38;
    beret.rotation.z = -0.25;
    g.add(beret);
    g.add(mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.06, 6), toon(d.color), 0.1, 1.04, 0, false));
  },
  // A sweatband, and a whistle on a lanyard.
  scrum: (g) => {
    const band = mesh(new THREE.TorusGeometry(0.29, 0.04, 8, 28), toon('#ffffff'), 0, 0.85, 0, false);
    band.rotation.x = Math.PI / 2;
    g.add(band);
    const lanyard = mesh(new THREE.TorusGeometry(0.27, 0.01, 4, 28), detail('#e63946'), 0, 0.45, 0.02, false);
    lanyard.rotation.x = Math.PI / 2.4;
    g.add(lanyard);
    const whistle = onBean(new THREE.Group(), 0.36, 0.25, 0.03);
    whistle.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 10), toon('#adb5bd'), 0, 0, 0, false));
    g.add(whistle);
  },
};

/** The gear that goes on the head, which gives way to an elf's hat at Christmas. */
const HEADWEAR: ReadonlySet<DepartmentId> = new Set(['backend', 'frontend', 'po', 'design', 'scrum']);

/** What a worker in department `d` wears: its kit (without what goes on its head, `hats` false) and its badge. */
export function departmentGear(d: DepartmentDef, hats = true): THREE.Group {
  const g = new THREE.Group();
  if (hats || !HEADWEAR.has(d.id)) GEAR[d.id](g, d);
  // The badge sits off-center on the chest, clear of the tie and the whistle.
  g.add(onBean(mesh(new THREE.CircleGeometry(0.07, 24), badgeMaterial(d), 0, 0, 0, false), 0.5, -0.42, 0.006));
  g.traverse((m) => ((m as THREE.Mesh).castShadow = true));
  return g;
}
