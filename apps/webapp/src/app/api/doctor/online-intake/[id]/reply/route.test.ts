import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const organizationId = "10000000-0000-4000-8000-000000000001";
const otherOrganizationId = "20000000-0000-4000-8000-000000000002";

const requireDoctorWorkspaceApiContextMock = vi.hoisted(() => vi.fn());
const withDoctorWorkspacePrincipalMock = vi.hoisted(() => vi.fn((_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
  const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
  if (!fn) throw new Error("principal_callback_required");
  return fn();
}));
const getRequestForDoctorMock = vi.hoisted(() => vi.fn());
const changeStatusMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const getClientIdentityForOrganizationMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ id: "patient-1" }),
);
const ensureConversationMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ conversationId: "conv-1" }),
);
const sendAdminReplyMock = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));

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

vi.mock("@/app-layer/di/onlineIntakeDeps", () => ({
  getOnlineIntakeService: () => ({
    getRequestForDoctor: getRequestForDoctorMock,
    changeStatus: changeStatusMock,
  }),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    doctorClientsPort: {
      getClientIdentityForOrganization: getClientIdentityForOrganizationMock,
    },
    messaging: {
      doctorSupport: {
        ensureConversationForPatient: ensureConversationMock,
        sendAdminReply: sendAdminReplyMock,
      },
    },
  }),
}));

import { POST } from "./route";

const ID = "00000000-0000-0000-0000-000000000001";

function makeRequest(body: unknown): Request {
  return new Request(`http://localhost/api/doctor/online-intake/${ID}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function call(req: Request) {
  return POST(req, { params: Promise.resolve({ id: ID }) });
}

describe("POST /api/doctor/online-intake/[id]/reply", () => {
  beforeEach(() => {
    requireDoctorWorkspaceApiContextMock.mockReset();
    requireDoctorWorkspaceApiContextMock.mockResolvedValue({
      ok: true,
      ctx: {
        organizationId,
        session: { user: { userId: "d1", role: "doctor", bindings: {}, displayName: "D" } },
      },
    });
    withDoctorWorkspacePrincipalMock.mockClear();
    withDoctorWorkspacePrincipalMock.mockImplementation(
      (_: unknown, sourceOrFn: string | (() => unknown), maybeFn?: () => unknown) => {
        const fn = typeof sourceOrFn === "function" ? sourceOrFn : maybeFn;
        if (!fn) throw new Error("principal_callback_required");
        return fn();
      },
    );
    getRequestForDoctorMock.mockReset();
    changeStatusMock.mockClear();
    getClientIdentityForOrganizationMock.mockClear();
    getClientIdentityForOrganizationMock.mockResolvedValue({ id: "patient-1" });
    ensureConversationMock.mockClear();
    sendAdminReplyMock.mockClear();
    sendAdminReplyMock.mockResolvedValue({ ok: true });
  });

  it("returns workspace gate response", async () => {
    requireDoctorWorkspaceApiContextMock.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }),
    });
    const res = await call(makeRequest({ text: "привет" }));
    expect(res.status).toBe(401);
    expect(getRequestForDoctorMock).not.toHaveBeenCalled();
  });

  it("400 при пустом тексте", async () => {
    const res = await call(makeRequest({ text: "" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("validation_error");
  });

  it("404 когда заявка не найдена", async () => {
    getRequestForDoctorMock.mockResolvedValue(null);
    const res = await call(makeRequest({ text: "привет" }));
    expect(res.status).toBe(404);
    expect(sendAdminReplyMock).not.toHaveBeenCalled();
  });

  it("404 когда заявка из другой организации", async () => {
    getRequestForDoctorMock.mockResolvedValue({ userId: "patient-1", status: "new", organizationId: otherOrganizationId });
    const res = await call(makeRequest({ text: "привет" }));
    expect(res.status).toBe(404);
    expect(getClientIdentityForOrganizationMock).not.toHaveBeenCalled();
    expect(sendAdminReplyMock).not.toHaveBeenCalled();
  });

  it("404 когда пациент заявки не принадлежит выбранной организации", async () => {
    getRequestForDoctorMock.mockResolvedValue({ userId: "patient-1", status: "new", organizationId });
    getClientIdentityForOrganizationMock.mockResolvedValueOnce(null);
    const res = await call(makeRequest({ text: "привет" }));
    expect(res.status).toBe(404);
    expect(getClientIdentityForOrganizationMock).toHaveBeenCalledWith("patient-1", organizationId);
    expect(sendAdminReplyMock).not.toHaveBeenCalled();
  });

  it("отправляет ответ и авто-переводит new → in_review", async () => {
    getRequestForDoctorMock.mockResolvedValue({ userId: "patient-1", status: "new", organizationId });

    const res = await call(makeRequest({ text: "Здравствуйте" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    expect(ensureConversationMock).toHaveBeenCalledWith("patient-1");
    expect(sendAdminReplyMock).toHaveBeenCalledWith(
      "conv-1",
      "Здравствуйте",
      organizationId,
      "D",
    );
    expect(withDoctorWorkspacePrincipalMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId }),
      expect.any(Function),
    );
    expect(changeStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: ID, toStatus: "in_review", changedBy: "d1" }),
    );
  });

  it("НЕ меняет статус, если заявка уже не в статусе new", async () => {
    getRequestForDoctorMock.mockResolvedValue({ userId: "patient-1", status: "in_review", organizationId });

    const res = await call(makeRequest({ text: "Ещё сообщение" }));
    expect(res.status).toBe(200);
    expect(sendAdminReplyMock).toHaveBeenCalledOnce();
    expect(changeStatusMock).not.toHaveBeenCalled();
  });

  it("ok:true даже если авто-переход статуса упал (partial-success: сообщение уже ушло)", async () => {
    getRequestForDoctorMock.mockResolvedValue({ userId: "patient-1", status: "new", organizationId });
    changeStatusMock.mockRejectedValue(new Error("db_connection_error"));

    const res = await call(makeRequest({ text: "Здравствуйте" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    // Сообщение ушло, попытка перехода была сделана
    expect(sendAdminReplyMock).toHaveBeenCalledOnce();
    expect(changeStatusMock).toHaveBeenCalledOnce();
  });

  it("400, когда отправка ответа провалилась", async () => {
    getRequestForDoctorMock.mockResolvedValue({ userId: "patient-1", status: "new", organizationId });
    sendAdminReplyMock.mockResolvedValue({ ok: false, error: "conversation_closed" });

    const res = await call(makeRequest({ text: "привет" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("conversation_closed");
    // статус не трогаем, если ответ не ушёл
    expect(changeStatusMock).not.toHaveBeenCalled();
  });
});
