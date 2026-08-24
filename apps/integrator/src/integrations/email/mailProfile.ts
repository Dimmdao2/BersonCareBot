import { z } from 'zod';
import type { DbPort } from '../../kernel/contracts/index.js';
import { interpolateTemplate } from '../../kernel/orchestrator/templateInterpolation.js';
import {
  fetchIntegratorClinicDeliveryCredentialValueJson,
  parseSystemSettingInnerWithSchema,
} from '../../infra/db/publicSystemSettings.js';
import { runWithOrganizationPrincipal } from '../../infra/principal/organizationPrincipal.js';

const platformProfileSchema = z.object({
  kind: z.literal('platform'),
  senderDisplayName: z.string().trim().min(1).max(200),
});

const brandedProfileSchema = z.object({
  kind: z.literal('branded'),
  organizationId: z.string().uuid(),
  clinicName: z.string().trim().min(1).max(200),
  platformName: z.string().trim().min(1).max(200),
});

export const mailProfileRequestSchema = z.discriminatedUnion('kind', [
  platformProfileSchema,
  brandedProfileSchema,
]);

const brandedTemplateSchema = z.object({
  senderDisplayNameTemplate: z.string().trim().min(1).max(500),
  authCodeSubjectTemplate: z.string().trim().min(1).max(500),
  authCodeTextTemplate: z.string().trim().min(1).max(4000),
});

type BrandedTemplate = z.infer<typeof brandedTemplateSchema>;

export type RenderedMailProfile = {
  senderDisplayName: string;
  subject: string;
  text: string;
};

function assertOwnerApprovedPairTemplate(template: BrandedTemplate): void {
  if (
    !template.senderDisplayNameTemplate.includes('{{clinicName}}') ||
    !template.senderDisplayNameTemplate.includes('{{platformName}}')
  ) {
    throw new Error('BRANDED_MAIL_TEMPLATE_REQUIRES_CLINIC_AND_PLATFORM_NAMES');
  }
  if (!template.authCodeSubjectTemplate.includes('{{senderDisplayName}}')) {
    throw new Error('BRANDED_MAIL_SUBJECT_REQUIRES_SENDER_DISPLAY_NAME');
  }
  if (
    !template.authCodeTextTemplate.includes('{{senderDisplayName}}') ||
    !template.authCodeTextTemplate.includes('{{code}}')
  ) {
    throw new Error('BRANDED_MAIL_TEXT_REQUIRES_SENDER_DISPLAY_NAME_AND_CODE');
  }
}

function render(template: string, vars: Record<string, string>): string {
  const rendered = interpolateTemplate(template, vars);
  if (typeof rendered !== 'string' || !rendered.trim()) {
    throw new Error('MAIL_PROFILE_RENDER_FAILED');
  }
  return rendered;
}

async function readBrandedTemplate(db: DbPort, organizationId: string): Promise<BrandedTemplate> {
  const valueJson = await runWithOrganizationPrincipal(organizationId, () =>
    fetchIntegratorClinicDeliveryCredentialValueJson(
      db,
      'clinic_transactional_mail_template',
      organizationId,
    ),
  );
  const template =
    valueJson === null
      ? null
      : parseSystemSettingInnerWithSchema(valueJson, brandedTemplateSchema);
  if (!template) {
    // Формулировку пары «клиника + наша сторона» владелец пишет отдельно. До этого branded-письмо
    // не маскируется платформенным fallback и не уходит с заведомо неверной идентичностью.
    throw new Error('BRANDED_MAIL_TEMPLATE_OWNER_COPY_PENDING');
  }
  assertOwnerApprovedPairTemplate(template);
  return template;
}

/** Единственный resolver/renderer sender identity и шаблона для писем с кодом. */
export async function resolveAndRenderAuthCodeMailProfile(input: {
  db: DbPort;
  profile: unknown;
  code: string;
}): Promise<RenderedMailProfile> {
  const profile = mailProfileRequestSchema.parse(input.profile);
  if (profile.kind === 'platform') {
    return {
      senderDisplayName: profile.senderDisplayName,
      subject: `Код подтверждения ${profile.senderDisplayName}`,
      text: `Ваш код ${profile.senderDisplayName}: ${input.code}`,
    };
  }

  const template = await readBrandedTemplate(input.db, profile.organizationId);
  const senderDisplayName = render(template.senderDisplayNameTemplate, {
    clinicName: profile.clinicName,
    platformName: profile.platformName,
  });
  const vars = {
    clinicName: profile.clinicName,
    platformName: profile.platformName,
    senderDisplayName,
    code: input.code,
  };
  return {
    senderDisplayName,
    subject: render(template.authCodeSubjectTemplate, vars),
    text: render(template.authCodeTextTemplate, vars),
  };
}
