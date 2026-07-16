import { describe, expect, it, vi } from "vitest";
import {
  isPatientProgramDiscussionMediaFlowEnabled,
  isPatientProgramDiscussionMediaSubmissionEnabled,
  isPatientProgramDiscussionUiEnabled,
} from "./discussionFeatureGates";

describe("discussionFeatureGates", () => {
  it("media flow requires both ui and media flags", async () => {
    const getBoolean = vi.fn(async (key: string) => {
      if (key === "patient_program_discussion_ui_enabled") {
        return true;
      }
      if (key === "patient_program_discussion_media_submission_enabled") {
        return false;
      }
      return false;
    });
    const deps = { runtimeConfig: { getBoolean } } satisfies Parameters<
      typeof isPatientProgramDiscussionMediaFlowEnabled
    >[0];
    const context = { patientUserId: "patient-1", organizationId: "org-1" };

    expect(await isPatientProgramDiscussionUiEnabled(deps, context)).toBe(true);
    expect(await isPatientProgramDiscussionMediaSubmissionEnabled(deps, context)).toBe(false);
    expect(await isPatientProgramDiscussionMediaFlowEnabled(deps, context)).toBe(false);

    getBoolean.mockImplementation(async (key: string) => {
      if (key === "patient_program_discussion_ui_enabled") {
        return true;
      }
      if (key === "patient_program_discussion_media_submission_enabled") {
        return true;
      }
      return false;
    });
    expect(await isPatientProgramDiscussionMediaFlowEnabled(deps, context)).toBe(true);
    expect(getBoolean).toHaveBeenCalledWith(
      "patient_program_discussion_media_submission_enabled",
      context,
    );
  });
});
