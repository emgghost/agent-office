// The office's departments, the roles a software company has, each in a glass room of four desks in
// its floor's Departments hall (see shared/hall-plan.ts, which the elevator goes to). A worker hired
// at a department's desk wears its color and gear and starts with its role's brief (the 'dept.<id>'
// prompts, editable in ⚙️ Settings); another worker can ask a department something, and the office
// finds, or hires, someone there to answer. The hall is only built on the office's own map; on the
// others its desks aren't anywhere, so nobody's hired at them there.

import { STATIONS } from './layout.js';

export const DEPARTMENT_IDS = ['backend', 'frontend', 'qa', 'security', 'devops', 'po', 'design', 'content', 'docs', 'techlead'] as const;
export type DepartmentId = (typeof DEPARTMENT_IDS)[number];

/** How many desks each department has in the hall. */
export const DEPARTMENT_SEATS = 4;

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
  /** Its desks in the hall (hall-plan.ts names them the same way). */
  desks: readonly string[];
}

const dept = (id: DepartmentId, name: string, emoji: string, color: string, floor: string, does: string): DepartmentDef => ({
  id,
  name,
  emoji,
  color,
  floor,
  does,
  desks: Array.from({ length: DEPARTMENT_SEATS }, (_, i) => `hall-${id}-${i + 1}`),
});

export const DEPARTMENTS: Record<DepartmentId, DepartmentDef> = {
  backend: dept('backend', 'Backend', '⚙️', '#3a86ff', '#d3e3ff', 'Servers, APIs, data and performance'),
  frontend: dept('frontend', 'Frontend', '🖥️', '#fb8500', '#ffe3c2', 'The UI: pages, components, styles and accessibility'),
  qa: dept('qa', 'QA', '🧪', '#2a9d8f', '#cdeee9', 'Writes and runs tests, reproduces bugs, checks that changes really work'),
  security: dept('security', 'Security', '🛡️', '#e63946', '#fbd5d8', 'Finds and fixes vulnerabilities, reviews code, dependencies and privacy risks'),
  devops: dept('devops', 'DevOps', '🚀', '#2b9348', '#d8f3dc', 'CI, builds, releases and runbooks; never touches a live server without the go-ahead'),
  po: dept('po', 'Product Owner', '🧭', '#8338ec', '#e5d6fb', 'Turns needs into user stories with acceptance criteria, and keeps the backlog in order'),
  design: dept('design', 'Designer', '🎨', '#ff006e', '#ffd1e6', 'UX and UI design: flows, layouts, design systems and specs'),
  content: dept('content', 'Persian Content', '✍️', '#0096c7', '#caf0f8', 'Persian copy for messages, templates and the UI: tone, clarity and right-to-left text'),
  docs: dept('docs', 'Technical Writer', '📚', '#8d6e63', '#efebe9', 'Keeps the README, plans, ADRs and guides true to what was built'),
  techlead: dept('techlead', 'Tech Lead', '🏛️', '#1d3557', '#dbe4f0', 'Architecture and technical decisions: design reviews, ADRs and keeping the codebase coherent'),
};

export function isDepartmentId(v: unknown): v is DepartmentId {
  return typeof v === 'string' && (DEPARTMENT_IDS as readonly string[]).includes(v);
}

/** The department a desk belongs to, if it's one of theirs (a hall desk, hall-<department>-<n>). */
export function departmentOf(deskId: string | undefined): DepartmentDef | undefined {
  const m = deskId ? /^hall-([a-z]+)-\d+$/.exec(deskId) : null;
  return m && isDepartmentId(m[1]) ? DEPARTMENTS[m[1]] : undefined;
}

/** A department by its id, or by its name as someone would say it ("security", "Product Owner", "UX", "l10n"). */
export function findDepartment(raw: string): DepartmentDef | undefined {
  const k = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!k) return undefined;
  const alias: Record<string, DepartmentId> = {
    be: 'backend',
    fe: 'frontend',
    ui: 'frontend',
    test: 'qa',
    testing: 'qa',
    tester: 'qa',
    sec: 'security',
    appsec: 'security',
    privacy: 'security',
    compliance: 'security',
    ops: 'devops',
    release: 'devops',
    ci: 'devops',
    sre: 'devops',
    infra: 'devops',
    productowner: 'po',
    product: 'po',
    designer: 'design',
    ux: 'design',
    copy: 'content',
    copywriter: 'content',
    persian: 'content',
    farsi: 'content',
    localization: 'content',
    l10n: 'content',
    i18n: 'content',
    translation: 'content',
    documentation: 'docs',
    writer: 'docs',
    technicalwriter: 'docs',
    techwriter: 'docs',
    tech: 'techlead',
    lead: 'techlead',
    architect: 'techlead',
    architecture: 'techlead',
  };
  return Object.values(DEPARTMENTS).find((d) => d.id === k || d.name.toLowerCase().replace(/[^a-z]/g, '') === k) ?? (alias[k] ? DEPARTMENTS[alias[k]] : undefined);
}

// ---- The rooms' glass ---------------------------------------------------------------------------

/** How high a room's glass goes: under the ceiling, so its name over the door and the hall stay in view. */
export const ROOM_HEIGHT = 2.6;
/** How wide its door is. */
export const ROOM_DOOR = 1.5;

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

