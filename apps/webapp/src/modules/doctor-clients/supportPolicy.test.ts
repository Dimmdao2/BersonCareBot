import { describe, expect, it } from "vitest";
import { resolvePatientProgramInteractionPolicy } from "./supportPolicy";

describe("resolvePatientProgramInteractionPolicy", () => {
  const defaults = { commentsEnabled: false, mediaEnabled: false };

  it("on support: allows comments/media unless explicitly false", () => {
    expect(
      resolvePatientProgramInteractionPolicy({
        profile: {
          patientUserId: "u1",
          onSupport: true,
          supportStartedAt: null,
          commentsEnabled: null,
          mediaEnabled: false,
          updatedAt: "",
          updatedBy: null,
        },
        defaultsWithoutSupport: defaults,
      }),
    ).toEqual({
      onSupport: true,
      commentsAllowed: true,
      mediaAllowed: false,
    });
  });

  it("off support: uses doctor defaults when overrides null", () => {
    expect(
      resolvePatientProgramInteractionPolicy({
        profile: {
          patientUserId: "u1",
          onSupport: false,
          supportStartedAt: null,
          commentsEnabled: null,
          mediaEnabled: null,
          updatedAt: "",
          updatedBy: null,
        },
        defaultsWithoutSupport: { commentsEnabled: true, mediaEnabled: false },
      }),
    ).toEqual({
      onSupport: false,
      commentsAllowed: true,
      mediaAllowed: false,
    });
  });

  it("off support: per-patient true overrides default off", () => {
    expect(
      resolvePatientProgramInteractionPolicy({
        profile: {
          patientUserId: "u1",
          onSupport: false,
          supportStartedAt: null,
          commentsEnabled: true,
          mediaEnabled: true,
          updatedAt: "",
          updatedBy: null,
        },
        defaultsWithoutSupport: defaults,
      }),
    ).toEqual({
      onSupport: false,
      commentsAllowed: true,
      mediaAllowed: true,
    });
  });
});
