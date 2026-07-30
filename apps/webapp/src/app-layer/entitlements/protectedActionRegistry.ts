import type { OrgMechanic } from '@/modules/org-entitlements/types';

export type ProtectedActionMapping = Readonly<{
  id: string;
  mechanic: OrgMechanic;
  file: string;
  exportName: string;
  method: string;
  authContext: string;
  guard:
    | 'requireEntitlementForRead'
    | 'requireEntitlementForMutation'
    | 'requireEntitlementForReadAction'
    | 'requireEntitlementForMutationAction'
    | 'requireDoctorForPatientHomeRead'
    | 'requireDoctorForPatientHomeMutation';
  serviceBoundary: string;
}>;

export type ProtectedActionExemption = Readonly<{
  file: string;
  exportName: string;
  reason: string;
}>;

export type ProtectedActionFamily = Readonly<{
  id: string;
  root: string;
  recursive: boolean;
  filePattern: string;
}>;

/**
 * S4-0's method-level inventory. `file` is relative to apps/webapp and the
 * checker proves the named export and the selected guard in that source.
 */
export const PROTECTED_ACTION_MAPPINGS = [
  {
    id: 'courses.list',
    mechanic: 'courses',
    file: 'src/app/api/doctor/courses/route.ts',
    exportName: 'GET',
    method: 'GET',
    authContext: 'requireDoctorWorkspaceApiContext',
    guard: 'requireEntitlementForRead',
    serviceBoundary: 'deps.courses.listCoursesForDoctor',
  },
  {
    id: 'courses.create',
    mechanic: 'courses',
    file: 'src/app/api/doctor/courses/route.ts',
    exportName: 'POST',
    method: 'POST',
    authContext: 'requireDoctorWorkspaceApiContext',
    guard: 'requireEntitlementForMutation',
    serviceBoundary: 'deps.courses.createCourse',
  },
  {
    id: 'courses.get',
    mechanic: 'courses',
    file: 'src/app/api/doctor/courses/[id]/route.ts',
    exportName: 'GET',
    method: 'GET',
    authContext: 'requireDoctorWorkspaceApiContext',
    guard: 'requireEntitlementForRead',
    serviceBoundary: 'deps.courses.getCourseForDoctor',
  },
  {
    id: 'courses.update',
    mechanic: 'courses',
    file: 'src/app/api/doctor/courses/[id]/route.ts',
    exportName: 'PATCH',
    method: 'PATCH',
    authContext: 'requireDoctorWorkspaceApiContext',
    guard: 'requireEntitlementForMutation',
    serviceBoundary: 'deps.courses.updateCourse',
  },
  {
    id: 'courses.usage',
    mechanic: 'courses',
    file: 'src/app/api/doctor/courses/[id]/usage/route.ts',
    exportName: 'GET',
    method: 'GET',
    authContext: 'requireDoctorWorkspaceApiContext',
    guard: 'requireEntitlementForRead',
    serviceBoundary: 'deps.courses.getCourseUsage',
  },
  {
    id: 'courses.patient.list',
    mechanic: 'courses',
    file: 'src/app/api/patient/courses/route.ts',
    exportName: 'GET',
    method: 'GET',
    authContext: 'requirePatientApiBusinessAccess + resolvePatientEnrollmentOrganizationId',
    guard: 'requireEntitlementForRead',
    serviceBoundary: 'deps.courses.listAssignedForPatient',
  },
  {
    id: 'courses.patient.enroll',
    mechanic: 'courses',
    file: 'src/app/api/patient/courses/[courseId]/enroll/route.ts',
    exportName: 'POST',
    method: 'POST',
    authContext: 'requirePatientApiBusinessAccess + resolvePatientEnrollmentOrganizationId',
    guard: 'requireEntitlementForMutation',
    serviceBoundary: 'deps.courses.enrollPatient',
  },
  {
    id: 'mailings.execute',
    mechanic: 'mailings',
    file: 'src/app/app/doctor/broadcasts/actions.ts',
    exportName: 'executeBroadcastAction',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireEntitlementForMutationAction',
    serviceBoundary: 'deps.doctorBroadcasts.execute',
  },
  {
    id: 'mailings.draft.save',
    mechanic: 'mailings',
    file: 'src/app/app/doctor/broadcasts/actions.ts',
    exportName: 'saveDraftAction',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireEntitlementForMutationAction',
    serviceBoundary: 'deps.doctorBroadcastComposer.saveDraft',
  },
  {
    id: 'cms-pages.save',
    mechanic: 'cms_pages',
    file: 'src/app/app/doctor/content/actions.ts',
    exportName: 'saveContentPage',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireEntitlementForMutationAction',
    serviceBoundary: 'deps.contentPages.updateFull/upsert',
  },
  {
    id: 'cms-pages.lifecycle',
    mechanic: 'cms_pages',
    file: 'src/app/app/doctor/content/lifecycleActions.ts',
    exportName: 'applyContentLifecycle',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireEntitlementForMutationAction',
    serviceBoundary: 'deps.contentPages.updateLifecycle',
  },
  {
    id: 'cms-pages.requires-auth',
    mechanic: 'cms_pages',
    file: 'src/app/app/doctor/content/contentPageAuthActions.ts',
    exportName: 'setContentPageRequiresAuth',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireEntitlementForMutationAction',
    serviceBoundary: 'deps.contentPages.updateLifecycle',
  },
  {
    id: 'cms-pages.inline-read',
    mechanic: 'cms_pages',
    file: 'src/app/app/doctor/content/inlineEditorActions.ts',
    exportName: 'loadContentPageForInlineEdit',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireEntitlementForReadAction',
    serviceBoundary: 'deps.contentPages.getById',
  },
  {
    id: 'cms-sections.save',
    mechanic: 'cms_pages',
    file: 'src/app/app/doctor/content/sections/actions.ts',
    exportName: 'saveContentSection',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireEntitlementForMutationAction',
    serviceBoundary: 'deps.contentSections.upsert',
  },
  {
    id: 'cms-sections.attach',
    mechanic: 'cms_pages',
    file: 'src/app/app/doctor/content/sections/actions.ts',
    exportName: 'attachArticleSectionToSystemFolder',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireEntitlementForMutationAction',
    serviceBoundary: 'deps.contentSections.update',
  },
  {
    id: 'cms-sections.rename',
    mechanic: 'cms_pages',
    file: 'src/app/app/doctor/content/sections/actions.ts',
    exportName: 'renameContentSectionSlug',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireEntitlementForMutationAction',
    serviceBoundary: 'deps.contentSections.renameSectionSlug',
  },
  {
    id: 'cms-sections.delete',
    mechanic: 'cms_pages',
    file: 'src/app/app/doctor/content/sections/actions.ts',
    exportName: 'deleteContentSection',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireEntitlementForMutationAction',
    serviceBoundary: 'deps.contentSections.deleteSectionWithPageReassign',
  },
  {
    id: 'cms-sections.visibility',
    mechanic: 'cms_pages',
    file: 'src/app/app/doctor/content/sections/sectionVisibilityActions.ts',
    exportName: 'setSectionVisibility',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireEntitlementForMutationAction',
    serviceBoundary: 'deps.contentSections.update',
  },
  {
    id: 'cms-sections.requires-auth',
    mechanic: 'cms_pages',
    file: 'src/app/app/doctor/content/sections/sectionVisibilityActions.ts',
    exportName: 'setSectionRequiresAuth',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireEntitlementForMutationAction',
    serviceBoundary: 'deps.contentSections.update',
  },
  {
    id: 'cms-sections.reorder',
    mechanic: 'cms_pages',
    file: 'src/app/app/doctor/content/sections/reorderContentSections.ts',
    exportName: 'reorderContentSections',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireEntitlementForMutationAction',
    serviceBoundary: 'deps.contentSections.reorderSlugs',
  },
  {
    id: 'cms-pages.reorder',
    mechanic: 'cms_pages',
    file: 'src/app/app/doctor/content/reorderContentPages.ts',
    exportName: 'reorderContentPagesInSection',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireEntitlementForMutationAction',
    serviceBoundary: 'deps.contentPages.reorderInSection',
  },
  {
    id: 'patient-home.blocks',
    mechanic: 'cms_pages',
    file: 'src/app/app/settings/patient-home/actions.ts',
    exportName: 'togglePatientHomeBlockVisibility',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireDoctorForPatientHomeMutation',
    serviceBoundary: 'deps.patientHomeBlocks.*',
  },
  {
    id: 'patient-home.icon',
    mechanic: 'cms_pages',
    file: 'src/app/app/settings/patient-home/actions.ts',
    exportName: 'setPatientHomeBlockIcon',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireDoctorForPatientHomeMutation',
    serviceBoundary: 'deps.patientHomeBlocks.setBlockIcon',
  },
  {
    id: 'patient-home.blocks.reorder',
    mechanic: 'cms_pages',
    file: 'src/app/app/settings/patient-home/actions.ts',
    exportName: 'reorderPatientHomeBlocks',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireDoctorForPatientHomeMutation',
    serviceBoundary: 'deps.patientHomeBlocks.reorderBlocks',
  },
  {
    id: 'patient-home.items',
    mechanic: 'cms_pages',
    file: 'src/app/app/settings/patient-home/actions.ts',
    exportName: 'addPatientHomeItem',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireDoctorForPatientHomeMutation',
    serviceBoundary: 'deps.patientHomeBlocks.*',
  },
  {
    id: 'patient-home.items.visibility',
    mechanic: 'cms_pages',
    file: 'src/app/app/settings/patient-home/actions.ts',
    exportName: 'updatePatientHomeItemVisibility',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireDoctorForPatientHomeMutation',
    serviceBoundary: 'deps.patientHomeBlocks.updateItem',
  },
  {
    id: 'patient-home.items.presentation',
    mechanic: 'cms_pages',
    file: 'src/app/app/settings/patient-home/actions.ts',
    exportName: 'updatePatientHomeItemPresentation',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireDoctorForPatientHomeMutation',
    serviceBoundary: 'deps.patientHomeBlocks.updateItem',
  },
  {
    id: 'patient-home.items.delete',
    mechanic: 'cms_pages',
    file: 'src/app/app/settings/patient-home/actions.ts',
    exportName: 'deletePatientHomeItem',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireDoctorForPatientHomeMutation',
    serviceBoundary: 'deps.patientHomeBlocks.deleteItem',
  },
  {
    id: 'patient-home.items.reorder',
    mechanic: 'cms_pages',
    file: 'src/app/app/settings/patient-home/actions.ts',
    exportName: 'reorderPatientHomeItems',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireDoctorForPatientHomeMutation',
    serviceBoundary: 'deps.patientHomeBlocks.reorderItems',
  },
  {
    id: 'patient-home.items.retarget',
    mechanic: 'cms_pages',
    file: 'src/app/app/settings/patient-home/actions.ts',
    exportName: 'retargetPatientHomeItem',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireDoctorForPatientHomeMutation',
    serviceBoundary: 'deps.patientHomeBlocks.updateItem',
  },
  {
    id: 'patient-home.section.create',
    mechanic: 'cms_pages',
    file: 'src/app/app/settings/patient-home/actions.ts',
    exportName: 'createContentSectionForPatientHomeBlock',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireDoctorForPatientHomeMutation',
    serviceBoundary: 'deps.contentSections.upsert/deps.patientHomeBlocks.addItem',
  },
  {
    id: 'patient-home.candidates.list',
    mechanic: 'cms_pages',
    file: 'src/app/app/settings/patient-home/actions.ts',
    exportName: 'listPatientHomeCandidates',
    method: 'action',
    authContext: 'requireDoctorWorkspaceContext',
    guard: 'requireDoctorForPatientHomeRead',
    serviceBoundary: 'deps.patientHomeBlocks.listCandidatesForBlock',
  },
  {
    id: 'subscriptions.patient-package.create',
    mechanic: 'subscriptions',
    file: 'src/app/api/doctor/booking-engine/patient-packages/route.ts',
    exportName: 'POST',
    method: 'POST',
    authContext: 'requireDoctorBookingEngine',
    guard: 'requireEntitlementForMutation',
    serviceBoundary: 'deps.memberships.createManualPatientPackage/offerCatalogPackageToPatient',
  },
  {
    id: 'files.patient-file.create',
    mechanic: 'files',
    file: 'src/app/api/doctor/patients/[userId]/files/route.ts',
    exportName: 'POST',
    method: 'POST',
    authContext: 'requireDoctorWorkspaceApiContext',
    guard: 'requireEntitlementForMutation',
    serviceBoundary: 'deps.patientFiles.createFile',
  },
  {
    id: 'files.patient-file.update',
    mechanic: 'files',
    file: 'src/app/api/doctor/patients/[userId]/files/[fileId]/route.ts',
    exportName: 'PATCH',
    method: 'PATCH',
    authContext: 'requireDoctorWorkspaceApiContext',
    guard: 'requireEntitlementForMutation',
    serviceBoundary: 'deps.patientFiles.linkFileToVisit/renameFile',
  },
  {
    id: 'booking.branch.create',
    mechanic: 'booking',
    file: 'src/app/api/admin/booking-engine/branches/route.ts',
    exportName: 'POST',
    method: 'POST',
    authContext: 'requireClinicManagementBookingEngine',
    guard: 'requireEntitlementForMutation',
    serviceBoundary: 'gate.ctx.service.catalog.upsertBranch',
  },
  {
    id: 'booking.service.create',
    mechanic: 'booking',
    file: 'src/app/api/admin/booking-engine/services/route.ts',
    exportName: 'POST',
    method: 'POST',
    authContext: 'requireClinicManagementBookingEngine',
    guard: 'requireEntitlementForMutation',
    serviceBoundary: 'gate.ctx.service.services.upsertService',
  },
  {
    id: 'booking.slot.create',
    mechanic: 'booking',
    file: 'src/app/api/admin/booking-engine/schedule-blocks/route.ts',
    exportName: 'POST',
    method: 'POST',
    authContext: 'requireAdminBookingEngine',
    guard: 'requireEntitlementForMutation',
    serviceBoundary: 'bookingScheduling.createScheduleBlock',
  },
  {
    id: 'booking.schedule-block.delete',
    mechanic: 'booking',
    file: 'src/app/api/admin/booking-engine/schedule-blocks/route.ts',
    exportName: 'DELETE',
    method: 'DELETE',
    authContext: 'requireAdminBookingEngine',
    guard: 'requireEntitlementForMutation',
    serviceBoundary: 'bookingScheduling.deleteScheduleBlock',
  },
  {
    id: 'payments.booking-settings.patch',
    mechanic: 'payments',
    file: 'src/app/api/admin/settings/route.ts',
    exportName: 'PATCH',
    method: 'PATCH',
    authContext: 'requireClinicManagementApiContext',
    guard: 'requireEntitlementForMutation',
    serviceBoundary: 'deps.systemSettings.updateSetting',
  },
  {
    id: 'clinic-team.invites.list',
    mechanic: 'clinic_team',
    file: 'src/app/api/clinic/invites/route.ts',
    exportName: 'GET',
    method: 'GET',
    authContext: 'requireClinicManagementApiContext',
    guard: 'requireEntitlementForRead',
    serviceBoundary: 'deps.organizationInvites.listPending/deps.clinicSeats.getSeatStatus',
  },
  {
    id: 'clinic-team.invites.create',
    mechanic: 'clinic_team',
    file: 'src/app/api/clinic/invites/route.ts',
    exportName: 'POST',
    method: 'POST',
    authContext: 'requireClinicManagementApiContext',
    guard: 'requireEntitlementForMutation',
    serviceBoundary:
      'deps.organizationInvites.createInvite (atomic seat check inside createReplacingPending)',
  },
  {
    id: 'clinic-team.invites.revoke',
    mechanic: 'clinic_team',
    file: 'src/app/api/clinic/invites/[id]/route.ts',
    exportName: 'DELETE',
    method: 'DELETE',
    authContext: 'requireClinicManagementApiContext',
    guard: 'requireEntitlementForMutation',
    serviceBoundary: 'deps.organizationInvites.revokeInvite',
  },
  {
    id: 'clinic-team.members.list',
    mechanic: 'clinic_team',
    file: 'src/app/api/clinic/members/route.ts',
    exportName: 'GET',
    method: 'GET',
    authContext: 'requireClinicManagementApiContext',
    guard: 'requireEntitlementForRead',
    serviceBoundary:
      'deps.organizationMembership.listOrganizationMembers/deps.clinicSeats.getSeatStatus',
  },
] as const satisfies readonly ProtectedActionMapping[];

