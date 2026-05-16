import { describe, expect, it } from "vitest";
import { buildMessengerBindBlockedRelayLines } from "@bersoncare/platform-merge";
import { parseMessengerPhoneBindAuditTargets } from "@/infra/adminAuditLogPresentation";

describe("buildMessengerBindBlockedRelayLines", () => {
  it("includes Russian headings and doctor client URLs", () => {
    const lines = buildMessengerBindBlockedRelayLines({
      variantLabel: "HTTP bind (webapp)",
      machineReason: "merge_blocked_ambiguous_candidates",
      reasonHumanRu: "Merge заблокирован: неоднозначные кандидаты",
      appBaseUrl: "https://example.com/",
      candidates: [
        {
          platformUserId: "f6545bcc-9ae8-4e07-9762-2553a9f9de94",
          displayName: "Иванова Мария",
          phoneNormalized: "+79001234567",
          email: null,
        },
        {
          platformUserId: "ae6e205a-9127-4283-862b-ac12b0239391",
          displayName: null,
          phoneNormalized: null,
          email: "x@example.org",
        },
      ],
      initiator: {
        channelLabel: "Телеграм",
        channelCode: "telegram",
        externalId: "467240537",
        platformUserId: "ae6e205a-9127-4283-862b-ac12b0239391",
      },
      channelCode: "telegram",
      externalId: "467240537",
      correlationId: "req-1",
      source: "http_bind",
    });
    expect(lines[0]).toContain("Ошибка автопривязки телефона");
    expect(lines.some((l) => l.includes("https://example.com/app/doctor/clients/"))).toBe(true);
    expect(lines.some((l) => l.includes("Иванова Мария"))).toBe(true);
  });
});

describe("parseMessengerPhoneBindAuditTargets", () => {
  it("sorts by platformUserId and uses displayName label", () => {
    const rows = parseMessengerPhoneBindAuditTargets({
      candidates: [
        { platformUserId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", displayName: "Zeta" },
        { platformUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", displayName: "Alpha" },
      ],
    });
    expect(rows).not.toBeNull();
    expect(rows!.map((r) => r.platformUserId)).toEqual([
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    ]);
    expect(rows![0].label).toBe("Alpha");
  });
});
