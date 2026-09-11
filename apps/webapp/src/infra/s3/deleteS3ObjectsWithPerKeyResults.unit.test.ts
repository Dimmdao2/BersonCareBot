import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * F-4 (correction stage, аудит `raw-bucket-audit-01`): строгая зачистка пользователя
 * (`strictPlatformUserPurge.ts`) зовёт `deleteS3ObjectsWithPerKeyResults` одним `target` на весь
 * список ключей. До этой правки внутри неё стоял ОДИН дефолт `kind: 'hot'` на все ключи —
 * `library`-ключ пользователя (сырой бакет, М7) удалялся мимо, S3 отвечал успехом на несуществующий
 * ключ, `s3Failures` оставался пустым, а «файлов больше нет» становилось неправдой. Этот тест бьёт
 * по НАСТОЯЩЕМУ AWS SDK клиенту (замокан только транспорт, не наша обёртка) — доказывает, что КАЖДЫЙ
 * ключ идёт в СВОЙ бакет по форме ключа, а не в один дефолтный.
 */
const fakes = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('@/config/env', () => ({
  env: {
    S3_ENDPOINT: 'http://s3.test',
    S3_REGION: 'test',
    S3_ACCESS_KEY: 'test',
    S3_SECRET_KEY: 'test',
    S3_FORCE_PATH_STYLE: true,
    S3_PRIVATE_BUCKET: 'hot-bucket',
    S3_RAW_BUCKET: 'raw-bucket',
    PATIENT_S3_ENDPOINT: '',
    PATIENT_S3_ACCESS_KEY: '',
    PATIENT_S3_SECRET_KEY: '',
    PATIENT_S3_BUCKET: '',
    PATIENT_S3_REGION: '',
    PATIENT_S3_FORCE_PATH_STYLE: false,
  },
}));

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  return {
    ...actual,
    S3Client: class {
      send = fakes.send;
    },
  };
});

const { deleteS3ObjectsWithPerKeyResults } = await import('./client');

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const MEDIA_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.send.mockResolvedValue({});
});

describe('deleteS3ObjectsWithPerKeyResults — каждый ключ несёт своё хранилище (F-4)', () => {
  it('свежий (post-M7) library-ключ удаляется из СЫРОГО бакета, легаси-ключ и артефакты — из горячего', async () => {
    const rawKey = `${ORG_ID}/media/${MEDIA_ID}/source.mp4`;
    const legacyKey = `media/${MEDIA_ID}-legacy/source.mp4`;
    const hlsKey = `media/${MEDIA_ID}/hls/master.m3u8`;

    const results = await deleteS3ObjectsWithPerKeyResults([rawKey, legacyKey, hlsKey], 'library');

    expect(results).toEqual([
      { key: rawKey, ok: true },
      { key: legacyKey, ok: true },
      { key: hlsKey, ok: true },
    ]);
    expect(fakes.send).toHaveBeenCalledTimes(3);
    const buckets = fakes.send.mock.calls.map(
      (call) => (call[0] as { input: { Bucket: string } }).input.Bucket,
    );
    expect(buckets).toEqual(['raw-bucket', 'hot-bucket', 'hot-bucket']);
  });
});
