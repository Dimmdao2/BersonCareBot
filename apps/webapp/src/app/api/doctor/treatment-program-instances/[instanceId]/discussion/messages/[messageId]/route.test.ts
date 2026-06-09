/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionMock = vi.fn();
const getInstanceMock = vi.fn();
const getClientIdentityMock = vi.fn();
const deleteMediaMock = vi.fn();

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: (...a: unknown[]) => getSessionMock(...a),
}));

vi.mock("@/modules/roles/service", () => ({
  canAccessDoctor: (role: string) => role === "doctor" || role === "admin",
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    treatmentProgramInstance: { getInstanceById: getInstanceMock },
    doctorClientsPort: { getClientIdentity: getClientIdentityMock },
    programItemDiscussion: { deletePatientMediaMessage: deleteMediaMock },
  }),
}));

import { DELETE } from "./route";

const instanceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const messageId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("DELETE doctor discussion media message", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getInstanceMock.mockReset();
    getClientIdentityMock.mockReset();
    deleteMediaMock.mockReset();
    getSessionMock.mockResolvedValue({ user: { userId: "doc", role: "doctor" } });
    getInstanceMock.mockResolvedValue({
      patientUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      assignmentSource: "doctor",
    });
    getClientIdentityMock.mockResolvedValue({ userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" });
    deleteMediaMock.mockResolvedValue(undefined);
  });

  it("deletes patient media message for doctor-assigned program", async () => {
    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ instanceId, messageId }),
    });
    expect(res.status).toBe(200);
    expect(deleteMediaMock).toHaveBeenCalledWith({
      messageId,
      patientUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });
  });

  it("returns 404 when message missing", async () => {
    deleteMediaMock.mockRejectedValue(new Error("message_not_found"));
    const res = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ instanceId, messageId }),
    });
    expect(res.status).toBe(404);
  });
});
