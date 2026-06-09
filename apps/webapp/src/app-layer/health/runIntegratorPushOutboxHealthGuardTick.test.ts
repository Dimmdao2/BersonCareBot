import { beforeEach, describe, expect, it, vi } from "vitest";

const getIpoMock = vi.hoisted(() => vi.fn());
const purgeMock = vi.hoisted(() => vi.fn());
const purgeWebhookEventsMock = vi.hoisted(() => vi.fn());
const dispatchMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    operatorHealthRead: { getIntegratorPushOutboxHealth: getIpoMock },
    healthFailureArchive: { purgeExpired: purgeMock },
    operatorHealthWrite: { purgeIntegrationWebhookErrorEventsOlderThanHours: purgeWebhookEventsMock },
  }),
}));

vi.mock("@/modules/operator-alerts/dispatchOperatorAlert", () => ({
  dispatchOperatorAlert: dispatchMock,
}));

import { runIntegratorPushOutboxHealthGuardTick } from "./runIntegratorPushOutboxHealthGuardTick";

function emptyIpo() {
  return {
    dueBacklog: 0,
    deadTotal: 0,
    oldestDueAgeSeconds: null,
    dueByKind: {},
    deadByKind: {},
    processingCount: 0,
    oldestProcessingAgeSeconds: null,
    lastQueueActivityAt: null,
  };
}

describe("runIntegratorPushOutboxHealthGuardTick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    purgeMock.mockResolvedValue({ deleted: 0 });
    purgeWebhookEventsMock.mockResolvedValue({ deleted: 0 });
    dispatchMock.mockResolvedValue({ dispatched: true });
  });

  it("returns ipo error status without dispatching alert", async () => {
    getIpoMock.mockResolvedValue({
      ...emptyIpo(),
      dueBacklog: 100,
      oldestDueAgeSeconds: 4000,
    });
    const r = await runIntegratorPushOutboxHealthGuardTick();
    expect(r.status).toBe("error");
    expect(r.alerted).toBe(false);
    expect(dispatchMock).not.toHaveBeenCalled();
    expect(purgeMock).toHaveBeenCalled();
    expect(purgeWebhookEventsMock).toHaveBeenCalled();
  });

  it("purges archive on ok status", async () => {
    getIpoMock.mockResolvedValue(emptyIpo());
    const r = await runIntegratorPushOutboxHealthGuardTick();
    expect(r.status).toBe("ok");
    expect(r.alerted).toBe(false);
    expect(purgeMock).toHaveBeenCalled();
    expect(purgeWebhookEventsMock).toHaveBeenCalled();
  });
});
