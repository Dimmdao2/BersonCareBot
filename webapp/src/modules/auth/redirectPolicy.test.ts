import { describe, expect, it } from "vitest";
import {
  getRedirectPathForRole,
  isSafeNext,
  getPostAuthRedirectTarget,
} from "./redirectPolicy";

describe("redirectPolicy", () => {
  describe("getRedirectPathForRole", () => {
    it("returns /app/doctor for doctor", () => {
      expect(getRedirectPathForRole("doctor")).toBe("/app/doctor");
    });
    it("returns /app/doctor for admin", () => {
      expect(getRedirectPathForRole("admin")).toBe("/app/doctor");
    });
    it("returns /app/patient for client", () => {
      expect(getRedirectPathForRole("client")).toBe("/app/patient");
    });
  });

  describe("isSafeNext", () => {
    it("allows /app/patient and below", () => {
      expect(isSafeNext("/app/patient")).toBe(true);
      expect(isSafeNext("/app/patient/cabinet")).toBe(true);
      expect(isSafeNext("/app/patient/lessons")).toBe(true);
    });
    it("rejects bind-phone", () => {
      expect(isSafeNext("/app/patient/bind-phone")).toBe(false);
      expect(isSafeNext("/app/patient/bind-phone?x=1")).toBe(false);
    });
    it("rejects non-patient paths", () => {
      expect(isSafeNext("/app/doctor")).toBe(false);
      expect(isSafeNext("/other")).toBe(false);
    });
    it("rejects null and empty", () => {
      expect(isSafeNext(null)).toBe(false);
      expect(isSafeNext("")).toBe(false);
    });
  });

  describe("getPostAuthRedirectTarget", () => {
    it("returns safe next when provided", () => {
      expect(getPostAuthRedirectTarget("client", "/app/patient/cabinet")).toBe("/app/patient/cabinet");
      expect(getPostAuthRedirectTarget("doctor", "/app/patient/lessons")).toBe("/app/patient/lessons");
    });
    it("returns role path when next is unsafe", () => {
      expect(getPostAuthRedirectTarget("client", "/app/doctor")).toBe("/app/patient");
      expect(getPostAuthRedirectTarget("doctor", null)).toBe("/app/doctor");
      expect(getPostAuthRedirectTarget("admin", "/app/patient/bind-phone")).toBe("/app/doctor");
    });
  });
});
