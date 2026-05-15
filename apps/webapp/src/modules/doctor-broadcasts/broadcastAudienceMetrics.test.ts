import { describe, it, expect } from "vitest";
import {
  computeDevModeRelayBroadcastReach,
  resolveBroadcastEffectiveClients,
  buildRecipientsPreviewFromClients,
} from "./broadcastAudienceMetrics";
import type { ClientListItem } from "@/modules/doctor-clients/ports";
import type { TestAccountIdentifiers } from "@/modules/system-settings/testAccounts";

const spec: TestAccountIdentifiers = {
  phones: ["+79990000000"],
  telegramIds: ["111"],
  maxIds: ["m1"],
};

function client(partial: Partial<ClientListItem> & Pick<ClientListItem, "userId">): ClientListItem {
  return {
    displayName: "U",
    phone: null,
    bindings: {},
    nextAppointmentLabel: null,
    activeTreatmentProgram: false,
    activeTreatmentProgramInstanceId: null,
    cancellationCount30d: 0,
    ...partial,
  };
}

describe("resolveBroadcastEffectiveClients", () => {
  it("devMode off returns full client list", () => {
    const clients = [
      client({ userId: "1", displayName: "B" }),
      client({ userId: "2", displayName: "A" }),
    ];
    const r = resolveBroadcastEffectiveClients(clients, ["bot_message", "sms"], false, null);
    expect(r.effective).toHaveLength(2);
    expect(r.nominal).toBe(2);
    expect(r.cappedByDevMode).toBe(false);
  });
});

describe("buildRecipientsPreviewFromClients", () => {
  it("sorts by display name and truncates with cap", () => {
    const clients = [
      client({ userId: "1", displayName: "Ян" }),
      client({ userId: "2", displayName: "Анна" }),
      client({ userId: "3", displayName: "Борис" }),
    ];
    const p = buildRecipientsPreviewFromClients(clients, 2);
    expect(p.names).toEqual(["Анна", "Борис"]);
    expect(p.total).toBe(3);
    expect(p.truncated).toBe(true);
  });

  it("uses label for empty display name", () => {
    const p = buildRecipientsPreviewFromClients([client({ userId: "1", displayName: "   " })], 20);
    expect(p.names).toEqual(["Без имени"]);
    expect(p.total).toBe(1);
    expect(p.truncated).toBe(false);
  });
});

describe("computeDevModeRelayBroadcastReach", () => {
  it("without relay channels returns nominal as effective", () => {
    const clients = [client({ userId: "1" })];
    const r = computeDevModeRelayBroadcastReach(clients, ["push"], spec);
    expect(r).toEqual({ effective: 1, nominal: 1, cappedByDevMode: false });
  });

  it("sms-only in dev_mode → 0 deliveries", () => {
    const clients = [client({ userId: "1", phone: "+79990000000" })];
    const r = computeDevModeRelayBroadcastReach(clients, ["sms"], spec);
    expect(r).toEqual({ effective: 0, nominal: 1, cappedByDevMode: true });
  });

  it("bot_message counts clients whose telegram or max is in test list", () => {
    const clients = [
      client({ userId: "1", bindings: { telegramId: "111" } }),
      client({ userId: "2", bindings: { telegramId: "222" } }),
      client({ userId: "3", bindings: { maxId: "m1" } }),
    ];
    const r = computeDevModeRelayBroadcastReach(clients, ["bot_message"], spec);
    expect(r.effective).toBe(2);
    expect(r.nominal).toBe(3);
    expect(r.cappedByDevMode).toBe(true);
  });

  it("null test accounts fail-closed for bot_message", () => {
    const clients = [client({ userId: "1", bindings: { telegramId: "111" } })];
    const r = computeDevModeRelayBroadcastReach(clients, ["bot_message"], null);
    expect(r).toEqual({ effective: 0, nominal: 1, cappedByDevMode: true });
  });
});
