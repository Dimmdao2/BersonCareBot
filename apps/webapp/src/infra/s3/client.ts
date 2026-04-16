import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/config/env";

const PRESIGN_PUT_EXPIRES_SEC = 900;
const PRESIGN_PART_EXPIRES_SEC = 900;
/** Browser / patient media redirect and doctor intake download. */
const PRESIGN_GET_DEFAULT_SEC = 3600;
const S3_KEY_PREFIX = "media";

let clientSingleton: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!clientSingleton) {
    clientSingleton = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY,
      },
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
  }
  return clientSingleton;
}

function privateBucket(): string {
  return env.S3_PRIVATE_BUCKET;
}

/** Sanitize original filename for object key segment. */
export function sanitizeMediaFilename(name: string): string {
  const base = name.replace(/\.\./g, "").replace(/\s+/g, "_").slice(0, 200);
  const cleaned = base.replace(/[^a-zA-Z0-9._\-]/g, "_");
  return cleaned.length > 0 ? cleaned : "file";
}

export function s3ObjectKey(mediaId: string, filename: string): string {
  const safe = sanitizeMediaFilename(filename);
  return `${S3_KEY_PREFIX}/${mediaId}/${safe}`;
}

/** Stable preview object keys (JPEG); content-addressed by media id + size tier. */
export function s3PreviewKey(mediaId: string, size: "sm" | "md"): string {
  return `previews/${size}/${mediaId}.jpg`;
}

/**
 * Direct public object URL (path-style MinIO). Use only for legacy content matching in findUsage
 * or optional future CDN assets when S3_PUBLIC_BUCKET is set.
 */
export function s3PublicUrl(key: string): string {
  const base = env.S3_ENDPOINT.replace(/\/$/, "");
  const bucket = env.S3_PUBLIC_BUCKET;
  return `${base}/${bucket}/${key}`;
}

/** Presigned PUT for CMS / patient uploads into the private bucket. */
export async function presignPutUrl(key: string, mimeType: string): Promise<string> {
  const client = getS3Client();
  const cmd = new PutObjectCommand({
    Bucket: privateBucket(),
    Key: key,
    ContentType: mimeType,
  });
  return getSignedUrl(client, cmd, { expiresIn: PRESIGN_PUT_EXPIRES_SEC });
}

/** Presigned GET for objects stored under S3_PRIVATE_BUCKET (media_files, intake attachments). */
export async function presignGetUrl(
  key: string,
  expiresSec: number = PRESIGN_GET_DEFAULT_SEC,
): Promise<string> {
  const client = getS3Client();
  const cmd = new GetObjectCommand({
    Bucket: privateBucket(),
    Key: key,
  });
  return getSignedUrl(client, cmd, { expiresIn: expiresSec });
}

export async function s3HeadObject(key: string): Promise<boolean> {
  const d = await s3HeadObjectDetails(key);
  return d !== null;
}

export type S3HeadObjectDetails = {
  contentLength: number;
  contentType: string | undefined;
  /** Lowercase keys as returned by HeadObject Metadata. */
  metadata: Record<string, string>;
  /** S3 object ETag when present (used for preview cache validators). */
  eTag?: string;
  lastModified?: Date;
};

export async function s3HeadObjectDetails(key: string): Promise<S3HeadObjectDetails | null> {
  const client = getS3Client();
  try {
    const out = await client.send(
      new HeadObjectCommand({
        Bucket: privateBucket(),
        Key: key,
      }),
    );
    const meta = out.Metadata ?? {};
    const normalized: Record<string, string> = {};
    for (const [k, v] of Object.entries(meta)) {
      if (v !== undefined) normalized[k.toLowerCase()] = v;
    }
    return {
      contentLength: Number(out.ContentLength ?? 0),
      contentType: out.ContentType,
      metadata: normalized,
      eTag: out.ETag ?? undefined,
      lastModified: out.LastModified ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function s3CreateMultipartUpload(params: {
  key: string;
  contentType: string;
  metadata: Record<string, string>;
}): Promise<{ uploadId: string }> {
  const client = getS3Client();
  const out = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: privateBucket(),
      Key: params.key,
      ContentType: params.contentType,
      Metadata: params.metadata,
    }),
  );
  if (!out.UploadId) {
    throw new Error("s3_multipart_no_upload_id");
  }
  return { uploadId: out.UploadId };
}

export async function presignUploadPartUrl(key: string, uploadId: string, partNumber: number): Promise<string> {
  const client = getS3Client();
  const cmd = new UploadPartCommand({
    Bucket: privateBucket(),
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(client, cmd, { expiresIn: PRESIGN_PART_EXPIRES_SEC });
}

export async function s3CompleteMultipartUpload(
  key: string,
  uploadId: string,
  parts: { PartNumber: number; ETag: string }[],
): Promise<void> {
  const client = getS3Client();
  const sorted = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: privateBucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: sorted.map((p) => {
          let etag = p.ETag.trim();
          if (!etag.startsWith('"')) etag = `"${etag}"`;
          return { PartNumber: p.PartNumber, ETag: etag };
        }),
      },
    }),
  );
}

export async function s3AbortMultipartUpload(key: string, uploadId: string): Promise<void> {
  const client = getS3Client();
  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: privateBucket(),
      Key: key,
      UploadId: uploadId,
    }),
  );
}

export async function s3PutObjectBody(key: string, body: Buffer, mimeType: string): Promise<void> {
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: privateBucket(),
      Key: key,
      Body: body,
      ContentType: mimeType,
    }),
  );
}

/** Full object bytes from private bucket (e.g. preview worker reading originals). */
export async function s3GetObjectBody(key: string): Promise<Buffer | null> {
  const client = getS3Client();
  try {
    const out = await client.send(
      new GetObjectCommand({
        Bucket: privateBucket(),
        Key: key,
      }),
    );
    const body = out.Body;
    if (!body) return null;
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  } catch {
    return null;
  }
}

export async function s3DeleteObject(key: string): Promise<void> {
  const client = getS3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: privateBucket(),
      Key: key,
    }),
  );
}

export type S3PerKeyDeleteResult =
  | { key: string; ok: true }
  | { key: string; ok: false; error: string };

/**
 * Deletes each key independently; does not short-circuit on first failure (strict purge post-commit).
 */
export async function deleteS3ObjectsWithPerKeyResults(keys: string[]): Promise<S3PerKeyDeleteResult[]> {
  const out: S3PerKeyDeleteResult[] = [];
  for (const key of keys) {
    try {
      await s3DeleteObject(key);
      out.push({ key, ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      out.push({ key, ok: false, error: msg });
    }
  }
  return out;
}
