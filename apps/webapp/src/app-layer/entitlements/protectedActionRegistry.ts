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

/**
 * S4-0's method-level inventory. `file` is relative to apps/webapp and the
 * checker proves the named export and the selected guard in that source.
 */
export const PROTECTED_ACTION_MAPPINGS = [
  { id: "courses.create", mechanic: "courses", file: "src/app/api/doctor/courses/route.ts", exportName: "POST", method: "POST", authContext: "requireDoctorWorkspaceApiContext", guard: "requireEntitlement", serviceBoundary: "deps.courses.createCourse" },
  { id: "mailings.execute", mechanic: "mailings", file: "src/app/app/doctor/broadcasts/actions.ts", exportName: "executeBroadcastAction", method: "action", authContext: "requireDoctorWorkspaceContext", guard: "requireEntitlementForAction", serviceBoundary: "deps.doctorBroadcasts.execute" },
  { id: "cms-pages.save", mechanic: "cms_pages", file: "src/app/app/doctor/content/actions.ts", exportName: "saveContentPage", method: "action", authContext: "requireDoctorWorkspaceContext", guard: "requireEntitlementForAction", serviceBoundary: "deps.contentPages.updateFull/upsert" },
  { id: "cms-pages.lifecycle", mechanic: "cms_pages", file: "src/app/app/doctor/content/lifecycleActions.ts", exportName: "applyContentLifecycle", method: "action", authContext: "requireDoctorWorkspaceContext", guard: "requireEntitlementForAction", serviceBoundary: "deps.contentPages.updateLifecycle" },
  { id: "cms-sections.save", mechanic: "cms_pages", file: "src/app/app/doctor/content/sections/actions.ts", exportName: "saveContentSection", method: "action", authContext: "requireDoctorWorkspaceContext", guard: "requireEntitlementForAction", serviceBoundary: "deps.contentSections.upsert" },
  { id: "cms-sections.delete", mechanic: "cms_pages", file: "src/app/app/doctor/content/sections/actions.ts", exportName: "deleteContentSection", method: "action", authContext: "requireDoctorWorkspaceContext", guard: "requireEntitlementForAction", serviceBoundary: "deps.contentSections.deleteSectionWithPageReassign" },
  { id: "subscriptions.patient-package.create", mechanic: "subscriptions", file: "src/app/api/doctor/booking-engine/patient-packages/route.ts", exportName: "POST", method: "POST", authContext: "requireDoctorBookingEngine", guard: "requireEntitlement", serviceBoundary: "deps.memberships.createManualPatientPackage/offerCatalogPackageToPatient" },
  { id: "patient-card.visits.create", mechanic: "patient_card", file: "src/app/api/doctor/patients/[userId]/visits/route.ts", exportName: "POST", method: "POST", authContext: "requireDoctorWorkspaceApiContext", guard: "requireEntitlement", serviceBoundary: "deps.patientClinical.createVisit" },
  { id: "patient-card.anamnesis.create", mechanic: "patient_card", file: "src/app/api/doctor/patients/[userId]/anamnesis/route.ts", exportName: "POST", method: "POST", authContext: "requireDoctorWorkspaceApiContext", guard: "requireEntitlement", serviceBoundary: "deps.patientClinical.appendAnamnesis*" },
  { id: "patient-card.complaints.update", mechanic: "patient_card", file: "src/app/api/doctor/patients/[userId]/complaints/[complaintId]/route.ts", exportName: "PATCH", method: "PATCH", authContext: "requireDoctorWorkspaceApiContext", guard: "requireEntitlement", serviceBoundary: "deps.patientClinical.updateComplaintFields" },
  { id: "patient-card.diagnoses.update", mechanic: "patient_card", file: "src/app/api/doctor/patients/[userId]/diagnoses/[diagnosisId]/route.ts", exportName: "PATCH", method: "PATCH", authContext: "requireDoctorWorkspaceApiContext", guard: "requireEntitlement", serviceBoundary: "deps.patientClinical.updateDiagnosisFields" },
  { id: "files.patient-file.create", mechanic: "files", file: "src/app/api/doctor/patients/[userId]/files/route.ts", exportName: "POST", method: "POST", authContext: "requireDoctorWorkspaceApiContext", guard: "requireEntitlement", serviceBoundary: "deps.patientFiles.createFile" },
  { id: "booking.branch.create", mechanic: "booking", file: "src/app/api/admin/booking-engine/branches/route.ts", exportName: "POST", method: "POST", authContext: "requireClinicManagementBookingEngine", guard: "requireEntitlement", serviceBoundary: "gate.ctx.service.catalog.upsertBranch" },
  { id: "booking.service.create", mechanic: "booking", file: "src/app/api/admin/booking-engine/services/route.ts", exportName: "POST", method: "POST", authContext: "requireClinicManagementBookingEngine", guard: "requireEntitlement", serviceBoundary: "gate.ctx.service.services.upsertService" },
  { id: "booking.slot.create", mechanic: "booking", file: "src/app/api/admin/booking-engine/schedule-blocks/route.ts", exportName: "POST", method: "POST", authContext: "requireAdminBookingEngine", guard: "requireEntitlement", serviceBoundary: "bookingScheduling.createScheduleBlock" },
  { id: "payments.booking-settings.patch", mechanic: "payments", file: "src/app/api/admin/settings/route.ts", exportName: "PATCH", method: "PATCH", authContext: "requireClinicManagementApiContext", guard: "requireEntitlement", serviceBoundary: "deps.systemSettings.updateSetting" },
] as const satisfies readonly ProtectedActionMapping[];

export const DECLARED_NO_SURFACE = {
  exercise_catalog: "S4-3/C5D deferred; no protected write surface in this stage",
  exercise_packages: "S4-3/C5D deferred; no protected write surface in this stage",
  patient_app: "code-search: no patient_app_enabled/toggle action",
  patient_app_paid_subscription: "code-search: no subscription-toggle action",
  branding: "code-search: no branding write action",
  custom_domain: "code-search: no custom-domain write action",
} as const satisfies Partial<Record<OrgMechanic, string>>;
