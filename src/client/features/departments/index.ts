/**
 * The departments (shared/departments.ts): their rooms are a fixture of the office floor (world.ts,
 * in world/office/build.ts), and here the workers at their desks get dressed in their gear (gear.ts).
 * The gear comes off on a map of its own, which dresses its workers its own way, and its headwear at
 * Christmas, when an elf's hat goes on instead.
 */
import { departmentOf } from '../../../shared/departments';
import type { Ctx } from '../../core/context';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import type { Worker } from '../../world/character';
import { departmentGear } from './gear';

export type DepartmentParts = Pick<Parts, 'views' | 'worlds'>;

export function installDepartments(ctx: Ctx, parts: DepartmentParts) {
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
