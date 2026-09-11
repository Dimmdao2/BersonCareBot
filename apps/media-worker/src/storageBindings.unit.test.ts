import { describe, expect, it } from 'vitest';
import { buildMediaWorkerStorageBindings } from './storageBindings.js';
import type { MediaWorkerEnv } from './env.js';

/**
 * Correction stage (audit `raw-bucket-audit-01`): tests the REAL binding `main.ts` wires the worker
 * with, not a fixture harness. The audit's exact finding this file closes: "Новый тест автора
 * «исходник читается из сырого бакета» проверяет фикстуру собственного хэрнесса… у `main.ts`, где
 * живёт настоящая привязка, тестов нет вовсе." `buildMediaWorkerStorageBindings` IS that binding —
 * `main.ts` now only calls it, nothing left uninstrumented.
 */
function fakeEnv(overrides: Partial<MediaWorkerEnv> = {}): MediaWorkerEnv {
  return {
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
    ...overrides,
  } as unknown as MediaWorkerEnv;
}

const MEDIA_ID = '22222222-2222-4222-8222-222222222222';
const ORG_ID = '33333333-3333-4333-8333-333333333333';

describe('buildMediaWorkerStorageBindings — настоящая привязка main.ts', () => {
  it('output (storageFor) всегда горячий бакет, для обеих целей', () => {
    const { storageFor } = buildMediaWorkerStorageBindings(fakeEnv());
    expect(storageFor('library').bucket).toBe('hot-bucket');
    expect(storageFor('patient').bucket).toBe('hot-bucket');
  });

  it('F-1: свежий (post-M7) org-prefixed ключ библиотеки читается из сырого бакета', () => {
    const { sourceStorageFor } = buildMediaWorkerStorageBindings(fakeEnv());
    const key = `${ORG_ID}/media/${MEDIA_ID}/source.mp4`;
    expect(sourceStorageFor('library', key).bucket).toBe('raw-bucket');
  });

  it('F-1: ещё не перенесённый (pre-M7) ключ библиотеки остаётся достижимым — горячий бакет', () => {
    const { sourceStorageFor } = buildMediaWorkerStorageBindings(fakeEnv());
    const key = `media/${MEDIA_ID}/source.mp4`;
    expect(sourceStorageFor('library', key).bucket).toBe('hot-bucket');
  });

  it('patient-цель источника всегда горячая, форма ключа не имеет значения', () => {
    const { sourceStorageFor } = buildMediaWorkerStorageBindings(fakeEnv());
    expect(sourceStorageFor('patient', `media/${MEDIA_ID}/source.mp4`).bucket).toBe('hot-bucket');
    expect(sourceStorageFor('patient', `${ORG_ID}/media/${MEDIA_ID}/source.mp4`).bucket).toBe(
      'hot-bucket',
    );
  });
});

/**
 * Канарейка F-5/INJ4 (независимый аудит `raw-bucket-audit-01`): та же инъекция «нет переменной —
 * возьми горячий», но со стороны воркера (`sourceStorageFor` для `library` возвращал `library`
 * вместо `raw`). Живьём — **0 из 114** тестов воркера покраснели. Этот тест пришпиливает, что
 * ИСТОЧНИК свежего библиотечного ключа НИКОГДА не совпадает с ВЫХОДНЫМ (горячим) бакетом.
 */
describe('нет фолбэка raw → hot в воркере (F-5, correction stage)', () => {
  it('свежий источник библиотеки никогда не читается из того же бакета, куда ложится выход', () => {
    const { storageFor, sourceStorageFor } = buildMediaWorkerStorageBindings(fakeEnv());
    const key = `${ORG_ID}/media/${MEDIA_ID}/source.mp4`;

    expect(sourceStorageFor('library', key).bucket).not.toBe(storageFor('library').bucket);
    expect(sourceStorageFor('library', key).bucket).toBe('raw-bucket');
  });
});
