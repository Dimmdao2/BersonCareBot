import { describe, expect, it } from "vitest";
import {
  buildPwaInstallLandingRedirectUrl,
  browserRequiresPwaStandaloneForAppPath,
  isPatientPwaGatedPath,
  isPwaMessengerEntryPath,
  shouldAllowPwaAppShellAccess,
} from "@/shared/lib/pwa/pwaAppAccessPolicy";

describe("pwaAppAccessPolicy", () => {
  it("requires standalone only for /app/patient paths", () => {
    expect(isPatientPwaGatedPath("/app/patient")).toBe(true);
    expect(isPatientPwaGatedPath("/app/patient/diary")).toBe(true);
    expect(browserRequiresPwaStandaloneForAppPath("/app/patient")).toBe(true);
    expect(browserRequiresPwaStandaloneForAppPath("/app/doctor")).toBe(false);
    expect(browserRequiresPwaStandaloneForAppPath("/app/settings")).toBe(false);
    expect(browserRequiresPwaStandaloneForAppPath("/app")).toBe(false);
    expect(browserRequiresPwaStandaloneForAppPath("/")).toBe(false);
    expect(browserRequiresPwaStandaloneForAppPath("/legal/privacy")).toBe(false);
  });

  it("exempts messenger entry routes from patient gate helper", () => {
    expect(isPwaMessengerEntryPath("/app/tg")).toBe(true);
    expect(isPwaMessengerEntryPath("/app/max")).toBe(true);
    expect(isPatientPwaGatedPath("/app/tg")).toBe(false);
  });

  it("allows standalone and mini app in patient cabinet", () => {
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

  it("allows doctor cabinet in browser without standalone", () => {
    expect(
      shouldAllowPwaAppShellAccess({
        pathname: "/app/doctor",
        search: "",
        standalone: false,
        messengerMiniApp: false,
        allowBrowserAccess: false,
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
  });

  it("preserves app_access_denied in next when gate redirects browser client", () => {
    expect(buildPwaInstallLandingRedirectUrl("/app/patient", "?app_access_denied=1")).toBe(
      "/?next=%2Fapp%2Fpatient%3Fapp_access_denied%3D1#install",
    );
  });
});
