import { describe, it, expect, vi } from "vitest";
import { fanOutBroadcastEmail, buildBroadcastEmailHtml } from "./fanOutBroadcastEmail";
import type { ClientListItem } from "@/modules/doctor-clients/ports";

// S10: email now goes through relayOutbound instead of sendTransactionalSmtpEmail
const relayOutboundMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/messaging/relayOutbound", () => ({
  relayOutbound: relayOutboundMock,
}));

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
    relayOutboundMock.mockResolvedValue({ ok: true, status: "accepted" });

    const emailMap = new Map([
      ["u1", "u1@example.com"],
      ["u2", "u2@example.com"],
    ]);
    const deps = {
      emailRecipientsPort: {
        getVerifiedEmailsForUserIds: vi.fn().mockResolvedValue(emailMap),
      },
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
    expect(relayOutboundMock).toHaveBeenCalledTimes(2);
    // Verify relay is called with email channel and subject metadata
    // Note: second arg is the deps object passed through from fanOutBroadcastEmail
    expect(relayOutboundMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "email",
        metadata: expect.objectContaining({ subject: "Test title" }),
      }),
      expect.anything(),
    );
  });

  it("passes inline-image HTML to relay when mediaUrl set; omits html otherwise (RASSL-06)", async () => {
    relayOutboundMock.mockClear();
    relayOutboundMock.mockResolvedValue({ ok: true, status: "accepted" });
    const deps = {
      emailRecipientsPort: {
        getVerifiedEmailsForUserIds: vi.fn().mockResolvedValue(new Map([["u1", "u1@example.com"]])),
      },
    };
    await fanOutBroadcastEmail(
      {
        auditId: "a-img",
        broadcastCategory: "organizational",
        broadcastTitle: "Pic title",
        broadcastBody: "Pic body",
        mediaUrl: "https://cdn/x.jpg",
        eligibleClients: [cl({ userId: "u1" })],
      },
      deps,
    );
    const arg = relayOutboundMock.mock.calls[0][0] as { html?: string };
    expect(arg.html).toContain('<img src="https://cdn/x.jpg"');
    expect(arg.html).toContain("Pic body");

    relayOutboundMock.mockClear();
    await fanOutBroadcastEmail(
      {
        auditId: "a-noimg",
        broadcastCategory: "organizational",
        broadcastTitle: "T",
        broadcastBody: "B",
        eligibleClients: [cl({ userId: "u1" })],
      },
      deps,
    );
    expect((relayOutboundMock.mock.calls[0][0] as { html?: string }).html).toBeUndefined();
  });

  it("buildBroadcastEmailHtml escapes content + embeds image", () => {
    const html = buildBroadcastEmailHtml("<b>T</b>", "a & b", "https://cdn/y.png");
    expect(html).toContain('<img src="https://cdn/y.png"');
    expect(html).toContain("&lt;b&gt;T&lt;/b&gt;"); // title escaped
    expect(html).toContain("a &amp; b"); // body escaped
  });

  it("skips clients without verified email", async () => {
    relayOutboundMock.mockResolvedValue({ ok: true, status: "accepted" });

    const emailMap = new Map([["u1", "u1@example.com"]]);
    const deps = {
      emailRecipientsPort: {
        getVerifiedEmailsForUserIds: vi.fn().mockResolvedValue(emailMap),
      },
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

  it("counts errors when relay fails", async () => {
    relayOutboundMock.mockResolvedValueOnce({ ok: false, reason: "dispatch_failed" });
    const emailMap = new Map([["u1", "u1@example.com"]]);
    const deps = {
      emailRecipientsPort: {
        getVerifiedEmailsForUserIds: vi.fn().mockResolvedValue(emailMap),
      },
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
