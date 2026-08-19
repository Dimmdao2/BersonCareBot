import type { PatientOrganizationPort } from './ports';

export type PatientOrganizationSummary = {
  organizationId: string;
  title: string;
};

export type PatientOrganizationResolution =
  | {
      ok: true;
      organizationId: string;
      organization: PatientOrganizationSummary;
      organizations: PatientOrganizationSummary[];
      selectedBy: 'only_active' | 'remembered' | 'verified_target';
    }
  | { ok: false; reason: 'no_active_enrollment' }
  | {
      ok: false;
      reason: 'organization_selection_required';
      organizationIds: string[];
      organizations: PatientOrganizationSummary[];
      invalidRememberedOrganization: boolean;
    }
  | { ok: false; reason: 'organization_target_not_authorized' };

export type ResolvePatientOrganizationOptions = {
  rememberedOrganizationId?: string | null;
  verifiedTargetOrganizationId?: string | null;
};

function toOrganizationSummaries(
  rows: Awaited<ReturnType<PatientOrganizationPort['listActiveEnrollmentsByPlatformUser']>>,
  platformUserId: string,
): PatientOrganizationSummary[] {
  const byId = new Map<string, PatientOrganizationSummary>();
  for (const row of rows) {
    if (
      row.platformUserId !== platformUserId ||
      row.status !== 'active' ||
      !row.organizationIsActive ||
      byId.has(row.organizationId)
    )
      continue;
    byId.set(row.organizationId, {
      organizationId: row.organizationId,
      title: row.organizationTitle.trim() || 'Организация',
    });
  }
  return [...byId.values()];
}

export function createPatientOrganizationService(deps: { port: PatientOrganizationPort }) {
  async function resolveActiveOrganizationForPatient(
    platformUserId: string,
    options: ResolvePatientOrganizationOptions = {},
  ): Promise<PatientOrganizationResolution> {
    const rows = await deps.port.listActiveEnrollmentsByPlatformUser(platformUserId);
    const organizations = toOrganizationSummaries(rows, platformUserId);
    if (organizations.length === 0) {
      return { ok: false, reason: 'no_active_enrollment' };
    }

    const verifiedTarget = options.verifiedTargetOrganizationId?.trim() || null;
    if (verifiedTarget) {
      const organization = organizations.find((row) => row.organizationId === verifiedTarget);
      if (!organization) return { ok: false, reason: 'organization_target_not_authorized' };
      return {
        ok: true,
        organizationId: organization.organizationId,
        organization,
        organizations,
        selectedBy: 'verified_target',
      };
    }

    const remembered = options.rememberedOrganizationId?.trim() || null;
    const rememberedOrganization = remembered
      ? organizations.find((row) => row.organizationId === remembered)
      : undefined;
    if (remembered && !rememberedOrganization) {
      return {
        ok: false,
        reason: 'organization_selection_required',
        organizationIds: organizations.map((row) => row.organizationId),
        organizations,
        invalidRememberedOrganization: true,
      };
    }

    if (organizations.length === 1) {
      const organization = organizations[0];
      return {
        ok: true,
        organizationId: organization.organizationId,
        organization,
        organizations,
        selectedBy: rememberedOrganization ? 'remembered' : 'only_active',
      };
    }

    if (rememberedOrganization) {
      return {
        ok: true,
        organizationId: rememberedOrganization.organizationId,
        organization: rememberedOrganization,
        organizations,
        selectedBy: 'remembered',
      };
    }

    return {
      ok: false,
      reason: 'organization_selection_required',
      organizationIds: organizations.map((row) => row.organizationId),
      organizations,
      invalidRememberedOrganization: false,
    };
  }

  return {
    async hasActiveEnrollment(platformUserId: string, organizationId: string): Promise<boolean> {
      return deps.port.hasActiveEnrollment(platformUserId, organizationId);
    },
    async hasSchedulableClientRelationship(platformUserId: string, organizationId: string) {
      return deps.port.hasSchedulableClientRelationship(platformUserId, organizationId);
    },
    async createManualOrganizationClient(
      input: Parameters<PatientOrganizationPort['createManualOrganizationClient']>[0],
    ) {
      // Т12 (owner 19.08, «лимит клиентов - убрать»): no tariff mechanic stands in front of a
      // client card any more, so there is no mutation decision to clear this write against.
      return deps.port.createManualOrganizationClient(input);
    },
    resolveActiveOrganizationForPatient,
    async resolveTreatmentProgramOrganizationForPatient(
      platformUserId: string,
      instanceId: string,
    ): Promise<PatientOrganizationResolution> {
      const targetOrganizationId = await deps.port.findTreatmentProgramOrganizationForPatient(
        platformUserId,
        instanceId,
      );
      if (!targetOrganizationId) return { ok: false, reason: 'organization_target_not_authorized' };
      return resolveActiveOrganizationForPatient(platformUserId, {
        verifiedTargetOrganizationId: targetOrganizationId,
      });
    },
    async getTreatmentProgramDescriptionForPatient(platformUserId: string, instanceId: string) {
      return deps.port.findTreatmentProgramDescriptionForPatient(platformUserId, instanceId);
    },
  };
}

export type PatientOrganizationService = ReturnType<typeof createPatientOrganizationService>;
