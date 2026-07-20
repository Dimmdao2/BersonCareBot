import { describe, expect, it } from "vitest";
import {
  addPatientOrganizationChangedNotice,
  buildPatientReminderOrganizationOpener,
  parsePatientReminderOrganizationTarget,
  patientOrganizationRecoveryPath,
} from "./patientReminderOrganizationTarget";

const ORG_A = "11111111-1111-4111-8111-111111111111";

describe("patient reminder organization target", () => {
  it("accepts only an exact UUID target", () => {
    expect(parsePatientReminderOrganizationTarget(ORG_A)).toBe(ORG_A);
    expect(parsePatientReminderOrganizationTarget("org-a")).toBeNull();
    expect(parsePatientReminderOrganizationTarget(undefined)).toBeNull();
  });

  it("routes a mismatched remembered context through the server-verifying opener", () => {
    expect(buildPatientReminderOrganizationOpener("daily-warmup", ORG_A)).toBe(
      `/api/patient/organization-context/open?kind=organization_go&organizationId=${ORG_A}&goKind=daily-warmup`,
    );
  });

  it("preserves existing target query while adding the visible context-change state", () => {
    expect(addPatientOrganizationChangedNotice("/app/patient/treatment/a?tab=program", true)).toBe(
      "/app/patient/treatment/a?tab=program&organizationChanged=1",
    );
    expect(addPatientOrganizationChangedNotice("/app/patient", false)).toBe("/app/patient");
  });

  it("uses a neutral chooser for missing or unavailable targets", () => {
    expect(patientOrganizationRecoveryPath("reminder_target_missing")).toBe(
      "/app/patient/organizations?reason=reminder_target_missing",
    );
    expect(patientOrganizationRecoveryPath("organization_unavailable")).toBe(
      "/app/patient/organizations?reason=organization_unavailable",
    );
  });
});
