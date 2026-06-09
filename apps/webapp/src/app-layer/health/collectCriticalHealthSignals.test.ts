import { beforeEach, describe, expect, it, vi } from "vitest";

const getConfigBoolMock = vi.hoisted(() => vi.fn());
const loadTranscodeMetricsMock = vi.hoisted(() => vi.fn());
const getOperatorJobStatusMock = vi.hoisted(() => vi.fn());
const checkDbMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/system-settings/configAdapter", () => ({
  getConfigBool: getConfigBoolMock,
}));

vi.mock("@/app-layer/media/adminTranscodeHealthMetrics", () => ({
  loadAdminTranscodeHealthMetricsSafe: loadTranscodeMetricsMock,
}));

vi.mock("@/app-layer/health/proxyIntegratorProjectionHealth", () => ({
  proxyIntegratorProjectionHealth: vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ deadCount: 0, retriesOverThreshold: 0 }), { status: 200 }),
  ),
}));

vi.mock("@/config/env", () => ({
  env: { INTEGRATOR_API_URL: "" },
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    health: { checkDbHealth: checkDbMock },
    operatorHealthRead: {
      getOutgoingDeliveryQueueHealth: vi.fn().mockResolvedValue({ deadTotal: 0, dueBacklog: 0 }),
      getIntegratorPushOutboxHealth: vi.fn().mockResolvedValue({
        dueBacklog: 0,
        deadTotal: 0,
        oldestDueAgeSeconds: null,
        dueByKind: {},
        deadByKind: {},
        processingCount: 0,
        oldestProcessingAgeSeconds: null,
        lastQueueActivityAt: null,
      }),
      listBackupJobStatus: vi.fn().mockResolvedValue([]),
      getOperatorJobStatus: getOperatorJobStatusMock,
    },
  }),
}));

import { collectCriticalHealthSignals } from "./collectCriticalHealthSignals";

describe("collectCriticalHealthSignals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkDbMock.mockResolvedValue(true);
    getOperatorJobStatusMock.mockResolvedValue(null);
    getConfigBoolMock.mockImplementation(async (key: string) => {
      if (key === "video_hls_pipeline_enabled") return false;
      if (key === "video_hls_reconcile_enabled") return false;
      return false;
    });
    loadTranscodeMetricsMock.mockResolvedValue(null);
  });

  it("does not mark video transcode error when pipeline disabled and metrics unavailable", async () => {
    const input = await collectCriticalHealthSignals();
    expect(input.videoTranscodeStatus).toBe("ok");
  });

  it("marks video transcode error when pipeline enabled and metrics unavailable", async () => {
    getConfigBoolMock.mockImplementation(async (key: string) => key === "video_hls_pipeline_enabled");
    const input = await collectCriticalHealthSignals();
    expect(input.videoTranscodeStatus).toBe("error");
  });
});
