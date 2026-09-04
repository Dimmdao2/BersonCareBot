import { describe, expect, it, vi } from 'vitest';
import {
  loadDoctorExerciseCommentAttention,
  type DoctorExerciseCommentAttentionDeps,
} from './loadDoctorExerciseCommentAttention';
import type { ClientListItem } from '@/modules/doctor-clients/ports';
import type {
  TreatmentProgramInstanceDetail,
  TreatmentProgramInstanceSummary,
} from '@/modules/treatment-program/types';
import type { ProgramItemDiscussionMessage } from '@/modules/program-item-discussion/types';

vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: vi.fn(async () => 'Europe/Moscow'),
}));

const PATIENT_ID = '61000000-0000-4000-8000-000000000001';
const DOCTOR_ID = '61000000-0000-4000-8000-000000000002';
const INSTANCE_ID = '61000000-0000-4000-8000-000000000003';
const STAGE_ID = '61000000-0000-4000-8000-000000000004';
const ANSWERED_ITEM = 'answered-exercise';
const MEDIA_ITEM = 'media-exercise';
const PLAIN_ITEM = 'plain-exercise';

function msg(
  id: string,
  stageItemId: string,
  senderRole: 'patient' | 'admin',
  createdAt: string,
  extra: Partial<ProgramItemDiscussionMessage> = {},
): ProgramItemDiscussionMessage {
  return {
    id,
    instanceStageItemId: stageItemId,
    patientUserId: PATIENT_ID,
    senderRole,
    origin: senderRole === 'patient' ? 'patient_observation' : 'support_admin_reply',
    body: 'text',
    mediaFileId: null,
    supportMessageId: null,
    createdAt,
    ...extra,
  };
}

function exerciseItem(id: string, title: string) {
  return {
    id,
    stageId: STAGE_ID,
    itemType: 'exercise' as const,
    itemRefId: id,
    sortOrder: 0,
    comment: null,
    localComment: null,
    settings: null,
    snapshot: { title },
    completedAt: null,
    isActionable: true,
    status: 'active' as const,
    groupId: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    lastViewedAt: null,
    effectiveComment: null,
  };
}

type ProgramItemDiscussionDeps = NonNullable<
  DoctorExerciseCommentAttentionDeps['programItemDiscussion']
>;

function buildDeps(overrides: {
  listMessagesPage: ProgramItemDiscussionDeps['listMessagesPage'];
  listAttentionSummaryForStageItems?: ProgramItemDiscussionDeps['listAttentionSummaryForStageItems'];
}): DoctorExerciseCommentAttentionDeps {
  const instanceSummary: TreatmentProgramInstanceSummary = {
    id: INSTANCE_ID,
    organizationId: null,
    patientUserId: PATIENT_ID,
    templateId: null,
    assignedBy: null,
    assignmentSource: 'doctor',
    title: 'Программа',
    status: 'active',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    patientPlanLastOpenedAt: null,
  };
  const instanceDetail: TreatmentProgramInstanceDetail = {
    ...instanceSummary,
    stages: [
      {
        id: STAGE_ID,
        instanceId: INSTANCE_ID,
        sourceStageId: null,
        title: 'Этап 1',
        description: null,
        sortOrder: 0,
        localComment: null,
        skipReason: null,
        status: 'in_progress',
        startedAt: null,
        goals: null,
        objectives: null,
        expectedDurationDays: null,
        expectedDurationText: null,
        groups: [],
        items: [
          exerciseItem(ANSWERED_ITEM, 'Отвеченное упражнение'),
          exerciseItem(MEDIA_ITEM, 'Медиа упражнение'),
          exerciseItem(PLAIN_ITEM, 'Обычное упражнение'),
        ],
      },
    ],
  };

  return {
    doctorUserId: DOCTOR_ID,
    organizationId: undefined,
    treatmentProgramInstance: {
      listForPatientClinicalView: vi.fn(async () => [instanceSummary]),
      getInstanceById: vi.fn(async () => instanceDetail),
    },
    programItemDiscussion: {
      listAttentionSummaryForStageItems:
        overrides.listAttentionSummaryForStageItems ??
        vi.fn(async (stageItemIds: string[]) =>
          stageItemIds.map((stageItemId) => ({ stageItemId, comments: 1, media: 0 })),
        ),
      listMessagesPage: overrides.listMessagesPage,
      listUnreadCountsForViewerByStageItems: vi.fn(async () => [
        { stageItemId: ANSWERED_ITEM, unread: 2 },
        { stageItemId: MEDIA_ITEM, unread: 1 },
        { stageItemId: PLAIN_ITEM, unread: 4 },
      ]),
    },
  };
}

