import { describe, expect, it, vi } from 'vitest';
import type { TreatmentProgramInstancePort } from './ports';
import type { TreatmentProgramInstanceDetail } from './types';
import {
  applyInstanceEditorBatch,
  type ApplyInstanceEditorBatchDeps,
} from './instanceEditorBatchApply';

const INSTANCE_ID = '11111111-1111-4111-8111-111111111111';
const STAGE_ID = '22222222-2222-4222-8222-222222222222';
const GROUP_ID = '33333333-3333-4333-8333-333333333333';
const MEDIA_ID = '44444444-4444-4444-8444-444444444444';
const ITEM_ID = '55555555-5555-4555-8555-555555555555';

describe('individual exercise attachment duration boundary', () => {
  it('does not finalize a 601-second personal exercise video', async () => {
    const detail = {
      id: INSTANCE_ID,
      stages: [
        {
          id: STAGE_ID,
          sortOrder: 1,
          groups: [{ id: GROUP_ID, systemKind: null }],
          items: [],
        },
      ],
    } as unknown as TreatmentProgramInstanceDetail;
    const createIndividualExerciseAndStageItem = vi.fn().mockResolvedValue({
      item: { id: ITEM_ID },
      exerciseId: ITEM_ID,
    });
    const instances = {
      getInstanceById: vi.fn().mockResolvedValue(detail),
      runInMutationTransaction: vi.fn(
        async (callback: () => Promise<unknown>) => await callback(),
      ),
      createIndividualExerciseAndStageItem,
    } as unknown as TreatmentProgramInstancePort;
    const getVideoAttachmentDurationRejection = vi.fn().mockResolvedValue({
      ok: false,
      code: 'video_duration_limit_exceeded',
      error: 'Файл упражнения длиннее 10 минут.',
    });
    const deps = {
      instances,
      templates: {},
      snapshots: {},
      itemRefs: {},
      media: { getVideoAttachmentDurationRejection },
    } as unknown as ApplyInstanceEditorBatchDeps;

    const rejection = await applyInstanceEditorBatch(deps, {
      instanceId: INSTANCE_ID,
      draft: {
        stageMetadata: {},
        groupPatches: {},
        itemPatches: {},
        stageOrder: null,
        stageCreates: [],
        groupCreates: [],
        itemCreates: [
          {
            kind: 'individual_exercise',
            clientId: 'draft:66666666-6666-4666-8666-666666666666',
            stageId: STAGE_ID,
            groupId: GROUP_ID,
            title: 'Персональное упражнение',
            regionRefIds: [],
            mediaId: MEDIA_ID,
            saveToCatalog: false,
          },
        ],
        itemDeletes: {},
        itemReorders: {},
        groupReorders: {},
        groupHides: {},
        itemStructuralPatches: {},
      },
    }).then(
      () => null,
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );

    expect({
      rejected: rejection !== null,
      durationGateCalls: getVideoAttachmentDurationRejection.mock.calls,
      writeCalls: createIndividualExerciseAndStageItem.mock.calls.length,
    }).toEqual({
      rejected: true,
      durationGateCalls: [[MEDIA_ID, 'exercise']],
      writeCalls: 0,
    });
  });
});
