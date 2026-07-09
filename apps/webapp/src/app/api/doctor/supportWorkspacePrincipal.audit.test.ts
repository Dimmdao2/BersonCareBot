import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const mutatingRouteFiles = [
  "src/app/api/doctor/clients/[userId]/notes/route.ts",
  "src/app/api/doctor/clients/[userId]/support-settings/route.ts",
  "src/app/api/doctor/clients/[userId]/tasks/route.ts",
  "src/app/api/doctor/clients/[userId]/booking-profile/route.ts",
  "src/app/api/doctor/clients/[userId]/warmup-schedule/route.ts",
  "src/app/api/doctor/clients/[userId]/symptom-trackings/route.ts",
  "src/app/api/doctor/comments/route.ts",
  "src/app/api/doctor/comments/[id]/route.ts",
  "src/app/api/doctor/online-intake/[id]/reply/route.ts",
  "src/app/api/doctor/online-intake/[id]/status/route.ts",
  "src/app/api/doctor/messages/[conversationId]/route.ts",
  "src/app/api/doctor/messages/[conversationId]/read/route.ts",
  "src/app/api/doctor/messages/conversations/ensure/route.ts",
  "src/app/api/doctor/tasks/route.ts",
  "src/app/api/doctor/tasks/[taskId]/route.ts",
  "src/app/api/doctor/tasks/[taskId]/complete/route.ts",
] as const;

