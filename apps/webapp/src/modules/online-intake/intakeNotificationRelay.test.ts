import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RelayResult } from "@/modules/messaging/relayOutbound";

const { relayMock, getConfigValueMock } = vi.hoisted(() => ({
  relayMock: vi.fn(async (): Promise<RelayResult> => ({ ok: true, status: "accepted" })),
  getConfigValueMock: vi.fn(async (_key: string, _fallback: string) => ""),
}));

vi.mock("@/modules/messaging/relayOutbound", () => ({
  relayOutbound: relayMock,
}));

vi.mock("@/modules/system-settings/configAdapter", () => ({
  getConfigValue: (key: string, fallback: string) => getConfigValueMock(key, fallback),
}));

import { createIntakeNotificationRelay } from "./intakeNotificationRelay";

describe("intakeNotificationRelay", () => {
  beforeEach(() => {
    relayMock.mockReset();
    getConfigValueMock.mockReset();
    relayMock.mockResolvedValue({ ok: true, status: "accepted" });
    getConfigValueMock.mockImplementation(async () => "");
  });

  it("sends telegram and max when targets present", async () => {
    getConfigValueMock.mockImplementation(async (key: string) => {
      if (key === "admin_telegram_ids") return "111";
      if (key === "admin_max_ids") return "max-1";
      return "";
    });

    const port = createIntakeNotificationRelay();
    await port.notifyNewIntakeRequest({
      requestId: "req-1",
      type: "lfk",
      patientName: "Иван",
      patientPhone: "+7900",
      summary: "Кратко",
    });

    expect(relayMock).toHaveBeenCalledTimes(2);
    expect(relayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "telegram",
        recipient: "111",
        messageId: "req-1:tg:111",
      }),
    );
    expect(relayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "max",
        recipient: "max-1",
        messageId: "req-1:max:max-1",
      }),
    );
  });

  it("deduplicates same id in admin and doctor lists", async () => {
    getConfigValueMock.mockImplementation(async (key: string) => {
      if (key === "admin_telegram_ids") return "999";
      if (key === "doctor_telegram_ids") return "999";
      return "";
    });

    const port = createIntakeNotificationRelay();
    await port.notifyNewIntakeRequest({
      requestId: "req-dedupe",
      type: "nutrition",
      patientName: "Мария",
      patientPhone: "+7901",
      summary: "",
    });

    expect(relayMock).toHaveBeenCalledTimes(1);
    expect(relayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "telegram",
        recipient: "999",
        messageId: "req-dedupe:tg:999",
      }),
    );
  });

  it("skips send when no targets configured", async () => {
    const port = createIntakeNotificationRelay();
    await port.notifyNewIntakeRequest({
      requestId: "req-empty",
      type: "lfk",
      patientName: "X",
      patientPhone: "+7902",
      summary: "текст",
    });

    expect(relayMock).not.toHaveBeenCalled();
  });

  it("does not throw when relay returns ok: false", async () => {
    getConfigValueMock.mockImplementation(async (key: string) => {
      if (key === "admin_telegram_ids") return "222";
      return "";
    });
    relayMock.mockResolvedValue({ ok: false, reason: "no_integrator_url" });

    const port = createIntakeNotificationRelay();
    await expect(
      port.notifyNewIntakeRequest({
        requestId: "req-fail",
        type: "lfk",
        patientName: "Y",
        patientPhone: "+7903",
        summary: "",
      }),
    ).resolves.toBeUndefined();
  });

  it("does not throw when relay throws", async () => {
    getConfigValueMock.mockImplementation(async (key: string) => {
      if (key === "admin_telegram_ids") return "333";
      return "";
    });
    relayMock.mockRejectedValue(new Error("network down"));

    const port = createIntakeNotificationRelay();
    await expect(
      port.notifyNewIntakeRequest({
        requestId: "req-throw",
        type: "lfk",
        patientName: "Z",
        patientPhone: "+7904",
        summary: "",
      }),
    ).resolves.toBeUndefined();
  });
});
