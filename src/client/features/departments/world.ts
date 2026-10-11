import * as THREE from 'three';
import { MANAGER_BOOTH, ROOM_DOOR, ROOM_HEIGHT, type DepartmentId } from '../../../shared/departments';
import { canvasTexture } from '../../world/texture';
import { mesh, roundedBox, textPlane, toon } from '../../world/toon';
import type { Fixture, Site } from '../../world/office/fixture';
import { PALETTE, box, glassPane } from '../../world/office/materials';
import { floorPlant, plant } from '../../world/office/props';

// What the departments' rooms are made of (built in the Departments hall, see hall.ts): runs of glass
// framed in each department's color, doors that slide open as anyone comes up to them, and the kit of
// each one's trade; and the Manager's booth in the office, made of the same glass.

const T = 0.08;

/** A run of glass `H` high from (x0, z0) to (x1, z1), one axis held, in panes about 1.4 wide, framed in `frame`, and what's in its way. */
export function glassRun(site: Site, frame: THREE.Material, x0: number, z0: number, x1: number, z1: number, H = ROOM_HEIGHT) {
  const alongX = z0 === z1;
  const len = alongX ? x1 - x0 : z1 - z0;
  if (len <= 0.05) return;
  const n = Math.max(1, Math.round(len / 1.4));
  const g = new THREE.Group();
  const bar = (w: number, h: number, d: number, x: number, y: number, z: number) => g.add(mesh(box(w, h, d), frame, x, y, z, false));
  for (let i = 0; i < n; i++) {
    const pane = glassPane(len / n - 0.04, H - 0.16);
    const u = (i + 0.5) * (len / n);
    pane.position.set(alongX ? x0 + u : x0, H / 2, alongX ? z0 : z0 + u);
    if (!alongX) pane.rotation.y = Math.PI / 2;
    g.add(pane);
  }
  for (let i = 0; i <= n; i++) {
    const u = i * (len / n);
    if (alongX) bar(0.07, H, T + 0.04, x0 + u, H / 2, z0);
    else bar(T + 0.04, H, 0.07, x0, H / 2, z0 + u);
  }
  for (const y of [0.04, H - 0.05]) {
    if (alongX) bar(len, 0.09, T + 0.06, x0 + len / 2, y, z0);
    else bar(T + 0.06, 0.09, len, x0, y, z0 + len / 2);
  }
  site.group.add(g);
  site.colliders.push(alongX ? { minX: x0, maxX: x1, minZ: z0 - T / 2, maxZ: z0 + T / 2, top: H, fence: true } : { minX: x0 - T / 2, maxX: x0 + T / 2, minZ: z0, maxZ: z1, top: H, fence: true });
}

/** A door at (dx, z) in a wall `H` high along x, `out` the way out of it: two glass leaves that slide apart over the glass either side, as the meeting room's do. */
export function door(site: Site, dx: number, z: number, out: 1 | -1, frame: THREE.Material, H = ROOM_HEIGHT) {
  const half = ROOM_DOOR / 2;
  const h = Math.min(2.2, H - 0.15);
  const leaves: [THREE.Group, number][] = [];
  for (const side of [-1, 1]) {
    const leaf = new THREE.Group();
    for (const y of [0.04, h - 0.04]) leaf.add(mesh(box(half, 0.07, 0.04), frame, 0, y, 0, false));
    for (const x of [-half / 2 + 0.03, half / 2 - 0.03]) leaf.add(mesh(box(0.06, h, 0.04), frame, x, h / 2, 0, false));
    const pane = glassPane(half - 0.12, h - 0.14);
    pane.position.y = h / 2;
    leaf.add(pane);
    leaf.add(mesh(box(0.03, 0.36, 0.07), toon(PALETTE.ink), -side * (half / 2 - 0.1), 1.05, 0, false));
    const x0 = dx + (side * half) / 2;
    // Outside the glass, so it slides across in front of it.
    leaf.position.set(x0, 0, z + out * (T / 2 + 0.04));
    site.group.add(leaf);
    leaves.push([leaf, x0]);
  }
  // Over the doorway, up to the top of the glass.
  site.group.add(mesh(box(ROOM_DOOR, H - h, T + 0.04), frame, dx, (H + h) / 2, z, false));
  site.doors.push({
    x: dx,
    y: 0,
    z,
    open: 0,
    show: (k) => {
      const e = k * k * (3 - 2 * k);
      for (const [leaf, x0] of leaves) leaf.position.x = x0 + Math.sign(x0 - dx) * e * (half - 0.06);
    },
  });
}

