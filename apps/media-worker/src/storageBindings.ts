import { createS3Client, type StorageBinding } from './s3.js';
import type { MediaWorkerEnv } from './env.js';
import type { StorageTarget } from './storageTarget.js';
import { isLegacyHotMediaSourceKey } from './hlsStorageLayout.js';

/**
 * The REAL binding `main.ts` wires the worker with — extracted out of `main()` (correction stage
 * F-1/F-5, audit `raw-bucket-audit-01`) so it is importable and testable without booting the whole
 * process (control-plane handshake, poll loop, signal handlers). The audit's exact finding: "у
 * `main.ts`, где живёт настоящая привязка, тестов нет вовсе" — the only prior test
 * (`processTranscodeJob.unit.test.ts`) exercised its own fixture harness, never this function.
 */
export type MediaWorkerStorageBindings = {
  /** Куда ложится ВЫХОД наряда — HLS-дерево, постер, 480p-рендишн. Всегда горячий бакет. */
  storageFor: (target: StorageTarget) => StorageBinding;
  /**
   * Откуда читается ИСХОДНИК (`media.s3_key`). У `library` это сырой бакет (`S3_RAW_BUCKET`, М7) —
   * КРОМЕ ещё не перенесённых старых ключей (F-1, `isLegacyHotMediaSourceKey`), которые физически
   * остались в горячем: форма ключа решает, а не только цель. У `patient` разделения нет — источник
   * и назначение совпадают, как и раньше.
   */
  sourceStorageFor: (target: StorageTarget, key: string) => StorageBinding;
};

/**
 * Два хранилища строятся один раз на процесс, а не на наряд: клиент S3 держит пул соединений, и
 * пересоздавать его на каждое видео значило бы платить рукопожатием за каждый файл.
 *
 * Пока `PATIENT_S3_BUCKET` не задан, обе цели — один и тот же объект: окружение без разделения ведёт
 * себя ровно как до его появления.
 */
export function buildMediaWorkerStorageBindings(env: MediaWorkerEnv): MediaWorkerStorageBindings {
  const libraryConfig = {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    bucket: env.S3_PRIVATE_BUCKET,
    forcePathStyle: env.S3_FORCE_PATH_STYLE ?? false,
  };
  const library: StorageBinding = {
    client: createS3Client(libraryConfig),
    bucket: libraryConfig.bucket,
  };
  const patient: StorageBinding = env.PATIENT_S3_BUCKET
    ? (() => {
        const cfg = {
          endpoint: env.PATIENT_S3_ENDPOINT || libraryConfig.endpoint,
          region: env.PATIENT_S3_REGION || libraryConfig.region,
          accessKeyId: env.PATIENT_S3_ACCESS_KEY || libraryConfig.accessKeyId,
          secretAccessKey: env.PATIENT_S3_SECRET_KEY || libraryConfig.secretAccessKey,
          bucket: env.PATIENT_S3_BUCKET,
          forcePathStyle: env.PATIENT_S3_FORCE_PATH_STYLE ?? libraryConfig.forcePathStyle,
        };
        return { client: createS3Client(cfg), bucket: cfg.bucket };
      })()
    : library;
  /*
   * Сырой бакет загрузок (М7, `docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`): те же эндпоинт и ключи,
   * что у `library` — отдельным провайдером/учёткой владелец его не заводил, — но свой бакет
   * `S3_RAW_BUCKET`. Исходник `library`-видео читается только отсюда, НИКОГДА тихим откатом на
   * `library` (F-5: владелец категорически запретил этот фолбэк, и он не был защищён НИ ОДНИМ
   * тестом — 0 из 114 покраснели на его инъекции); `patient` разделения не получает вовсе.
   */
  const raw: StorageBinding = { client: library.client, bucket: env.S3_RAW_BUCKET };

  return {
    storageFor: (target: StorageTarget): StorageBinding => (target === 'patient' ? patient : library),
    sourceStorageFor: (target: StorageTarget, key: string): StorageBinding => {
      if (target === 'patient') return patient;
      return isLegacyHotMediaSourceKey(key) ? library : raw;
    },
  };
}
