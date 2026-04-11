import { describe, expect, it } from "vitest";
import type { AuthMethodsPayload } from "./checkPhoneMethods";
import {
  isOtpChannelAvailable,
  isOtpChannelAvailablePublic,
  OTP_OTHER_CHANNELS_ORDER,
  OTP_PUBLIC_NON_SMS_CHANNELS_ORDER,
  OTP_PUBLIC_OTHER_CHANNELS_ORDER,
  pickOtpChannelWithPreference,
  pickOtpChannelWithPreferencePublic,
  pickPrimaryOtpChannel,
  pickPrimaryOtpChannelPublic,
} from "./otpChannelUi";

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

describe("OTP_PUBLIC_OTHER_CHANNELS_ORDER", () => {
  it("has no sms (веб-вход без SMS)", () => {
    expect(OTP_PUBLIC_OTHER_CHANNELS_ORDER).not.toContain("sms");
    expect(OTP_PUBLIC_NON_SMS_CHANNELS_ORDER).toEqual(OTP_PUBLIC_OTHER_CHANNELS_ORDER);
  });
});

describe("isOtpChannelAvailable", () => {
  it("requires sms flag for SMS channel", () => {
    expect(isOtpChannelAvailable({ sms: true }, "sms")).toBe(true);
    expect(isOtpChannelAvailable({ sms: false }, "sms")).toBe(false);
  });
});

describe("pickPrimaryOtpChannelPublic", () => {
  it("returns null when only email is available", () => {
    expect(pickPrimaryOtpChannelPublic({ sms: false, email: true })).toBeNull();
  });

  it("returns null when only SMS (SMS через «Другие способы»)", () => {
    expect(pickPrimaryOtpChannelPublic({ sms: true })).toBeNull();
  });

  it("prefers telegram over sms", () => {
    expect(
      pickPrimaryOtpChannelPublic({ sms: true, telegram: true }),
    ).toBe("telegram");
  });
});

describe("isOtpChannelAvailablePublic", () => {
  it("never allows email", () => {
    expect(isOtpChannelAvailablePublic({ sms: true, email: true }, "email")).toBe(false);
  });
});

describe("pickOtpChannelWithPreferencePublic", () => {
  it("ignores email preference", () => {
    expect(
      pickOtpChannelWithPreferencePublic({ sms: true, email: true }, "email"),
    ).toBeNull();
  });

  it("ignores sms preference so auto-start never uses SMS", () => {
    expect(
      pickOtpChannelWithPreferencePublic({ sms: true, telegram: true }, "sms"),
    ).toBe("telegram");
  });

  it("uses non-email preference when available", () => {
    expect(
      pickOtpChannelWithPreferencePublic({ sms: true, max: true }, "max"),
    ).toBe("max");
  });
});

describe("pickOtpChannelWithPreference", () => {
  const methods: AuthMethodsPayload = { sms: true, telegram: true, max: true, email: true };

  it("uses preferred when available", () => {
    expect(pickOtpChannelWithPreference(methods, "max")).toBe("max");
  });

  it("ignores preferred when not available", () => {
    expect(pickOtpChannelWithPreference({ sms: true, max: true }, "telegram")).toBe("max");
  });

  it("falls back to primary when preferred null", () => {
    expect(pickOtpChannelWithPreference(methods, null)).toBe("telegram");
  });
});
