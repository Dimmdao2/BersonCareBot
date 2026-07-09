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

const patientBoundReadRouteFiles = [
  "src/app/api/doctor/clients/[userId]/notes/route.ts",
  "src/app/api/doctor/clients/[userId]/support-settings/route.ts",
  "src/app/api/doctor/clients/[userId]/tasks/route.ts",
  "src/app/api/doctor/clients/[userId]/tasks/summary/route.ts",
  "src/app/api/doctor/clients/[userId]/treatment-program-instances/route.ts",
  "src/app/api/doctor/clients/[userId]/program-day-activity/route.ts",
  "src/app/api/doctor/clients/[userId]/lfk-complex-exercises/[exerciseRowId]/route.ts",
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

  it.each(patientBoundReadRouteFiles)("%s resolves patient-bound access through the selected workspace", (file) => {
    const src = readSource(file);
    expect(src).toContain("requireDoctorWorkspaceApiContext");
    expect(src).toContain("getClientIdentityForOrganization");
    expect(src).toContain("gate.ctx.organizationId");
    expect(src).not.toContain("getCurrentSession");
    expect(src).not.toContain("canAccessDoctor");
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

  it("doctor global client lifecycle routes require selected workspace membership before global writes", () => {
    for (const file of [
      "src/app/api/doctor/clients/[userId]/block/route.ts",
      "src/app/api/doctor/clients/[userId]/archive/route.ts",
      "src/app/api/doctor/clients/[userId]/permanent-delete/route.ts",
      "src/app/api/doctor/patients/[userId]/email-change/route.ts",
    ]) {
      const src = readSource(file);
      expect(src).toContain("requireDoctorWorkspaceApiContext");
      expect(src).toContain("getClientIdentityForOrganization");
      expect(src).toContain("gate.ctx.organizationId");
    }

    const purgeRoute = readSource("src/app/api/doctor/clients/[userId]/permanent-delete/route.ts");
    expect(purgeRoute).toContain("requireAdminModeSession");
    expect(purgeRoute).toContain("const targetUserId = identityInWorkspace.userId");
    expect(purgeRoute).toContain("targetId: targetUserId");
    expect(purgeRoute.indexOf("getClientIdentityForOrganization")).toBeLessThan(
      purgeRoute.indexOf("runStrictPurgePlatformUser({"),
    );

    const emailRoute = readSource("src/app/api/doctor/patients/[userId]/email-change/route.ts");
    expect(emailRoute).toContain("withDoctorWorkspacePrincipal");
    expect(emailRoute).toContain("startEmailChallenge(identity.userId");
    expect(emailRoute).toContain("getPendingEmailChallenge(identity.userId)");
  });

  it("doctor global patient profile routes require selected workspace membership before global profile writes", () => {
    for (const file of [
      "src/app/api/doctor/patients/[userId]/route.ts",
      "src/app/api/doctor/patients/[userId]/fio/route.ts",
      "src/app/api/doctor/patients/[userId]/physical/route.ts",
    ]) {
      const src = readSource(file);
      expect(src).toContain("requireDoctorWorkspaceApiContext");
      expect(src).toContain("getClientIdentityForOrganization");
      expect(src).toContain("withDoctorWorkspacePrincipal");
      expect(src).toContain("gate.ctx.organizationId");
    }
  });

  it("doctor clinical core routes require selected workspace membership and principal context", () => {
    for (const file of [
      "src/app/api/doctor/patients/[userId]/clinical/route.ts",
      "src/app/api/doctor/patients/[userId]/anamnesis/route.ts",
      "src/app/api/doctor/patients/[userId]/visits/route.ts",
      "src/app/api/doctor/patients/[userId]/visits/[visitId]/route.ts",
      "src/app/api/doctor/patients/[userId]/complaints/[complaintId]/route.ts",
      "src/app/api/doctor/patients/[userId]/diagnoses/[diagnosisId]/route.ts",
      "src/app/api/doctor/patients/[userId]/diagnoses/[diagnosisId]/status/route.ts",
    ]) {
      const src = readSource(file);
      expect(src).toContain("requireDoctorWorkspaceApiContext");
      expect(src).toContain("getClientIdentityForOrganization");
      expect(src).toContain("withDoctorWorkspacePrincipal");
      expect(src).toContain("gate.ctx.organizationId");
      expect(src).toContain("identity.userId");
    }
  });

  it("patient clinical repo stamps and checks organization principal for clinical writes", () => {
    const src = readSource("src/infra/repos/pgPatientClinical.ts");
    expect(src).toContain("getCurrentDbPrincipalOrganizationId");
    expect(src).toContain("runDrizzleMutationTransaction");
    expect(src).toContain("currentWriteOrganizationId");
    expect(src).toContain("organization_principal_mismatch");
    expect(src).toContain("organizationId");
    expect(src).toContain("clinical_target_not_found");
    expect(src).toContain("ar.platform_user_id = pu.id");
    expect(src).toContain("user_phone_history");
    expect(src).toContain("getDiagnosisStatusHistory(");
    expect(src).toContain("eq(clinicalDiagnosis.patientUserId, patientUserId)");
  });

  it("doctor diagnosis catalog route and repo use selected workspace principal", () => {
    const route = readSource("src/app/api/doctor/patients/[userId]/diagnosis-catalog/route.ts");
    expect(route).toContain("requireDoctorWorkspaceApiContext");
    expect(route).toContain("getClientIdentityForOrganization");
    expect(route).toContain("withDoctorWorkspacePrincipal");
    expect(route).toContain("gate.ctx.organizationId");

    const repo = readSource("src/infra/repos/pgPatientClinical.ts");
    expect(repo).toContain("eq(clinicalDiagnosisCatalog.organizationId, organizationId)");
    expect(repo).toContain("insert(clinicalDiagnosisCatalog)");
    expect(repo).toContain("organizationId,");
  });

  it("doctor patient card SSR clinical reads run under selected workspace principal", () => {
    const src = readSource("src/app/app/doctor/patients/[userId]/page.tsx");
    expect(src).toContain("requireDoctorWorkspaceContext");
    expect(src).toContain("getClientIdentityForOrganization");
    expect(src).toContain("workspace.organizationId");
    expect(src).toContain("const patientUserId = identity.userId");
    expect(src).toContain("withDoctorWorkspacePrincipal(workspace, () => deps.patientClinical.getClinicalState(patientUserId))");
    expect(src).toContain("withDoctorWorkspacePrincipal(workspace, () => deps.patientClinical.listVisits(patientUserId))");
    expect(src).toContain("withDoctorWorkspacePrincipal(workspace, () => deps.patientClinical.getAnamnesis(patientUserId))");
    expect(src).toContain("withDoctorWorkspacePrincipal(workspace, () => deps.patientComorbidities.listActive(patientUserId))");
  });

  it("doctor patient comorbidity routes require selected workspace membership and principal context", () => {
    for (const file of [
      "src/app/api/doctor/patients/[userId]/comorbidities/route.ts",
      "src/app/api/doctor/patients/[userId]/comorbidities/[comorbidityId]/route.ts",
    ]) {
      const src = readSource(file);
      expect(src).toContain("requireDoctorWorkspaceApiContext");
      expect(src).toContain("getClientIdentityForOrganization");
      expect(src).toContain("withDoctorWorkspacePrincipal");
      expect(src).toContain("gate.ctx.organizationId");
      expect(src).toContain("identity.userId");
    }
  });

  it("doctor patient file routes and SSR preload require selected workspace membership and principal context", () => {
    for (const file of [
      "src/app/api/doctor/patients/[userId]/files/route.ts",
      "src/app/api/doctor/patients/[userId]/files/[fileId]/route.ts",
    ]) {
      const src = readSource(file);
      expect(src).toContain("requireDoctorWorkspaceApiContext");
      expect(src).toContain("getClientIdentityForOrganization");
      expect(src).toContain("withDoctorWorkspacePrincipal");
      expect(src).toContain("gate.ctx.organizationId");
      expect(src).toContain("identity.userId");
    }

    const page = readSource("src/app/app/doctor/patients/[userId]/page.tsx");
    expect(page).toContain("withDoctorWorkspacePrincipal(workspace, () => deps.patientFiles.listFiles(patientUserId))");
  });

  it("patient files and client media folder repos use organization principal for file/folder rows", () => {
    const filesRepo = readSource("src/infra/repos/pgPatientFiles.ts");
    expect(filesRepo).toContain("getCurrentDbPrincipalOrganizationId");
    expect(filesRepo).toContain("runDrizzleMutationTransaction");
    expect(filesRepo).toContain("currentPrincipalOrganizationId");
    expect(filesRepo).toContain("currentWriteOrganizationId");
    expect(filesRepo).toContain("organization_principal_mismatch");
    expect(filesRepo).toContain("organization_principal_required");
    expect(filesRepo).toContain("patient_file_visit_patient_mismatch");
    expect(filesRepo).toContain("organizationId,");

    const folderRepo = readSource("src/infra/repos/pgClientMediaFolders.ts");
    expect(folderRepo).toContain("getCurrentDbPrincipalOrganizationId");
    expect(folderRepo).toContain("folderOrgScopeCondition");
    expect(folderRepo).toContain("currentOrganizationValues");
    expect(folderRepo).toContain("organizationId");
    expect(folderRepo).toContain("folderOrgScopeCondition(),");
  });

  it("doctor patient payment routes, repo, and SSR preload use selected workspace principal", () => {
    for (const file of [
      "src/app/api/doctor/patients/[userId]/payments/route.ts",
      "src/app/api/doctor/patients/[userId]/payment-timeline/route.ts",
      "src/app/api/doctor/patients/[userId]/acquiring-charge/route.ts",
    ]) {
      const src = readSource(file);
      expect(src).toContain("requireDoctorWorkspaceApiContext");
      expect(src).toContain("getClientIdentityForOrganization");
      expect(src).toContain("gate.ctx.organizationId");
      expect(src).toContain("identity.userId");
    }

    const paymentsRoute = readSource("src/app/api/doctor/patients/[userId]/payments/route.ts");
    expect(paymentsRoute).toContain("withDoctorWorkspacePrincipal");
    expect(paymentsRoute).toContain("deps.patientPayments.listPaymentsWithSummary(identity.userId)");
    expect(paymentsRoute).toContain("patientUserId: identity.userId");

    const timelineRoute = readSource("src/app/api/doctor/patients/[userId]/payment-timeline/route.ts");
    expect(timelineRoute).toContain("withDoctorWorkspacePrincipal");
    expect(timelineRoute).toContain("deps.patientPayments.listPayments(identity.userId)");
    expect(timelineRoute).toContain("listPaymentHistoryForUser(identity.userId, gate.ctx.organizationId)");

    const acquiringRoute = readSource("src/app/api/doctor/patients/[userId]/acquiring-charge/route.ts");
    expect(acquiringRoute).toContain("patientUserId: identity.userId");
    expect(acquiringRoute).toContain("deps.acquiringGateway.createCharge");
    expect(acquiringRoute.indexOf("getClientIdentityForOrganization")).toBeLessThan(
      acquiringRoute.indexOf("deps.acquiringGateway.createCharge"),
    );

    const repo = readSource("src/infra/repos/pgPatientPayments.ts");
    expect(repo).toContain("getCurrentDbPrincipalOrganizationId");
    expect(repo).toContain("organization_principal_required");
    expect(repo).toContain("eq(patientPayment.organizationId, organizationId)");
    expect(repo).toContain("runWithDbOrganizationPrincipal(organizationId");

    const page = readSource("src/app/app/doctor/patients/[userId]/page.tsx");
    expect(page).toContain("withDoctorWorkspacePrincipal(workspace, () => deps.patientPayments.listPaymentsWithSummary(patientUserId))");
    expect(page).toContain("listPaymentHistoryForUser(patientUserId, workspace.organizationId)");
    expect(page).toContain("listPatientPackagesForUser(patientUserId, workspace.organizationId)");
  });

  it("doctor patient adjunct read routes use selected workspace membership and canonical patient id", () => {
    for (const file of [
      "src/app/api/doctor/patients/[userId]/appointments/route.ts",
      "src/app/api/doctor/patients/[userId]/appointments/unlinked/route.ts",
      "src/app/api/doctor/patients/[userId]/exercise-calendar/route.ts",
      "src/app/api/doctor/patients/[userId]/program-activity/route.ts",
      "src/app/api/doctor/patients/[userId]/proactive-insights/route.ts",
      "src/app/api/doctor/clients/[userId]/history/route.ts",
    ]) {
      const src = readSource(file);
      expect(src).toContain("requireDoctorWorkspaceApiContext");
      expect(src).toContain("getClientIdentityForOrganization");
      expect(src).toContain("gate.ctx.organizationId");
      expect(src).toContain("identity.userId");
      expect(src).not.toContain("requireDoctorApiSession");
      expect(src).not.toContain("getDefaultOrganizationId");
    }

    const unlinkedRoute = readSource("src/app/api/doctor/patients/[userId]/appointments/unlinked/route.ts");
    expect(unlinkedRoute).toContain("withDoctorWorkspacePrincipal");
    expect(unlinkedRoute).toContain("listLinkedAppointmentRecordIds(identity.userId)");

    const appointmentsRoute = readSource("src/app/api/doctor/patients/[userId]/appointments/route.ts");
    expect(appointmentsRoute).toContain("listPatientAppointments(");
    expect(appointmentsRoute).toContain("gate.ctx.organizationId");
    const exerciseRoute = readSource("src/app/api/doctor/patients/[userId]/exercise-calendar/route.ts");
    expect(exerciseRoute).toContain("organizationId: gate.ctx.organizationId");
    expect(exerciseRoute).toContain("listByUserInUtcRange(");
    const programActivityRoute = readSource("src/app/api/doctor/patients/[userId]/program-activity/route.ts");
    expect(programActivityRoute).toContain("organizationId: gate.ctx.organizationId");
    const proactiveRoute = readSource("src/app/api/doctor/patients/[userId]/proactive-insights/route.ts");
    expect(proactiveRoute).toContain("organizationId: gate.ctx.organizationId");

    const doctorClientsRepo = readSource("src/infra/repos/pgDoctorClients.ts");
    expect(doctorClientsRepo).toContain("listPatientAppointments(userId: string, organizationId?: string)");
    expect(doctorClientsRepo).toContain("bea_scope.organization_id = $2::uuid");
    const patientPracticeRepo = readSource("src/infra/repos/pgPatientPracticeCompletions.ts");
    expect(patientPracticeRepo).toContain("eq(patientPracticeCompletions.organizationId, organizationId)");
    const programActionLogRepo = readSource("src/infra/repos/pgProgramActionLog.ts");
    expect(programActionLogRepo).toContain("eq(logTable.organizationId, params.organizationId)");
    const programItemDiscussionRepo = readSource("src/infra/repos/pgProgramItemDiscussion.ts");
    expect(programItemDiscussionRepo).toContain("eq(treatmentProgramInstances.organizationId, organizationId)");
    const proactiveRepo = readSource("src/infra/repos/pgDoctorProactiveInsights.ts");
    expect(proactiveRepo).toContain("dps.organization_id = $2::uuid");
    expect(proactiveRepo).toContain("tpi.organization_id = $2::uuid");

    const clinicalRepo = readSource("src/infra/repos/pgPatientClinical.ts");
    expect(clinicalRepo).toContain("listLinkedAppointmentRecordIds(patientUserId");
    expect(clinicalRepo).toContain("requiredPrincipalOrganizationId()");
    expect(clinicalRepo).toContain("organization_principal_required");
    expect(clinicalRepo).toContain("eq(clinicalVisit.organizationId, organizationId)");
  });

  it("patient comorbidities repo stamps and checks organization principal for comorbidity writes", () => {
    const src = readSource("src/infra/repos/pgPatientComorbidities.ts");
    expect(src).toContain("getCurrentDbPrincipalOrganizationId");
    expect(src).toContain("runDrizzleMutationTransaction");
    expect(src).toContain("currentPrincipalOrganizationId");
    expect(src).toContain("currentWriteOrganizationId");
    expect(src).toContain("organization_principal_mismatch");
    expect(src).toContain("organization_principal_required");
    expect(src).toContain("const organizationId = currentWriteOrganizationId");
    expect(src).toContain("organizationId,");
  });

  it("doctor supplementary contact routes require selected workspace membership before contact operations", () => {
    for (const file of [
      "src/app/api/doctor/clients/[userId]/supplementary-contacts/route.ts",
      "src/app/api/doctor/clients/[userId]/supplementary-contacts/[contactId]/route.ts",
    ]) {
      const src = readSource(file);
      expect(src).toContain("requireDoctorWorkspaceApiContext");
      expect(src).toContain("getClientIdentityForOrganization");
      expect(src).toContain("withDoctorWorkspacePrincipal");
      expect(src).toContain("gate.ctx.organizationId");
    }
  });
});
