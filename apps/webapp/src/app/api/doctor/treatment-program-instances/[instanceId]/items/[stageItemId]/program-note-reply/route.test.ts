/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionMock = vi.fn();
const getSettingMock = vi.fn();
const getInstanceMock = vi.fn();
const sendReplyMock = vi.fn();

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: () => sessionMock(),
}));

vi.mock("@/modules/roles/service", () => ({
  canAccessDoctor: (role: string) => role === "doctor",
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    systemSettings: { getSetting: getSettingMock },
    treatmentProgramInstance: { getInstanceById: getInstanceMock },
    sendProgramNoteReply: sendReplyMock,
  }),
}));

import { POST } from "./route";

const instanceId = "11111111-1111-4111-8111-111111111111";
const stageItemId = "22222222-2222-4222-8222-222222222222";
const doctorId = "33333333-3333-4333-8333-333333333333";

describe("POST program-note-reply", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    getSettingMock.mockReset();
    getInstanceMock.mockReset();
    sendReplyMock.mockReset();
    sessionMock.mockResolvedValue({ user: { userId: doctorId, role: "doctor" } });
    getSettingMock.mockResolvedValue({ valueJson: { value: true } });
    getInstanceMock.mockResolvedValue({
      patientUserId: "00000000-0000-4000-8000-000000000001",
      stages: [{ items: [{ id: stageItemId }] }],
    });
    sendReplyMock.mockResolvedValue({ ok: true });
  });

  it("uses stable idempotency key for same payload", async () => {
    const body = JSON.stringify({ text: "Делайте медленнее" });
    const req = () =>
      POST(
        new Request("http://localhost/reply", { method: "POST", headers: { "content-type": "application/json" }, body }),
        { params: Promise.resolve({ instanceId, stageItemId }) },
      );

    await req();
    await req();

    expect(sendReplyMock).toHaveBeenCalledTimes(2);
    const first = sendReplyMock.mock.calls[0]![0].integratorMessageId;
    const second = sendReplyMock.mock.calls[1]![0].integratorMessageId;
    expect(first).toBe(second);
    expect(first).toMatch(/^webapp-program-note:/);
  });
});
