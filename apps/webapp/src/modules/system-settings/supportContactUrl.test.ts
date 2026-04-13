import { describe, expect, it } from "vitest";
import { routePaths } from "@/app-layer/routes/paths";
import { resolveSupportContactHrefForLoginFlow } from "./supportContactUrl";

describe("resolveSupportContactHrefForLoginFlow", () => {
  it("maps default patient support path to login contact page", () => {
    expect(resolveSupportContactHrefForLoginFlow("/app/patient/support")).toBe(routePaths.loginContactSupport);
  });

  it("maps nested patient support path to login contact page", () => {
    expect(resolveSupportContactHrefForLoginFlow("/app/patient/support/foo")).toBe(routePaths.loginContactSupport);
  });

  it("preserves external URLs", () => {
    expect(resolveSupportContactHrefForLoginFlow("https://t.me/help")).toBe("https://t.me/help");
  });

  it("uses login contact when configured empty", () => {
    expect(resolveSupportContactHrefForLoginFlow("")).toBe(routePaths.loginContactSupport);
    expect(resolveSupportContactHrefForLoginFlow("  ")).toBe(routePaths.loginContactSupport);
  });
});
