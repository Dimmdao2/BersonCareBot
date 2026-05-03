import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

export type S3Config = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle: boolean;
};

export function createS3Client(cfg: S3Config): S3Client {
  return new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: cfg.forcePathStyle,
  });
}

export function contentTypeForKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (lower.endsWith(".ts")) return "video/mp2t";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

export async function downloadObjectToFile(
  client: S3Client,
  bucket: string,
  key: string,
  dest: string,
): Promise<void> {
  const out = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
  const body = out.Body as Readable | undefined;
  if (!body) {
    throw new Error("s3_empty_body");
  }
  await pipeline(body, createWriteStream(dest));
}

export async function headObjectExists(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<boolean> {
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    return true;
  } catch (e: unknown) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw e;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export async function putObjectWithRetry(
  client: S3Client,
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string,
  log: { warn: (o: unknown, m: string) => void },
): Promise<void> {
  const max = 3;
  let last: unknown;
  for (let i = 0; i < max; i++) {
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      return;
    } catch (e) {
      last = e;
      log.warn({ err: e, key, attempt: i + 1 }, "s3_put_retry");
      await sleep(200 * (i + 1));
    }
  }
  throw last;
}
