// The Departments hall: a floor's second room, where its departments sit (shared/departments.ts), a
// glass room of four desks each. The office's elevator goes there as a stop of its own (🏢
// Departments); it stands on the office's own level, 600 m north of the building, out past the
// city, with no windows, so nothing outside it ever shows. Plain numbers only, with nothing imported
// at run time: layout.ts takes the hall's desks in among every desk (DESK_BY_ID), and departments.ts
// and hall.ts build on these.

import type { DeskDef } from './layout.js';

/** Where the hall stands: its middle, and how far it reaches either way from it, at the office's own level (y 0). */
export const HALL = { x: 0, z: -600, halfX: 24, halfZ: 9.5, height: 4.2 } as const;

/** The hall's floor, in the world. */
export const HALL_BOUNDS = { minX: HALL.x - HALL.halfX, maxX: HALL.x + HALL.halfX, minZ: HALL.z - HALL.halfZ, maxZ: HALL.z + HALL.halfZ } as const;

/** Whether (x, z) is in the hall. */
export function inHall(x: number, z: number): boolean {
  return x > HALL_BOUNDS.minX - 0.5 && x < HALL_BOUNDS.maxX + 0.5 && z > HALL_BOUNDS.minZ - 0.5 && z < HALL_BOUNDS.maxZ + 0.5;
}

/** The lobby at the hall's west end, with the lift in its west wall: where you step out, facing into the hall (+x). */
export const HALL_LOBBY = { maxX: HALL_BOUNDS.minX + 9.2 } as const;
export const HALL_LIFT = { x: HALL_BOUNDS.minX, z: HALL.z, width: 1.8, arrive: { x: HALL_BOUNDS.minX + 1.6, z: HALL.z, rotY: Math.PI / 2 } } as const;

/** The corridor down the middle of the hall, between the two rows of rooms. */
export const HALL_CORRIDOR = { minZ: HALL.z - 2.5, maxZ: HALL.z + 2.5 } as const;

/** A room's size, and the gap between rooms along a row. */
const ROOM_W = 7;
const ROOM_D = 6;
const ROOM_GAP = 0.6;

/**
 * The rooms, west to east: the north row's, whose doors open south onto the corridor, and the south
 * row's, whose doors open north onto it. Department ids, as shared/departments.ts has them.
 */
export const HALL_ROWS = {
  north: ['backend', 'frontend', 'qa', 'security', 'devops'],
  south: ['po', 'design', 'content', 'docs', 'techlead'],
} as const;

/** A department's room in the hall: its walls, and the wall its door is in, which faces the corridor. */
export interface HallRoom {
  dept: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** The z of the wall with the door, on the corridor, and which way out of it is (+1 toward +z). */
  doorZ: number;
  out: 1 | -1;
  /** The middle of its desks, back to back in two rows of two. */
  podX: number;
  podZ: number;
}

export const HALL_ROOMS: readonly HallRoom[] = (['north', 'south'] as const).flatMap((row) =>
  HALL_ROWS[row].map((dept, i): HallRoom => {
    const minX = HALL_LOBBY.maxX + 0.6 + i * (ROOM_W + ROOM_GAP);
    const north = row === 'north';
    const doorZ = north ? HALL_CORRIDOR.minZ : HALL_CORRIDOR.maxZ;
    const farZ = north ? doorZ - ROOM_D : doorZ + ROOM_D;
    return { dept, minX, maxX: minX + ROOM_W, minZ: Math.min(doorZ, farZ), maxZ: Math.max(doorZ, farZ), doorZ, out: north ? 1 : -1, podX: minX + ROOM_W / 2, podZ: (doorZ + farZ) / 2 };
  }),
);

/** A desk's half depth and half width (DESK_SIZE in layout.ts, which this can't import while it's being made). */
const DESK_HALF_D = 0.55;
const DESK_HALF_W = 1.1;

/**
 * The hall's desks: four in each room, back to back in two rows of two (as the office's pods are),
 * `hall-<dept>-1` and `-2` on the row whose workers face +z, `-3` and `-4` on the one facing -z.
 */
export const HALL_DESKS: DeskDef[] = HALL_ROOMS.flatMap((r) => {
  const name = r.dept === 'techlead' ? 'Tech Lead' : r.dept === 'po' ? 'Product Owner' : r.dept === 'qa' ? 'QA' : r.dept === 'devops' ? 'DevOps' : r.dept[0].toUpperCase() + r.dept.slice(1);
  return [
    // At rotY π the worker sits on the -z side, facing the spine; at 0 on the +z side.
    { z: r.podZ - DESK_HALF_D, rotY: Math.PI },
    { z: r.podZ + DESK_HALF_D, rotY: 0 },
  ].flatMap(({ z, rotY }, row) => [-DESK_HALF_W, DESK_HALF_W].map((dx, k) => ({ id: `hall-${r.dept}-${row * 2 + k + 1}`, x: r.podX + dx, z, rotY, label: `${name} ${row * 2 + k + 1}` })));
});

/** Whether a desk is one of the hall's. */
export const isHallDesk = (id: string | undefined) => !!id && id.startsWith('hall-');
