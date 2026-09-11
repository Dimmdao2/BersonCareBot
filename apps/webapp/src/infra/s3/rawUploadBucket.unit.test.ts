import { describe, expect, it, vi } from 'vitest';

/**
 * М7 (`docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`): свежая загрузка `library`-цели обязана попасть
 * в ОТДЕЛЬНЫЙ сырой бакет под ключом `<organizationId>/media/<mediaId>/<file>` — верхняя папка
 * равна организации, чтобы объём читался независимым обходом бакета, а не только счётчиком в базе.
 *
 * WHAT BREAKS, если это не проверено кодом:
 * 1. Кто-то возвращает `sourceStorageKindFor('library')` к `'hot'` (фолбэк на горячий бакет) —
 *    загрузка тихо продолжает работать, но исходники больше не изолированы от выдачи.
 * 2. Кто-то строит сырой ключ через `s3ObjectKey` вместо `s3RawObjectKey` — объект уезжает в бакет
 *    без папки организации, и обход бакета для подсчёта объёма перестаёт группироваться верно.
 * Оба случая ничего не ломают немедленно (объект всё ещё загружается и читается), поэтому без
 * теста регрессия прошла бы незамеченной до следующего аудита.
 */
vi.mock('@/config/env', () => ({
  env: {
    S3_ENDPOINT: 'https://storage.example',
    S3_ACCESS_KEY: 'library-access',
    S3_SECRET_KEY: 'library-secret',
    S3_PRIVATE_BUCKET: 'hot-bucket',
    S3_RAW_BUCKET: 'raw-bucket',
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

const { s3RawObjectKey, sourceStorageKindFor, storageBucketFor } = await import('./client');

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const MEDIA_ID = '11111111-1111-4111-8111-111111111111';

describe('сырой бакет загрузок (М7)', () => {
  it('sourceStorageKindFor направляет library-цель в raw, patient-цель — в hot', () => {
    expect(sourceStorageKindFor('library')).toBe('raw');
    expect(sourceStorageKindFor('patient')).toBe('hot');
  });

  it('s3RawObjectKey кладёт папку организации верхним уровнем ключа', () => {
    expect(s3RawObjectKey(ORG_ID, MEDIA_ID, 'clip.mp4')).toBe(
      `${ORG_ID}/media/${MEDIA_ID}/clip.mp4`,
    );
  });

  it('library/raw резолвится в S3_RAW_BUCKET, отдельно от S3_PRIVATE_BUCKET', () => {
    expect(storageBucketFor('library', 'raw')).toBe('raw-bucket');
    expect(storageBucketFor('library', 'hot')).toBe('hot-bucket');
    expect(storageBucketFor('library', 'raw')).not.toBe(storageBucketFor('library', 'hot'));
  });

  it('patient-цель разделения не получает: raw и hot — один и тот же бакет', () => {
    expect(storageBucketFor('patient', 'raw')).toBe(storageBucketFor('patient', 'hot'));
  });
});
