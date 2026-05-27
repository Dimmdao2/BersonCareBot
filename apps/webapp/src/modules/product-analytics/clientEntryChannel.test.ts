import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveClientEntryChannel } from "@/modules/product-analytics/clientEntryChannel";

vi.mock("@/shared/lib/messengerMiniApp", () => ({
  isMessengerMiniAppHost: vi.fn(() => false),
  readTelegramInitDataForAuth: vi.fn(() => ""),
  getMaxWebAppInitDataForAuth: vi.fn(() => ""),
}));

vi.mock("@/shared/lib/platform", () => ({
  readMessengerSurfaceCookie: vi.fn(() => null),
}));

vi.mock("@/shared/lib/webPush/pwaDisplay", () => ({
  isStandalonePwa: vi.fn(() => false),
}));

import { isMessengerMiniAppHost, readTelegramInitDataForAuth } from "@/shared/lib/messengerMiniApp";
import { readMessengerSurfaceCookie } from "@/shared/lib/platform";
import { isStandalonePwa } from "@/shared/lib/webPush/pwaDisplay";

describe("resolveClientEntryChannel", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {} as Window);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(isMessengerMiniAppHost).mockReturnValue(false);
    vi.mocked(readMessengerSurfaceCookie).mockReturnValue(null);
    vi.mocked(readTelegramInitDataForAuth).mockReturnValue("");
    vi.mocked(isStandalonePwa).mockReturnValue(false);
  });

  it("returns pwa in standalone mode outside mini app", () => {
    vi.mocked(isStandalonePwa).mockReturnValue(true);
    expect(resolveClientEntryChannel()).toBe("pwa");
  });

  it("returns telegram in mini app host", () => {
    vi.mocked(isMessengerMiniAppHost).mockReturnValue(true);
    vi.mocked(readMessengerSurfaceCookie).mockReturnValue("telegram");
    expect(resolveClientEntryChannel()).toBe("telegram");
  });

  it("returns max when surface cookie is max", () => {
    vi.mocked(isMessengerMiniAppHost).mockReturnValue(true);
    vi.mocked(readMessengerSurfaceCookie).mockReturnValue("max");
    expect(resolveClientEntryChannel()).toBe("max");
  });

  it("returns browser by default", () => {
    expect(resolveClientEntryChannel()).toBe("browser");
  });
});
