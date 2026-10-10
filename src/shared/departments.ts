// The office's departments: a glass-walled room round each row of two desks (see DESKS in layout.ts),
// for the roles a software company has. A worker hired at a department's desk wears its color and
// gear and starts with its role's brief (the 'dept.<id>' prompts, editable in ⚙️ Settings); another
// worker can ask a department something and the office finds, or hires, someone there to answer.
// The rooms are only built on the office's own map (features/departments/world.ts); on the others the
// desks still belong to their departments.

import { DESKS, DESK_SIZE, STATIONS, deskSeat, type DeskDef } from './layout.js';

export const DEPARTMENT_IDS = ['security', 'qa', 'backend', 'frontend', 'po', 'pm', 'design', 'scrum'] as const;
export type DepartmentId = (typeof DEPARTMENT_IDS)[number];

export interface DepartmentDef {
  id: DepartmentId;
  name: string;
  emoji: string;
  /** Its workers' color and its room's frame. */
  color: string;
  /** Its room's floor, a lighter shade of it. */
  floor: string;
  /** What it does, in a line: the hire window and the department list say it. */
  does: string;
  /** Its two desks, in DESKS. */
  desks: readonly [string, string];
}

export const DEPARTMENTS: Record<DepartmentId, DepartmentDef> = {
  security: { id: 'security', name: 'Security', emoji: '🛡️', color: '#e63946', floor: '#fbd5d8', does: 'Finds and fixes vulnerabilities, reviews code and dependencies for risks', desks: ['desk-1', 'desk-2'] },
  qa: { id: 'qa', name: 'QA', emoji: '🧪', color: '#2a9d8f', floor: '#cdeee9', does: 'Writes and runs tests, reproduces bugs, checks that changes really work', desks: ['desk-3', 'desk-4'] },
  backend: { id: 'backend', name: 'Backend', emoji: '⚙️', color: '#3a86ff', floor: '#d3e3ff', does: 'Servers, APIs, data and performance', desks: ['desk-5', 'desk-6'] },
  frontend: { id: 'frontend', name: 'Frontend', emoji: '🖥️', color: '#fb8500', floor: '#ffe3c2', does: 'The UI: pages, components, styles and accessibility', desks: ['desk-7', 'desk-8'] },
  po: { id: 'po', name: 'Product Owner', emoji: '🧭', color: '#8338ec', floor: '#e5d6fb', does: 'Turns needs into user stories with acceptance criteria, and keeps the backlog in order', desks: ['desk-9', 'desk-10'] },
  pm: { id: 'pm', name: 'Project Manager', emoji: '📅', color: '#2d6a4f', floor: '#d3eadc', does: 'Plans the work, tracks progress and risks, and reports where things stand', desks: ['desk-11', 'desk-12'] },
  design: { id: 'design', name: 'Designer', emoji: '🎨', color: '#ff006e', floor: '#ffd1e6', does: 'UX and UI design: flows, layouts, design systems and specs', desks: ['desk-13', 'desk-14'] },
  scrum: { id: 'scrum', name: 'Scrum Master', emoji: '🏃', color: '#e9a100', floor: '#fdeebb', does: 'Runs the sprint: the board, stand-ups, blockers and retros', desks: ['desk-15', 'desk-16'] },
};

export function isDepartmentId(v: unknown): v is DepartmentId {
  return typeof v === 'string' && (DEPARTMENT_IDS as readonly string[]).includes(v);
}

const BY_DESK = new Map<string, DepartmentDef>(Object.values(DEPARTMENTS).flatMap((d) => d.desks.map((id) => [id, d] as const)));

/** The department a desk belongs to, if it's one of theirs. */
export function departmentOf(deskId: string | undefined): DepartmentDef | undefined {
  return deskId ? BY_DESK.get(deskId) : undefined;
}

/** A department by its id, or by its name as someone would say it ("security", "Product Owner", "design", "UX"). */
export function findDepartment(raw: string): DepartmentDef | undefined {
  const k = raw.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!k) return undefined;
  const alias: Record<string, DepartmentId> = { sec: 'security', appsec: 'security', test: 'qa', testing: 'qa', tester: 'qa', be: 'backend', fe: 'frontend', ui: 'frontend', productowner: 'po', product: 'po', projectmanager: 'pm', manager: 'pm', designer: 'design', ux: 'design', scrummaster: 'scrum', agile: 'scrum' };
  return Object.values(DEPARTMENTS).find((d) => d.id === k || d.name.toLowerCase().replace(/[^a-z]/g, '') === k) ?? (alias[k] ? DEPARTMENTS[alias[k]] : undefined);
}

// ---- The rooms ----------------------------------------------------------------------------------

/** How high a room's glass goes: well under the ceiling, so the office stays one big space. */
export const ROOM_HEIGHT = 2.6;
/** How wide its door is, in the middle of the wall behind its chairs. */
export const ROOM_DOOR = 1.5;
/** How far a room reaches out to either side of its desks: as wide as the rug under them. */
const SIDE = 0.9;
/** How far behind its chairs its door wall is: room to walk up behind the workers. */
const BEHIND = 2.6;

