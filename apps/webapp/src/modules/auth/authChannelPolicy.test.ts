import { beforeEach, describe, expect, it, vi } from "vitest";

const getPublicRuntimeBoolMock = vi.hoisted(() => vi.fn());

vi.mock("@/modules/system-settings/configAdapter", () => ({
  getPublicRuntimeBool: getPublicRuntimeBoolMock,
}));

import { getAuthChannelPolicy, isAuthChannelEnabled } from "./authChannelPolicy";

describe("auth channel policy", () => {
  beforeEach(() => {
    getPublicRuntimeBoolMock.mockReset().mockResolvedValue(true);
  });

  it("maps each channel to its canonical public-runtime key", async () => {
    await expect(isAuthChannelEnabled("sms")).resolves.toBe(true);
    expect(getPublicRuntimeBoolMock).toHaveBeenCalledWith(
      "auth_sms_enabled",
      "public_auth_config",
    );
  });

  it("returns the complete independent policy", async () => {
    getPublicRuntimeBoolMock.mockImplementation(async (key: string) => key !== "auth_sms_enabled");

    await expect(getAuthChannelPolicy()).resolves.toEqual({
      email: true,
      sms: false,
      telegram: true,
      max: true,
    });
    expect(getPublicRuntimeBoolMock.mock.calls).toEqual([
      ["auth_email_enabled", "public_auth_config"],
      ["auth_sms_enabled", "public_auth_config"],
      ["auth_telegram_enabled", "public_auth_config"],
      ["auth_max_enabled", "public_auth_config"],
    ]);
  });
});
