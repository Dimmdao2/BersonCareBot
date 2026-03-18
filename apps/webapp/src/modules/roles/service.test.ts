import { describe, expect, it } from "vitest";
import { canAccessPatient, canAccessDoctor } from "./service";

describe("roles service", () => {
  describe("canAccessPatient", () => {
    it("allows only client", () => {
      expect(canAccessPatient("client")).toBe(true);
      expect(canAccessPatient("admin")).toBe(false);
    });
    it("denies doctor", () => {
      expect(canAccessPatient("doctor")).toBe(false);
    });
  });

  describe("canAccessDoctor", () => {
    it("allows doctor and admin", () => {
      expect(canAccessDoctor("doctor")).toBe(true);
      expect(canAccessDoctor("admin")).toBe(true);
    });
    it("denies client", () => {
      expect(canAccessDoctor("client")).toBe(false);
    });
  });
});
