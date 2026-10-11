// Getting about the Departments hall (see hall-plan.ts for where everything in it is): its rooms'
// glass, its desks and chairs and the kit in each room are in the way, and its lift, at the west end
// of the lobby, is where the workers come in from and go home by.

import { DESK_SIZE, type DeskDef } from './layout.js';
import { ROOM_DOOR } from './departments.js';
import { HALL_BOUNDS, HALL_DESKS, HALL_LIFT, HALL_ROOMS, type HallRoom } from './hall-plan.js';
import { NavGrid, deskPoint, type Pt, type Rect } from './nav.js';

/** A room's door: the middle of its wall on the corridor. */
export function hallDoor(r: HallRoom): { x: number; z: number } {
  return { x: r.podX, z: r.doorZ };
}

/** A room's glass as thin rectangles (minX, maxX, minZ, maxZ), its door left open. */
export function hallRoomWalls(r: HallRoom, t = 0.1): Rect[] {
  const half = ROOM_DOOR / 2;
  const farZ = r.doorZ === r.minZ ? r.maxZ : r.minZ;
  return [
    [r.minX - t / 2, r.minX + t / 2, r.minZ, r.maxZ],
    [r.maxX - t / 2, r.maxX + t / 2, r.minZ, r.maxZ],
    [r.minX, r.maxX, farZ - t / 2, farZ + t / 2],
    [r.minX, r.podX - half, r.doorZ - t / 2, r.doorZ + t / 2],
    [r.podX + half, r.maxX, r.doorZ - t / 2, r.doorZ + t / 2],
  ];
}

/**
 * Where a room's kit stands (a server rack, a board, an easel): in its far corner on the east side,
 * clear of the walkway round its desks on the west side, which reaches the row by the far wall.
 */
export function hallKit(r: HallRoom): { x: number; z: number; facing: number; half: number } {
  const farZ = r.doorZ === r.minZ ? r.maxZ : r.minZ;
  return { x: r.maxX - 0.55, z: farZ + r.out * 0.55, facing: -Math.PI / 2, half: 0.36 };
}

/** What's in the way in the hall: the rooms' glass and kit, and the desks and their chairs. */
function obstacles() {
  const rects: Rect[] = [];
  const circles: [number, number, number][] = [];
  for (const r of HALL_ROOMS) {
    rects.push(...hallRoomWalls(r));
    const kit = hallKit(r);
    rects.push([kit.x - kit.half, kit.x + kit.half, kit.z - kit.half, kit.z + kit.half]);
  }
  const hw = DESK_SIZE.width / 2;
  const hd = DESK_SIZE.depth / 2;
  for (const d of HALL_DESKS) {
    rects.push([d.x - hw, d.x + hw, d.z - hd, d.z + hd]);
    const [cx, cz] = deskPoint(d, 0, 0.9);
    circles.push([cx, cz, 0.35]);
  }
  return { rects, circles };
}

let grid: NavGrid | undefined;
/** The hall on a half-meter grid, made the first time it's needed. */
export function hallNav(): NavGrid {
  return (grid ??= new NavGrid(HALL_BOUNDS, obstacles()));
}

/** In the lift, and just out of it, where the workers come in and go home. */
const IN_LIFT: Pt = [HALL_LIFT.x + 0.4, HALL_LIFT.z];
const OUT_OF_LIFT: Pt = [HALL_LIFT.arrive.x, HALL_LIFT.arrive.z];

/** A worker hired at a hall desk: out of the lift and round to its chair. */
export function hallWayIn(seat: DeskDef): Pt[] {
  return [IN_LIFT, ...hallNav().wayTo(OUT_OF_LIFT, seat)];
}

/** A worker sent home from a hall desk (from beside it, or from `from`): to the lift, and into it. */
export function hallWayHome(seat: DeskDef, from?: Pt): Pt[] {
  const nav = hallNav();
  return [...(from ? nav.route(from, OUT_OF_LIFT) : nav.wayFrom(seat, OUT_OF_LIFT)), IN_LIFT];
}
