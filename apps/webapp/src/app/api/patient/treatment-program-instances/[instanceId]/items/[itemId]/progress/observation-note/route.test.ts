import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  gateMock,
  buildAppDepsMock,
  getInstanceForPatientMock,
  appendNoteMock,
  getPatientProgramInteractionPolicyMock,
  discussionUiEnabledMock,
} = vi.hoisted(() => ({
  gateMock: vi.fn(),
  buildAppDepsMock: vi.fn(),
  getInstanceForPatientMock: vi.fn(),
  appendNoteMock: vi.fn(),
  getPatientProgramInteractionPolicyMock: vi.fn(),
  discussionUiEnabledMock: vi.fn(),
}));

vi.mock("@/app-layer/guards/requireRole", () => ({
  requirePatientApiBusinessAccess: gateMock,
}));
vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));
vi.mock("@/modules/program-item-discussion/discussionFeatureGates", () => ({
  isPatientProgramDiscussionUiEnabled: discussionUiEnabledMock,
}));
vi.mock("@/app-layer/cache/revalidatePatientTreatmentProgramUi", () => ({
  revalidatePatientTreatmentProgramUi: vi.fn(),
}));

import { POST } from "./route";

const instanceId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const patientUserId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("POST observation-note", () => {
  beforeEach(() => {
    gateMock.mockReset();
    buildAppDepsMock.mockReset();
    getInstanceForPatientMock.mockReset();
    appendNoteMock.mockReset();
    getPatientProgramInteractionPolicyMock.mockReset();
    discussionUiEnabledMock.mockReset();

    gateMock.mockResolvedValue({
      ok: true,
      session: { user: { userId: patientUserId, role: "client", phone: null, bindings: {} } },
    });
    discussionUiEnabledMock.mockResolvedValue(true);
    getPatientProgramInteractionPolicyMock.mockResolvedValue({
      onSupport: true,
      commentsAllowed: true,
      mediaAllowed: true,
    });
    getInstanceForPatientMock.mockResolvedValue({
      id: instanceId,
      assignmentSource: "doctor",
    });
    appendNoteMock.mockResolvedValue(undefined);
    buildAppDepsMock.mockReturnValue({
      treatmentProgramInstance: { getInstanceForPatient: getInstanceForPatientMock },
      doctorClients: { getPatientProgramInteractionPolicy: getPatientProgramInteractionPolicyMock },
      treatmentProgramPatientActions: { patientAppendObservationNote: appendNoteMock },
    });
  });

  it("returns 403 when support policy disables comments", async () => {
    getPatientProgramInteractionPolicyMock.mockResolvedValue({
      onSupport: false,
      commentsAllowed: false,
      mediaAllowed: false,
    });

    const res = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "test" }),
      }),
      { params: Promise.resolve({ instanceId, itemId }) },
    );
    expect(res.status).toBe(403);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toBe("patient_support_comments_disabled");
    expect(appendNoteMock).not.toHaveBeenCalled();
  });
});
