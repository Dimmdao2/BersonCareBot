import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPgEmailSetupAccessPort } from "./pgEmailSetupAccessPort";
import type { EmailSetupTokensPort } from "@/modules/auth/emailSetupTokens/ports";

const sendEmailSetupLinkViaIntegratorMock = vi.fn();
const getAppBaseUrlMock = vi.fn();

vi.mock("@/infra/integrations/email/integratorEmailAdapter", () => ({
  sendEmailSetupLinkViaIntegrator: (...args: unknown[]) => sendEmailSetupLinkViaIntegratorMock(...args),
}));

vi.mock("@/modules/system-settings/integrationRuntime", () => ({
  getAppBaseUrl: () => getAppBaseUrlMock(),
}));

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
    getAppBaseUrlMock.mockResolvedValue("https://app.example.com");
    sendEmailSetupLinkViaIntegratorMock.mockResolvedValue({ ok: true });
  });

  it("enqueues setup link email on success", async () => {
    const port = createPgEmailSetupAccessPort(tokensPort);
    const r = await port.requestContactEmailSetup({
      userId: "u1",
      emailNormalized: "user@example.com",
      source: "doctor_profile",
    });
    expect(r).toEqual({ ok: true, status: "enqueued" });
    expect(tokensPort.revokeActiveForUserEmail).toHaveBeenCalledWith("u1", "user@example.com");
    expect(sendEmailSetupLinkViaIntegratorMock).toHaveBeenCalledWith(
      "user@example.com",
      expect.any(String),
      expect.stringContaining("https://app.example.com/app/auth/email-setup?token="),
    );
    const insertArg = vi.mocked(tokensPort.insertToken).mock.calls[0]?.[0];
    expect(insertArg?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(insertArg?.tokenHash).not.toContain("est_");
  });

  it("rolls back token when email send fails", async () => {
    sendEmailSetupLinkViaIntegratorMock.mockResolvedValueOnce({ ok: false, error: "http_503" });
    const port = createPgEmailSetupAccessPort(tokensPort);
    const r = await port.requestContactEmailSetup({
      userId: "u1",
      emailNormalized: "user@example.com",
      source: "rubitime",
    });
    expect(r).toEqual({ ok: false, reason: "not_configured" });
    expect(tokensPort.deleteTokenById).toHaveBeenCalledWith("t1");
  });
});
