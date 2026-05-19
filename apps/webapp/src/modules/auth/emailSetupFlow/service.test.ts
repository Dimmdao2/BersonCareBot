import { describe, expect, it, vi, beforeEach } from "vitest";
import { createEmailSetupFlowService } from "./service";
import type { EmailSetupFlowPort } from "./ports";
import type { EmailSetupTokensService } from "@/modules/auth/emailSetupTokens/service";
import type { EmailSetupAccessService } from "@/modules/auth/emailSetupAccess/service";

vi.mock("@/modules/auth/pinHash", () => ({
  hashPin: async (p: string) => `hashed:${p}`,
}));

describe("emailSetupFlow service", () => {
  const flowPort: EmailSetupFlowPort = {
    assertContactEmailForSetup: vi.fn(),
    applyEmailSetupCompletion: vi.fn(),
  };
  const tokens = {
    lookupEmailSetupToken: vi.fn(),
    validateEmailSetupToken: vi.fn(),
    consumeEmailSetupToken: vi.fn(),
  } as unknown as EmailSetupTokensService;
  const emailSetupAccess = {
    requestContactEmailSetup: vi.fn(),
  } as unknown as EmailSetupAccessService;

  beforeEach(() => {
    vi.mocked(flowPort.assertContactEmailForSetup).mockReset();
    vi.mocked(flowPort.applyEmailSetupCompletion).mockReset();
    vi.mocked(tokens.lookupEmailSetupToken).mockReset();
    vi.mocked(tokens.validateEmailSetupToken).mockReset();
    vi.mocked(tokens.consumeEmailSetupToken).mockReset();
    vi.mocked(emailSetupAccess.requestContactEmailSetup).mockReset();
  });

  it("validate returns ready for active token and matching contact email", async () => {
    vi.mocked(tokens.lookupEmailSetupToken).mockResolvedValueOnce({
      ok: true,
      status: "active",
      tokenId: "t1",
      userId: "u1",
      emailNormalized: "a@b.com",
    });
    vi.mocked(flowPort.assertContactEmailForSetup).mockResolvedValueOnce({
      ok: true,
      email: "a@b.com",
    });

    const svc = createEmailSetupFlowService({ tokens, flowPort, emailSetupAccess });
    const r = await svc.validateTokenForForm("est_test");
    expect(r).toEqual({ ok: true, email: "a@b.com", status: "ready" });
  });

  it("validate returns expired with email for resend UI", async () => {
    vi.mocked(tokens.lookupEmailSetupToken).mockResolvedValueOnce({
      ok: true,
      status: "expired",
      userId: "u1",
      emailNormalized: "a@b.com",
    });
    vi.mocked(flowPort.assertContactEmailForSetup).mockResolvedValueOnce({
      ok: true,
      email: "a@b.com",
    });

    const svc = createEmailSetupFlowService({ tokens, flowPort, emailSetupAccess });
    const r = await svc.validateTokenForForm("est_test");
    expect(r).toEqual({ ok: false, error: "expired", email: "a@b.com" });
  });

  it("complete verifies email, sets password, consumes token in apply tx", async () => {
    vi.mocked(tokens.validateEmailSetupToken).mockResolvedValueOnce({
      ok: true,
      tokenId: "t1",
      userId: "u1",
      emailNormalized: "a@b.com",
    });
    vi.mocked(flowPort.assertContactEmailForSetup).mockResolvedValueOnce({
      ok: true,
      email: "a@b.com",
    });
    vi.mocked(flowPort.applyEmailSetupCompletion).mockResolvedValueOnce({ ok: true });

    const svc = createEmailSetupFlowService({ tokens, flowPort, emailSetupAccess });
    const r = await svc.completeEmailSetup("est_test", "secret1234");
    expect(r).toEqual({ ok: true, userId: "u1" });
    expect(flowPort.applyEmailSetupCompletion).toHaveBeenCalledWith({
      userId: "u1",
      emailNormalized: "a@b.com",
      passwordHash: "hashed:secret1234",
      setupTokenId: "t1",
    });
    expect(tokens.consumeEmailSetupToken).not.toHaveBeenCalled();
  });

  it("resend issues new link for expired token", async () => {
    vi.mocked(tokens.lookupEmailSetupToken).mockResolvedValueOnce({
      ok: true,
      status: "expired",
      userId: "u1",
      emailNormalized: "a@b.com",
    });
    vi.mocked(flowPort.assertContactEmailForSetup).mockResolvedValueOnce({
      ok: true,
      email: "a@b.com",
    });
    vi.mocked(emailSetupAccess.requestContactEmailSetup).mockResolvedValueOnce({
      ok: true,
      status: "enqueued",
    });

    const svc = createEmailSetupFlowService({ tokens, flowPort, emailSetupAccess });
    const r = await svc.resendFromExpiredToken("est_expired");
    expect(r).toEqual({ ok: true });
    expect(emailSetupAccess.requestContactEmailSetup).toHaveBeenCalledWith({
      userId: "u1",
      emailNormalized: "a@b.com",
      source: "manual_resend",
    });
  });

  it("used token cannot complete", async () => {
    vi.mocked(tokens.validateEmailSetupToken).mockResolvedValueOnce({
      ok: false,
      reason: "used",
    });

    const svc = createEmailSetupFlowService({ tokens, flowPort, emailSetupAccess });
    const r = await svc.completeEmailSetup("est_used", "secret1234");
    expect(r).toEqual({ ok: false, error: "used" });
  });
});
