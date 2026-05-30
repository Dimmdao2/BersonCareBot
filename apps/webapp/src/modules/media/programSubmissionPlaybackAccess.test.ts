import { describe, expect, it } from "vitest";
import { canAccessProgramSubmissionMedia } from "./programSubmissionPlaybackAccess";
import type { AppSession } from "@/shared/types/session";

function session(userId: string, role: AppSession["user"]["role"]): AppSession {
  return {
    user: { userId, role, displayName: "U", bindings: {} },
    issuedAt: 0,
    expiresAt: 9999999999,
  };
}

describe("canAccessProgramSubmissionMedia", () => {
  it("allows any authenticated user for non-submission media", () => {
    expect(
      canAccessProgramSubmissionMedia(session("p1", "client"), {
        usagePurpose: null,
        uploadedBy: "other",
      }),
    ).toBe(true);
  });

  it("allows uploader patient", () => {
    expect(
      canAccessProgramSubmissionMedia(session("p1", "client"), {
        usagePurpose: "program_item_submission",
        uploadedBy: "p1",
      }),
    ).toBe(true);
  });

  it("allows doctor for submission media", () => {
    expect(
      canAccessProgramSubmissionMedia(session("d1", "doctor"), {
        usagePurpose: "program_item_submission",
        uploadedBy: "p1",
      }),
    ).toBe(true);
  });

  it("denies unrelated patient", () => {
    expect(
      canAccessProgramSubmissionMedia(session("p2", "client"), {
        usagePurpose: "program_item_submission",
        uploadedBy: "p1",
      }),
    ).toBe(false);
  });
});
