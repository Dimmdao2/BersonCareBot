import { describe, expect, it } from "vitest";
import { isOtpChannelAvailable, OTP_OTHER_CHANNELS_ORDER, pickPrimaryOtpChannel } from "./otpChannelUi";

describe("pickPrimaryOtpChannel", () => {
  it("prefers telegram over max and email", () => {
    expect(
      pickPrimaryOtpChannel({
        sms: true,
        telegram: true,
        max: true,
        email: true,
      }),
    ).toBe("telegram");
  });

  it("falls back to sms when no messengers or email", () => {
    expect(pickPrimaryOtpChannel({ sms: true })).toBe("sms");
  });
});

describe("OTP_OTHER_CHANNELS_ORDER", () => {
  it("ends with sms", () => {
    expect(OTP_OTHER_CHANNELS_ORDER[OTP_OTHER_CHANNELS_ORDER.length - 1]).toBe("sms");
  });
});

describe("isOtpChannelAvailable", () => {
  it("treats sms as always available", () => {
    expect(isOtpChannelAvailable({ sms: true }, "sms")).toBe(true);
  });
});
