/**
 * The only route-facing adapter for storage writes in the media intake flow.
 * It deliberately accepts a closed `UploadPolicyId`, never caller-built MIME/size rules.
 */
import { randomUUID } from 'node:crypto';
import {
  presignPutUrl,
  presignUploadPartUrl,
  s3AbortMultipartUpload,
  s3CompleteMultipartUpload,
  s3CreateMultipartUpload,
  s3GetObjectPrefix,
  s3HeadObjectDetails,
  s3ObjectKey,
  s3RawObjectKey,
  sourceStorageKindFor,
  storageBucketFor,
} from './s3Client';
import type { StorageKind, StorageTarget } from './s3Client';
import {
  confirmMediaFileReady,
  confirmProgramSubmissionMediaFileReady,
  abortPendingProgramSubmissionMedia,
  stagePendingMediaAbort,
} from './s3MediaStorage';
import { tryFinalizeMultipartIdempotentTx } from './mediaUploadSessionsRepo';
import type { PoolClient } from 'pg';
import {
  validateReceivedUpload,
  validateUploadIntent,
  assertReceivedUpload,
  type ReceivedUpload,
  type UploadIntent,
  type UploadPolicyId,
  type UploadValidationResult,
} from '@/modules/media/uploadValidation';
import {
  chooseMultipartPartSize,
  MULTIPART_SESSION_TTL_MS,
  multipartMaxPartNumber,
} from '@/modules/media/multipartConstants';

export type PreparedMediaUpload = Readonly<{
  id: string;
  key: string;
  bucket: string;
  /** В каком физическом хранилище живёт объект — решается здесь и дальше только передаётся. */
  target: StorageTarget;
  /**
   * Сырой бакет или горячий (М7). Свежая загрузка `library`-цели всегда `raw` — она ложится в
   * `S3_RAW_BUCKET`, а не туда, откуда что-либо отдаётся. `patient` не разделён — всегда `hot`.
   */
  kind: StorageKind;
  intent: UploadIntent;
}>;

function sanitizeFilename(name: string): string {
  const base = name.replace(/\.\./g, '').replace(/\s+/g, '_').slice(0, 200);
  const cleaned = base.replace(/[^a-zA-Z0-9._\-]/g, '_');
  return cleaned || 'file';
}

/**
 * Единственное место, где решается физическое хранилище загрузки (owner ruling 06.09.2026).
 *
 * Решает `policyId`, а не вызывающий: политика уже описывает, ЧТО грузится, она замкнута и
 * обязательна на каждой двери. Поэтому новую загрузку нельзя завести, забыв назвать хранилище, —
 * а именно так данные пациента и утекли бы в общий бакет. Отдельный необязательный аргумент
 * «положи в шифрованное» такой гарантии не даёт: его забывают.
 *
 * `namespace: 'patient-files'` учитывается тоже: он уже отделяет файлы врача о пациенте.
 */
const PATIENT_UPLOAD_POLICIES: ReadonlySet<UploadPolicyId> = new Set<UploadPolicyId>([
  'patient-program-submission',
  'patient-file',
]);

export function storageTargetFor(input: {
  policyId: UploadPolicyId;
  namespace?: 'media' | 'patient-files';
}): StorageTarget {
  if (input.namespace === 'patient-files') return 'patient';
  return PATIENT_UPLOAD_POLICIES.has(input.policyId) ? 'patient' : 'library';
}

export function prepareMediaUpload(input: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  policyId: UploadPolicyId;
  namespace?: 'media' | 'patient-files';
  /**
   * Обязателен: свежая `library`-загрузка кладётся под `<organizationId>/media/<id>/<file>` в
   * сыром бакете (М7) — папка верхнего уровня организация, чтобы объём читался обходом бакета.
   * `patient`/`patient-files` цели ключ игнорируют (их формат и бакет не меняются).
   */
  organizationId: string;
}): UploadValidationResult<PreparedMediaUpload> {
  const validated = validateUploadIntent(input);
  if (!validated.ok) return validated;
  const id = randomUUID();
  const target = storageTargetFor(input);
  const kind: StorageKind = sourceStorageKindFor(target);
  const key =
    input.namespace === 'patient-files'
      ? `patient-files/${id}/${sanitizeFilename(validated.value.filename)}`
      : kind === 'raw'
        ? s3RawObjectKey(input.organizationId, id, validated.value.filename)
        : s3ObjectKey(id, validated.value.filename);
  return {
    ok: true,
    value: {
      id,
      key,
      bucket: storageBucketFor(target, kind),
      target,
      kind,
      intent: validated.value,
    },
  };
}

export function presignPreparedUpload(upload: PreparedMediaUpload): Promise<string> {
  return presignPutUrl(upload.key, upload.intent.mimeType, upload.target, upload.kind);
}

export async function beginPreparedMultipartUpload(
  upload: PreparedMediaUpload,
  metadata: Record<string, string>,
): Promise<{ uploadId: string }> {
  return s3CreateMultipartUpload({
    key: upload.key,
    contentType: upload.intent.mimeType,
    metadata,
    target: upload.target,
    kind: upload.kind,
  });
}

/**
 * One multipart begin lifecycle for every already-authorized media door. The route selects the
 * closed policy before this call and supplies only its existing pending-row creator; it never
 * selects a bucket, object key, or multipart metadata.
 */
