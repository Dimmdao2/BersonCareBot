import { describe, expect, it } from "vitest";
import {
  MAX_BRIDGE_LOAD_GRACE_MS,
  isLikelyMaxMiniAppSurface,
  shouldDeferPhoneLoginWhileMaxBridgeMayLoad,
} from "./messengerAuthStrategy";

describe("shouldDeferPhoneLoginWhileMaxBridgeMayLoad", () => {
  it("defers while grace elapsed and bridge not ready", () => {
    expect(
      shouldDeferPhoneLoginWhileMaxBridgeMayLoad({
        token: null,
        elapsedMs: MAX_BRIDGE_LOAD_GRACE_MS - 1,
        telegramInitDataEmpty: true,
        maxInitDataEmpty: true,
        maxBridgeReady: false,
        messengerMiniAppContext: true,
      }),
    ).toBe(true);
  });

  it("stops deferring after grace when bridge never appears (plain browser)", () => {
    expect(
      shouldDeferPhoneLoginWhileMaxBridgeMayLoad({
        token: null,
        elapsedMs: MAX_BRIDGE_LOAD_GRACE_MS,
        telegramInitDataEmpty: true,
        maxInitDataEmpty: true,
        maxBridgeReady: false,
        messengerMiniAppContext: true,
      }),
    ).toBe(false);
  });

  it("does not defer in plain browser without messenger mini app context", () => {
    expect(
      shouldDeferPhoneLoginWhileMaxBridgeMayLoad({
        token: null,
        elapsedMs: 0,
        telegramInitDataEmpty: true,
        maxInitDataEmpty: true,
        maxBridgeReady: false,
        messengerMiniAppContext: false,
      }),
    ).toBe(false);
  });

  it("does not defer when query jwt present", () => {
    expect(
      shouldDeferPhoneLoginWhileMaxBridgeMayLoad({
        token: "x",
        elapsedMs: 0,
        telegramInitDataEmpty: true,
        maxInitDataEmpty: true,
        maxBridgeReady: false,
        messengerMiniAppContext: true,
      }),
    ).toBe(false);
  });

  it("does not defer when MAX bridge already ready", () => {
    expect(
      shouldDeferPhoneLoginWhileMaxBridgeMayLoad({
        token: null,
        elapsedMs: 0,
        telegramInitDataEmpty: true,
        maxInitDataEmpty: true,
        maxBridgeReady: true,
        messengerMiniAppContext: true,
      }),
    ).toBe(false);
  });
});

describe("isLikelyMaxMiniAppSurface", () => {
  it("detects MAX when TG empty and bridge ready", () => {
    expect(isLikelyMaxMiniAppSurface(true, true)).toBe(true);
    expect(isLikelyMaxMiniAppSurface(false, true)).toBe(false);
  });
});
