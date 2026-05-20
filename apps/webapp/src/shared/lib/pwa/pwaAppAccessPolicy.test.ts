import { describe, expect, it } from "vitest";
import {
  buildPwaInstallLandingRedirectUrl,
  browserRequiresPwaStandaloneForAppPath,
  isAppEntryTokenBypass,
  isPwaMessengerEntryPath,
  shouldAllowPwaAppShellAccess,
} from "@/shared/lib/pwa/pwaAppAccessPolicy";

describe("pwaAppAccessPolicy", () => {
  it("requires standalone for /app/patient but not public paths", () => {
    expect(browserRequiresPwaStandaloneForAppPath("/app/patient")).toBe(true);
    expect(browserRequiresPwaStandaloneForAppPath("/")).toBe(false);
    expect(browserRequiresPwaStandaloneForAppPath("/legal/privacy")).toBe(false);
  });

  it("exempts messenger entry routes", () => {
    expect(isPwaMessengerEntryPath("/app/tg")).toBe(true);
    expect(isPwaMessengerEntryPath("/app/max")).toBe(true);
    expect(browserRequiresPwaStandaloneForAppPath("/app/tg")).toBe(false);
  });

  it("allows token entry on /app in browser", () => {
    expect(isAppEntryTokenBypass("/app", "?t=abc")).toBe(true);
    expect(isAppEntryTokenBypass("/app/patient", "?t=abc")).toBe(false);
  });

  it("allows standalone and mini app", () => {
    expect(
      shouldAllowPwaAppShellAccess({
        pathname: "/app/patient",
        search: "",
        standalone: true,
        messengerMiniApp: false,
      }),
    ).toBe(true);
    expect(
      shouldAllowPwaAppShellAccess({
        pathname: "/app/patient/diary",
        search: "",
        standalone: false,
        messengerMiniApp: true,
      }),
    ).toBe(true);
  });

  it("blocks browser patient shell in production mode", () => {
    expect(
      shouldAllowPwaAppShellAccess({
        pathname: "/app/patient",
        search: "",
        standalone: false,
        messengerMiniApp: false,
        allowBrowserAccess: false,
      }),
    ).toBe(false);
  });

  it("builds install landing redirect with next and hash", () => {
    expect(buildPwaInstallLandingRedirectUrl("/app/patient", "?tab=symptoms")).toBe(
      "/?next=%2Fapp%2Fpatient%3Ftab%3Dsymptoms#install",
    );
    expect(buildPwaInstallLandingRedirectUrl("/app", "")).toBe("/#install");
  });
});
