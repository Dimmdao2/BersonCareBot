import { describe, expect, it } from "vitest";
import {
  normalizeBookingCatalogCityCode,
  pickBookingCityCodeForAddressLinks,
  resolvePatientAddressHref,
} from "./patientHelpAddressLink";

describe("patientHelpAddressLink", () => {
  it("normalizes catalog and alias city codes", () => {
    expect(normalizeBookingCatalogCityCode("moscow")).toBe("moscow");
    expect(normalizeBookingCatalogCityCode("MSK")).toBe("moscow");
    expect(normalizeBookingCatalogCityCode("spb")).toBe("spb");
    expect(normalizeBookingCatalogCityCode("unknown")).toBeNull();
  });

  it("links to address-msk help when moscow and article published", () => {
    const href = resolvePatientAddressHref(new Set(["address-msk", "address-spb"]), "moscow");
    expect(href).toBe("/app/patient/help/address-msk");
  });

  it("links to address-msk help when catalog uses msk alias", () => {
    const href = resolvePatientAddressHref(new Set(["address-msk", "address-spb"]), "msk");
    expect(href).toBe("/app/patient/help/address-msk");
  });

  it("links to address-spb help when spb and article published", () => {
    const href = resolvePatientAddressHref(new Set(["address-msk", "address-spb"]), "spb");
    expect(href).toBe("/app/patient/help/address-spb");
  });

  it("falls back to patient address when city unknown or article missing", () => {
    expect(resolvePatientAddressHref(new Set(["address-msk"]), "spb")).toBe("/app/patient/address");
    expect(resolvePatientAddressHref(new Set(["address-spb"]), "moscow")).toBe("/app/patient/address");
    expect(resolvePatientAddressHref(new Set(["address-msk", "address-spb"]), null)).toBe(
      "/app/patient/address",
    );
  });

  it("prefers searchParams city over upcoming snapshots", () => {
    expect(pickBookingCityCodeForAddressLinks("spb", ["moscow"])).toBe("spb");
    expect(pickBookingCityCodeForAddressLinks(undefined, ["moscow", null])).toBe("moscow");
    expect(pickBookingCityCodeForAddressLinks("", [])).toBeNull();
  });

  it("ignores unrecognized cityCode query and uses upcoming snapshot", () => {
    expect(pickBookingCityCodeForAddressLinks("invalid", ["moscow"])).toBe("moscow");
    expect(pickBookingCityCodeForAddressLinks("invalid", [])).toBeNull();
  });
});