export async function beginAuthorizedMultipartUpload(input: {
  upload: PreparedMediaUpload;
  ownerUserId: string;
  createPendingAndSession: (params: {
    mediaId: string;
    sessionId: string;
    uploadId: string;
    partSizeBytes: number;
    expiresAt: Date;
  }) => Promise<void>;
  abortPending: (mediaId: string) => Promise<unknown>;
}): Promise<{
  mediaId: string;
  sessionId: string;
  uploadId: string;
  partSizeBytes: number;
  maxParts: number;
  expiresAt: Date;
}> {
  const mediaId = input.upload.id;
  const sessionId = randomUUID();
  const partSizeBytes = chooseMultipartPartSize(input.upload.intent.sizeBytes);
  const maxParts = multipartMaxPartNumber(input.upload.intent.sizeBytes, partSizeBytes);
  const expiresAt = new Date(Date.now() + MULTIPART_SESSION_TTL_MS);
  let uploadId: string | null = null;
  try {
    const created = await beginPreparedMultipartUpload(input.upload, {
      'media-id': mediaId,
      'owner-user-id': input.ownerUserId,
      'expected-size': String(input.upload.intent.sizeBytes),
      'upload-policy': input.upload.intent.policyId,
    });
    uploadId = created.uploadId;
    await input.createPendingAndSession({ mediaId, sessionId, uploadId, partSizeBytes, expiresAt });
    return { mediaId, sessionId, uploadId, partSizeBytes, maxParts, expiresAt };
  } catch (error) {
    if (uploadId) {
      await abortPreparedMultipartUpload(
        input.upload.key,
        uploadId,
        input.upload.target,
        input.upload.kind,
      ).catch(() => undefined);
    }
    await input.abortPending(mediaId).catch(() => undefined);
    throw error;
  }
}

/**
 * `kind` не персистится в сессии multipart (`media_upload_sessions` хранит только
 * `storage_target`) — он чистая функция от `target`, поэтому пересчитывается здесь тем же
 * правилом, что и при создании загрузки (`sourceStorageKindFor`), а не хранится второй раз.
 */
export function presignPreparedUploadPart(session: {
  key: string;
  uploadId: string;
  partNumber: number;
  target: StorageTarget;
}): Promise<string> {
  return presignUploadPartUrl(
    session.key,
    session.uploadId,
    session.partNumber,
    session.target,
    sourceStorageKindFor(session.target),
  );
}

export function completePreparedMultipartUpload(
  key: string,
  uploadId: string,
  parts: { PartNumber: number; ETag: string }[],
  target: StorageTarget,
): Promise<void> {
  return s3CompleteMultipartUpload(key, uploadId, parts, target, sourceStorageKindFor(target));
}

export function abortPreparedMultipartUpload(
  key: string,
  uploadId: string,
  target: StorageTarget,
  kind: StorageKind = sourceStorageKindFor(target),
): Promise<void> {
  return s3AbortMultipartUpload(key, uploadId, target, kind);
}

/**
 * HEAD plus a tiny range read: never downloads the whole object to validate a signature.
 *
 * `target` обязателен ровно по той же причине, что и у двери загрузки: дверь приёмки ищет
 * объект в конкретном бакете, и «не указали — значит библиотека» превратило бы принятое видео
 * пациента в `file_not_found_in_s3`.
 */
export async function validateReceivedMediaObject(
  upload: Pick<PreparedMediaUpload, 'key' | 'intent' | 'target'>,
): Promise<UploadValidationResult<ReceivedUpload>> {
  const kind = sourceStorageKindFor(upload.target);
  const head = await s3HeadObjectDetails(upload.key, upload.target, kind);
  if (!head) return { ok: false, error: 'file_not_found_in_s3' };
  const firstBytes = await s3GetObjectPrefix(upload.key, upload.target, undefined, kind);
  if (!firstBytes) return { ok: false, error: 'file_not_found_in_s3' };
  return validateReceivedUpload({
    intent: upload.intent,
    contentLength: head.contentLength,
    contentType: head.contentType,
    firstBytes,
  });
}

/** Multipart completion additionally verifies the metadata written at CreateMultipartUpload. */
export function inspectReceivedMediaObject(key: string, target: StorageTarget) {
  return s3HeadObjectDetails(key, target, sourceStorageKindFor(target));
}

export function validateBufferedMediaUpload(
  intent: UploadIntent,
  bytes: Uint8Array,
): UploadValidationResult<ReceivedUpload> {
  return validateReceivedUpload({
    intent,
    contentLength: bytes.byteLength,
    contentType: intent.mimeType,
    firstBytes: bytes,
  });
}

/** The only adapter allowed to hand a received proof to the ready repository primitives. */
export function acceptReceivedMedia(mediaId: string, received: ReceivedUpload): Promise<boolean> {
  assertReceivedUpload(received);
  return confirmMediaFileReady(mediaId, received);
}

export function acceptReceivedProgramSubmission(
  mediaId: string,
  received: ReceivedUpload,
): Promise<boolean> {
  assertReceivedUpload(received);
  return confirmProgramSubmissionMediaFileReady(mediaId, received);
}

/** The only route-facing abort transition for terminal single-PUT receive failures. */
export function abortPendingMediaUpload(mediaId: string): Promise<boolean> {
  return stagePendingMediaAbort(mediaId);
}

/** Patient submission abort uses its own exact DB root and cannot delete patient-file metadata. */
export function abortPendingProgramSubmissionUpload(mediaId: string): Promise<boolean> {
  return abortPendingProgramSubmissionMedia(mediaId);
}

export function finalizeReceivedMultipart(
  client: PoolClient,
  params: {
    sessionId: string;
    mediaId: string;
    ownerUserId: string;
    organizationId: string;
    received: ReceivedUpload;
  },
) {
  assertReceivedUpload(params.received);
  return tryFinalizeMultipartIdempotentTx(
    client,
    params.sessionId,
    params.mediaId,
    params.ownerUserId,
    params.organizationId,
    params.received,
  );
}
