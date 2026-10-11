/**
 * The departments (shared/departments.ts): their hall is a fixture of the office floor (hall.ts, in
 * world/office/build.ts), whose lift is defined here, and here the workers at their desks get dressed
 * in their gear (gear.ts). The gear comes off on a map of its own, which dresses its workers its own
 * way, and its headwear at Christmas, when an elf's hat goes on instead.
 */
import { departmentOf } from '../../../shared/departments';
import type { Ctx } from '../../core/context';
import { aside, hintTitle, key, onE } from '../../core/hint';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import type { Worker } from '../../world/character';
import { departmentGear } from './gear';

// The kinds of thing you can use that this defines (see InteractKinds in world/types.ts).
declare module '../../world/types' {
  interface InteractKinds {
    hall: true;
  }
}

export type DepartmentParts = Pick<Parts, 'views' | 'worlds' | 'travel'>;

export function installDepartments(ctx: Ctx, parts: DepartmentParts) {
  // The hall's lift: the elevator panel, to ride back up to the office, or anywhere else it goes.
  ctx.interactions.define('hall', {
    reach: 2.2,
    hint: () => ({ k: 'hall', parts: [hintTitle('🛗 Lift'), aside('back up to the office'), key('E', 'Choose a floor')] }),
    use: onE(() => parts.travel.showElevator()),
  });

  /** What each worker model has on: a department's id (and whether it's without its hat), or '' for nothing. */
  const wearing = new WeakMap<Worker, string>();
  // Checked every frame, which costs a lookup a desk: a worker can be hired, moved to another map or
  // dressed up for a holiday at any moment, and its model made again with it.
  ctx.ticks.add('others', () => {
    const dressed = parts.worlds.inOffice();
    const hats = store.theme.active !== 'christmas';
    for (const [id, v] of parts.views.workerViews) {
      const dept = dressed && store.workers.get(id)?.kind === 'agent' ? departmentOf(v.deskId) : undefined;
      const want = dept ? `${dept.id}${hats ? '' : ':no-hat'}` : '';
      if ((wearing.get(v.model) ?? '') === want) continue;
      wearing.set(v.model, want);
      v.model.wearGear(dept ? departmentGear(dept, hats) : null);
    }
  });
}
