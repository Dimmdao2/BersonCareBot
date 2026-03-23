import { describe, expect, it } from "vitest";
import { getDoctorScreenTitle } from "./doctorScreenTitles";

describe("getDoctorScreenTitle", () => {
  it("returns overview for /app/doctor", () => {
    expect(getDoctorScreenTitle("/app/doctor")).toBe("Обзор");
  });
  it("returns clients for list", () => {
    expect(getDoctorScreenTitle("/app/doctor/clients")).toBe("Клиенты");
  });
  it("returns client for detail", () => {
    expect(getDoctorScreenTitle("/app/doctor/clients/u1")).toBe("Клиент");
  });
  it("returns references", () => {
    expect(getDoctorScreenTitle("/app/doctor/references")).toBe("Справочники");
  });
});
