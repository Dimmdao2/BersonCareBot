import { beforeEach, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  runWebappNamedRoot: vi.fn(),
  runWebappSql: vi.fn(),
  runWebappTransaction: vi.fn(),
  drizzle: { select: vi.fn(), update: vi.fn(), transaction: vi.fn() },
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: () => fakes.db,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
  runWebappSql: fakes.runWebappSql,
  runWebappTransaction: fakes.runWebappTransaction,
  runWebappPgText: vi.fn(),
  webappSqlFromPgText: vi.fn(),
}));

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: () => fakes.drizzle,
}));

import {
  assertMediaWorkerControlReady,
  completeMediaWorkerHlsJob,
  failMediaWorkerJob,
  loadMediaWorkerControlMedia,
  markMediaWorkerProcessing,
  reclaimAndClaimMediaWorkerJob,
  retryMediaWorkerJob,
} from '@/infra/repos/pgMediaWorkerControl';

const JOB = { id: '11111111-1111-4111-8111-111111111111', mediaId: '22222222-2222-4222-8222-222222222222' };

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Отказ, который ловят эти проверки, уже случался и стоил больше суток: диспетчер очереди читал
 * `media_transcode_jobs` ОТНОШЕНИЕМ, а под ролью воркера это `42501 accepted organization context
 * required` — у межарендного диспетчера своего `organization_id` нет и быть не может. Воркер уходил
 * в петлю падения раз в 5 секунд, его собственный журнал печатал `{"type":"Error"}` без текста, и
 * снаружи это выглядело как «новое видео не прикрепляется, тишина» и вечная заглушка «Видео
 * готовится» на старом. Дорого и молча — оба свойства сразу.
 */
it('диспетчер забирает работу объявленной дверью и не трогает очередь отношением', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({
    rows: [{
      claim: {
        kind: 'claimed',
        job: {
          id: JOB.id,
          mediaId: JOB.mediaId,
          organizationId: '33333333-3333-4333-8333-333333333333',
          attempts: 2,
        },
      },
    }],
  });

  const claimed = await reclaimAndClaimMediaWorkerJob({
    enabled: true, lockedBy: 'worker-1', staleLockMinutes: 15,
  });

  expect(claimed).toEqual({
    kind: 'claimed',
    job: {
      id: JOB.id,
      mediaId: JOB.mediaId,
      organizationId: '33333333-3333-4333-8333-333333333333',
      attempts: 2,
    },
  });
  expect(fakes.runWebappNamedRoot.mock.calls[0]?.slice(1, 3)).toEqual([
    'app.claim_media_transcode_job(text,integer)',
    ['worker-1', 15],
  ]);
  // Прямое чтение очереди здесь — это ровно тот 42501, который убил пересборку видео на TEST.
  expect(fakes.runWebappSql).not.toHaveBeenCalled();
  expect(fakes.runWebappTransaction).not.toHaveBeenCalled();
  expect(fakes.drizzle.select).not.toHaveBeenCalled();
});

it('выключенная петля не ходит в базу вовсе', async () => {
  const claimed = await reclaimAndClaimMediaWorkerJob({
    enabled: false, lockedBy: 'worker-1', staleLockMinutes: 15,
  });

  expect(claimed).toEqual({ kind: 'disabled' });
  expect(fakes.runWebappNamedRoot).not.toHaveBeenCalled();
});

it('работа без организации не достраивается умолчанием, а отвергается', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({
    rows: [{ claim: { kind: 'claimed', job: { id: JOB.id, mediaId: JOB.mediaId, attempts: 1 } } }],
  });

  // Воркер по занятой работе идёт качать и ПЕРЕЗАПИСЫВАТЬ файл. Работа неизвестно чьей клиники —
  // это чужой файл под чужим ключом, поэтому «нет организации» обязано быть отказом, а не пустой
  // строкой в наблюдаемости.
  await expect(reclaimAndClaimMediaWorkerJob({
    enabled: true, lockedBy: 'worker-1', staleLockMinutes: 15,
  })).rejects.toThrow('media_worker_claim_invalid');
});

