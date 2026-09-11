import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Канарейка F-5 (независимый аудит `raw-bucket-audit-01`, correction stage). Владелец дословно
 * запретил фолбэк «нет переменной — возьми горячий бакет». Живьём аудит показал, что ОДНА строка
 * (`client.ts:65`, `env.S3_RAW_BUCKET || libraryHot.bucket`) красит **0 из 139** тестов вебаппа —
 * запрет не был защищён НИЧЕМ. Этот тест пришпиливает ровно то поведение, менять которое может
 * только владелец: raw-бакет `library`-цели равен РОВНО `S3_RAW_BUCKET`, никогда
 * `S3_PRIVATE_BUCKET`, даже когда `S3_RAW_BUCKET` пуст.
 *
 * `vi.resetModules()` + `vi.doMock` за тест (а не статический `vi.mock` на верху файла), потому что
 * каждый тест поднимает `client.ts` со своим env — иначе он закешировал бы конфигурацию первого
 * импорта.
 */
describe('нет фолбэка raw → hot (F-5, correction stage)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  function mockEnv(overrides: { S3_RAW_BUCKET: string }) {
    vi.doMock('@/config/env', () => ({
      env: {
        S3_ENDPOINT: 'https://storage.example',
        S3_ACCESS_KEY: 'library-access',
        S3_SECRET_KEY: 'library-secret',
        S3_PRIVATE_BUCKET: 'hot-bucket',
        S3_RAW_BUCKET: overrides.S3_RAW_BUCKET,
        S3_REGION: 'region-1',
        S3_FORCE_PATH_STYLE: false,
        PATIENT_S3_ENDPOINT: '',
        PATIENT_S3_ACCESS_KEY: '',
        PATIENT_S3_SECRET_KEY: '',
        PATIENT_S3_BUCKET: '',
        PATIENT_S3_REGION: '',
        PATIENT_S3_FORCE_PATH_STYLE: false,
      },
    }));
  }

  it('пустой S3_RAW_BUCKET не откатывается на S3_PRIVATE_BUCKET', async () => {
    mockEnv({ S3_RAW_BUCKET: '' });
    const { storageBucketFor } = await import('./client');

    expect(storageBucketFor('library', 'raw')).toBe('');
    expect(storageBucketFor('library', 'raw')).not.toBe('hot-bucket');
  });

  it('непустой S3_RAW_BUCKET резолвится ровно в себя, а не в S3_PRIVATE_BUCKET', async () => {
    mockEnv({ S3_RAW_BUCKET: 'raw-bucket' });
    const { storageBucketFor } = await import('./client');

    expect(storageBucketFor('library', 'raw')).toBe('raw-bucket');
    expect(storageBucketFor('library', 'raw')).not.toBe('hot-bucket');
  });
});
