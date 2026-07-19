import type { OrgMechanic } from "@/modules/org-entitlements/types";

export type ProtectedActionMapping = Readonly<{
  id: string;
  mechanic: OrgMechanic;
  file: string;
  exportName: string;
  method: string;
  authContext: string;
  guard: "requireEntitlement" | "requireEntitlementForAction";
  serviceBoundary: string;
}>;

export type ProtectedActionExemption = Readonly<{
  file: string;
  exportName: string;
  reason: string;
}>;

/**
 * S4-0's method-level inventory. `file` is relative to apps/webapp and the
 * checker proves the named export and the selected guard in that source.
 */
export const PROTECTED_ACTION_MAPPINGS = [
  { id: "courses.list", mechanic: "courses", file: "src/app/api/doctor/courses/route.ts", exportName: "GET", method: "GET", authContext: "requireDoctorWorkspaceApiContext", guard: "requireEntitlement", serviceBoundary: "deps.courses.listCoursesForDoctor" },
  { id: "courses.create", mechanic: "courses", file: "src/app/api/doctor/courses/route.ts", exportName: "POST", method: "POST", authContext: "requireDoctorWorkspaceApiContext", guard: "requireEntitlement", serviceBoundary: "deps.courses.createCourse" },
  { id: "courses.get", mechanic: "courses", file: "src/app/api/doctor/courses/[id]/route.ts", exportName: "GET", method: "GET", authContext: "requireDoctorWorkspaceApiContext", guard: "requireEntitlement", serviceBoundary: "deps.courses.getCourseForDoctor" },
  { id: "courses.update", mechanic: "courses", file: "src/app/api/doctor/courses/[id]/route.ts", exportName: "PATCH", method: "PATCH", authContext: "requireDoctorWorkspaceApiContext", guard: "requireEntitlement", serviceBoundary: "deps.courses.updateCourse" },
  { id: "courses.usage", mechanic: "courses", file: "src/app/api/doctor/courses/[id]/usage/route.ts", exportName: "GET", method: "GET", authContext: "requireDoctorWorkspaceApiContext", guard: "requireEntitlement", serviceBoundary: "deps.courses.getCourseUsage" },
  { id: "courses.patient.list", mechanic: "courses", file: "src/app/api/patient/courses/route.ts", exportName: "GET", method: "GET", authContext: "requirePatientApiBusinessAccess + resolvePatientEnrollmentOrganizationId", guard: "requireEntitlement", serviceBoundary: "deps.courses.listAssignedForPatient" },
  { id: "courses.patient.enroll", mechanic: "courses", file: "src/app/api/patient/courses/[courseId]/enroll/route.ts", exportName: "POST", method: "POST", authContext: "requirePatientApiBusinessAccess + resolvePatientEnrollmentOrganizationId", guard: "requireEntitlement", serviceBoundary: "deps.courses.enrollPatient" },
  { id: "mailings.execute", mechanic: "mailings", file: "src/app/app/doctor/broadcasts/actions.ts", exportName: "executeBroadcastAction", method: "action", authContext: "requireDoctorWorkspaceContext", guard: "requireEntitlementForAction", serviceBoundary: "deps.doctorBroadcasts.execute" },
  { id: "cms-pages.save", mechanic: "cms_pages", file: "src/app/app/doctor/content/actions.ts", exportName: "saveContentPage", method: "action", authContext: "requireDoctorWorkspaceContext", guard: "requireEntitlementForAction", serviceBoundary: "deps.contentPages.updateFull/upsert" },
  { id: "cms-pages.lifecycle", mechanic: "cms_pages", file: "src/app/app/doctor/content/lifecycleActions.ts", exportName: "applyContentLifecycle", method: "action", authContext: "requireDoctorWorkspaceContext", guard: "requireEntitlementForAction", serviceBoundary: "deps.contentPages.updateLifecycle" },
  { id: "cms-sections.save", mechanic: "cms_pages", file: "src/app/app/doctor/content/sections/actions.ts", exportName: "saveContentSection", method: "action", authContext: "requireDoctorWorkspaceContext", guard: "requireEntitlementForAction", serviceBoundary: "deps.contentSections.upsert" },
  { id: "cms-sections.attach", mechanic: "cms_pages", file: "src/app/app/doctor/content/sections/actions.ts", exportName: "attachArticleSectionToSystemFolder", method: "action", authContext: "requireDoctorWorkspaceContext", guard: "requireEntitlementForAction", serviceBoundary: "deps.contentSections.update" },
  { id: "cms-sections.rename", mechanic: "cms_pages", file: "src/app/app/doctor/content/sections/actions.ts", exportName: "renameContentSectionSlug", method: "action", authContext: "requireDoctorWorkspaceContext", guard: "requireEntitlementForAction", serviceBoundary: "deps.contentSections.renameSectionSlug" },
  { id: "cms-sections.delete", mechanic: "cms_pages", file: "src/app/app/doctor/content/sections/actions.ts", exportName: "deleteContentSection", method: "action", authContext: "requireDoctorWorkspaceContext", guard: "requireEntitlementForAction", serviceBoundary: "deps.contentSections.deleteSectionWithPageReassign" },
  { id: "subscriptions.patient-package.create", mechanic: "subscriptions", file: "src/app/api/doctor/booking-engine/patient-packages/route.ts", exportName: "POST", method: "POST", authContext: "requireDoctorBookingEngine", guard: "requireEntitlement", serviceBoundary: "deps.memberships.createManualPatientPackage/offerCatalogPackageToPatient" },
  { id: "patient-card.visits.create", mechanic: "patient_card", file: "src/app/api/doctor/patients/[userId]/visits/route.ts", exportName: "POST", method: "POST", authContext: "requireDoctorWorkspaceApiContext", guard: "requireEntitlement", serviceBoundary: "deps.patientClinical.createVisit" },
  { id: "patient-card.anamnesis.create", mechanic: "patient_card", file: "src/app/api/doctor/patients/[userId]/anamnesis/route.ts", exportName: "POST", method: "POST", authContext: "requireDoctorWorkspaceApiContext", guard: "requireEntitlement", serviceBoundary: "deps.patientClinical.appendAnamnesis*" },
  { id: "patient-card.complaints.update", mechanic: "patient_card", file: "src/app/api/doctor/patients/[userId]/complaints/[complaintId]/route.ts", exportName: "PATCH", method: "PATCH", authContext: "requireDoctorWorkspaceApiContext", guard: "requireEntitlement", serviceBoundary: "deps.patientClinical.updateComplaintFields" },
  { id: "patient-card.diagnoses.update", mechanic: "patient_card", file: "src/app/api/doctor/patients/[userId]/diagnoses/[diagnosisId]/route.ts", exportName: "PATCH", method: "PATCH", authContext: "requireDoctorWorkspaceApiContext", guard: "requireEntitlement", serviceBoundary: "deps.patientClinical.updateDiagnosisFields" },
  { id: "patient-card.visits.update", mechanic: "patient_card", file: "src/app/api/doctor/patients/[userId]/visits/[visitId]/route.ts", exportName: "PATCH", method: "PATCH", authContext: "requireDoctorWorkspaceApiContext", guard: "requireEntitlement", serviceBoundary: "deps.patientClinical.updateVisitFields" },
  { id: "patient-card.diagnoses.status.update", mechanic: "patient_card", file: "src/app/api/doctor/patients/[userId]/diagnoses/[diagnosisId]/status/route.ts", exportName: "PATCH", method: "PATCH", authContext: "requireDoctorWorkspaceApiContext", guard: "requireEntitlement", serviceBoundary: "deps.patientClinical.setDiagnosisClinicalStatus" },
  { id: "patient-card.physical.update", mechanic: "patient_card", file: "src/app/api/doctor/patients/[userId]/physical/route.ts", exportName: "PATCH", method: "PATCH", authContext: "requireDoctorWorkspaceApiContext", guard: "requireEntitlement", serviceBoundary: "deps.doctorClients.setPatientPhysical" },
  { id: "patient-card.comorbidities.create", mechanic: "patient_card", file: "src/app/api/doctor/patients/[userId]/comorbidities/route.ts", exportName: "POST", method: "POST", authContext: "requireDoctorWorkspaceApiContext", guard: "requireEntitlement", serviceBoundary: "deps.patientComorbidities.add" },
  { id: "patient-card.comorbidities.update", mechanic: "patient_card", file: "src/app/api/doctor/patients/[userId]/comorbidities/[comorbidityId]/route.ts", exportName: "PATCH", method: "PATCH", authContext: "requireDoctorWorkspaceApiContext", guard: "requireEntitlement", serviceBoundary: "deps.patientComorbidities.editText/restore" },
  { id: "patient-card.comorbidities.remove", mechanic: "patient_card", file: "src/app/api/doctor/patients/[userId]/comorbidities/[comorbidityId]/route.ts", exportName: "DELETE", method: "DELETE", authContext: "requireDoctorWorkspaceApiContext", guard: "requireEntitlement", serviceBoundary: "deps.patientComorbidities.markRemoved (soft removal)" },
  { id: "files.patient-file.create", mechanic: "files", file: "src/app/api/doctor/patients/[userId]/files/route.ts", exportName: "POST", method: "POST", authContext: "requireDoctorWorkspaceApiContext", guard: "requireEntitlement", serviceBoundary: "deps.patientFiles.createFile" },
  { id: "files.patient-file.update", mechanic: "files", file: "src/app/api/doctor/patients/[userId]/files/[fileId]/route.ts", exportName: "PATCH", method: "PATCH", authContext: "requireDoctorWorkspaceApiContext", guard: "requireEntitlement", serviceBoundary: "deps.patientFiles.linkFileToVisit/renameFile" },
  { id: "booking.branch.create", mechanic: "booking", file: "src/app/api/admin/booking-engine/branches/route.ts", exportName: "POST", method: "POST", authContext: "requireClinicManagementBookingEngine", guard: "requireEntitlement", serviceBoundary: "gate.ctx.service.catalog.upsertBranch" },
  { id: "booking.service.create", mechanic: "booking", file: "src/app/api/admin/booking-engine/services/route.ts", exportName: "POST", method: "POST", authContext: "requireClinicManagementBookingEngine", guard: "requireEntitlement", serviceBoundary: "gate.ctx.service.services.upsertService" },
  { id: "booking.slot.create", mechanic: "booking", file: "src/app/api/admin/booking-engine/schedule-blocks/route.ts", exportName: "POST", method: "POST", authContext: "requireAdminBookingEngine", guard: "requireEntitlement", serviceBoundary: "bookingScheduling.createScheduleBlock" },
  { id: "payments.booking-settings.patch", mechanic: "payments", file: "src/app/api/admin/settings/route.ts", exportName: "PATCH", method: "PATCH", authContext: "requireClinicManagementApiContext", guard: "requireEntitlement", serviceBoundary: "deps.systemSettings.updateSetting" },
  { id: "clinic-team.invites.list", mechanic: "clinic_team", file: "src/app/api/clinic/invites/route.ts", exportName: "GET", method: "GET", authContext: "requireClinicManagementApiContext", guard: "requireEntitlement", serviceBoundary: "deps.organizationInvites.listPending/deps.clinicSeats.getSeatStatus" },
  { id: "clinic-team.invites.create", mechanic: "clinic_team", file: "src/app/api/clinic/invites/route.ts", exportName: "POST", method: "POST", authContext: "requireClinicManagementApiContext", guard: "requireEntitlement", serviceBoundary: "deps.organizationInvites.createInvite (atomic seat check inside createReplacingPending)" },
  { id: "clinic-team.invites.revoke", mechanic: "clinic_team", file: "src/app/api/clinic/invites/[id]/route.ts", exportName: "DELETE", method: "DELETE", authContext: "requireClinicManagementApiContext", guard: "requireEntitlement", serviceBoundary: "deps.organizationInvites.revokeInvite" },
  { id: "clinic-team.members.list", mechanic: "clinic_team", file: "src/app/api/clinic/members/route.ts", exportName: "GET", method: "GET", authContext: "requireClinicManagementApiContext", guard: "requireEntitlement", serviceBoundary: "deps.organizationMembership.listOrganizationMembers/deps.clinicSeats.getSeatStatus" },
] as const satisfies readonly ProtectedActionMapping[];

