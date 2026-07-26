import { beforeEach, describe, expect, it, vi } from "vitest";

const { getOperatorJobStatusMock, recordFailureMock } = vi.hoisted(() => ({
  getOperatorJobStatusMock: vi.fn(),
  recordFailureMock: vi.fn(async () => undefined),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    operatorHealthRead: { getOperatorJobStatus: getOperatorJobStatusMock },
    operatorHealthWrite: { recordOperatorJobTickFailure: recordFailureMock },
  }),
}));

import { persistUndeliveredSupportSubmission } from "./persistUndeliveredSupportSubmission";
import {
  SUPPORT_UNDELIVERED_JOB_FAMILY,
  SUPPORT_UNDELIVERED_JOB_KEY,
} from "@/modules/support/undeliveredSupportSubmissions";

describe("persistUndeliveredSupportSubmission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOperatorJobStatusMock.mockResolvedValue(null);
  });

  it("reads the existing job row, merges, and writes back under the dedicated job key", async () => {
    const ok = await persistUndeliveredSupportSubmission({
      at: "2026-07-26T12:00:00.000Z",
      kind: "patient",
      email: "a@b.co",
      message: "help me",
      userId: "u1",
    });
    expect(ok).toBe(true);
    expect(getOperatorJobStatusMock).toHaveBeenCalledWith(
      SUPPORT_UNDELIVERED_JOB_FAMILY,
      SUPPORT_UNDELIVERED_JOB_KEY,
    );
    expect(recordFailureMock).toHaveBeenCalledTimes(1);
    const [input] = recordFailureMock.mock.calls[0] as unknown as [
      { jobFamily: string; jobKey: string; metaJson: { items: unknown[]; total: number } },
    ];
    expect(input.jobFamily).toBe(SUPPORT_UNDELIVERED_JOB_FAMILY);
    expect(input.jobKey).toBe(SUPPORT_UNDELIVERED_JOB_KEY);
    expect(input.metaJson.total).toBe(1);
    expect(input.metaJson.items).toHaveLength(1);
  });

  it("accumulates on top of an existing row instead of overwriting it", async () => {
    getOperatorJobStatusMock.mockResolvedValue({
      jobKey: SUPPORT_UNDELIVERED_JOB_KEY,
      jobFamily: SUPPORT_UNDELIVERED_JOB_FAMILY,
      lastStatus: "failure",
      lastStartedAt: null,
      lastFinishedAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastDurationMs: null,
      lastError: "support_submission_undelivered:guest",
      metaJson: { items: [{ at: "2026-07-26T11:00:00.000Z", kind: "guest", email: "g@b.co", message: "prior" }], total: 3 },
    });
    await persistUndeliveredSupportSubmission({
      at: "2026-07-26T12:00:00.000Z",
      kind: "patient",
      email: "a@b.co",
      message: "help me",
    });
    const [input] = recordFailureMock.mock.calls[0] as unknown as [{ metaJson: { items: unknown[]; total: number } }];
    expect(input.metaJson.total).toBe(4);
    expect(input.metaJson.items).toHaveLength(2);
  });

  it("never throws — a persistence failure returns false instead of propagating", async () => {
    getOperatorJobStatusMock.mockRejectedValue(new Error("db down"));
    const ok = await persistUndeliveredSupportSubmission({
      at: "2026-07-26T12:00:00.000Z",
      kind: "guest",
      email: "a@b.co",
      message: "help",
    });
    expect(ok).toBe(false);
  });
});
