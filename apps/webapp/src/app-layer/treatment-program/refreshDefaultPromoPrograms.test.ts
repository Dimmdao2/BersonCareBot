import { beforeEach, describe, expect, it, vi } from "vitest";

const { refreshMock, retargetMock, revalidateMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  retargetMock: vi.fn(),
  revalidateMock: vi.fn(),
}));

vi.mock("@/app-layer/cache/revalidatePatientTreatmentProgramUi", () => ({
  revalidatePatientTreatmentProgramUi: revalidateMock,
}));

import { refreshDefaultPromoPrograms } from "./refreshDefaultPromoPrograms";

describe("refreshDefaultPromoPrograms", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    retargetMock.mockReset();
    revalidateMock.mockReset();
  });

  it("retargets rehab_program reminders and revalidates when refreshed", async () => {
    refreshMock.mockResolvedValue({
      templateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      refreshedCount: 1,
      pairs: [
        {
          patientUserId: "00000000-0000-4000-8000-000000000001",
          oldInstanceId: "11111111-1111-4111-8111-111111111111",
          newInstanceId: "22222222-2222-4222-8222-222222222222",
        },
      ],
    });

    const deps = {
      treatmentProgramInstance: { refreshActivePromoProgramsFromDefaultTemplate: refreshMock },
      reminders: { retargetRehabProgramInstanceLinkedId: retargetMock },
    } as never;

    const result = await refreshDefaultPromoPrograms(deps, "dddddddd-dddd-4ddd-8ddd-dddddddddddd");

    expect(result.refreshedCount).toBe(1);
    expect(retargetMock).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    );
    expect(revalidateMock).toHaveBeenCalledTimes(1);
  });

  it("skips revalidate when nothing refreshed", async () => {
    refreshMock.mockResolvedValue({
      templateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      refreshedCount: 0,
      pairs: [],
    });

    const deps = {
      treatmentProgramInstance: { refreshActivePromoProgramsFromDefaultTemplate: refreshMock },
      reminders: { retargetRehabProgramInstanceLinkedId: retargetMock },
    } as never;

    await refreshDefaultPromoPrograms(deps, null);

    expect(retargetMock).not.toHaveBeenCalled();
    expect(revalidateMock).not.toHaveBeenCalled();
  });
});