const clients: ClientListItem[] = [
  {
    userId: PATIENT_ID,
    displayName: 'Дмитрий Берсон',
    firstName: 'Дмитрий',
    lastName: 'Берсон',
    patronymic: null,
    phone: null,
    bindings: {},
    nextAppointmentLabel: null,
    activeTreatmentProgram: true,
    activeTreatmentProgramInstanceId: INSTANCE_ID,
    cancellationsCount: 0,
    reschedulesCount: 0,
  },
];

describe('loadDoctorExerciseCommentAttention unread semantics', () => {
  it('keeps an answered thread (last message is the doctor reply) when unread > 0', async () => {
    const deps = buildDeps({
      listMessagesPage: vi.fn(async ({ stageItemId }: { stageItemId: string }) => {
        if (stageItemId === ANSWERED_ITEM) {
          return [
            msg('a1', ANSWERED_ITEM, 'patient', '2026-09-03T10:00:00.000Z'),
            msg('a2', ANSWERED_ITEM, 'admin', '2026-09-03T10:05:00.000Z'),
          ];
        }
        if (stageItemId === MEDIA_ITEM) {
          return [msg('m1', MEDIA_ITEM, 'patient', '2026-09-03T11:00:00.000Z', { body: null, mediaFileId: 'file-1' })];
        }
        return [msg('p1', PLAIN_ITEM, 'patient', '2026-09-03T12:00:00.000Z')];
      }),
    });

    const result = await loadDoctorExerciseCommentAttention(deps, clients);
    const stageItemIds = result.items.map((row) => row.stageItemId);
    expect(stageItemIds).toContain(ANSWERED_ITEM);
  });

  it('keeps a media-only comment (no text body) when unread > 0', async () => {
    const deps = buildDeps({
      listMessagesPage: vi.fn(async ({ stageItemId }: { stageItemId: string }) => {
        if (stageItemId === ANSWERED_ITEM) {
          return [
            msg('a1', ANSWERED_ITEM, 'patient', '2026-09-03T10:00:00.000Z'),
            msg('a2', ANSWERED_ITEM, 'admin', '2026-09-03T10:05:00.000Z'),
          ];
        }
        if (stageItemId === MEDIA_ITEM) {
          return [msg('m1', MEDIA_ITEM, 'patient', '2026-09-03T11:00:00.000Z', { body: null, mediaFileId: 'file-1' })];
        }
        return [msg('p1', PLAIN_ITEM, 'patient', '2026-09-03T12:00:00.000Z')];
      }),
    });

    const result = await loadDoctorExerciseCommentAttention(deps, clients);
    const mediaRow = result.items.find((row) => row.stageItemId === MEDIA_ITEM);
    expect(mediaRow).toBeDefined();
    expect(mediaRow?.latestMessage.mediaFileId).toBe('file-1');
  });

  it('sums unread across multiple exercises for one patient to an exact total, dropping none', async () => {
    const deps = buildDeps({
      listMessagesPage: vi.fn(async ({ stageItemId }: { stageItemId: string }) => {
        if (stageItemId === ANSWERED_ITEM) {
          return [
            msg('a1', ANSWERED_ITEM, 'patient', '2026-09-03T10:00:00.000Z'),
            msg('a2', ANSWERED_ITEM, 'admin', '2026-09-03T10:05:00.000Z'),
          ];
        }
        if (stageItemId === MEDIA_ITEM) {
          return [msg('m1', MEDIA_ITEM, 'patient', '2026-09-03T11:00:00.000Z', { body: null, mediaFileId: 'file-1' })];
        }
        return [msg('p1', PLAIN_ITEM, 'patient', '2026-09-03T12:00:00.000Z')];
      }),
    });

    const result = await loadDoctorExerciseCommentAttention(deps, clients);
    // 2 (answered) + 1 (media) + 4 (plain) = 7, matching the owner-cited scenario (UNREAD-06).
    expect(result.total).toBe(7);
    expect(result.items).toHaveLength(3);
    expect(result.items.map((row) => row.stageItemId).sort()).toEqual(
      [ANSWERED_ITEM, MEDIA_ITEM, PLAIN_ITEM].sort(),
    );
    expect(result.items.map((row) => row.unreadCount)).toEqual(
      expect.arrayContaining([2, 1, 4]),
    );
  });
});