/** A board on two legs, `paint` drawn on its 3:4 face, which faces +z. */
function standBoard(paint: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.Group {
  const g = new THREE.Group();
  const W = 0.8;
  const H = 1.05;
  const legs = toon('#495057');
  for (const sx of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.6, 6), legs, (sx * W) / 2.4, 0.8, -0.03));
  g.add(mesh(roundedBox(W + 0.06, H + 0.06, 0.04, 0.02), toon('#ffffff'), 0, 1.05, -0.01));
  const face = mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: canvasTexture(240, 315, (c) => paint(c, 240, 315)) }), 0, 1.05, 0.012, false);
  g.add(face);
  return g;
}

/** Sticky notes in columns: a sprint board, or a roadmap. */
function columns(titles: string[], colors: string[], notes: number[][]) {
  return (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.fillStyle = '#fffaf3';
    g.fillRect(0, 0, w, h);
    const cw = w / titles.length;
    g.font = '800 22px Nunito, system-ui, sans-serif';
    g.textAlign = 'center';
    titles.forEach((t, i) => {
      g.fillStyle = '#2b2d42';
      g.fillText(t, cw * i + cw / 2, 30);
      if (i) g.fillRect(cw * i, 44, 2, h - 56);
      notes[i].forEach((y, k) => {
        g.fillStyle = colors[(i + k) % colors.length];
        g.fillRect(cw * i + 10, 54 + y, cw - 20, 40);
        g.fillStyle = 'rgba(43,45,66,.35)';
        g.fillRect(cw * i + 16, 66 + y, cw - 40, 4);
        g.fillRect(cw * i + 16, 76 + y, cw - 52, 4);
      });
    });
  };
}

