/** Wave 3 phase 15D — worker tick orchestration over Drizzle outbox ports. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  claimDueIntegratorPushJobsMock,
  completeIntegratorPushJobMock,
  deliverIntegratorPushPayloadMock,
  failIntegratorPushJobDeadMock,
  rescheduleIntegratorPushJobMock,
} = vi.hoisted(() => ({
  claimDueIntegratorPushJobsMock: vi.fn(),
  completeIntegratorPushJobMock: vi.fn(),
  deliverIntegratorPushPayloadMock: vi.fn(),
  failIntegratorPushJobDeadMock: vi.fn(),
  rescheduleIntegratorPushJobMock: vi.fn(),
}));

vi.mock("@/infra/db/client", () => ({
  getPool: vi.fn(() => ({ connect: vi.fn() })),
}));

vi.mock("./integratorPushOutbox", () => ({
  claimDueIntegratorPushJobs: (...args: unknown[]) => claimDueIntegratorPushJobsMock(...args),
  completeIntegratorPushJob: (...args: unknown[]) => completeIntegratorPushJobMock(...args),
  failIntegratorPushJobDead: (...args: unknown[]) => failIntegratorPushJobDeadMock(...args),
  rescheduleIntegratorPushJob: (...args: unknown[]) => rescheduleIntegratorPushJobMock(...args),
  isRecoverableIntegratorPushFailure: (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    return !msg.includes("integrator settings/sync 400:");
  },
}));

vi.mock("./deliverIntegratorPushPayload", () => ({
  deliverIntegratorPushPayload: (...args: unknown[]) => deliverIntegratorPushPayloadMock(...args),
}));

import { runIntegratorPushWorkerTick } from "./runIntegratorPushWorkerTick";

const sampleRow = {
  id: "101",
  kind: "system_settings_sync" as const,
  idempotencyKey: "settings:admin:dev_mode",
  payload: { key: "dev_mode", scope: "admin" },
  attemptsDone: 0,
  maxAttempts: 8,
};

describe("runIntegratorPushWorkerTick", () => {
  beforeEach(() => {
    claimDueIntegratorPushJobsMock.mockReset();
    completeIntegratorPushJobMock.mockReset();
    deliverIntegratorPushPayloadMock.mockReset();
    failIntegratorPushJobDeadMock.mockReset();
    rescheduleIntegratorPushJobMock.mockReset();
    completeIntegratorPushJobMock.mockResolvedValue(undefined);
    failIntegratorPushJobDeadMock.mockResolvedValue(undefined);
    rescheduleIntegratorPushJobMock.mockResolvedValue(undefined);
  });

  it("claims due rows, delivers payload, and completes successful jobs", async () => {
    claimDueIntegratorPushJobsMock.mockResolvedValueOnce([sampleRow]);
    deliverIntegratorPushPayloadMock.mockResolvedValueOnce(undefined);

    const done = await runIntegratorPushWorkerTick(10);

    expect(done).toBe(1);
    expect(claimDueIntegratorPushJobsMock).toHaveBeenCalledWith(expect.objectContaining({ connect: expect.any(Function) }), 10);
    expect(deliverIntegratorPushPayloadMock).toHaveBeenCalledWith(sampleRow);
    expect(completeIntegratorPushJobMock).toHaveBeenCalledWith(expect.anything(), "101");
    expect(failIntegratorPushJobDeadMock).not.toHaveBeenCalled();
    expect(rescheduleIntegratorPushJobMock).not.toHaveBeenCalled();
  });

  it("marks non-recoverable delivery failures as dead", async () => {
    claimDueIntegratorPushJobsMock.mockResolvedValueOnce([sampleRow]);
    deliverIntegratorPushPayloadMock.mockRejectedValueOnce(new Error("integrator settings/sync 400: bad"));

    const done = await runIntegratorPushWorkerTick(5);

    expect(done).toBe(0);
    expect(failIntegratorPushJobDeadMock).toHaveBeenCalledWith(
      expect.anything(),
      "101",
      "integrator settings/sync 400: bad",
    );
    expect(rescheduleIntegratorPushJobMock).not.toHaveBeenCalled();
  });

  it("reschedules recoverable failures before max attempts", async () => {
    claimDueIntegratorPushJobsMock.mockResolvedValueOnce([{ ...sampleRow, attemptsDone: 1, maxAttempts: 8 }]);
    deliverIntegratorPushPayloadMock.mockRejectedValueOnce(new Error("integrator settings/sync 503: down"));

    const done = await runIntegratorPushWorkerTick(5);

    expect(done).toBe(0);
    expect(rescheduleIntegratorPushJobMock).toHaveBeenCalledWith(
      expect.anything(),
      "101",
      2,
      60,
      "integrator settings/sync 503: down",
    );
    expect(failIntegratorPushJobDeadMock).not.toHaveBeenCalled();
  });

  it("marks recoverable failures dead when max attempts reached", async () => {
    claimDueIntegratorPushJobsMock.mockResolvedValueOnce([{ ...sampleRow, attemptsDone: 7, maxAttempts: 8 }]);
    deliverIntegratorPushPayloadMock.mockRejectedValueOnce(new Error("integrator settings/sync 503: down"));

    const done = await runIntegratorPushWorkerTick(5);

    expect(done).toBe(0);
    expect(failIntegratorPushJobDeadMock).toHaveBeenCalledWith(
      expect.anything(),
      "101",
      "integrator settings/sync 503: down",
    );
    expect(rescheduleIntegratorPushJobMock).not.toHaveBeenCalled();
  });
});
