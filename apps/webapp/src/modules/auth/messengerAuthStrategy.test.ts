import { describe, expect, it } from "vitest";
import {
  MAX_BRIDGE_LOAD_GRACE_MS,
  isAuthBootstrapEarlyUiV2Enabled,
  isLikelyMaxMiniAppSurface,
  shouldDeferPhoneLoginWhileMaxBridgeMayLoad,
  shouldExposeInteractiveLogin,
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

describe("shouldExposeInteractiveLogin", () => {
  it("exposes initData=no in messenger context", () => {
    expect(
      shouldExposeInteractiveLogin({
        earlyUiEnabled: false,
        isMessengerMiniAppEntry: true,
        messengerSoftOk: false,
        browserSoftOk: false,
        initDataStatus: "no",
        state: "idle",
      }),
    ).toBe(true);
  });

  it("does not expose messenger mini app on error state (timeout / init failure UI)", () => {
    expect(
      shouldExposeInteractiveLogin({
        earlyUiEnabled: false,
        isMessengerMiniAppEntry: true,
        messengerSoftOk: true,
        browserSoftOk: false,
        initDataStatus: "unknown",
        state: "error",
      }),
    ).toBe(false);
  });

  it("exposes on error in plain browser (non-messenger)", () => {
    expect(
      shouldExposeInteractiveLogin({
        earlyUiEnabled: false,
        isMessengerMiniAppEntry: false,
        messengerSoftOk: false,
        browserSoftOk: false,
        initDataStatus: "unknown",
        state: "error",
      }),
    ).toBe(true);
  });

  it("with early UI exposes after messenger soft while initData unknown", () => {
    expect(
      shouldExposeInteractiveLogin({
        earlyUiEnabled: true,
        isMessengerMiniAppEntry: true,
        messengerSoftOk: true,
        browserSoftOk: false,
        initDataStatus: "unknown",
        state: "idle",
      }),
    ).toBe(true);
  });

  it("with early UI exposes after browser soft in non-messenger context", () => {
    expect(
      shouldExposeInteractiveLogin({
        earlyUiEnabled: true,
        isMessengerMiniAppEntry: false,
        messengerSoftOk: false,
        browserSoftOk: true,
        initDataStatus: "unknown",
        state: "idle",
      }),
    ).toBe(true);
  });
});

describe("isAuthBootstrapEarlyUiV2Enabled", () => {
  it("reads NEXT_PUBLIC_AUTH_BOOTSTRAP_EARLY_UI_V2", () => {
    const prev = process.env.NEXT_PUBLIC_AUTH_BOOTSTRAP_EARLY_UI_V2;
    process.env.NEXT_PUBLIC_AUTH_BOOTSTRAP_EARLY_UI_V2 = "1";
    expect(isAuthBootstrapEarlyUiV2Enabled()).toBe(true);
    if (prev === undefined) delete process.env.NEXT_PUBLIC_AUTH_BOOTSTRAP_EARLY_UI_V2;
    else process.env.NEXT_PUBLIC_AUTH_BOOTSTRAP_EARLY_UI_V2 = prev;
  });
});