/**
 * Every exported handler/action in a declared mechanic-bearing file is either
 * protected above or deliberately exempted here. This is an inventory
 * guarantee, not an attempt to infer arbitrary future business semantics.
 */
export const PROTECTED_ACTION_EXEMPTIONS = [
  { file: "src/app/app/doctor/broadcasts/actions.ts", exportName: "previewBroadcastAction", reason: "non-mutating preview" },
  { file: "src/app/app/doctor/broadcasts/actions.ts", exportName: "listBroadcastAuditAction", reason: "read action" },
  { file: "src/app/app/doctor/broadcasts/actions.ts", exportName: "loadDraftAction", reason: "read action" },
  { file: "src/app/app/doctor/broadcasts/actions.ts", exportName: "saveDraftAction", reason: "draft persistence is not the protected mailing execution boundary" },
  { file: "src/app/app/doctor/broadcasts/actions.ts", exportName: "getChannelCountsAction", reason: "read action" },
  { file: "src/app/app/doctor/broadcasts/actions.ts", exportName: "getChannelCountsByAudienceAction", reason: "read action" },
  { file: "src/app/app/doctor/content/lifecycleActions.ts", exportName: "applyContentLifecycleForm", reason: "form wrapper delegates to mapped applyContentLifecycle" },
  { file: "src/app/api/doctor/booking-engine/patient-packages/route.ts", exportName: "GET", reason: "read route" },
  { file: "src/app/api/doctor/patients/[userId]/anamnesis/route.ts", exportName: "GET", reason: "read route" },
  { file: "src/app/api/doctor/patients/[userId]/files/route.ts", exportName: "GET", reason: "read route" },
  { file: "src/app/api/doctor/patients/[userId]/diagnoses/[diagnosisId]/status/route.ts", exportName: "GET", reason: "read status history" },
  { file: "src/app/api/doctor/patients/[userId]/physical/route.ts", exportName: "GET", reason: "read route" },
  { file: "src/app/api/doctor/patients/[userId]/comorbidities/route.ts", exportName: "GET", reason: "read route including removed records for recovery" },
  { file: "src/app/api/doctor/patients/[userId]/files/[fileId]/route.ts", exportName: "GET", reason: "read/download route" },
  { file: "src/app/api/admin/booking-engine/branches/route.ts", exportName: "GET", reason: "read route" },
  { file: "src/app/api/admin/booking-engine/services/route.ts", exportName: "GET", reason: "read route" },
  { file: "src/app/api/admin/booking-engine/schedule-blocks/route.ts", exportName: "GET", reason: "read route" },
  { file: "src/app/api/admin/booking-engine/schedule-blocks/route.ts", exportName: "DELETE", reason: "S4 Phase 2 scopes booking to create only" },
  { file: "src/app/api/admin/settings/route.ts", exportName: "GET", reason: "read route" },
] as const satisfies readonly ProtectedActionExemption[];

export const DECLARED_NO_SURFACE = {
  exercise_catalog: "S4-3/C5D deferred; no protected write surface in this stage",
  exercise_packages: "S4-3/C5D deferred; no protected write surface in this stage",
  patient_app: "code-search: no patient_app_enabled/toggle action",
  patient_app_paid_subscription: "code-search: no subscription-toggle action",
  branding: "code-search: no branding write action",
  custom_domain: "code-search: no custom-domain write action",
} as const satisfies Partial<Record<OrgMechanic, string>>;
