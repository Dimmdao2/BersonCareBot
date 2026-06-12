import { describe, it, expect, vi } from "vitest";
import { fanOutBroadcastEmail } from "./fanOutBroadcastEmail";
import type { ClientListItem } from "@/modules/doctor-clients/ports";

vi.mock("@/modules/outbound-email/sendTransactionalSmtp", () => ({
  sendTransactionalSmtpEmail: vi.fn().mockResolvedValue({ ok: true }),
}));

import { sendTransactionalSmtpEmail } from "@/modules/outbound-email/sendTransactionalSmtp";

function cl(partial: Partial<ClientListItem> & Pick<ClientListItem, "userId">): ClientListItem {
  return {
    displayName: "Test",
    phone: null,
    bindings: {},
    nextAppointmentLabel: null,
    activeTreatmentProgram: false,
    activeTreatmentProgramInstanceId: null,
    cancellationCount30d: 0,
    ...partial,
  };
}

describe("fanOutBroadcastEmail", () => {
  it("sends email to each client with verified email", async () => {
    const emailMap = new Map([
      ["u1", "u1@example.com"],
      ["u2", "u2@example.com"],
    ]);
    const deps = {
      emailRecipientsPort: {
        getVerifiedEmailsForUserIds: vi.fn().mockResolvedValue(emailMap),
      },
      getSmtpValueJson: vi.fn().mockResolvedValue({ value: { host: "localhost", port: 587, secure: false, user: "test", password: "pass", from: "noreply@test.com" } }),
    };

    const result = await fanOutBroadcastEmail(
      {
        auditId: "audit-1",
        broadcastCategory: "organizational",
        broadcastTitle: "Test title",
        broadcastBody: "Test body",
        eligibleClients: [cl({ userId: "u1" }), cl({ userId: "u2" })],
      },
      deps,
    );

    expect(result.attempted).toBe(2);
    expect(result.delivered).toBe(2);
    expect(result.errors).toBe(0);
    expect(result.skipped).toBe(0);
    expect(vi.mocked(sendTransactionalSmtpEmail)).toHaveBeenCalledTimes(2);
  });

  it("skips clients without verified email", async () => {
    const emailMap = new Map([["u1", "u1@example.com"]]);
    const deps = {
      emailRecipientsPort: {
        getVerifiedEmailsForUserIds: vi.fn().mockResolvedValue(emailMap),
      },
      getSmtpValueJson: vi.fn().mockResolvedValue({}),
    };

    const result = await fanOutBroadcastEmail(
      {
        auditId: "audit-2",
        broadcastCategory: "service",
        broadcastTitle: "T",
        broadcastBody: "B",
        eligibleClients: [cl({ userId: "u1" }), cl({ userId: "u2-no-email" })],
      },
      deps,
    );

    expect(result.attempted).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it("counts errors when smtp fails", async () => {
    vi.mocked(sendTransactionalSmtpEmail).mockResolvedValueOnce({ ok: false, error: "smtp_error" });
    const emailMap = new Map([["u1", "u1@example.com"]]);
    const deps = {
      emailRecipientsPort: {
        getVerifiedEmailsForUserIds: vi.fn().mockResolvedValue(emailMap),
      },
      getSmtpValueJson: vi.fn().mockResolvedValue({}),
    };

    const result = await fanOutBroadcastEmail(
      {
        auditId: "audit-3",
        broadcastCategory: "marketing",
        broadcastTitle: "T",
        broadcastBody: "B",
        eligibleClients: [cl({ userId: "u1" })],
      },
      deps,
    );

    expect(result.errors).toBe(1);
    expect(result.delivered).toBe(0);
  });

  it("returns all skipped when resolver throws", async () => {
    const deps = {
      emailRecipientsPort: {
        getVerifiedEmailsForUserIds: vi.fn().mockRejectedValue(new Error("db error")),
      },
      getSmtpValueJson: vi.fn().mockResolvedValue({}),
    };

    const result = await fanOutBroadcastEmail(
      {
        auditId: "audit-4",
        broadcastCategory: "organizational",
        broadcastTitle: "T",
        broadcastBody: "B",
        eligibleClients: [cl({ userId: "u1" }), cl({ userId: "u2" })],
      },
      deps,
    );

    expect(result.attempted).toBe(0);
    expect(result.skipped).toBe(2);
  });
});
