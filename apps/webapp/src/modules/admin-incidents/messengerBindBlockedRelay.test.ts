import { describe, expect, it } from "vitest";
import { buildMessengerBindBlockedRelayLines } from "@bersoncare/platform-merge";
import {
  parseMessengerPhoneBindAuditInitiator,
  parseMessengerPhoneBindAuditTargets,
} from "@/infra/adminAuditLogPresentation";

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
        messengerDisplayHint: "@operator_hint",
      },
      channelCode: "telegram",
      externalId: "467240537",
      correlationId: "req-1",
      source: "http_bind",
    });
    expect(lines[0]).toContain("Ошибка автопривязки телефона");
    expect(lines.some((l) => l.includes("https://example.com/app/doctor/clients/"))).toBe(true);
    expect(lines.some((l) => l.includes("Иванова Мария"))).toBe(true);
    expect(lines.some((l) => l.includes("Подпись в мессенджере: @operator_hint"))).toBe(true);
    expect(
      lines.some((l) =>
        l.includes(
          "/api/doctor/clients/merge-preview?targetId=ae6e205a-9127-4283-862b-ac12b0239391&duplicateId=f6545bcc-9ae8-4e07-9762-2553a9f9de94",
        ),
      ),
    ).toBe(true);
  });

  it("labels MAX messengerDisplayHint as profile phone", () => {
    const lines = buildMessengerBindBlockedRelayLines({
      variantLabel: "HTTP bind (webapp)",
      machineReason: "phone_owned_by_other_user",
      reasonHumanRu: "Тест",
      appBaseUrl: "https://example.com/",
      candidates: [
        {
          platformUserId: "11111111-1111-1111-1111-111111111111",
          displayName: null,
          phoneNormalized: null,
          email: null,
        },
        {
          platformUserId: "22222222-2222-2222-2222-222222222222",
          displayName: null,
          phoneNormalized: null,
          email: null,
        },
      ],
      initiator: {
        channelLabel: "MAX",
        channelCode: "max",
        externalId: "max-ext-1",
        platformUserId: "22222222-2222-2222-2222-222222222222",
        messengerDisplayHint: "+79001112233",
      },
      channelCode: "max",
      externalId: "max-ext-1",
    });
    expect(lines.some((l) => l.includes("Телефон в профиле (MAX): +79001112233"))).toBe(true);
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

  it("returns three rows sorted by platformUserId", () => {
    const rows = parseMessengerPhoneBindAuditTargets({
      candidates: [
        { platformUserId: "cccccccc-cccc-cccc-cccc-cccccccccccc", displayName: "Gamma" },
        { platformUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", displayName: "Alpha" },
        { platformUserId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", displayName: "Zeta" },
      ],
    });
    expect(rows!.map((r) => r.platformUserId)).toEqual([
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      "cccccccc-cccc-cccc-cccc-cccccccccccc",
    ]);
  });
});

describe("parseMessengerPhoneBindAuditInitiator", () => {
  it("reads channelLabel, externalId, platformUserId, messengerDisplayHint", () => {
    const ini = parseMessengerPhoneBindAuditInitiator({
      initiator: {
        channelLabel: "MAX",
        channelCode: "max",
        externalId: "u-1",
        platformUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        messengerDisplayHint: "@nick",
      },
    });
    expect(ini).toEqual({
      channelLabel: "MAX",
      externalId: "u-1",
      platformUserId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      messengerDisplayHint: "@nick",
    });
  });
});
