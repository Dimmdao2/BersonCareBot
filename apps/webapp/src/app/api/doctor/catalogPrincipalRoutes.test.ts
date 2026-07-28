import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readRoute(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), 'utf8');
}

describe('doctor catalog API principal routes', () => {
  it('wraps recommendation API writes in doctor workspace principal', () => {
    const collection = readRoute('./recommendations/route.ts');
    const item = readRoute('./recommendations/[id]/route.ts');

    expect(collection).toContain('requireDoctorWorkspaceApiContext');
    expect(collection).toContain('doctor.recommendations.create');
    expect(item).toContain('requireDoctorWorkspaceApiContext');
    expect(item).toContain('doctor.recommendations.update');
    expect(item).toContain('doctor.recommendations.archive');
  });

  it('wraps clinical test API writes in doctor workspace principal', () => {
    const collection = readRoute('./clinical-tests/route.ts');
    const item = readRoute('./clinical-tests/[id]/route.ts');

    expect(collection).toContain('requireDoctorWorkspaceApiContext');
    expect(collection).toContain('doctor.clinical-tests.create');
    expect(item).toContain('requireDoctorWorkspaceApiContext');
    expect(item).toContain('doctor.clinical-tests.update');
    expect(item).toContain('doctor.clinical-tests.archive');
  });

  it('wraps test set API writes in doctor workspace principal', () => {
    const collection = readRoute('./test-sets/route.ts');
    const item = readRoute('./test-sets/[id]/route.ts');
    const items = readRoute('./test-sets/[id]/items/route.ts');

    expect(collection).toContain('requireDoctorWorkspaceApiContext');
    expect(collection).toContain('doctor.test-sets.create');
    expect(item).toContain('requireDoctorWorkspaceApiContext');
    expect(item).toContain('doctor.test-sets.update');
    expect(item).toContain('doctor.test-sets.archive');
    expect(items).toContain('requireDoctorWorkspaceApiContext');
    expect(items).toContain('doctor.test-sets.items.update');
  });

  it('wraps course API writes in doctor workspace principal', () => {
    const collection = readRoute('./courses/route.ts');
    const item = readRoute('./courses/[id]/route.ts');

    expect(collection).toContain('requireDoctorWorkspaceApiContext');
    expect(collection).toContain('doctor.courses.create');
    expect(item).toContain('requireDoctorWorkspaceApiContext');
    expect(item).toContain('doctor.courses.update');
    expect(item).toContain('doctor.courses.archive');
  });

  it('wraps treatment program template API writes in doctor workspace principal', () => {
    const collection = readRoute('./treatment-program-templates/route.ts');
    const item = readRoute('./treatment-program-templates/[id]/route.ts');
    const stages = readRoute('./treatment-program-templates/[id]/stages/route.ts');
    const stagesReorder = readRoute('./treatment-program-templates/[id]/stages/reorder/route.ts');
    const stage = readRoute('./treatment-program-templates/stages/[stageId]/route.ts');
    const groups = readRoute('./treatment-program-templates/stages/[stageId]/groups/route.ts');
    const groupsReorder = readRoute(
      './treatment-program-templates/stages/[stageId]/groups/reorder/route.ts',
    );
    const group = readRoute('./treatment-program-templates/stage-groups/[groupId]/route.ts');
    const items = readRoute('./treatment-program-templates/stages/[stageId]/items/route.ts');
    const itemsReorder = readRoute(
      './treatment-program-templates/stages/[stageId]/items/reorder/route.ts',
    );
    const itemRoute = readRoute('./treatment-program-templates/stage-items/[itemId]/route.ts');
    const expandLfk = readRoute(
      './treatment-program-templates/stages/[stageId]/items/from-lfk-complex/route.ts',
    );
    const expandTestSet = readRoute(
      './treatment-program-templates/stages/[stageId]/items/from-test-set/route.ts',
    );

    for (const source of [
      collection,
      item,
      stages,
      stagesReorder,
      stage,
      groups,
      groupsReorder,
      group,
      items,
      itemsReorder,
      itemRoute,
      expandLfk,
      expandTestSet,
    ]) {
      expect(source).toContain('requireDoctorWorkspaceApiContext');
    }

    expect(collection).toContain('doctor.treatment-program-templates.create');
    expect(item).toContain('doctor.treatment-program-templates.update');
    expect(item).toContain('doctor.treatment-program-templates.archive');
    expect(stages).toContain('doctor.treatment-program-templates.stages.create');
    expect(stagesReorder).toContain('doctor.treatment-program-templates.stages.reorder');
    expect(stage).toContain('doctor.treatment-program-templates.stages.update');
    expect(stage).toContain('doctor.treatment-program-templates.stages.delete');
    expect(groups).toContain('doctor.treatment-program-templates.stage-groups.create');
    expect(groupsReorder).toContain('doctor.treatment-program-templates.stage-groups.reorder');
    expect(group).toContain('doctor.treatment-program-templates.stage-groups.update');
    expect(group).toContain('doctor.treatment-program-templates.stage-groups.delete');
    expect(items).toContain('doctor.treatment-program-templates.stage-items.create');
    expect(itemsReorder).toContain('doctor.treatment-program-templates.stage-items.reorder');
    expect(itemRoute).toContain('doctor.treatment-program-templates.stage-items.update');
    expect(itemRoute).toContain('doctor.treatment-program-templates.stage-items.delete');
    expect(expandLfk).toContain('doctor.treatment-program-templates.stage-items.expand-lfk');
    expect(expandTestSet).toContain(
      'doctor.treatment-program-templates.stage-items.expand-test-set',
    );
  });
});