/** The kit of each department's trade, standing in its room's corner facing in (+z here). */
export const KIT: Record<DepartmentId, () => THREE.Group> = {
  // A server rack with its lights blinking green and red, and a padlock on its door.
  security: () => {
    const g = new THREE.Group();
    g.add(mesh(roundedBox(0.62, 1.8, 0.6, 0.04), toon('#22223b'), 0, 0.9, 0));
    for (let i = 0; i < 7; i++) {
      g.add(mesh(box(0.5, 0.16, 0.02), toon('#4a4e69'), 0, 0.3 + i * 0.22, 0.305, false));
      g.add(mesh(new THREE.SphereGeometry(0.018, 6, 4), toon(i % 3 ? '#06d6a0' : '#ef476f'), 0.18, 0.3 + i * 0.22, 0.32, false));
    }
    const lock = new THREE.Group();
    lock.add(mesh(roundedBox(0.16, 0.13, 0.05, 0.02), toon('#ffd166'), 0, 0, 0));
    lock.add(mesh(new THREE.TorusGeometry(0.05, 0.015, 6, 12, Math.PI), toon('#adb5bd'), 0, 0.065, 0, false));
    lock.position.set(-0.15, 1.95, 0.25);
    g.add(lock);
    return g;
  },
  // A test-results board: green ticks, and the odd bug.
  qa: () =>
    standBoard((g, w, h) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      g.font = '800 26px Nunito, system-ui, sans-serif';
      g.fillStyle = '#2a9d8f';
      g.textAlign = 'center';
      g.fillText('✓ 128 passed', w / 2, 40);
      for (let i = 0; i < 9; i++) {
        const y = 70 + i * 26;
        g.fillStyle = i === 5 ? '#ef476f' : '#06d6a0';
        g.beginPath();
        g.arc(28, y, 8, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ced4da';
        g.fillRect(46, y - 4, w - 70 - (i * 37) % 60, 8);
      }
      g.font = '40px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
      g.fillText('🐞', w - 36, h - 24);
    }),
  // A database: three stacked drums.
  backend: () => {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.32, 20), toon(i % 2 ? '#3a86ff' : '#5e9bff'), 0, 0.18 + i * 0.36, 0));
      g.add(mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 24), toon('#1d3557'), 0, 0.35 + i * 0.36, 0, false).rotateX(Math.PI / 2));
    }
    return g;
  },
  // A big screen on a stand showing a page being laid out.
  frontend: () =>
    standBoard((g, w, h) => {
      g.fillStyle = '#1b263b';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#fb8500';
      g.fillRect(14, 14, w - 28, 34);
      const blocks = ['#ffb703', '#8ecae6', '#219ebc', '#ffffff'];
      for (let i = 0; i < 6; i++) {
        g.fillStyle = blocks[i % blocks.length];
        g.fillRect(14 + (i % 2) * ((w - 28) / 2 + 4), 60 + Math.floor(i / 2) * 80, (w - 36) / 2, 70);
      }
    }),
  // A roadmap: now, next, later.
  po: () => standBoard(columns(['Now', 'Next', 'Later'], ['#cdb4db', '#ffc8dd', '#bde0fe', '#a2d2ff'], [[0, 50, 100], [0, 50, 100, 150], [0, 50]])),
  // An easel with swatches on its canvas.
  design: () => {
    const g = new THREE.Group();
    const wood = toon(PALETTE.wood);
    for (const [x, z, tilt] of [[-0.3, 0.12, 0.12], [0.3, 0.12, -0.12], [0, -0.3, 0]] as const) {
      const leg = mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.7, 6), wood, x, 0.83, z);
      leg.rotation.set(z < 0 ? -0.25 : 0.1, 0, tilt);
      g.add(leg);
    }
    const canvas = mesh(
      new THREE.PlaneGeometry(0.72, 0.6),
      new THREE.MeshBasicMaterial({
        map: canvasTexture(240, 200, (c) => {
          c.fillStyle = '#ffffff';
          c.fillRect(0, 0, 240, 200);
          ['#ff006e', '#fb5607', '#ffbe0b', '#3a86ff', '#8338ec', '#06d6a0'].forEach((col, i) => {
            c.fillStyle = col;
            c.beginPath();
            c.arc(46 + (i % 3) * 74, 62 + Math.floor(i / 3) * 76, 28, 0, Math.PI * 2);
            c.fill();
          });
        }),
      }),
      0,
      1.25,
      0.17,
      false,
    );
    canvas.rotation.x = -0.12;
    g.add(canvas);
    g.add(mesh(box(0.8, 0.04, 0.08), wood, 0, 0.93, 0.2, false));
    return g;
  },
  // The pipeline: build, test, release, a tick for each stage that passed.
  devops: () =>
    standBoard((g, w) => {
      g.fillStyle = '#0b1f14';
      g.fillRect(0, 0, w, 315);
      g.font = '800 22px Nunito, system-ui, sans-serif';
      g.textAlign = 'left';
      ['build', 'test', 'lint', 'package', 'release'].forEach((stage, i) => {
        const y = 40 + i * 56;
        g.fillStyle = i < 4 ? '#2b9348' : '#f9c74f';
        g.beginPath();
        g.arc(34, y, 14, 0, Math.PI * 2);
        g.fill();
        if (i < 4) g.fillRect(31, y + 14, 6, 28);
        g.fillStyle = '#e9f5db';
        g.fillText(`${i < 4 ? '✓' : '…'} ${stage}`, 60, y + 8);
      });
    }),
  // A sheet of Persian copy being written, right to left, with its length counted.
  content: () =>
    standBoard((g, w, h) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      g.direction = 'rtl';
      g.textAlign = 'right';
      g.fillStyle = '#023e8a';
      g.font = '800 26px Tahoma, Vazirmatn, sans-serif';
      g.fillText('متن پیام', w - 16, 40);
      g.font = '18px Tahoma, Vazirmatn, sans-serif';
      g.fillStyle = '#2b2d42';
      ['سلام {{name}} عزیز،', 'کد تخفیف شما آماده است.', 'تا پایان هفته معتبر است.'].forEach((line, i) => g.fillText(line, w - 16, 84 + i * 34));
      g.fillStyle = '#90e0ef';
      for (let i = 0; i < 4; i++) g.fillRect(16 + (i % 2) * 40, 200 + i * 22, w - 60 - (i % 2) * 40, 8);
      g.direction = 'ltr';
      g.textAlign = 'left';
      g.font = '700 16px Nunito, system-ui, sans-serif';
      g.fillStyle = '#6c757d';
      g.fillText('62 / 70', 16, h - 16);
    }),
  // A short bookcase of the project's docs.
  docs: () => {
    const g = new THREE.Group();
    const wood = toon('#8d6e63');
    g.add(mesh(box(0.8, 1.3, 0.34), wood, 0, 0.65, 0));
    const spines = ['#e63946', '#3a86ff', '#ffb703', '#2a9d8f', '#8338ec', '#fb8500', '#1d3557'];
    for (const [shelf, y] of [[0, 0.32], [1, 0.74], [2, 1.12]] as const) {
      g.add(mesh(box(0.72, 0.03, 0.3), toon('#6d4c41'), 0, y - 0.17, 0.02, false));
      for (let i = 0; i < 6; i++) {
        const tall = 0.24 + ((i * 7 + shelf * 3) % 5) * 0.02;
        g.add(mesh(box(0.08, tall, 0.22), toon(spines[(i + shelf * 2) % spines.length]), -0.27 + i * 0.105, y - 0.15 + tall / 2, 0.05, false));
      }
    }
    return g;
  },
  // The architecture: boxes and the arrows between them.
  techlead: () =>
    standBoard((g, w, h) => {
      g.fillStyle = '#f8f9fa';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#1d3557';
      g.lineWidth = 3;
      const boxes: [number, number][] = [[20, 30], [130, 30], [75, 135], [20, 235], [130, 235]];
      for (const [x, y] of boxes) {
        g.fillStyle = '#dbe4f0';
        g.fillRect(x, y, 90, 50);
        g.strokeRect(x, y, 90, 50);
      }
      for (const [a, b] of [[0, 2], [1, 2], [2, 3], [2, 4]] as const) {
        g.beginPath();
        g.moveTo(boxes[a][0] + 45, boxes[a][1] + 50);
        g.lineTo(boxes[b][0] + 45, boxes[b][1]);
        g.stroke();
      }
    }),
};

