/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import {
  appendRegionParamFromListPreserve,
  DOCTOR_CATALOG_URL_SYNC_EVENT,
  readDoctorCatalogClientFilterUrlSlice,
} from "./doctorCatalogClientUrlSync";

describe("doctorCatalogClientUrlSync", () => {
  it("appendRegionParamFromListPreserve skips UUID payload", () => {
    const sp = new URLSearchParams();
    appendRegionParamFromListPreserve(sp, "550e8400-e29b-41d4-a716-446655440000");
    expect(sp.has("region")).toBe(false);
  });

  it("appendRegionParamFromListPreserve skips junk token", () => {
    const sp = new URLSearchParams();
    appendRegionParamFromListPreserve(sp, "not valid!");
    expect(sp.has("region")).toBe(false);
  });

  it("readDoctorCatalogClientFilterUrlSlice drops UUID region like no filter", () => {
    window.history.replaceState({}, "", "/?region=550e8400-e29b-41d4-a716-446655440000");
    const s = readDoctorCatalogClientFilterUrlSlice();
    expect(s.regionCode).toBeUndefined();
    window.history.replaceState({}, "", "/");
  });

  it("appendRegionParamFromListPreserve sets region code", () => {
    const sp = new URLSearchParams();
    appendRegionParamFromListPreserve(sp, "spine");
    expect(sp.get("region")).toBe("spine");
  });

  it("readDoctorCatalogClientFilterUrlSlice parses query", () => {
    window.history.replaceState({}, "", "/?q=foo&region=spine&load=strength&titleSort=asc&domain=nutrition&assessment=knee");
    const s = readDoctorCatalogClientFilterUrlSlice();
    expect(s.q).toBe("foo");
    expect(s.regionCode).toBe("spine");
    expect(s.loadType).toBe("strength");
    expect(s.titleSort).toBe("asc");
    expect(s.domain).toBe("nutrition");
    expect(s.assessmentKind).toBe("knee");
    window.history.replaceState({}, "", "/");
  });

  it("exports sync event name", () => {
    expect(DOCTOR_CATALOG_URL_SYNC_EVENT).toBe("doctorcatalog:urlsync");
  });
});
