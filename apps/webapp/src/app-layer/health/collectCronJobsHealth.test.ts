import { describe, expect, it, vi } from "vitest";
import { collectCronJobsHealth } from "@/app-layer/health/collectCronJobsHealth";
import {
  OPERATOR_MEDIA_JOB_FAMILY,
  OPERATOR_MEDIA_PLAYBACK_STATS_RETENTION_JOB_KEY,
} from "@/modules/operator-health/reconcileJobKeys";

const getOperatorJobStatusMock = vi.fn();

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    operatorHealthRead: {
      getOperatorJobStatus: getOperatorJobStatusMock,
    },
  }),
}));

describe("collectCronJobsHealth", () => {
  it("includes playback retention job with ok status when tick is fresh", async () => {
    getOperatorJobStatusMock.mockImplementation((family: string, key: string) => {
      if (
        family === OPERATOR_MEDIA_JOB_FAMILY &&
        key === OPERATOR_MEDIA_PLAYBACK_STATS_RETENTION_JOB_KEY
      ) {
        return Promise.resolve({
          jobKey: key,
          jobFamily: family,
          lastStatus: "success",
          lastStartedAt: "2026-05-28T04:15:00.000Z",
          lastFinishedAt: "2026-05-28T04:15:01.000Z",
          lastSuccessAt: new Date(Date.now() - 60_000).toISOString(),
          lastFailureAt: null,
          lastDurationMs: 120,
          lastError: null,
          metaJson: { deleted: 0, dryRun: false },
        });
      }
      return Promise.resolve(null);
    });

    const result = await collectCronJobsHealth();
    const playback = result.jobs.find((j) => j.id === "playback_retention");
    expect(playback?.status).toBe("ok");
    expect(playback?.lastTick?.metaJson.deleted).toBe(0);
    expect(result.status).not.toBe("no_data");
  });

  it("merges backup job rows from backupJobs map", async () => {
    getOperatorJobStatusMock.mockResolvedValue(null);
    const result = await collectCronJobsHealth({
      backupJobs: {
        "backup.hourly": {
          lastStatus: "success",
          lastStartedAt: null,
          lastFinishedAt: "2026-05-28T10:00:00.000Z",
          lastSuccessAt: new Date(Date.now() - 30 * 60_000).toISOString(),
          lastFailureAt: null,
          lastDurationMs: 5000,
          lastError: null,
        },
      },
    });
    const hourly = result.jobs.find((j) => j.id === "backup_hourly");
    expect(hourly?.status).toBe("ok");
    expect(hourly?.lastTick?.jobKey).toBe("backup.hourly");
  });

  it("aggregate status stays ok when only optional backup jobs have no_data", async () => {
    getOperatorJobStatusMock.mockImplementation((family: string, key: string) => {
      return Promise.resolve({
        jobKey: key,
        jobFamily: family,
        lastStatus: "success",
        lastStartedAt: null,
        lastFinishedAt: new Date().toISOString(),
        lastSuccessAt: new Date(Date.now() - 60_000).toISOString(),
        lastFailureAt: null,
        lastDurationMs: 2,
        lastError: null,
        metaJson: {},
      });
    });

    const result = await collectCronJobsHealth({
      backupJobs: {
        "backup.hourly": {
          lastStatus: "success",
          lastStartedAt: null,
          lastFinishedAt: new Date().toISOString(),
          lastSuccessAt: new Date(Date.now() - 30 * 60_000).toISOString(),
          lastFailureAt: null,
          lastDurationMs: 1000,
          lastError: null,
        },
      },
    });

    expect(result.jobs.find((j) => j.id === "backup_daily")?.status).toBe("no_data");
    expect(result.jobs.find((j) => j.id === "backup_weekly")?.status).toBe("no_data");
    expect(result.status).toBe("ok");
  });
});
