import { ALLOWED_MEDIA_MIME, MAX_MEDIA_BYTES, MAX_PROXY_UPLOAD_BYTES } from './uploadAllowedMime';
import {
  MAX_PROGRAM_SUBMISSION_BYTES,
  PROGRAM_SUBMISSION_ALLOWED_MIME,
} from './programSubmissionUploadLimits';

const uploadIntentBrand: unique symbol = Symbol('uploadIntent');
const receivedUploadBrand: unique symbol = Symbol('receivedUpload');
const receivedUploadCapabilities = new WeakSet<object>();

export type UploadPolicyId =
  | 'cms'
  | 'proxy'
  | 'individual-exercise-video'
  | 'patient-program-submission'
  | 'patient-file';

type UploadPolicy = {
  readonly allowedMime: ReadonlySet<string>;
  readonly maxBytes: number;
};

const VIDEO_MIME = new Set([...ALLOWED_MEDIA_MIME].filter((mime) => mime.startsWith('video/')));

/** Closed MIME-to-extension policy for every public upload intent. */
const UPLOAD_FILENAME_EXTENSIONS: Record<string, readonly string[]> = {
  'image/jpeg': ['.jpg', '.jpeg', '.jpe'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'image/heic': ['.heic'],
  'image/heif': ['.heif'],
  'image/avif': ['.avif'],
  'image/tiff': ['.tif', '.tiff'],
  'image/svg+xml': ['.svg'],
  'video/mp4': ['.mp4', '.m4v'],
  'video/quicktime': ['.mov', '.qt'],
  'video/webm': ['.webm'],
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/ogg': ['.ogg', '.oga'],
  'audio/aac': ['.aac'],
  'audio/mp4': ['.m4a', '.mp4'],
  'audio/x-m4a': ['.m4a'],
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
};

/** Closed registry: routes select an id; they cannot mint a permissive policy object. */
const UPLOAD_POLICIES: Record<UploadPolicyId, UploadPolicy> = {
  cms: { allowedMime: ALLOWED_MEDIA_MIME, maxBytes: MAX_MEDIA_BYTES },
  proxy: { allowedMime: ALLOWED_MEDIA_MIME, maxBytes: MAX_PROXY_UPLOAD_BYTES },
  'individual-exercise-video': { allowedMime: VIDEO_MIME, maxBytes: MAX_MEDIA_BYTES },
  'patient-program-submission': {
    allowedMime: PROGRAM_SUBMISSION_ALLOWED_MIME,
    maxBytes: MAX_PROGRAM_SUBMISSION_BYTES,
  },
  'patient-file': { allowedMime: ALLOWED_MEDIA_MIME, maxBytes: MAX_MEDIA_BYTES },
};

export type UploadIntent = Readonly<{
  filename: string;
  mimeType: string;
  sizeBytes: number;
  policyId: UploadPolicyId;
  readonly [uploadIntentBrand]: true;
}>;

export type ReceivedUpload = Readonly<{
  intent: UploadIntent;
  readonly [receivedUploadBrand]: true;
}>;

export type UploadValidationFailure =
  | { ok: false; error: 'invalid_upload_intent' }
  | { ok: false; error: 'file_extension_not_allowed'; mime: string }
  | { ok: false; error: 'mime_not_allowed'; mime: string }
  | { ok: false; error: 'file_too_large'; maxBytes: number }
  | { ok: false; error: 'empty_file' }
  | { ok: false; error: 'received_size_mismatch'; maxBytes: number }
  | { ok: false; error: 'received_content_type_mismatch'; mime: string }
  | { ok: false; error: 'file_signature_mismatch'; mime: string }
  | { ok: false; error: 'file_not_found_in_s3' };

export type UploadValidationResult<T> = { ok: true; value: T } | UploadValidationFailure;

function hasCompatibleExtension(filename: string, mimeType: string): boolean {
  if (/[\\/]/.test(filename)) return false;
  const extensionStart = filename.lastIndexOf('.');
  if (extensionStart <= 0 || extensionStart === filename.length - 1) return false;
  const extension = filename.slice(extensionStart).toLowerCase();
  return UPLOAD_FILENAME_EXTENSIONS[mimeType]?.includes(extension) ?? false;
}

export function validateUploadIntent(input: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  policyId: UploadPolicyId;
}): UploadValidationResult<UploadIntent> {
  const policy = UPLOAD_POLICIES[input.policyId];
  const filename = input.filename.trim();
  if (
    !filename ||
    filename.length > 255 ||
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes <= 0
  ) {
    return { ok: false, error: input.sizeBytes === 0 ? 'empty_file' : 'invalid_upload_intent' };
  }
  const mimeType = input.mimeType.trim().toLowerCase();
  if (!policy.allowedMime.has(mimeType))
    return { ok: false, error: 'mime_not_allowed', mime: mimeType };
  if (!hasCompatibleExtension(filename, mimeType)) {
    return { ok: false, error: 'file_extension_not_allowed', mime: mimeType };
  }
  if (input.sizeBytes > policy.maxBytes) {
    return { ok: false, error: 'file_too_large', maxBytes: policy.maxBytes };
  }
  return {
    ok: true,
    value: {
      filename,
      mimeType,
      sizeBytes: input.sizeBytes,
      policyId: input.policyId,
      [uploadIntentBrand]: true,
    },
  };
}

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  return bytes.length >= prefix.length && prefix.every((value, index) => bytes[index] === value);
}

