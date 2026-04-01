import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/config/env";

const PRESIGN_EXPIRES_SEC = 900;
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

/** Public GET URL for path-style MinIO: https://endpoint/bucket/key */
export function s3PublicUrl(key: string): string {
  const base = env.S3_ENDPOINT.replace(/\/$/, "");
  const bucket = env.S3_PUBLIC_BUCKET;
  return `${base}/${bucket}/${key}`;
}

export async function presignPutUrl(key: string, mimeType: string): Promise<string> {
  const client = getS3Client();
  const cmd = new PutObjectCommand({
    Bucket: env.S3_PUBLIC_BUCKET,
    Key: key,
    ContentType: mimeType,
  });
  return getSignedUrl(client, cmd, { expiresIn: PRESIGN_EXPIRES_SEC });
}

export async function s3HeadObject(key: string): Promise<boolean> {
  const client = getS3Client();
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: env.S3_PUBLIC_BUCKET,
        Key: key,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function s3PutObjectBody(
  key: string,
  body: Buffer,
  mimeType: string,
): Promise<void> {
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: env.S3_PUBLIC_BUCKET,
      Key: key,
      Body: body,
      ContentType: mimeType,
    }),
  );
}

export async function s3DeleteObject(key: string): Promise<void> {
  const client = getS3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: env.S3_PUBLIC_BUCKET,
      Key: key,
    }),
  );
}