/**
 * `listAttentionSummaryForStageItems` (real implementation:
 * `apps/webapp/src/infra/repos/pgProgramItemDiscussion.ts:335-366`) is an EARLIER pre-filter gate,
 * upstream of the unread-count fix verified above. It inspects only the single latest message per
 * stage item and returns `comments: 0` whenever that latest message is not a text message from the
 * patient — i.e. exactly for an answered thread (latest = admin reply) or a media-only latest
 * message. `loadDoctorExerciseCommentAttention` filters candidate stage items on
 * `row.comments > 0` (this file, `attentionStageItemIds`) BEFORE ever calling the fixed
 * `listUnreadCountsForViewerByStageItems`, so an exercise with real unread messages is dropped here
 * regardless of the (correct) counting logic exercised above.
 *
 * This mock reproduces that real SQL behavior in-process (no DB) so the regression is provable at
 * this layer's boundary — see `pgProgramItemDiscussion.ts:355-365` for the exact logic mirrored.
 */
function productionLikeAttentionSummary(
  messagesByStageItem: Record<string, ProgramItemDiscussionMessage[]>,
): ProgramItemDiscussionDeps['listAttentionSummaryForStageItems'] {
  return vi.fn(async (stageItemIds: string[]) =>
    stageItemIds.map((stageItemId) => {
      const messages = messagesByStageItem[stageItemId] ?? [];
      const latest = messages[messages.length - 1];
      if (!latest || latest.senderRole !== 'patient') return { stageItemId, comments: 0, media: 0 };
      return {
        stageItemId,
        comments: latest.mediaFileId ? 0 : 1,
        media: latest.mediaFileId ? 1 : 0,
      };
    }),
  );
}

describe('loadDoctorExerciseCommentAttention vs. the real attention-summary pre-filter', () => {
  it('FAIL (live-confirmed, 2026-09-04): drops an answered thread and a media-only thread even though both have unread > 0', async () => {
    const messagesByStageItem: Record<string, ProgramItemDiscussionMessage[]> = {
      [ANSWERED_ITEM]: [
        msg('a1', ANSWERED_ITEM, 'patient', '2026-09-03T10:00:00.000Z'),
        msg('a2', ANSWERED_ITEM, 'admin', '2026-09-03T10:05:00.000Z'),
      ],
      [MEDIA_ITEM]: [
        msg('m1', MEDIA_ITEM, 'patient', '2026-09-03T11:00:00.000Z', { body: null, mediaFileId: 'file-1' }),
      ],
      [PLAIN_ITEM]: [msg('p1', PLAIN_ITEM, 'patient', '2026-09-03T12:00:00.000Z')],
    };
    const deps = buildDeps({
      listAttentionSummaryForStageItems: productionLikeAttentionSummary(messagesByStageItem),
      listMessagesPage: vi.fn(async ({ stageItemId }: { stageItemId: string }) => messagesByStageItem[stageItemId] ?? []),
    });

    const result = await loadDoctorExerciseCommentAttention(deps, clients);

    // Ground truth (matches listUnreadCountsForViewerByStageItems mock in buildDeps): unread = 2+1+4 = 7,
    // across all three exercises, none dropped — this is what UNREAD-05/UNREAD-06 require.
    // Live-reproduced 2026-09-04 on candidate `1a9e6bb00` with a real patient (Берсон Дмитрий,
    // stage items 1775c14e/a62d836f/5c2a0ad5): the app showed total=2 and only 1 of 3 exercises.
    expect(result.total).toBe(7);
    expect(result.items.map((row) => row.stageItemId).sort()).toEqual(
      [ANSWERED_ITEM, MEDIA_ITEM, PLAIN_ITEM].sort(),
    );
  });
});
