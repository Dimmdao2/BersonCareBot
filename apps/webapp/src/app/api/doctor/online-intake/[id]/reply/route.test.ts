import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const getRequestForDoctorMock = vi.hoisted(() => vi.fn());
const changeStatusMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const ensureConversationMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ conversationId: "conv-1" }),
);
const sendAdminReplyMock = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: getCurrentSessionMock,
}));

vi.mock("@/app-layer/di/onlineIntakeDeps", () => ({
  getOnlineIntakeService: () => ({
    getRequestForDoctor: getRequestForDoctorMock,
    changeStatus: changeStatusMock,
  }),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
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
    getCurrentSessionMock.mockReset();
    getRequestForDoctorMock.mockReset();
    changeStatusMock.mockClear();
    ensureConversationMock.mockClear();
    sendAdminReplyMock.mockClear();
    sendAdminReplyMock.mockResolvedValue({ ok: true });
  });

  it("401 без сессии", async () => {
    getCurrentSessionMock.mockResolvedValue(null);
    const res = await call(makeRequest({ text: "привет" }));
    expect(res.status).toBe(401);
    expect(getRequestForDoctorMock).not.toHaveBeenCalled();
  });

  it("403 для пациента (client)", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "u1", role: "client", bindings: {} },
    });
    const res = await call(makeRequest({ text: "привет" }));
    expect(res.status).toBe(403);
    expect(getRequestForDoctorMock).not.toHaveBeenCalled();
  });

  it("400 при пустом тексте", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    const res = await call(makeRequest({ text: "" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("validation_error");
  });

  it("404 когда заявка не найдена", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    getRequestForDoctorMock.mockResolvedValue(null);
    const res = await call(makeRequest({ text: "привет" }));
    expect(res.status).toBe(404);
    expect(sendAdminReplyMock).not.toHaveBeenCalled();
  });

  it("отправляет ответ и авто-переводит new → in_review", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    getRequestForDoctorMock.mockResolvedValue({ userId: "patient-1", status: "new" });

    const res = await call(makeRequest({ text: "Здравствуйте" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    expect(ensureConversationMock).toHaveBeenCalledWith("patient-1");
    expect(sendAdminReplyMock).toHaveBeenCalledWith("conv-1", "Здравствуйте");
    expect(changeStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: ID, toStatus: "in_review", changedBy: "d1" }),
    );
  });

  it("НЕ меняет статус, если заявка уже не в статусе new", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    getRequestForDoctorMock.mockResolvedValue({ userId: "patient-1", status: "in_review" });

    const res = await call(makeRequest({ text: "Ещё сообщение" }));
    expect(res.status).toBe(200);
    expect(sendAdminReplyMock).toHaveBeenCalledOnce();
    expect(changeStatusMock).not.toHaveBeenCalled();
  });

  it("ok:true даже если авто-переход статуса упал (partial-success: сообщение уже ушло)", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    getRequestForDoctorMock.mockResolvedValue({ userId: "patient-1", status: "new" });
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
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: "d1", role: "doctor", bindings: {} },
    });
    getRequestForDoctorMock.mockResolvedValue({ userId: "patient-1", status: "new" });
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
