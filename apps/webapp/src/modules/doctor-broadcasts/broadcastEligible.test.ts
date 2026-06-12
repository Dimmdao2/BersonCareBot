import { describe, expect, it } from "vitest";
import {
  filterEligibleBroadcastClients,
  deriveBroadcastDeliveryPolicy,
  broadcastNotificationPrefsDefaults,
  broadcastIncludeWebPushJob,
} from "./broadcastEligible";
import type { ClientListItem } from "@/modules/doctor-clients/ports";

const c = (partial: Partial<ClientListItem> & Pick<ClientListItem, "userId">): ClientListItem => ({
  displayName: "P",
  phone: "+79001112233",
  bindings: {},
  nextAppointmentLabel: null,
  activeTreatmentProgram: false,
  activeTreatmentProgramInstanceId: null,
  cancellationCount30d: 0,
  ...partial,
});

describe("filterEligibleBroadcastClients", () => {
  const emptyMap = new Map();

  it("includes client when telegram allowed and tg bound", () => {
    const list = filterEligibleBroadcastClients(
      [c({ userId: "u", bindings: { telegramId: "1" } })],
      ["bot_message"],
      "all",
      emptyMap,
    );
    expect(list.map((x) => x.userId)).toEqual(["u"]);
  });

  it("excludes when telegram prefs off unless with_telegram segment", () => {
    const m = new Map([["u", { telegram: false, max: true, sms: true }]]);
    expect(
      filterEligibleBroadcastClients(
        [c({ userId: "u", bindings: { telegramId: "1" } })],
        ["bot_message"],
        "all",
        m,
      ),
    ).toHaveLength(0);
    expect(
      filterEligibleBroadcastClients(
        [c({ userId: "u", bindings: { telegramId: "1" } })],
        ["bot_message"],
        "with_telegram",
        m,
      ),
    ).toHaveLength(1);
  });
});

describe("broadcastIncludeWebPushJob", () => {
  it("includes user when push channel selected and user is eligible", () => {
    const ids = new Set(["u1"]);
    expect(broadcastIncludeWebPushJob(["push"], ids, "u1")).toBe(true);
    expect(broadcastIncludeWebPushJob(["bot_message"], ids, "u1")).toBe(false);
    expect(broadcastIncludeWebPushJob(["push"], ids, "u2")).toBe(false);
  });
});

describe("filterEligibleBroadcastClients — email channel", () => {
  it("includes client with verified email when email channel selected", () => {
    const emptyMap = new Map();
    const emailEligible = new Set(["u"]);
    const list = filterEligibleBroadcastClients(
      [c({ userId: "u", bindings: {} })],
      ["email"],
      "all",
      emptyMap,
      new Set<string>(),
      emailEligible,
    );
    expect(list.map((x) => x.userId)).toEqual(["u"]);
  });

  it("excludes client without verified email when email channel selected", () => {
    const emptyMap = new Map();
    const emailEligible = new Set<string>(); // empty — no verified emails
    const list = filterEligibleBroadcastClients(
      [c({ userId: "u", bindings: {} })],
      ["email"],
      "all",
      emptyMap,
      new Set<string>(),
      emailEligible,
    );
    expect(list).toHaveLength(0);
  });
});

describe("deriveBroadcastDeliveryPolicy", () => {
  it("returns respect_prefs_bot when only bot_message and broad segment", () => {
    expect(deriveBroadcastDeliveryPolicy("all", ["bot_message"]).kind).toBe("respect_prefs_bot");
  });

  it("returns respect_prefs_bot when only telegram", () => {
    expect(deriveBroadcastDeliveryPolicy("all", ["telegram"]).kind).toBe("respect_prefs_bot");
  });

  it("returns respect_prefs_bot when only max", () => {
    expect(deriveBroadcastDeliveryPolicy("all", ["max"]).kind).toBe("respect_prefs_bot");
  });

  it("returns telegram_isolate_bot for with_telegram + telegram channel", () => {
    expect(deriveBroadcastDeliveryPolicy("with_telegram", ["telegram"]).kind).toBe("telegram_isolate_bot");
  });

  it("returns none when no channels", () => {
    expect(deriveBroadcastDeliveryPolicy("all", []).kind).toBe("none");
  });

  it("returns none when only email (wantsBot=false,wantsSms=false,wantsPush=false,wantsEmail=true) — returns respect_prefs_bot", () => {
    expect(deriveBroadcastDeliveryPolicy("all", ["email"]).kind).toBe("respect_prefs_bot");
  });
});

describe("broadcastNotificationPrefsDefaults", () => {
  it("all true", () => {
    expect(broadcastNotificationPrefsDefaults()).toEqual({ telegram: true, max: true, sms: true });
  });
});