function isIsoBmffFtyp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  );
}

function brand(bytes: Uint8Array): string {
  return bytes.length >= 12
    ? String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!)
    : '';
}

function isSvgText(bytes: Uint8Array): boolean {
  const text = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, 512))
    .trimStart()
    .replace(/^\uFEFF/, '')
    .toLowerCase();
  return text.startsWith('<?xml') || text.startsWith('<svg');
}

/** The proxy's former magic-byte implementation, shared with direct-to-S3 received validation. */
export function matchesUploadSignature(mime: string, bytes: Uint8Array): boolean {
  if (mime === 'image/jpeg') return hasPrefix(bytes, [0xff, 0xd8, 0xff]);
  if (mime === 'image/png')
    return hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (mime === 'image/gif')
    return (
      hasPrefix(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
      hasPrefix(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
    );
  if (mime === 'image/webp')
    return (
      hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  if (mime === 'image/heic' || mime === 'image/heif')
    return (
      isIsoBmffFtyp(bytes) &&
      ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand(bytes))
    );
  if (mime === 'image/avif') return isIsoBmffFtyp(bytes) && ['avif', 'avis'].includes(brand(bytes));
  if (mime === 'image/tiff')
    return hasPrefix(bytes, [0x49, 0x49, 0x2a, 0]) || hasPrefix(bytes, [0x4d, 0x4d, 0, 0x2a]);
  if (mime === 'image/svg+xml') return isSvgText(bytes);
  if (mime === 'video/mp4' || mime === 'video/quicktime') return isIsoBmffFtyp(bytes);
  if (mime === 'video/webm') return hasPrefix(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
  if (mime === 'audio/mpeg')
    return (
      hasPrefix(bytes, [0x49, 0x44, 0x33]) ||
      (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)
    );
  if (mime === 'audio/wav')
    return (
      hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x41 &&
      bytes[10] === 0x56 &&
      bytes[11] === 0x45
    );
  if (mime === 'audio/ogg') return hasPrefix(bytes, [0x4f, 0x67, 0x67, 0x53]);
  if (mime === 'audio/aac')
    return (
      (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xf0) === 0xf0) ||
      isIsoBmffFtyp(bytes)
    );
  if (mime === 'audio/mp4' || mime === 'audio/x-m4a') return isIsoBmffFtyp(bytes);
  if (mime === 'application/pdf') return hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (
    ['application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint'].includes(
      mime,
    )
  )
    return hasPrefix(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (mime.includes('openxmlformats-officedocument'))
    return hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04]) || hasPrefix(bytes, [0x50, 0x4b, 0x05, 0x06]);
  return mime === 'text/plain' || mime === 'text/csv';
}

export function validateReceivedUpload(input: {
  intent: UploadIntent;
  contentLength: number;
  contentType: string | undefined;
  firstBytes: Uint8Array;
}): UploadValidationResult<ReceivedUpload> {
  if (input.contentLength !== input.intent.sizeBytes)
    return { ok: false, error: 'received_size_mismatch', maxBytes: input.intent.sizeBytes };
  const storedType = input.contentType?.split(';')[0]?.trim().toLowerCase();
  if (storedType !== input.intent.mimeType)
    return { ok: false, error: 'received_content_type_mismatch', mime: input.intent.mimeType };
  if (!matchesUploadSignature(input.intent.mimeType, input.firstBytes))
    return { ok: false, error: 'file_signature_mismatch', mime: input.intent.mimeType };
  const received: ReceivedUpload = Object.freeze({
    intent: input.intent,
    [receivedUploadBrand]: true,
  });
  receivedUploadCapabilities.add(received);
  return { ok: true, value: received };
}

/** Runtime-only proof: a TypeScript cast cannot mint a received-object result. */
export function assertReceivedUpload(value: unknown): asserts value is ReceivedUpload {
  if (typeof value === 'object' && value !== null && receivedUploadCapabilities.has(value)) return;
  throw new Error('invalid_received_upload_capability');
}

export function uploadValidationResponse(failure: UploadValidationFailure): {
  status: number;
  body: Record<string, unknown>;
} {
  if (
    failure.error === 'mime_not_allowed' ||
    failure.error === 'file_extension_not_allowed' ||
    failure.error === 'received_content_type_mismatch' ||
    failure.error === 'file_signature_mismatch'
  )
    return { status: 415, body: { ok: false, error: failure.error, mime: failure.mime } };
  if (failure.error === 'file_too_large' || failure.error === 'received_size_mismatch')
    return { status: 413, body: { ok: false, error: failure.error, maxBytes: failure.maxBytes } };
  if (failure.error === 'file_not_found_in_s3')
    return { status: 404, body: { ok: false, error: failure.error } };
  return { status: 400, body: { ok: false, error: failure.error } };
}