it('пустая очередь — это простой, а не занятая работа', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ claim: { kind: 'idle' } }] });

  await expect(reclaimAndClaimMediaWorkerJob({
    enabled: true, lockedBy: 'worker-1', staleLockMinutes: 15,
  })).resolves.toEqual({ kind: 'idle' });
});

it('файл своей работы читается дверью, чужая работа отдаёт «нет такой»', async () => {
  fakes.runWebappNamedRoot.mockResolvedValueOnce({
    rows: [{
      media: {
        id: JOB.mediaId,
        mimeType: 'video/mp4',
        s3Key: 'media/a.mp4',
        hlsMasterPlaylistS3Key: null,
        videoProcessingStatus: 'processing',
        videoDurationSeconds: 42,
        usagePurpose: null,
      },
    }],
  });

  await expect(loadMediaWorkerControlMedia(JOB, 'worker-1')).resolves.toEqual({
    id: JOB.mediaId,
    mimeType: 'video/mp4',
    s3Key: 'media/a.mp4',
    hlsMasterPlaylistS3Key: null,
    videoProcessingStatus: 'processing',
    videoDurationSeconds: 42,
    usagePurpose: null,
  });
  expect(fakes.runWebappNamedRoot.mock.calls[0]?.slice(1, 3)).toEqual([
    'app.read_media_transcode_job_media(uuid,uuid,text)',
    [JOB.id, JOB.mediaId, 'worker-1'],
  ]);

  fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [{ media: null }] });
  await expect(loadMediaWorkerControlMedia(JOB, 'worker-2')).resolves.toBeNull();
});

it('исход оборота записывается дверью, каждый под своим именем', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ recorded: true }] });

  await markMediaWorkerProcessing(JOB, 'worker-1');
  await retryMediaWorkerJob(JOB, 'worker-1', '2026-08-20T10:00:00.000Z', 'ffmpeg died');
  await failMediaWorkerJob(JOB, 'worker-1', 'too many attempts');
  await completeMediaWorkerHlsJob(JOB, 'worker-1', {
    masterKey: 'hls/master.m3u8', qualitiesJson: '["720p"]', durationSeconds: 61,
  });

  expect(fakes.runWebappNamedRoot.mock.calls.map((call) => [call[1], call[2]])).toEqual([
    ['app.record_media_transcode_job_outcome(uuid,uuid,text,text,text)',
      [JOB.id, JOB.mediaId, 'worker-1', 'processing', '{}']],
    ['app.record_media_transcode_job_outcome(uuid,uuid,text,text,text)',
      [JOB.id, JOB.mediaId, 'worker-1', 'retry',
        '{"nextAttemptAt":"2026-08-20T10:00:00.000Z","error":"ffmpeg died"}']],
    ['app.record_media_transcode_job_outcome(uuid,uuid,text,text,text)',
      [JOB.id, JOB.mediaId, 'worker-1', 'failed', '{"error":"too many attempts"}']],
    ['app.record_media_transcode_job_outcome(uuid,uuid,text,text,text)',
      [JOB.id, JOB.mediaId, 'worker-1', 'done_hls',
        '{"masterKey":"hls/master.m3u8","qualitiesJson":"[\\"720p\\"]","durationSeconds":61}']],
  ]);
  expect(fakes.runWebappSql).not.toHaveBeenCalled();
});

it('чужой замок на работе — конфликт, а не молчаливая перезапись', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ recorded: false }] });

  await expect(completeMediaWorkerHlsJob(JOB, 'worker-2', { masterKey: 'hls/master.m3u8' }))
    .rejects.toThrow('media_worker_control_conflict');
});

it('проба готовности спрашивает саму дверь очереди, а не отношение', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ media: null }] });

  await assertMediaWorkerControlReady();

  expect(fakes.runWebappNamedRoot.mock.calls[0]?.[1])
    .toBe('app.read_media_transcode_job_media(uuid,uuid,text)');
  expect(fakes.runWebappSql).not.toHaveBeenCalled();
});
