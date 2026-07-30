import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/web-push/loadWarmupPushDynamicContext', () => ({
  loadWarmupPushDynamicContext: vi.fn().mockResolvedValue({
    dailyWarmupTitle: null,
    warmupsRemaining: null,
  }),
}));

import { loadWarmupPushDynamicContext } from '@/modules/web-push/loadWarmupPushDynamicContext';
import { createLoadWarmupPushContext } from './createLoadWarmupPushContext';

function deps() {
  return {
    reminders: { listRulesByUser: vi.fn() },
    patientPractice: {
      listByUserInUtcRange: vi.fn(),
      getLatestDailyWarmupCompletedContentPageId: vi.fn(),
    },
    patientDailyWarmupPresentation: {
      getPresentationState: vi.fn(),
      upsertPresentationState: vi.fn(),
      getPresentedContentPageId: vi.fn(),
      setPresentedContentPageId: vi.fn(),
    },
    patientHomeBlocks: {},
    contentPages: {},
    contentSections: {},
    systemSettings: {},
    patientCalendarTimezone: { getIanaForUser: vi.fn() },
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('warmup push read materialization', () => {
  it('passes only the existing-presentation reader when warmups are off', async () => {
    const load = createLoadWarmupPushContext(deps(), {
      canMaterializePresentation: vi.fn().mockResolvedValue(false),
    });

    await load('patient');

    expect(loadWarmupPushDynamicContext).toHaveBeenCalledWith(
      'patient',
      expect.objectContaining({
        getPresentedDailyWarmupContentPageId: expect.any(Function),
      }),
    );
    expect(vi.mocked(loadWarmupPushDynamicContext).mock.calls[0]?.[1]).not.toHaveProperty(
      'presentationSyncDeps',
    );
  });

  it('supplies presentation sync only when warmup materialization is allowed', async () => {
    const load = createLoadWarmupPushContext(deps(), {
      canMaterializePresentation: vi.fn().mockResolvedValue(true),
    });

    await load('patient');

    expect(vi.mocked(loadWarmupPushDynamicContext).mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        presentationSyncDeps: expect.any(Object),
      }),
    );
  });
});