/** A department's room, axis-aligned: the spine between the back-to-back desks on one side, the door on the other. */
export interface RoomDef {
  dept: DepartmentDef;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** The wall the desks stand back to back against (shared with the room on its other side), and the one with the door: z values. */
  spineZ: number;
  doorZ: number;
  /** Which way out of the door is: +1 toward +z, -1 toward -z. */
  out: 1 | -1;
}

function room(dept: DepartmentDef): RoomDef {
  const desks = dept.desks.map((id) => DESKS.find((d) => d.id === id)!) as [DeskDef, DeskDef];
  const hw = DESK_SIZE.width / 2;
  const minX = Math.min(...desks.map((d) => d.x)) - hw - SIDE;
  const maxX = Math.max(...desks.map((d) => d.x)) + hw + SIDE;
  // The workers sit on the side away from the spine; the room goes past them to its door.
  const seat = deskSeat(desks[0]);
  const out = seat.z > desks[0].z ? 1 : -1;
  const spineZ = desks[0].z - (out * DESK_SIZE.depth) / 2;
  const doorZ = seat.z + out * (BEHIND - 0.85);
  return { dept, minX, maxX, minZ: Math.min(spineZ, doorZ), maxZ: Math.max(spineZ, doorZ), spineZ, doorZ, out };
}

export const ROOMS: readonly RoomDef[] = Object.values(DEPARTMENTS).map(room);

/** The door's middle, on its wall. */
export function roomDoor(r: RoomDef): { x: number; z: number } {
  return { x: (r.minX + r.maxX) / 2, z: r.doorZ };
}

/**
 * Where its kit stands (a server rack, a board, an easel): in the end of the room away from the next
 * room along the row, between the desks' spine and the door. `facing` is the way it faces, rotation
 * about y, toward the desks.
 */
export function roomKit(r: RoomDef): { x: number; z: number; facing: number; half: number } {
  const west = r.minX < -6;
  return { x: west ? r.minX + 0.5 : r.maxX - 0.5, z: (r.spineZ + r.doorZ) / 2, facing: west ? Math.PI / 2 : -Math.PI / 2, half: 0.36 };
}

/**
 * The room's walls as thin rectangles (minX, maxX, minZ, maxZ), with its door left open: what the
 * dog and the workers walking about steer round (shared/nav.ts), as the 3D walls stand.
 */
export function roomWalls(r: RoomDef, t = 0.1): [number, number, number, number][] {
  const dx = (r.minX + r.maxX) / 2;
  const half = ROOM_DOOR / 2;
  return [
    [r.minX - t / 2, r.minX + t / 2, r.minZ, r.maxZ],
    [r.maxX - t / 2, r.maxX + t / 2, r.minZ, r.maxZ],
    [r.minX, dx - half, r.doorZ - t / 2, r.doorZ + t / 2],
    [dx + half, r.maxX, r.doorZ - t / 2, r.doorZ + t / 2],
    [r.minX, r.maxX, r.spineZ - t / 2, r.spineZ + t / 2],
  ];
}

// ---- The Manager's booth ------------------------------------------------------------------------

/**
 * The Manager's own glass booth, round its kiosk (station-manager in layout.ts): the kiosk in the
 * middle of its back half with the Manager standing behind it, room to stand in front of it, and the
 * door in the wall the kiosk faces, toward the room. Framed in the Manager's gold.
 */
export const MANAGER_BOOTH = (() => {
  const k = STATIONS.find((s) => s.station === 'manager')!;
  // The kiosk faces -z at rotY 0 (see deskPoint): its front, where you stand, is toward minZ.
  const box = { minX: k.x - 1.6, maxX: k.x + 1.6, minZ: k.z - 1.6, maxZ: k.z + 1.3 };
  // A potted plant in each back corner.
  const plants: readonly (readonly [number, number])[] = [[box.minX + 0.4, box.maxZ - 0.4], [box.maxX - 0.4, box.maxZ - 0.4]];
  // Lower than the departments' glass, so the Manager's name tag and card stand clear above it.
  return { ...box, doorX: k.x, height: 2, color: '#ffb703', floor: '#fff1c1', plants } as const;
})();

/** The booth's walls as thin rectangles, its door left open: what the dog and the workers walking about steer round. */
export function boothWalls(t = 0.1): [number, number, number, number][] {
  const b = MANAGER_BOOTH;
  const half = ROOM_DOOR / 2;
  return [
    [b.minX - t / 2, b.minX + t / 2, b.minZ, b.maxZ],
    [b.maxX - t / 2, b.maxX + t / 2, b.minZ, b.maxZ],
    [b.minX, b.maxX, b.maxZ - t / 2, b.maxZ + t / 2],
    [b.minX, b.doorX - half, b.minZ - t / 2, b.minZ + t / 2],
    [b.doorX + half, b.maxX, b.minZ - t / 2, b.minZ + t / 2],
  ];
}

