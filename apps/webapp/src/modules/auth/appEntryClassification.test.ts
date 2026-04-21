import { describe, expect, it } from "vitest";
import {
  classifyUnauthenticatedAppEntry,
  isDevBypassToken,
  shouldAllowStandaloneTokenExchange,
} from "./appEntryClassification";

describe("appEntryClassification", () => {
  it("detects dev bypass tokens", () => {
    expect(isDevBypassToken("dev:admin")).toBe(true);
    expect(isDevBypassToken("dev:client")).toBe(true);
    expect(isDevBypassToken("token")).toBe(false);
    expect(isDevBypassToken(null)).toBe(false);
  });

  it("allows normal standalone token exchange without switch=1", () => {
    expect(
      shouldAllowStandaloneTokenExchange({
        token: "signed-token",
        switchParam: null,
      }),
    ).toBe(true);
  });

  it("blocks dev bypass token exchange without switch=1", () => {
    expect(
      shouldAllowStandaloneTokenExchange({
        token: "dev:admin",
        switchParam: null,
      }),
    ).toBe(false);
    expect(
      shouldAllowStandaloneTokenExchange({
        token: "dev:admin",
        switchParam: "0",
      }),
    ).toBe(false);
  });

  it("allows dev bypass token exchange only with switch=1", () => {
    expect(
      shouldAllowStandaloneTokenExchange({
        token: "dev:admin",
        switchParam: "1",
      }),
    ).toBe(true);
  });

  it("classifies browser_interactive when dev token is present without allow flag", () => {
    expect(
      classifyUnauthenticatedAppEntry({
        platformEntry: "standalone",
        messengerSurface: null,
        token: "dev:admin",
        allowStandaloneTokenExchange: false,
      }),
    ).toBe("browser_interactive");
  });

  it("classifies token_exchange when standalone token exchange is allowed", () => {
    expect(
      classifyUnauthenticatedAppEntry({
        platformEntry: "standalone",
        messengerSurface: null,
        token: "dev:admin",
        allowStandaloneTokenExchange: true,
      }),
    ).toBe("token_exchange");
  });
});
