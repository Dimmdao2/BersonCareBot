import { describe, expect, it } from "vitest";
import {
  formatClientEnvironmentFact,
  parseSupportedClientEnvironment,
  toClientEnvironmentTelemetry,
} from "./supportedClientMatrix";

describe("supported client matrix", () => {
  it("presents a confident iPhone fact without retaining raw UA", () => {
    const parsed = parseSupportedClientEnvironment(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 15_5 like Mac OS X) AppleWebKit/605.1.15 Version/15.5 Mobile Safari/604.1",
    );
    expect(parsed).toMatchObject({
      osFamily: "ios",
      osVersion: "15.5",
      browserFamily: "safari",
      browserVersion: "15.5",
      deviceName: "iPhone",
      confidence: "high",
      supportBucket: "within_matrix",
    });
    expect(formatClientEnvironmentFact(parsed)).toBe("Ваше устройство: iPhone, iOS 15.5, Safari");
    expect(toClientEnvironmentTelemetry(parsed)).toEqual({
      osFamily: "ios",
      osMajor: 15,
      browserFamily: "safari",
      browserMajor: 15,
      supportBucket: "within_matrix",
      isInAppWebView: false,
    });
    expect(parsed).not.toHaveProperty("userAgent");
  });

  it("classifies explicit old baselines but never returns an access decision", () => {
    const oldIos = parseSupportedClientEnvironment(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 Version/14.1 Mobile Safari/604.1",
    );
    const oldChrome = parseSupportedClientEnvironment(
      "Mozilla/5.0 (Linux; Android 12; Pixel 5 Build/SP2A) AppleWebKit/537.36 Chrome/99.0.4844.84 Mobile Safari/537.36",
    );
    expect(oldIos.supportBucket).toBe("below_matrix");
    expect(oldChrome.supportBucket).toBe("below_matrix");
    expect(oldChrome).not.toHaveProperty("allowed");
    expect(oldChrome).not.toHaveProperty("blocked");
  });

  it("keeps unparseable clients generic", () => {
    const parsed = parseSupportedClientEnvironment("unknown-client");
    expect(parsed.supportBucket).toBe("unknown");
    expect(formatClientEnvironmentFact(parsed)).toBeNull();
  });
});
