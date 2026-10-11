import * as THREE from 'three';
import { DEPARTMENTS, ROOM_DOOR, isDepartmentId } from '../../../shared/departments';
import { HALL, HALL_BOUNDS, HALL_CORRIDOR, HALL_DESKS, HALL_LIFT, HALL_LOBBY, HALL_ROOMS, type HallRoom } from '../../../shared/hall-plan';
import { hallKit } from '../../../shared/hall';
import { DESK_SIZE, SLAB, deskSeat } from '../../../shared/layout';
import { canvasTexture } from '../../world/texture';
import { mesh, roundedBox, textPlane, toon } from '../../world/toon';
import type { Interactable } from '../../world/types';
import type { Fixture, Site } from '../../world/office/fixture';
import { box } from '../../world/office/materials';
import { floorPlant, pendant, plant } from '../../world/office/props';
import { buildDesk } from '../../world/office/seats';
import { KIT, door, glassRun } from './world';

// The Departments hall (see shared/hall-plan.ts): a long, windowless room 600 m north of the office,
// on its level, where the floor's departments sit, a glass room of four desks each down either side of
// a corridor, with a lobby at its west end where the lift comes up. It's part of the floor like the
// office is (its desks are the floor's), so the workers at them are drawn here as at any desk; the
// lift (kind 'hall', defined in features/departments/index.ts) is its way back.

const WALL = '#f3ede4';
const TRIM = '#c9b8a6';
const T = 0.3;

/** The hall's walls, floor and ceiling: nothing outside it shows, and nothing in it casts the sun's shadow over the rest. */
function shell(site: Site) {
  const b = HALL_BOUNDS;
  const w = b.maxX - b.minX;
  const d = b.maxZ - b.minZ;
  const H = HALL.height;
  const g = new THREE.Group();
  const floor = mesh(box(w, 0.2, d), site.planks, HALL.x, -0.1, HALL.z, false);
  g.add(floor);
  // What you stand on (as the office's own floor is, see stack.ts), and what you'd bump your head on.
  site.colliders.push({ ...b, top: 0, bottom: -SLAB }, { ...b, top: H + 0.3, bottom: H });
  // A runner down the corridor, from the lobby to the far end.
  g.add(mesh(roundedBox(b.maxX - HALL_LOBBY.maxX - 1, 0.012, HALL_CORRIDOR.maxZ - HALL_CORRIDOR.minZ - 1.4, 0.3), toon('#d6ccc2'), (HALL_LOBBY.maxX + b.maxX) / 2, 0.014, HALL.z, false));
  const wall = toon(WALL);
  const trim = toon(TRIM);
  for (const [x, z, sx, sz] of [
    [HALL.x, b.minZ - T / 2, w + 2 * T, T],
    [HALL.x, b.maxZ + T / 2, w + 2 * T, T],
    [b.minX - T / 2, HALL.z, T, d],
    [b.maxX + T / 2, HALL.z, T, d],
  ] as const) {
    g.add(mesh(box(sx, H, sz), wall, x, H / 2, z, false));
    g.add(mesh(box(sx + 0.02, 0.14, sz + 0.02), trim, x, 0.07, z, false));
    site.colliders.push({ minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2, top: H });
  }
  // Lit by its own lamps, not the sun, which never reaches it.
  const ceiling = mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: '#efe8dc' }), HALL.x, H, HALL.z, false);
  ceiling.rotation.x = Math.PI / 2;
  g.add(ceiling);
  // Lamps down the corridor and over each room's desks.
  const lamps: [number, number][] = [];
  for (let x = HALL_LOBBY.maxX + 3; x < b.maxX - 2; x += 7.6) lamps.push([x, HALL.z]);
  lamps.push([(b.minX + HALL_LOBBY.maxX) / 2, HALL.z]);
  for (const r of HALL_ROOMS) lamps.push([r.podX, r.podZ]);
  for (const [x, z] of lamps) {
    const lamp = pendant(0.9);
    lamp.position.set(x, H - 1.1, z);
    g.add(lamp);
  }
  g.traverse((o) => ((o as THREE.Mesh).castShadow = false));
  site.group.add(g);
}

/** The lift in the lobby's west wall, its doors shut (the office's elevator is where it really goes), and its call button. */
function lift(site: Site) {
  const steel = toon('#aab4be');
  const frame = toon('#6c757d');
  const x = HALL_LIFT.x + 0.02;
  const z = HALL_LIFT.z;
  const w = HALL_LIFT.width;
  const g = new THREE.Group();
  g.add(mesh(box(0.12, 2.6, w + 0.4), frame, x, 1.3, z, false));
  for (const side of [-1, 1]) g.add(mesh(box(0.06, 2.4, w / 2 - 0.03), steel, x + 0.07, 1.2, z + (side * w) / 4, false));
  // Its call button, beside the doors.
  g.add(mesh(box(0.05, 0.22, 0.14), frame, x + 0.06, 1.15, z + w / 2 + 0.35, false));
  g.add(mesh(new THREE.CircleGeometry(0.035, 12).rotateY(Math.PI / 2), toon('#ffd166'), x + 0.09, 1.15, z + w / 2 + 0.35, false));
  const label = textPlane('🛗 Lift · up to the office', { bg: '#2b2d42', color: '#fffaf3', size: 48, border: '#fffaf3' });
  label.scale.multiplyScalar(0.45);
  label.position.set(x + 0.1, 2.95, z);
  label.rotation.y = Math.PI / 2;
  g.add(label);
  // Looked at (first person) or stood by (third), it's the lift.
  const it: Interactable = { kind: 'hall', x: HALL_LIFT.arrive.x - 0.6, z, radius: 1.6 };
  g.userData.interact = it;
  site.group.add(g);
  site.interactables.push(it);
}

