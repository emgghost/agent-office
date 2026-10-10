import { FLOOR, KIOSK, type DeskDef } from '../../../shared/layout';
import { deskPoint } from '../../../shared/nav';
import type { Collider } from '../types';

// What's in the way at a board agent's kiosk, kept apart from the kiosk's model (seats.ts) so it can
// be checked without loading one.

/** A kiosk standing by the north wall, as the board agents' do (the Manager's stands out in the room, in its booth). */
export const againstWall = (def: DeskDef) => def.z < FLOOR.minZ + 2;

/**
 * The kiosk and the agent behind it, and up over the agent's head so nobody hops on it. One by the
 * north wall goes back to the wall, so nobody squeezes in behind.
 */
export function kioskCollider(def: DeskDef): Collider {
  const corners = [-1, 1].flatMap((t) => [-KIOSK.depth / 2, KIOSK.stand + 0.35].map((sz) => deskPoint(def, (t * KIOSK.width) / 2, sz)));
  const xs = corners.map(([x]) => x);
  const zs = corners.map(([, z]) => z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: againstWall(def) ? FLOOR.minZ : Math.min(...zs), maxZ: Math.max(...zs), top: 1.5, fence: true };
}
