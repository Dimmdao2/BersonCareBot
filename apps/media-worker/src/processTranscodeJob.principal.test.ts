import type { S3Client } from "@aws-sdk/client-s3";
import { getCurrentDbPrincipal } from "@bersoncare/db-principal";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { ClaimedJob } from "./jobs/claim.js";
import type { Logger } from "./logger.js";
import { processTranscodeJob, type TranscodeContext } from "./processTranscodeJob.js";

describe("processTranscodeJob principal scope", () => {
  it("runs DB access under an infra principal even for organization-tagged jobs", async () => {
    const principalKinds: Array<string | undefined> = [];
    const query = vi.fn(async (text: string, _values?: readonly unknown[]) => {
      principalKinds.push(getCurrentDbPrincipal()?.kind);
      if (text.includes("FROM public.media_files")) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    });
    const pool = { query } as unknown as Pool;
    const ctx: TranscodeContext = {
      pool,
      s3Client: {} as S3Client,
      bucket: "private",
      ffmpegBin: "ffmpeg",
      ffmpegTimeoutMs: 60_000,
      maxAttempts: 3,
      log: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as unknown as Logger,
    };
    const job: ClaimedJob = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      mediaId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      organizationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      attempts: 1,
    };

    await processTranscodeJob(ctx, job);

    expect(principalKinds.length).toBeGreaterThan(0);
    expect(principalKinds.every((kind) => kind === "infra")).toBe(true);
    expect(getCurrentDbPrincipal()).toBeUndefined();
  });
});
