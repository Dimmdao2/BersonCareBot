/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const inferSpy = vi.fn();

vi.mock("@/shared/lib/messengerMiniApp", () => ({
  inferMessengerChannelForRequestContact: () => inferSpy(),
}));

import {
  assignChannelLinkToBlankWindow,
  buildTgAppDeepLink,
  finishChannelLinkNavigation,
  isLikelyMobileUserAgent,
  isMaxChannelDeepLinkUrl,
  pickTelegramOpenUrl,
} from "./telegramChannelLinkOpen";

beforeEach(() => {
  inferSpy.mockReturnValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isMaxChannelDeepLinkUrl", () => {
  it("returns true for max.ru with start param", () => {
    expect(isMaxChannelDeepLinkUrl("https://max.ru/MyBot?start=link_abc")).toBe(true);
    expect(isMaxChannelDeepLinkUrl("https://www.max.ru/MyBot?start=x")).toBe(true);
  });

  it("returns false without start or wrong host", () => {
    expect(isMaxChannelDeepLinkUrl("https://max.ru/MyBot")).toBe(false);
    expect(isMaxChannelDeepLinkUrl("https://example.com/?start=x")).toBe(false);
  });
});

describe("isLikelyMobileUserAgent", () => {
  it("detects common mobile UAs", () => {
    expect(isLikelyMobileUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true);
    expect(isLikelyMobileUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit")).toBe(true);
  });

  it("returns false for desktop", () => {
    expect(isLikelyMobileUserAgent("Mozilla/5.0 (X11; Linux x86_64) Chrome/120")).toBe(false);
  });
});

describe("buildTgAppDeepLink", () => {
  it("parses t.me bot ?start=", () => {
    expect(buildTgAppDeepLink("https://t.me/MyCareBot?start=link_abc")).toBe(
      "tg://resolve?domain=MyCareBot&start=link_abc"
    );
  });

  it("strips @ from domain segment", () => {
    expect(buildTgAppDeepLink("https://t.me/@MyCareBot?start=link_x")).toBe(
      "tg://resolve?domain=MyCareBot&start=link_x"
    );
  });

  it("returns null without start param", () => {
    expect(buildTgAppDeepLink("https://t.me/MyCareBot")).toBeNull();
  });

  it("returns null for non-t.me", () => {
    expect(buildTgAppDeepLink("https://example.com/bot")).toBeNull();
  });

  it("encodes domain and start", () => {
    expect(buildTgAppDeepLink("https://t.me/bot_name?start=a%20b")).toBe(
      "tg://resolve?domain=bot_name&start=a%20b"
    );
  });
});

describe("pickTelegramOpenUrl", () => {
  const desktopUa = "Mozilla/5.0 (Windows NT 10.0) Chrome/120";
  const iphoneUa =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";

  it("keeps https on desktop", () => {
    const url = "https://t.me/Bot?start=link_1";
    expect(pickTelegramOpenUrl(url, desktopUa)).toBe(url);
  });

  it("uses tg:// on mobile when parseable", () => {
    const url = "https://t.me/Bot?start=link_1";
    expect(pickTelegramOpenUrl(url, iphoneUa)).toBe("tg://resolve?domain=Bot&start=link_1");
  });

  it("falls back to https on mobile when not parseable", () => {
    const url = "https://example.com/x";
    expect(pickTelegramOpenUrl(url, iphoneUa)).toBe(url);
  });
});

describe("assignChannelLinkToBlankWindow", () => {
  const desktopUa = "Mozilla/5.0 (Windows NT 10.0) Chrome/120";
  const iphoneUa =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";

  it("sets location.href to https t.me on desktop for telegram channel", () => {
    const loc = { href: "" };
    const blankWin = { location: loc, close: vi.fn() } as unknown as Window;
    const url = "https://t.me/Bot?start=link_1";
    assignChannelLinkToBlankWindow(blankWin, url, "telegram", desktopUa);
    expect(loc.href).toBe(url);
    expect(blankWin.close).not.toHaveBeenCalled();
  });

  it("uses tg:// on mobile for telegram channel", () => {
    const loc = { href: "" };
    const blankWin = { location: loc, close: vi.fn() } as unknown as Window;
    assignChannelLinkToBlankWindow(
      blankWin,
      "https://t.me/Bot?start=link_1",
      "telegram",
      iphoneUa,
    );
    expect(loc.href).toBe("tg://resolve?domain=Bot&start=link_1");
  });

  it("passes url through for max channel (no tg rewrite)", () => {
    const loc = { href: "" };
    const blankWin = { location: loc, close: vi.fn() } as unknown as Window;
    assignChannelLinkToBlankWindow(blankWin, "https://max.ru/", "max", iphoneUa);
    expect(loc.href).toBe("https://max.ru/");
  });

  it("closes window when assigning location.href throws", () => {
    const close = vi.fn();
    const blankWin = {
      location: {
        set href(_v: string) {
          throw new Error("blocked");
        },
      },
      close,
    } as unknown as Window;
    assignChannelLinkToBlankWindow(blankWin, "https://t.me/Bot?start=x", "telegram", desktopUa);
    expect(close).toHaveBeenCalled();
  });
});

describe("finishChannelLinkNavigation", () => {
  const desktopUa = "Mozilla/5.0 (Windows NT 10.0) Chrome/120";
  const iphoneUa =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15";

  it("calls openTelegramLink in Telegram mini app for telegram channel", () => {
    const openTelegramLink = vi.fn();
    const openLink = vi.fn();
    vi.stubGlobal("Telegram", { WebApp: { openTelegramLink, openLink } });
    inferSpy.mockReturnValue("telegram");

    finishChannelLinkNavigation({
      blankWin: null,
      url: "https://t.me/Bot?start=link_1",
      channel: "telegram",
      userAgent: desktopUa,
    });

    expect(openTelegramLink).toHaveBeenCalledWith("https://t.me/Bot?start=link_1");
    expect(openLink).not.toHaveBeenCalled();
  });

  it("calls openLink with max.ru URL in Telegram mini app for max channel", () => {
    const openLink = vi.fn();
    vi.stubGlobal("Telegram", { WebApp: { openLink, openTelegramLink: vi.fn() } });
    inferSpy.mockReturnValue("telegram");
    const url = "https://max.ru/MyBot?start=link_abc";

    finishChannelLinkNavigation({
      blankWin: null,
      url,
      channel: "max",
      userAgent: iphoneUa,
    });

    expect(openLink).toHaveBeenCalledWith(url, { try_instant_view: false });
  });

  it("uses Telegram.WebApp.openLink for max even when inferMessengerChannel is undefined (avoids blocked window.open)", () => {
    const openLink = vi.fn();
    vi.stubGlobal("Telegram", { WebApp: { openLink, openTelegramLink: vi.fn() } });
    inferSpy.mockReturnValue(undefined);
    const url = "https://max.ru/MyBot?start=link_abc";

    finishChannelLinkNavigation({
      blankWin: null,
      url,
      channel: "max",
      userAgent: iphoneUa,
    });

    expect(openLink).toHaveBeenCalledWith(url, { try_instant_view: false });
  });

  it("calls openMaxLink in MAX mini app for max deeplink", () => {
    const openMaxLink = vi.fn();
    vi.stubGlobal("WebApp", { openMaxLink, openLink: vi.fn() });
    inferSpy.mockReturnValue("max");
    const url = "https://max.ru/MyBot?start=link_abc";

    finishChannelLinkNavigation({
      blankWin: null,
      url,
      channel: "max",
      userAgent: desktopUa,
    });

    expect(openMaxLink).toHaveBeenCalledWith(url);
  });

  it("assigns blank window when not in mini app", () => {
    inferSpy.mockReturnValue(undefined);
    const loc = { href: "" };
    const blankWin = { location: loc, close: vi.fn() } as unknown as Window;

    finishChannelLinkNavigation({
      blankWin,
      url: "https://t.me/Bot?start=link_1",
      channel: "telegram",
      userAgent: desktopUa,
    });

    expect(loc.href).toBe("https://t.me/Bot?start=link_1");
  });
});
