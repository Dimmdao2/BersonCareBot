/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import { shouldRunMediaLibraryPickerServerSearch } from "@/shared/ui/doctor/media/useMediaLibraryPickerServerSearch";

describe("shouldRunMediaLibraryPickerServerSearch", () => {
  it("returns false when query empty", () => {
    expect(shouldRunMediaLibraryPickerServerSearch(0, "", false)).toBe(false);
    expect(shouldRunMediaLibraryPickerServerSearch(3, "  ", false)).toBe(false);
  });

  it("returns false when local matches exist", () => {
    expect(shouldRunMediaLibraryPickerServerSearch(1, "test", false)).toBe(false);
  });

  it("returns false while base list is loading", () => {
    expect(shouldRunMediaLibraryPickerServerSearch(0, "test", true)).toBe(false);
  });

  it("returns true when query set, no local matches, base loaded", () => {
    expect(shouldRunMediaLibraryPickerServerSearch(0, "test", false)).toBe(true);
  });
});
