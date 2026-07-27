/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() => vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
  const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
  if (!fn) throw new Error("principal_callback_required");
  return fn();
}));
const getSettingMock = vi.fn();
const getInstanceMock = vi.fn();
const sendReplyMock = vi.fn();

vi.mock("@/app-layer/guards/requireRole", () => ({
  requireDoctorWorkspaceApiContext: () => requireDoctorWorkspaceApiContextMock(),
}));

vi.mock("@/app-layer/guards/doctorWorkspacePrincipal", () => ({
  withDoctorWorkspacePrincipal: (
    ctx: unknown,
    sourceOrFn: string | (() => unknown),
    maybeFn?: () => unknown,
  ) => {
    const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
    if (!fn) throw new Error("principal_callback_required");
    return withDoctorWorkspacePrincipalMock(ctx, fn);
  },
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
const workspaceCtx = {
  session: {
    user: {
      userId: doctorId,
      role: "doctor",
      displayName: "doctor@example.com",
      firstName: "Дмитрий",
      lastName: "Берсон",
      bindings: {},
    },
  },
  organizationId: "44444444-4444-4444-8444-444444444444",
  membershipId: "55555555-5555-4555-8555-555555555555",
  membershipRole: "doctor",
  specialistId: null,
  canManageOrganization: false,
  canManageAllSpecialists: false,
};

describe("POST program-note-reply", () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
        if (!fn) throw new Error("principal_callback_required");
        return fn();
      },
    );
    getSettingMock.mockReset();
    getInstanceMock.mockReset();
    sendReplyMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({ ok: true, ctx: workspaceCtx });
    getSettingMock.mockResolvedValue({ valueJson: { value: true } });
    getInstanceMock.mockResolvedValue({
      organizationId: workspaceCtx.organizationId,
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
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(workspaceCtx, expect.any(Function));
    const first = sendReplyMock.mock.calls[0]![0].integratorMessageId;
    const second = sendReplyMock.mock.calls[1]![0].integratorMessageId;
    expect(first).toBe(second);
    expect(first).toMatch(/^webapp-program-note:/);
    expect(sendReplyMock).toHaveBeenCalledWith(
      expect.objectContaining({ senderDisplayName: "Берсон Дмитрий" }),
    );
  });
});
