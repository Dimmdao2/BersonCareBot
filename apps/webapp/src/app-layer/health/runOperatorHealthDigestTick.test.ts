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

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    operatorHealthDigestRead: {
      hadOperatorIncidentsResolveAllInWindow: vi.fn().mockResolvedValue(false),
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

    getConfigValueMock.mockResolvedValue("");
    getAppDisplayTimeZoneMock.mockResolvedValue("Europe/Moscow");
    collectInputMock.mockResolvedValue({
      auditErrorCount: 0,
      incidentsOpened: [],
      incidentsResolved: [],
      jobFailures: [],
      degradedLines: [],
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
  });

  it("dispatches digest at digestTime in display timezone", async () => {
    const now = new Date("2026-06-09T06:00:00.000Z");
    const result = await runOperatorHealthDigestTick(now);
    expect(result.sent).toBe(true);
    expect(result.dedupKey).toBe("digest:2026-06-09");
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        block: "digest",
        dedupKey: "digest:2026-06-09",
      }),
    );
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
