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
  it("returns new content page title", () => {
    expect(getDoctorScreenTitle("/app/doctor/content/new")).toBe("Новая страница");
  });
  it("returns edit content title", () => {
    expect(getDoctorScreenTitle("/app/doctor/content/edit/abc")).toBe("Редактировать страницу");
  });
  it("returns news and motivation title", () => {
    expect(getDoctorScreenTitle("/app/doctor/content/news")).toBe("Новости и мотивация");
  });
  it("normalizes trailing slash on overview", () => {
    expect(getDoctorScreenTitle("/app/doctor/")).toBe("Обзор");
  });
  it("returns fallback for unknown doctor path", () => {
    expect(getDoctorScreenTitle("/app/doctor/unknown-section")).toBe("Кабинет");
  });
});