/**
 * The Manager's booth round its kiosk (see MANAGER_BOOTH): gold-framed glass, low enough that the
 * Manager's name tag and the card over its head stand clear above it, its door toward the room, its
 * own floor, its name on the glass beside the door, and a tall plant in each back corner.
 */
export const managerBooth: Fixture = (site) => {
  const b = MANAGER_BOOTH;
  const frame = toon(b.color);
  site.group.add(mesh(roundedBox(b.maxX - b.minX - 0.12, 0.012, b.maxZ - b.minZ - 0.12, 0.25), toon(b.floor), (b.minX + b.maxX) / 2, 0.016, (b.minZ + b.maxZ) / 2, false));
  const H = b.height;
  glassRun(site, frame, b.minX, b.minZ, b.minX, b.maxZ, H);
  glassRun(site, frame, b.maxX, b.minZ, b.maxX, b.maxZ, H);
  glassRun(site, frame, b.minX, b.maxZ, b.maxX, b.maxZ, H);
  glassRun(site, frame, b.minX, b.minZ, b.doorX - ROOM_DOOR / 2, b.minZ, H);
  glassRun(site, frame, b.doorX + ROOM_DOOR / 2, b.minZ, b.maxX, b.minZ, H);
  door(site, b.doorX, b.minZ, -1, frame, H);
  // On the glass west of the door (on your right as you come up to it), outside and in.
  const signX = (b.minX + b.doorX - ROOM_DOOR / 2) / 2;
  for (const side of [-1, 1]) {
    const label = textPlane('💼 Manager', { bg: b.color, color: '#2b2d42', size: 56, border: '#ffffff' });
    label.scale.multiplyScalar(0.36);
    label.position.set(signX, 1.55, b.minZ + side * (T / 2 + 0.03));
    label.rotation.y = side > 0 ? 0 : Math.PI;
    site.group.add(label);
  }
  b.plants.forEach(([x, z], i) => {
    const p = plant(floorPlant(i + 1), 0.9);
    p.position.set(x, 0, z);
    site.group.add(p);
    site.colliders.push({ minX: x - 0.27, maxX: x + 0.27, minZ: z - 0.27, maxZ: z + 0.27, top: 0.45 });
  });
  return {};
};

