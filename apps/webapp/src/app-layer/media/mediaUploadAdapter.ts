/**
 * The only route-facing adapter for storage writes in the media intake flow.
 * It deliberately accepts a closed `UploadPolicyId`, never caller-built MIME/size rules.
 */
import { randomUUID } from 'node:crypto';
import { env } from '@/config/env';
import {
  presignPutUrl,
  presignUploadPartUrl,
  s3AbortMultipartUpload,
  s3CompleteMultipartUpload,
  s3CreateMultipartUpload,
  s3GetObjectPrefix,
  s3HeadObjectDetails,
  s3ObjectKey,
} from './s3Client';
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

export type PreparedMediaUpload = Readonly<{
  id: string;
  key: string;
  bucket: string;
  intent: UploadIntent;
}>;

function sanitizeFilename(name: string): string {
  const base = name.replace(/\.\./g, '').replace(/\s+/g, '_').slice(0, 200);
  const cleaned = base.replace(/[^a-zA-Z0-9._\-]/g, '_');
  return cleaned || 'file';
}

export function prepareMediaUpload(input: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  policyId: UploadPolicyId;
  namespace?: 'media' | 'patient-files';
}): UploadValidationResult<PreparedMediaUpload> {
  const validated = validateUploadIntent(input);
  if (!validated.ok) return validated;
  const id = randomUUID();
  const key =
    input.namespace === 'patient-files'
      ? `patient-files/${id}/${sanitizeFilename(validated.value.filename)}`
      : s3ObjectKey(id, validated.value.filename);
  return {
    ok: true,
    value: {
      id,
      key,
      bucket: env.S3_PRIVATE_BUCKET ?? 'bersonservices-private',
      intent: validated.value,
    },
  };
}

export function presignPreparedUpload(upload: PreparedMediaUpload): Promise<string> {
  return presignPutUrl(upload.key, upload.intent.mimeType);
}

export async function beginPreparedMultipartUpload(
  upload: PreparedMediaUpload,
  metadata: Record<string, string>,
): Promise<{ uploadId: string }> {
  return s3CreateMultipartUpload({
    key: upload.key,
    contentType: upload.intent.mimeType,
    metadata,
  });
}

export function presignPreparedUploadPart(session: {
  key: string;
  uploadId: string;
  partNumber: number;
}): Promise<string> {
  return presignUploadPartUrl(session.key, session.uploadId, session.partNumber);
}

export function completePreparedMultipartUpload(
  key: string,
  uploadId: string,
  parts: { PartNumber: number; ETag: string }[],
): Promise<void> {
  return s3CompleteMultipartUpload(key, uploadId, parts);
}

export function abortPreparedMultipartUpload(key: string, uploadId: string): Promise<void> {
  return s3AbortMultipartUpload(key, uploadId);
}

/** HEAD plus a tiny range read: never downloads the whole object to validate a signature. */
export async function validateReceivedMediaObject(
  upload: Pick<PreparedMediaUpload, 'key' | 'intent'>,
): Promise<UploadValidationResult<ReceivedUpload>> {
  const head = await s3HeadObjectDetails(upload.key);
  if (!head) return { ok: false, error: 'file_not_found_in_s3' };
  const firstBytes = await s3GetObjectPrefix(upload.key);
  if (!firstBytes) return { ok: false, error: 'file_not_found_in_s3' };
  return validateReceivedUpload({
    intent: upload.intent,
    contentLength: head.contentLength,
    contentType: head.contentType,
    firstBytes,
  });
}

/** Multipart completion additionally verifies the metadata written at CreateMultipartUpload. */
export function inspectReceivedMediaObject(key: string) {
  return s3HeadObjectDetails(key);
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
