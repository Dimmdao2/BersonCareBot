import { normalizeEmail } from '@/modules/auth/emailNormalize';
import { normalizePhone } from '@/modules/auth/phoneNormalize';
import { isValidPhoneE164 } from '@/modules/auth/phoneValidation';
import type { LeadsPort, LeadsService } from './ports';
import type { Lead, NormalizedLeadInput, SubmitLeadInput } from './types';

type LeadsServiceDependencies = {
  assertWriteClearance?: (mechanic: 'leads') => void;
  now?: () => string;
};

function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSubmission(input: SubmitLeadInput): NormalizedLeadInput {
  if (!input.applicant) throw new Error('lead_email_verification_required');
  const emailNormalized = normalizeEmail(input.email);
  if (!emailNormalized || emailNormalized !== input.applicant.emailNormalized) {
    throw new Error('lead_email_verification_required');
  }
  const phoneNormalized = optionalText(input.phone) ? normalizePhone(input.phone ?? '') : null;
  if (phoneNormalized && !isValidPhoneE164(phoneNormalized)) {
    throw new Error('invalid_lead_phone');
  }
  const messageText = input.messageText.trim();
  if (!messageText) throw new Error('empty_lead_message');
  return {
    organizationId: input.organizationId,
    platformUserId: input.applicant.platformUserId,
    firstName: optionalText(input.firstName),
    lastName: optionalText(input.lastName),
    patronymic: optionalText(input.patronymic),
    emailNormalized,
    phoneNormalized,
    preferredContact: optionalText(input.preferredContact),
    messageText,
    sourceSurface: input.sourceSurface,
  };
}

function assertTenant(organizationId: string, value: Lead): Lead {
  if (value.organizationId !== organizationId) throw new Error('lead_tenant_boundary_violation');
  return value;
}

export function createLeadsService(
  port: LeadsPort,
  dependencies: LeadsServiceDependencies = {},
): LeadsService {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const assertWrite = () => dependencies.assertWriteClearance?.('leads');
  return {
    async submit(input) {
      assertWrite();
      const normalized = normalizeSubmission(input);
      const row = await port.create(normalized, now());
      return assertTenant(input.organizationId, row);
    },
    async list(input) {
      const rows = await port.list(input);
      return rows.map((row) => assertTenant(input.organizationId, row));
    },
    async get(organizationId, leadId) {
      const row = await port.get(organizationId, leadId);
      return row ? assertTenant(organizationId, row) : null;
    },
    async accept(organizationId, leadId) {
      assertWrite();
      const row = await port.accept(organizationId, leadId, now());
      return row ? assertTenant(organizationId, row) : null;
    },
    async close(organizationId, leadId) {
      assertWrite();
      const row = await port.close(organizationId, leadId, now());
      return row ? assertTenant(organizationId, row) : null;
    },
    async reject(input) {
      assertWrite();
      const comment = optionalText(input.comment);
      const row = await port.reject({ ...input, comment, now: now() });
      if (!row) return null;
      return assertTenant(input.organizationId, row);
    },
    async archive(organizationId, leadId) {
      assertWrite();
      const row = await port.setArchived(organizationId, leadId, true, now());
      return row ? assertTenant(organizationId, row) : null;
    },
    async unarchive(organizationId, leadId) {
      assertWrite();
      const row = await port.setArchived(organizationId, leadId, false, now());
      return row ? assertTenant(organizationId, row) : null;
    },
  };
}
