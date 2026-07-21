import { beforeEach, describe, expect, it, vi } from "vitest";

const getConfigBoolMock = vi.hoisted(() => vi.fn());
const loadTranscodeMetricsMock = vi.hoisted(() => vi.fn());
const getOperatorJobStatusMock = vi.hoisted(() => vi.fn());
const checkDbMock = vi.hoisted(() => vi.fn());
const getPoolRoutingMetricsMock = vi.hoisted(() => vi.fn());
const readIsolationHealthMock = vi.hoisted(() => vi.fn());
const readIsolationCanaryMock = vi.hoisted(() => vi.fn());
const listOpenIncidentsMock = vi.hoisted(() => vi.fn());

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

vi.mock("@/infra/db/client", () => ({
  getCurrentWebappPoolRoutingMetrics: getPoolRoutingMetricsMock,
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
      listWebhookBurstSignals: vi.fn().mockResolvedValue([]),
      listOpenIncidents: listOpenIncidentsMock,
      getTenantIsolationCanarySnapshot: readIsolationCanaryMock,
    },
    saasIsolationDiagnostics: { readHealth: readIsolationHealthMock },
  }),
}));

import {
  collectCriticalHealthSignals,
  collectOperatorHealthBannerInput,
} from "./collectCriticalHealthSignals";
import { resetTenantIsolationCriticalHealthForTest } from "@/modules/operator-health/tenantIsolationCriticalHealth";

describe("collectCriticalHealthSignals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTenantIsolationCriticalHealthForTest();
    checkDbMock.mockResolvedValue(true);
    getOperatorJobStatusMock.mockResolvedValue(null);
    getConfigBoolMock.mockImplementation(async (key: string) => {
      if (key === "video_hls_pipeline_enabled") return false;
      if (key === "video_hls_reconcile_enabled") return false;
      return false;
    });
    loadTranscodeMetricsMock.mockResolvedValue(null);
    getPoolRoutingMetricsMock.mockReturnValue({
      staffSelections: 0,
      nonstaffSelections: 0,
      missingPrincipalSelections: 0,
      bootstrapSelections: 0,
      infraSelections: 0,
      poolRoleMismatches: 0,
      webPushReminderSelections: 0,
    });
    readIsolationHealthMock.mockResolvedValue({
      status: "okay",
      active: { unexplained: 0 },
    });
    readIsolationCanaryMock.mockResolvedValue({ organizations: [], truncated: false });
    listOpenIncidentsMock.mockResolvedValue([]);
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

  it("collects a recent synchronous provider incident into the bounded critical input", async () => {
    listOpenIncidentsMock.mockResolvedValue([
      {
        id: "incident-id",
        dedupKey: "outbound_delivery_provider:email:provider_send_failed",
        direction: "outbound_delivery_provider",
        integration: "email",
        errorClass: "provider_send_failed",
        errorDetail: null,
        openedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
        lastSeenAt: new Date(Date.now() - 5 * 60_000).toISOString(),
        occurrenceCount: 1,
      },
    ]);

    const input = await collectCriticalHealthSignals();
    expect(input.outboundDeliveryProvider).toEqual({ recentIncidentCount: 1 });
    expect(listOpenIncidentsMock).toHaveBeenCalledWith(100);
  });

  it("feeds existing routing and isolation diagnostics into the critical snapshot", async () => {
    getPoolRoutingMetricsMock.mockReturnValue({
      missingPrincipalSelections: 2,
      poolRoleMismatches: 1,
    });
    readIsolationHealthMock.mockResolvedValue({
      status: "critical",
      active: { unexplained: 3 },
    });
    const input = await collectCriticalHealthSignals();
    expect(input.tenantIsolation).toEqual({
      runtime: { critical: true, missingPrincipalDelta: 2, poolRoleMismatchDelta: 1 },
      diagnostics: { status: "critical", activeUnexplainedEvents: 3 },
      wentDark: { status: "priming", affectedOrganizations: 0 },
    });
  });

  it("keeps isolation reads and state advancement out of the doctor banner request path", async () => {
    const input = await collectOperatorHealthBannerInput();
    expect(input.tenantIsolation).toBeUndefined();
    expect(readIsolationHealthMock).not.toHaveBeenCalled();
    expect(readIsolationCanaryMock).not.toHaveBeenCalled();
    expect(getPoolRoutingMetricsMock).not.toHaveBeenCalled();
  });
});
