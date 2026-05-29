import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const upsertMock = vi.fn();

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    patientMergeCandidate: {
      upsertPending: (...args: unknown[]) => upsertMock(...args),
    },
  }),
}));

vi.mock("@/app-layer/db/client", () => ({
  getPool: () => ({ query: queryMock }),
}));

import { recordPublicBookingMergeCandidates } from "./recordPublicBookingMergeCandidates";

describe("recordPublicBookingMergeCandidates", () => {
  beforeEach(() => {
    queryMock.mockReset();
    upsertMock.mockReset();
  });

  it("creates pending candidates for name collision without phone", async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: "candidate-1" }],
    });
    upsertMock.mockResolvedValue({ id: "mc-1" });

    await recordPublicBookingMergeCandidates({
      pool: { query: queryMock } as never,
      organizationId: "org-1",
      anchorUserId: "anchor-1",
      contactName: "Иван Иванов",
      triggerAppointmentId: "appt-1",
    });

    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        anchorUserId: "anchor-1",
        candidateUserId: "candidate-1",
        reason: "public_booking_phone_collision",
        triggerAppointmentId: "appt-1",
      }),
    );
  });

  it("skips when contact name too short", async () => {
    await recordPublicBookingMergeCandidates({
      pool: { query: queryMock } as never,
      organizationId: "org-1",
      anchorUserId: "anchor-1",
      contactName: "И",
      triggerAppointmentId: "appt-1",
    });
    expect(queryMock).not.toHaveBeenCalled();
  });
});