/** A board on the lobby's north wall: which department is in which room. */
function directory(site: Site) {
  const rows = HALL_ROOMS.map((r) => (isDepartmentId(r.dept) ? DEPARTMENTS[r.dept] : undefined)).filter((d) => !!d);
  const tex = canvasTexture(520, 620, (g) => {
    g.fillStyle = '#2b2d42';
    g.fillRect(0, 0, 520, 620);
    g.fillStyle = '#fffaf3';
    g.font = '800 40px Nunito, system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('🏢 Departments', 260, 56);
    g.textAlign = 'left';
    g.font = '700 26px Nunito, system-ui, sans-serif';
    rows.forEach((d, i) => {
      const y = 112 + i * 50;
      g.fillStyle = d.color;
      g.fillRect(30, y - 26, 12, 34);
      g.fillStyle = '#fffaf3';
      g.fillText(`${d.emoji} ${d.name}`, 58, y);
      g.fillStyle = '#adb5bd';
      g.textAlign = 'right';
      g.fillText(i < 5 ? 'left ↖' : 'right ↙', 490, y);
      g.textAlign = 'left';
    });
  });
  const board = mesh(new THREE.PlaneGeometry(2.2, 2.62), new THREE.MeshBasicMaterial({ map: tex }), (HALL_BOUNDS.minX + HALL_LOBBY.maxX) / 2, 1.9, HALL_BOUNDS.minZ + 0.03, false);
  site.group.add(board);
  site.group.add(mesh(box(2.34, 2.76, 0.04), toon('#fffaf3'), board.position.x, 1.9, HALL_BOUNDS.minZ + 0.01, false));
  // Plants by the lift, and on the far side of the lobby.
  [
    [HALL_BOUNDS.minX + 0.6, HALL.z - 2.2],
    [HALL_BOUNDS.minX + 0.6, HALL.z + 2.2],
    [HALL_LOBBY.maxX - 0.6, HALL_BOUNDS.maxZ - 0.6],
  ].forEach(([x, z], i) => {
    const p = plant(floorPlant(i), 1);
    p.position.set(x, 0, z);
    site.group.add(p);
    site.colliders.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3, top: 0.5 });
  });
}

/** One department's room: its floor, its glass in its color with the door onto the corridor, its name over the door, and its kit. */
function room(site: Site, r: HallRoom) {
  if (!isDepartmentId(r.dept)) return;
  const d = DEPARTMENTS[r.dept];
  const frame = toon(d.color);
  const farZ = r.doorZ === r.minZ ? r.maxZ : r.minZ;
  site.group.add(mesh(roundedBox(r.maxX - r.minX - 0.12, 0.012, r.maxZ - r.minZ - 0.12, 0.25), toon(d.floor), r.podX, 0.016, r.podZ, false));
  glassRun(site, frame, r.minX, r.minZ, r.minX, r.maxZ);
  glassRun(site, frame, r.maxX, r.minZ, r.maxX, r.maxZ);
  glassRun(site, frame, r.minX, farZ, r.maxX, farZ);
  glassRun(site, frame, r.minX, r.doorZ, r.podX - ROOM_DOOR / 2, r.doorZ);
  glassRun(site, frame, r.podX + ROOM_DOOR / 2, r.doorZ, r.maxX, r.doorZ);
  // The corridor side is out of the room: the north row's doors open to +z, the south row's to -z.
  door(site, r.podX, r.doorZ, r.out, frame);
  for (const side of [1, -1]) {
    const label = textPlane(`${d.emoji} ${d.name}`, { bg: d.color, color: '#ffffff', size: 56, border: '#ffffff' });
    label.scale.multiplyScalar(0.5);
    label.position.set(r.podX, 2.42, r.doorZ + side * r.out * 0.07);
    label.rotation.y = side * r.out > 0 ? 0 : Math.PI;
    site.group.add(label);
  }
  const at = hallKit(r);
  const kit = KIT[r.dept]();
  kit.position.set(at.x, 0, at.z);
  kit.rotation.y = at.facing;
  site.group.add(kit);
  site.colliders.push({ minX: at.x - at.half, maxX: at.x + at.half, minZ: at.z - at.half, maxZ: at.z + at.half, top: 1.8 });
}

/** The hall's desks, as the office's are built (see seats.ts): their views, what's in the way and what to use. */
function desks(site: Site) {
  HALL_DESKS.forEach((def, i) => {
    const view = buildDesk(def, i, site.looks.trim);
    site.group.add(view.group);
    site.desks.set(def.id, view);
    const hw = DESK_SIZE.width / 2 - 0.05;
    const hd = DESK_SIZE.depth / 2 - 0.02;
    site.colliders.push({ minX: def.x - hw, maxX: def.x + hw, minZ: def.z - hd, maxZ: def.z + hd, top: DESK_SIZE.height });
    const seat = deskSeat(def, 1.25);
    const it: Interactable = { kind: 'desk', deskId: def.id, x: seat.x, z: seat.z, radius: 1.3 };
    site.interactables.push(it);
    view.group.userData.interact = it;
  });
}

/** The Departments hall, built with the office floor. */
export const departmentHall: Fixture = (site) => {
  shell(site);
  lift(site);
  directory(site);
  for (const r of HALL_ROOMS) room(site, r);
  desks(site);
  return {};
};
