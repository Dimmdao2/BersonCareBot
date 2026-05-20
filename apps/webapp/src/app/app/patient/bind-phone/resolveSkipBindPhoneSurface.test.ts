import { describe, expect, it } from "vitest";
import { resolveSkipBindPhoneSurface } from "./resolveSkipBindPhoneSurface";

describe("resolveSkipBindPhoneSurface", () => {
  it("does not skip when DB trusted tier is false and snapshot has no phone", () => {
    expect(
      resolveSkipBindPhoneSurface({
        databaseUrlSet: true,
        phoneTrustedForPatient: false,
        sessionSnapshotHasPhone: false,
      }),
    ).toBe(false);
  });

  it("skips when phoneTrustedForPatient is true", () => {
    expect(
      resolveSkipBindPhoneSurface({
        databaseUrlSet: true,
        phoneTrustedForPatient: true,
        sessionSnapshotHasPhone: false,
      }),
    ).toBe(true);
  });

  it("falls back to snapshot when platform context failed", () => {
    expect(
      resolveSkipBindPhoneSurface({
        databaseUrlSet: true,
        platformContextFailed: true,
        sessionSnapshotHasPhone: false,
      }),
    ).toBe(false);
  });
});
