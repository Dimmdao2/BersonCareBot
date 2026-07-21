import type { S3Client } from "@aws-sdk/client-s3";
import { getCurrentDbPrincipal, getCurrentObservabilityContext } from "@bersoncare/db-principal";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { ClaimedJob } from "./jobs/claim.js";
import type { Logger } from "./logger.js";
import { runMediaWorkerTick, type MediaWorkerTickContext } from "./workerTick.js";

function makeCtx(): MediaWorkerTickContext {
  return {
    pool: {} as Pool,
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
    lockId: "worker-1",
    staleLockMinutes: 15,
  };
}

describe("runMediaWorkerTick principal scope", () => {
  it("runs pipeline read, stale reclaim, claim, and processing inside an infra principal scope", async () => {
    const principalKinds: Array<string | undefined> = [];
    const job: ClaimedJob = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      mediaId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      organizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      attempts: 1,
    };

    const result = await runMediaWorkerTick(makeCtx(), {
      readPipelineEnabled: vi.fn(async () => {
        principalKinds.push(getCurrentDbPrincipal()?.kind);
        return true;
      }),
      reclaimStaleProcessing: vi.fn(async () => {
        principalKinds.push(getCurrentDbPrincipal()?.kind);
        return 0;
      }),
      claimNextJob: vi.fn(async () => {
        principalKinds.push(getCurrentDbPrincipal()?.kind);
        return job;
      }),
      processTranscodeJob: vi.fn(async () => {
        principalKinds.push(getCurrentDbPrincipal()?.kind);
        expect(getCurrentObservabilityContext()).toEqual({
          correlationId: job.id,
          orgId: job.organizationId,
        });
      }),
    });

    expect(result).toBe("processed");
    expect(principalKinds).toEqual(["infra", "infra", "infra", "infra"]);
    expect(getCurrentDbPrincipal()).toBeUndefined();
    expect(getCurrentObservabilityContext()).toEqual({});
  });
});
