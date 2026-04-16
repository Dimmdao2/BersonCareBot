/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import { PLATFORM_COOKIE_NAME } from "@/shared/lib/platform";
import { isMessengerMiniAppHost } from "@/shared/lib/messengerMiniApp";

describe("isMessengerMiniAppHost", () => {
  beforeEach(() => {
    delete (window as Window & { Telegram?: unknown }).Telegram;
    delete (window as Window & { WebApp?: unknown }).WebApp;
    document.cookie = `${PLATFORM_COOKIE_NAME}=; path=/; max-age=0`;
  });

  it("returns false in standalone browser when only MAX bridge object exists", () => {
    (window as Window & { WebApp?: { ready?: () => void; initData?: string } }).WebApp = {
      ready: () => undefined,
      initData: "",
    };

    expect(isMessengerMiniAppHost()).toBe(false);
  });

  it("returns true for MAX mini app when bridge has initData", () => {
    (window as Window & { WebApp?: { ready?: () => void; initData?: string } }).WebApp = {
      ready: () => undefined,
      initData: "signed-max-init-data",
    };

    expect(isMessengerMiniAppHost()).toBe(true);
  });
});