/**
 * Action families are scanned independently from the mapping list, so a new
 * exported action file cannot evade the inventory merely by omitting a row.
 */
export const PROTECTED_ACTION_FAMILIES = [
  {
    id: 'doctor-content',
    root: 'src/app/app/doctor/content',
    recursive: false,
    filePattern: '(?:actions|Actions|reorderContentPages)\\.ts$',
  },
  {
    id: 'doctor-content-sections',
    root: 'src/app/app/doctor/content/sections',
    recursive: false,
    filePattern: '(?:actions|Actions|reorderContentSections)\\.ts$',
  },
  {
    id: 'doctor-broadcasts',
    root: 'src/app/app/doctor/broadcasts',
    recursive: false,
    filePattern: 'actions\\.ts$',
  },
  {
    id: 'patient-home-settings',
    root: 'src/app/app/settings/patient-home',
    recursive: false,
    filePattern: 'actions\\.ts$',
  },
] as const satisfies readonly ProtectedActionFamily[];

/**
 * Every exported handler/action in a declared mechanic-bearing file is either
 * protected above or deliberately exempted here. This is an inventory
 * guarantee, not an attempt to infer arbitrary future business semantics.
 */
export const PROTECTED_ACTION_EXEMPTIONS = [
  {
    file: 'src/app/app/doctor/broadcasts/actions.ts',
    exportName: 'previewBroadcastAction',
    reason: 'non-mutating preview',
  },
  {
    file: 'src/app/app/doctor/broadcasts/actions.ts',
    exportName: 'listBroadcastAuditAction',
    reason: 'read action',
  },
  {
    file: 'src/app/app/doctor/broadcasts/actions.ts',
    exportName: 'loadDraftAction',
    reason: 'read action',
  },
  {
    file: 'src/app/app/doctor/broadcasts/actions.ts',
    exportName: 'getChannelCountsAction',
    reason: 'read action',
  },
  {
    file: 'src/app/app/doctor/broadcasts/actions.ts',
    exportName: 'getChannelCountsByAudienceAction',
    reason: 'read action',
  },
  {
    file: 'src/app/app/doctor/content/lifecycleActions.ts',
    exportName: 'applyContentLifecycleForm',
    reason: 'form wrapper delegates to mapped applyContentLifecycle',
  },
  {
    file: 'src/app/api/doctor/booking-engine/patient-packages/route.ts',
    exportName: 'GET',
    reason: 'read route',
  },
  {
    file: 'src/app/api/doctor/patients/[userId]/anamnesis/route.ts',
    exportName: 'GET',
    reason: 'read route',
  },
  {
    file: 'src/app/api/doctor/patients/[userId]/files/route.ts',
    exportName: 'GET',
    reason: 'read route',
  },
  {
    file: 'src/app/api/doctor/patients/[userId]/diagnoses/[diagnosisId]/status/route.ts',
    exportName: 'GET',
    reason: 'read status history',
  },
  {
    file: 'src/app/api/doctor/patients/[userId]/physical/route.ts',
    exportName: 'GET',
    reason: 'read route',
  },
  {
    file: 'src/app/api/doctor/patients/[userId]/comorbidities/route.ts',
    exportName: 'GET',
    reason: 'read route including removed records for recovery',
  },
  // Patient card mutations are never tariff-gated: `patient_card` is a critical mechanic
  // (canon QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md §4, class "никогда") and has no key in
  // MECHANIC_REGISTRY — a tariff gate here would not compile. #1069, 31.07.
  {
    file: 'src/app/api/doctor/patients/[userId]/visits/route.ts',
    exportName: 'POST',
    reason: 'critical mechanic (patient_card) — never tariff-gated',
  },
  {
    file: 'src/app/api/doctor/patients/[userId]/visits/[visitId]/route.ts',
    exportName: 'PATCH',
    reason: 'critical mechanic (patient_card) — never tariff-gated',
  },
  {
    file: 'src/app/api/doctor/patients/[userId]/anamnesis/route.ts',
    exportName: 'POST',
    reason: 'critical mechanic (patient_card) — never tariff-gated',
  },
  {
    file: 'src/app/api/doctor/patients/[userId]/complaints/[complaintId]/route.ts',
    exportName: 'PATCH',
    reason: 'critical mechanic (patient_card) — never tariff-gated',
  },
  {
    file: 'src/app/api/doctor/patients/[userId]/diagnoses/[diagnosisId]/route.ts',
    exportName: 'PATCH',
    reason: 'critical mechanic (patient_card) — never tariff-gated',
  },
  {
    file: 'src/app/api/doctor/patients/[userId]/diagnoses/[diagnosisId]/status/route.ts',
    exportName: 'PATCH',
    reason: 'critical mechanic (patient_card) — never tariff-gated',
  },
  {
    file: 'src/app/api/doctor/patients/[userId]/physical/route.ts',
    exportName: 'PATCH',
    reason: 'critical mechanic (patient_card) — never tariff-gated',
  },
  {
    file: 'src/app/api/doctor/patients/[userId]/comorbidities/route.ts',
    exportName: 'POST',
    reason: 'critical mechanic (patient_card) — never tariff-gated',
  },
  {
    file: 'src/app/api/doctor/patients/[userId]/comorbidities/[comorbidityId]/route.ts',
    exportName: 'PATCH',
    reason: 'critical mechanic (patient_card) — never tariff-gated',
  },
  {
    file: 'src/app/api/doctor/patients/[userId]/comorbidities/[comorbidityId]/route.ts',
    exportName: 'DELETE',
    reason: 'critical mechanic (patient_card) — never tariff-gated',
  },
  {
    file: 'src/app/api/doctor/patients/[userId]/files/[fileId]/route.ts',
    exportName: 'GET',
    reason: 'read/download route',
  },
  {
    file: 'src/app/api/admin/booking-engine/branches/route.ts',
    exportName: 'GET',
    reason: 'read route',
  },
  {
    file: 'src/app/api/admin/booking-engine/services/route.ts',
    exportName: 'GET',
    reason: 'read route',
  },
  {
    file: 'src/app/api/admin/booking-engine/schedule-blocks/route.ts',
    exportName: 'GET',
    reason: 'read route',
  },
  {
    file: 'src/app/api/admin/settings/route.ts',
    exportName: 'DELETE',
    reason:
      'global operator-health reset; role-protected admin operation, not an organization tariff mechanic',
  },
  { file: 'src/app/api/admin/settings/route.ts', exportName: 'GET', reason: 'read route' },
] as const satisfies readonly ProtectedActionExemption[];

export const DECLARED_NO_SURFACE = {
  exercise_catalog: 'S4-3/C5D deferred; no protected write surface in this stage',
  exercise_packages: 'S4-3/C5D deferred; no protected write surface in this stage',
  patient_app: 'code-search: no patient_app_enabled/toggle action',
  patient_app_paid_subscription: 'code-search: no subscription-toggle action',
  branding: 'code-search: no branding write action',
  custom_domain: 'code-search: no custom-domain write action',
} as const satisfies Partial<Record<OrgMechanic, string>>;
