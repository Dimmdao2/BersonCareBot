import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  runWebappNamedRoot: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: () => fakes.db,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
}));

import {
  enqueueMediaTranscodeJob,
  enqueueMediaTranscodeJobForService,
} from './pgMediaTranscodeJobs';

const mediaId = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('media transcode exact producers', () => {
  it('uses the staff producer for an authenticated upload completion', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({
      rows: [{ result: { ok: true, kind: 'queued', jobId: mediaId, alreadyQueued: false } }],
    });

    await expect(enqueueMediaTranscodeJob(mediaId)).resolves.toEqual({
      ok: true,
      kind: 'queued',
      jobId: mediaId,
      alreadyQueued: false,
    });
    expect(fakes.runWebappNamedRoot.mock.calls[0]?.slice(1, 3)).toEqual([
      'app.enqueue_media_transcode_job_for_staff(uuid)',
      [mediaId],
    ]);
  });

  it('uses the service producer for the internal media endpoint', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({
      rows: [{ result: { ok: true, kind: 'queued', jobId: mediaId, alreadyQueued: true } }],
    });

    await expect(enqueueMediaTranscodeJobForService(mediaId)).resolves.toEqual({
      ok: true,
      kind: 'queued',
      jobId: mediaId,
      alreadyQueued: true,
    });
    expect(fakes.runWebappNamedRoot.mock.calls[0]?.slice(1, 3)).toEqual([
      'app.enqueue_media_transcode_job_for_service(uuid)',
      [mediaId],
    ]);
  });

  it('fails closed on an undeclared database result shape', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [{ result: { ok: true } }] });

    await expect(enqueueMediaTranscodeJob(mediaId)).rejects.toThrow(
      'invalid_media_transcode_enqueue_result',
    );
  });
});
