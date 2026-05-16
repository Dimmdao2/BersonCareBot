import { describe, expect, it } from "vitest";
import {
  filterEligibleBroadcastClients,
  deriveBroadcastDeliveryPolicy,
  broadcastNotificationPrefsDefaults,
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

describe("deriveBroadcastDeliveryPolicy", () => {
  it("returns respect_prefs_bot when only bot_message and broad segment", () => {
    expect(deriveBroadcastDeliveryPolicy("all", ["bot_message"]).kind).toBe("respect_prefs_bot");
  });

  it("returns none when no channels", () => {
    expect(deriveBroadcastDeliveryPolicy("all", []).kind).toBe("none");
  });
});

describe("broadcastNotificationPrefsDefaults", () => {
  it("all true", () => {
    expect(broadcastNotificationPrefsDefaults()).toEqual({ telegram: true, max: true, sms: true });
  });
});
