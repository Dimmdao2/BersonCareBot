import { beforeEach, describe, expect, it, vi } from "vitest";
import { bindEmailSendPort } from "@/modules/auth/emailSendPort";
import { createPgEmailSetupAccessPort } from "./pgEmailSetupAccessPort";
import type { EmailSetupTokensPort } from "@/modules/auth/emailSetupTokens/ports";

const sendEmailCodeMock = vi.fn();

describe("pgEmailSetupAccessPort", () => {
  const tokensPort: EmailSetupTokensPort = {
    revokeActiveForUserEmail: vi.fn().mockResolvedValue(undefined),
    insertToken: vi.fn().mockResolvedValue({ id: "t1" }),
    deleteTokenById: vi.fn().mockResolvedValue(undefined),
    findByTokenHash: vi.fn(),
    markUsedById: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sendEmailCodeMock.mockResolvedValue({ ok: true });
    bindEmailSendPort({ sendCode: (...args: unknown[]) => sendEmailCodeMock(...args) });
  });

  it("enqueues setup code email on success", async () => {
    const port = createPgEmailSetupAccessPort(tokensPort);
    const r = await port.requestContactEmailSetup({
      userId: "u1",
      emailNormalized: "user@example.com",
      source: "doctor_profile",
    });
    expect(r).toEqual({ ok: true, status: "enqueued" });
    expect(tokensPort.revokeActiveForUserEmail).not.toHaveBeenCalled();
    expect(tokensPort.insertToken).not.toHaveBeenCalled();
    expect(sendEmailCodeMock).toHaveBeenCalledWith(
      "user@example.com",
      expect.stringMatching(/^\d{6}$/),
    );
  });

  it("returns not_configured when code email send fails", async () => {
    sendEmailCodeMock.mockResolvedValueOnce({ ok: false, error: "http_503" });
    const port = createPgEmailSetupAccessPort(tokensPort);
    const r = await port.requestContactEmailSetup({
      userId: "u1",
      emailNormalized: "user@example.com",
      source: "rubitime",
    });
    expect(r).toEqual({ ok: false, reason: "not_configured" });
    expect(tokensPort.deleteTokenById).not.toHaveBeenCalled();
  });
});