const principalBackedRepoFiles = [
  "src/infra/repos/pgDoctorNotes.ts",
  "src/infra/repos/pgDoctorPatientSupport.ts",
  "src/infra/repos/pgComments.ts",
  "src/infra/repos/pgSupportCommunication.ts",
  "src/infra/repos/pgSpecialistTasks.ts",
] as const;

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("doctor support/task workspace principal cutover", () => {
  it.each(mutatingRouteFiles)("%s wraps mutating work in doctor workspace principal", (file) => {
    const src = readSource(file);
    expect(src).toContain("requireDoctorWorkspaceApiContext");
    expect(src).toContain("withDoctorWorkspacePrincipal");
  });

  it.each(principalBackedRepoFiles)("%s uses principal-aware transactions and organization stamping", (file) => {
    const src = readSource(file);
    expect(src).toContain("runDrizzleMutationTransaction");
    expect(src).toContain("currentWriteOrganizationId");
    if (file === "src/infra/repos/pgSupportCommunication.ts") {
      expect(src).toContain("organization_id");
    } else {
      expect(src).toContain("organizationId: currentWriteOrganizationId");
    }
  });

  it("task update/delete/complete routes reject tasks outside the selected workspace", () => {
    const taskRoute = readSource("src/app/api/doctor/tasks/[taskId]/route.ts");
    const completeRoute = readSource("src/app/api/doctor/tasks/[taskId]/complete/route.ts");
    expect(taskRoute).toContain("existing.organizationId !== gate.ctx.organizationId");
    expect(completeRoute).toContain("existing.organizationId !== gate.ctx.organizationId");
  });

  it("patient-bound create routes resolve the patient inside the selected organization", () => {
    for (const file of [
      "src/app/api/doctor/clients/[userId]/notes/route.ts",
      "src/app/api/doctor/clients/[userId]/support-settings/route.ts",
      "src/app/api/doctor/clients/[userId]/tasks/route.ts",
      "src/app/api/doctor/clients/[userId]/booking-profile/route.ts",
      "src/app/api/doctor/clients/[userId]/warmup-schedule/route.ts",
      "src/app/api/doctor/clients/[userId]/symptom-trackings/route.ts",
      "src/app/api/doctor/messages/conversations/ensure/route.ts",
      "src/app/api/doctor/tasks/route.ts",
    ]) {
      const src = readSource(file);
      expect(src).toContain("getClientIdentityForOrganization");
      expect(src).toContain("gate.ctx.organizationId");
    }
  });

  it("doctor message mutations reject conversations outside the selected workspace", () => {
    for (const file of [
      "src/app/api/doctor/messages/[conversationId]/route.ts",
      "src/app/api/doctor/messages/[conversationId]/read/route.ts",
    ]) {
      const src = readSource(file);
      expect(src).toContain("conversationBelongsToWorkspace");
      expect(src).toContain("full.conversation");
      expect(src).toContain("gate.ctx.organizationId");
    }
  });

  it("doctor message read and write routes preserve legacy unowned conversations", () => {
    for (const file of [
      "src/app/api/doctor/messages/[conversationId]/route.ts",
      "src/app/api/doctor/messages/[conversationId]/read/route.ts",
    ]) {
      const src = readSource(file);
      expect(src).toContain("return conversation.organizationId == null");
      expect(src).toContain("claimLegacyConversationForWorkspace");
      expect(src).toContain("claimLegacyConversationForOrganization");
    }
  });

  it("doctor comments routes scope reads and writes to the selected workspace", () => {
    for (const file of [
      "src/app/api/doctor/comments/route.ts",
      "src/app/api/doctor/comments/[id]/route.ts",
    ]) {
      const src = readSource(file);
      expect(src).toContain("requireDoctorWorkspaceApiContext");
      expect(src).toContain("withDoctorWorkspacePrincipal");
    }

    const itemRoute = readSource("src/app/api/doctor/comments/[id]/route.ts");
    expect(itemRoute).toContain("commentBelongsToWorkspace");
    expect(itemRoute).toContain("comment.organizationId === organizationId");

    const collectionRoute = readSource("src/app/api/doctor/comments/route.ts");
    expect(collectionRoute).toContain('targetType === "program_instance"');
    expect(collectionRoute).toContain("ensureDoctorCommentTargetInWorkspace");
    expect(collectionRoute).toContain("deps.treatmentProgramInstance.getInstanceById");
    expect(collectionRoute).toContain("instance.organizationId === organizationId");
  });

  it("doctor online-intake routes scope reads and writes to the selected workspace", () => {
    for (const file of [
      "src/app/api/doctor/online-intake/route.ts",
      "src/app/api/doctor/online-intake/[id]/route.ts",
      "src/app/api/doctor/online-intake/stats/route.ts",
      "src/app/api/doctor/online-intake/[id]/reply/route.ts",
      "src/app/api/doctor/online-intake/[id]/status/route.ts",
    ]) {
      const src = readSource(file);
      expect(src).toContain("requireDoctorWorkspaceApiContext");
      expect(src).toContain("withDoctorWorkspacePrincipal");
    }

    const replyRoute = readSource("src/app/api/doctor/online-intake/[id]/reply/route.ts");
    expect(replyRoute).toContain("intake.organizationId !== gate.ctx.organizationId");
    expect(replyRoute).toContain("getClientIdentityForOrganization");

    const statusRoute = readSource("src/app/api/doctor/online-intake/[id]/status/route.ts");
    expect(statusRoute).toContain("intake.organizationId !== gate.ctx.organizationId");

    const repo = readSource("src/infra/repos/pgOnlineIntake.ts");
    expect(repo).toContain("getCurrentDbPrincipalOrganizationId");
    expect(repo).toContain("currentWriteOrganizationId");
    expect(repo).toContain("organization_principal_mismatch");
    expect(repo).toContain("organization_id, from_status, to_status");
  });

  it("doctor client-card schedule and booking writes use selected workspace organization", () => {
    const bookingProfileRoute = readSource("src/app/api/doctor/clients/[userId]/booking-profile/route.ts");
    expect(bookingProfileRoute).not.toContain("getDefaultOrganizationId");
    expect(bookingProfileRoute).toContain("organizationId: gate.ctx.organizationId");
    expect(bookingProfileRoute).toContain("getBookingProfile(gate.ctx.organizationId, userId)");

    const warmupRoute = readSource("src/app/api/doctor/clients/[userId]/warmup-schedule/route.ts");
    expect(warmupRoute).toContain("deps.reminders.listRulesByUser(userId)");
    expect(warmupRoute).toContain("deps.reminders.updateRule(userId, warmupRule.id");
    expect(warmupRoute).toContain("withDoctorWorkspacePrincipal(gate.ctx");

    const reminderRulesRepo = readSource("src/infra/repos/pgReminderRules.ts");
    expect(reminderRulesRepo).toContain("getCurrentDbPrincipalOrganizationId");
    expect(reminderRulesRepo).toContain("ruleOrgScopeSql");
    expect(reminderRulesRepo).toContain("organization_id = COALESCE(organization_id");

    const symptomDiaryRepo = readSource("src/infra/repos/pgSymptomDiary.ts");
    expect(symptomDiaryRepo).toContain("getCurrentDbPrincipalOrganizationId");
    expect(symptomDiaryRepo).toContain("organization_id");
  });
});
