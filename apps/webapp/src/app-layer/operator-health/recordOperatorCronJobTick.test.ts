import { beforeEach, describe, expect, it, vi } from 'vitest';

const { reportMock, recordFailureMock } = vi.hoisted(() => ({
  reportMock: vi.fn(),
  recordFailureMock: vi.fn(async () => undefined),
}));
vi.mock('@/infra/saasIsolationReporterRuntime', () => ({
  reportSaasIsolationEventBestEffort: reportMock,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    operatorHealthWrite: {
      recordOperatorJobTickSuccess: vi.fn(),
      recordOperatorJobTickFailure: recordFailureMock,
    },
  }),
}));

import { recordOperatorCronJobTickBestEffort } from './recordOperatorCronJobTick';

const base = {
  jobFamily: 'media',
  jobKey: 'media.preview.process',
  startedAtIso: '2026-07-15T10:00:00.000Z',
  durationMs: 10,
  success: false,
};

describe('recordOperatorCronJobTickBestEffort SaaS telemetry', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not infer isolation telemetry from a failed cron result', async () => {
    await recordOperatorCronJobTickBestEffort({
      ...base,
      error: 'permission denied for table media_files',
    });
    expect(reportMock).not.toHaveBeenCalled();
  });

  it('ignores an ordinary business rejection from the status write port', async () => {
    recordFailureMock.mockRejectedValueOnce(new Error('temporary storage timeout'));
    await recordOperatorCronJobTickBestEffort({ ...base, error: 'ffmpeg timeout' });
    expect(reportMock).not.toHaveBeenCalled();
  });

  it('reports a recognized isolation rejection from the status write port', async () => {
    recordFailureMock.mockRejectedValueOnce(
      Object.assign(new Error('permission denied for table operator_job_status'), {
        code: '42501',
      }),
    );
    await recordOperatorCronJobTickBestEffort({ ...base, error: 'ffmpeg timeout' });
    expect(reportMock).toHaveBeenCalledWith({
      eventClass: 'role_pool_mismatch',
      sourceService: 'cron',
      sourceOperation: 'cron_media',
    });
  });
});
