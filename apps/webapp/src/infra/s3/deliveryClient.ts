import type { StorageTarget } from '@/shared/types/storageTarget';
import {
  presignGetUrl,
  s3GetObjectBody,
  s3GetObjectStream,
  s3GetPrivateObjectBuffer,
  s3HeadObjectDetails,
  type S3GetObjectStreamResult,
  type S3GetObjectStreamFailureReason,
  type S3HeadObjectDetails,
} from './client';

export type { S3GetObjectStreamFailureReason };

/**
 * S3 capability exposed to browser-facing delivery code.
 *
 * There is deliberately no storage-kind argument here: every object reachable through this
 * capability lives in the hot delivery bucket. Raw-upload access stays in `client.ts` and is
 * imported only by ingestion/encoding and the explicit `/original` download door.
 */
export function presignDeliveryGetUrl(
  key: string,
  expiresSec: number,
  target: StorageTarget,
  serve?: { mimeType?: string; filename?: string },
): Promise<string> {
  return presignGetUrl(key, expiresSec, target, serve, 'hot');
}

export function deliveryHeadObjectDetails(
  key: string,
  target: StorageTarget,
): Promise<S3HeadObjectDetails | null> {
  return s3HeadObjectDetails(key, target, 'hot');
}

export function deliveryGetObjectBody(
  key: string,
  target: StorageTarget,
): Promise<Buffer | null> {
  return s3GetObjectBody(key, target, 'hot');
}

export function deliveryGetPrivateObjectBuffer(
  key: string,
  target: StorageTarget,
) {
  return s3GetPrivateObjectBuffer(key, target, 'hot');
}

export function deliveryGetObjectStream(params: {
  key: string;
  range?: string | null;
  target: StorageTarget;
}): Promise<S3GetObjectStreamResult> {
  return s3GetObjectStream({ ...params, kind: 'hot' });
}
