import { describe, expect, it, vi } from "vitest";
import {
  isPatientProgramDiscussionMediaFlowEnabled,
  isPatientProgramDiscussionMediaSubmissionEnabled,
  isPatientProgramDiscussionUiEnabled,
  parseDiscussionFeatureEnabled,
} from "./discussionFeatureGates";

describe("discussionFeatureGates", () => {
  it("parseDiscussionFeatureEnabled reads value flag", () => {
    expect(parseDiscussionFeatureEnabled({ value: true })).toBe(true);
    expect(parseDiscussionFeatureEnabled({ value: false })).toBe(false);
    expect(parseDiscussionFeatureEnabled(null)).toBe(false);
  });

  it("media flow requires both ui and media flags", async () => {
    const getSetting = vi.fn(async (key: string) => {
      if (key === "patient_program_discussion_ui_enabled") {
        return { valueJson: { value: true } };
      }
      if (key === "patient_program_discussion_media_submission_enabled") {
        return { valueJson: { value: false } };
      }
      return null;
    });
    const deps = { systemSettings: { getSetting } } as Parameters<
      typeof isPatientProgramDiscussionMediaFlowEnabled
    >[0];

    expect(await isPatientProgramDiscussionUiEnabled(deps)).toBe(true);
    expect(await isPatientProgramDiscussionMediaSubmissionEnabled(deps)).toBe(false);
    expect(await isPatientProgramDiscussionMediaFlowEnabled(deps)).toBe(false);

    getSetting.mockImplementation(async (key: string) => {
      if (key === "patient_program_discussion_ui_enabled") {
        return { valueJson: { value: true } };
      }
      if (key === "patient_program_discussion_media_submission_enabled") {
        return { valueJson: { value: true } };
      }
      return null;
    });
    expect(await isPatientProgramDiscussionMediaFlowEnabled(deps)).toBe(true);
  });
});
