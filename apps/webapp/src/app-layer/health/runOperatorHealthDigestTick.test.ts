import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerOperatorAlertDedupPort } from "@/modules/operator-alerts/operatorAlertRuntime";
import {
  inMemoryOperatorHealthAlertSentPort,
  resetInMemoryOperatorHealthAlertSent,
} from "@/infra/repos/inMemoryOperatorHealthAlertSent";

const getConfigValueMock = vi.fn();
const getAppDisplayTimeZoneMock = vi.fn();
const dispatchMock = vi.fn();
const collectInputMock = vi.fn();
const tickDebounceMock = vi.fn();
const hadResolveAllMock = vi.fn();

vi.mock("@/modules/system-settings/configAdapter", () => ({
  getConfigValue: (...args: unknown[]) => getConfigValueMock(...args),
}));

vi.mock("@/modules/system-settings/appDisplayTimezone", () => ({
  getAppDisplayTimeZone: () => getAppDisplayTimeZoneMock(),
}));

vi.mock("@/modules/operator-alerts/dispatchOperatorAlert", () => ({
  dispatchOperatorAlert: (...args: unknown[]) => dispatchMock(...args),
}));

vi.mock("@/app-layer/health/collectOperatorHealthDigestInput", () => ({
  collectOperatorHealthDigestInput: (...args: unknown[]) => collectInputMock(...args),
}));

vi.mock("@/app-layer/health/tickProjectionDigestDebounce", () => ({
  tickProjectionDigestDebounce: (...args: unknown[]) => tickDebounceMock(...args),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    operatorHealthDigestRead: {
      hadOperatorIncidentsResolveAllInWindow: (...args: unknown[]) => hadResolveAllMock(...args),
    },
  }),
}));

import { runOperatorHealthDigestTick } from "./runOperatorHealthDigestTick";

describe("runOperatorHealthDigestTick", () => {
  beforeEach(() => {
    resetInMemoryOperatorHealthAlertSent();
    registerOperatorAlertDedupPort(inMemoryOperatorHealthAlertSentPort);
    getConfigValueMock.mockReset();
    getAppDisplayTimeZoneMock.mockReset();
    dispatchMock.mockReset();
    collectInputMock.mockReset();
    tickDebounceMock.mockReset();
    hadResolveAllMock.mockReset();

    getConfigValueMock.mockResolvedValue("");
    getAppDisplayTimeZoneMock.mockResolvedValue("Europe/Moscow");
    tickDebounceMock.mockResolvedValue({ includeRetriesLine: false, includeStalePendingLine: false });
    hadResolveAllMock.mockResolvedValue(false);
    collectInputMock.mockResolvedValue({
      auditErrorCount: 0,
      incidentsOpened: [],
      incidentsResolved: [],
      jobFailures: [],
      snapshotLines: [],
      suppressRecovery: false,
    });
    dispatchMock.mockResolvedValue({ dispatched: true });
  });

  it("skips when not digest send slot", async () => {
    const now = new Date("2026-06-09T06:30:00.000Z");
    const result = await runOperatorHealthDigestTick(now);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe("not_slot");
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(tickDebounceMock).toHaveBeenCalledWith(now.getTime());
  });

  it("advances projection debounce even when digest is disabled", async () => {
    getConfigValueMock.mockImplementation(async (key: string) => {
      if (key === "operator_health_alert_config") {
        return JSON.stringify({
          topics: { critical_enabled: true, digest_enabled: false, account_conflicts: true },
          digestTime: "09:00",
          channels: {
            critical: { telegram: true, max: true, web_push: true },
            digest: { telegram: true, max: true, web_push: true },
            account_conflicts: { telegram: true, max: true, web_push: true },
          },
        });
      }
      return "";
    });
    const now = new Date("2026-06-09T06:30:00.000Z");
    await runOperatorHealthDigestTick(now);
    expect(tickDebounceMock).toHaveBeenCalledWith(now.getTime());
  });

  it("dispatches digest at digestTime in display timezone", async () => {
    const now = new Date("2026-06-09T06:00:00.000Z");
    tickDebounceMock.mockResolvedValue({ includeRetriesLine: true, includeStalePendingLine: false });
    const result = await runOperatorHealthDigestTick(now);
    expect(result.sent).toBe(true);
    expect(result.dedupKey).toBe("digest:2026-06-09");
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        block: "digest",
        dedupKey: "digest:2026-06-09",
      }),
    );
    expect(collectInputMock).toHaveBeenCalledWith(
      expect.objectContaining({
        suppressRecovery: false,
      }),
    );
  });

  it("passes suppressRecovery when resolve-all happened in window", async () => {
    hadResolveAllMock.mockResolvedValue(true);
    const now = new Date("2026-06-09T06:00:00.000Z");
    await runOperatorHealthDigestTick(now);
    expect(collectInputMock).toHaveBeenCalledWith(
      expect.objectContaining({ suppressRecovery: true }),
    );
  });

  it("skips when digest block is disabled", async () => {
    getConfigValueMock.mockImplementation(async (key: string) => {
      if (key === "operator_health_alert_config") {
        return JSON.stringify({
          topics: { critical_enabled: true, digest_enabled: false, account_conflicts: true },
          digestTime: "09:00",
          channels: {
            critical: { telegram: true, max: true, web_push: true },
            digest: { telegram: true, max: true, web_push: true },
            account_conflicts: { telegram: true, max: true, web_push: true },
          },
        });
      }
      return "";
    });
    const now = new Date("2026-06-09T06:00:00.000Z");
    const result = await runOperatorHealthDigestTick(now);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe("disabled");
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("dedups second send same calendar day", async () => {
    const now = new Date("2026-06-09T06:00:00.000Z");
    await inMemoryOperatorHealthAlertSentPort.recordSent({
      dedupKey: "digest:2026-06-09",
      severity: "digest",
    });
    const result = await runOperatorHealthDigestTick(now);
    expect(result.sent).toBe(false);
    expect(result.reason).toBe("dedup");
    expect(dispatchMock).not.toHaveBeenCalled();
  });
});
