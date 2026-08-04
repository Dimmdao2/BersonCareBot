/**
 * VISIBILITY_MODEL_DESIGN_2026-08-04.md §3 / VISIBILITY_CD_BRIEF_2026-08-04.md stage C.
 *
 * `actor` is intentionally the same shape as the fields already computed on
 * `DoctorWorkspaceAccessContext` (requireRole.ts) — no new per-request context is introduced.
 * The predicate keys off `canManageAllSpecialists` + `specialistId`, not off `membershipRole`
 * directly: those two facts already carry the owner's model in full ("менеджер и админ клиники
 * видят по всем" = canManageAllSpecialists; "врач видит своих" = a bound specialistId). `role` is
 * kept on the type for callers/telemetry, not because the predicate branches on it.
 *
 * `assistant` — explicit choice, not a silent gap (brief demands one): today `assistant` never
 * gets `canManageAllSpecialists` (owner/admin only, organization-membership/service.ts) and never
 * gets a bound `specialistId` (only owner/admin/doctor pass the clinical-workspace gate in
 * workspaceCapabilities.ts), so an assistant actor falls into the narrow branch with no
 * specialist identity and sees nothing through this port. If assistants ever need scheduling-only
 * visibility across the clinic, that is the deferred "отдельное расписание всей клиники для
 * администратора" line the owner already flagged as unresolved (design doc §"Что остаётся в
 * объёме") — not something to guess into this predicate.
 */
export type PatientVisibilityMembershipRole = 'owner' | 'admin' | 'doctor' | 'assistant';

export type PatientVisibilityActor = {
  membershipRole: PatientVisibilityMembershipRole;
  specialistId: string | null;
  canManageAllSpecialists: boolean;
};

export type PatientVisibilityLinkPort = {
  /** Point check backing `assertPatientVisibleToActor` — is there an active link for this triple? */
  hasActiveLink(params: {
    organizationId: string;
    patientUserId: string;
    specialistId: string;
  }): Promise<boolean>;

  /**
   * Stage D backfill primitive: create an `active` link if none exists yet for the pair
   * (any status — an `ended` row is a deliberate prior removal, not something to resurrect).
   * Returns whether a row was created, so the caller can report accurate counts.
   */
  createLinkIfAbsent(params: {
    organizationId: string;
    patientUserId: string;
    specialistId: string;
    createdVia: 'first_appointment' | 'manual_assign' | 'transfer';
  }): Promise<{ created: boolean }>;
};
