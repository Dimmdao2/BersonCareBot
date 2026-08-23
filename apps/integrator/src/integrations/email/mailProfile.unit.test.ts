import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  fetchClinicTemplate: vi.fn(),
}));

vi.mock('../../infra/db/publicSystemSettings.js', () => ({
  fetchIntegratorClinicDeliveryCredentialValueJson: fakes.fetchClinicTemplate,
  parseSystemSettingInnerWithSchema: (value: unknown, schema: { parse: (input: unknown) => unknown }) =>
    schema.parse(value),
}));

vi.mock('../../infra/principal/organizationPrincipal.js', () => ({
  runWithOrganizationPrincipal: async (_organizationId: string, callback: () => unknown) => callback(),
}));

import { resolveAndRenderAuthCodeMailProfile } from './mailProfile.js';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000042';

describe('auth-code mail profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['staff', 'Therapysto'],
    ['standard patient', 'Therapygo'],
  ])('renders the configured %s platform name into the auth-code delivery', async (_surface, name) => {
    await expect(
      resolveAndRenderAuthCodeMailProfile({
        db: {} as never,
        profile: { kind: 'platform', senderDisplayName: name },
        code: '123456',
      }),
    ).resolves.toEqual({
      senderDisplayName: name,
      subject: `Код подтверждения ${name}`,
      text: `Ваш код ${name}: 123456`,
    });
  });

  it('renders a branded patient from the owner-provided template with both required names', async () => {
    fakes.fetchClinicTemplate.mockResolvedValueOnce({
      senderDisplayNameTemplate: '{{clinicName}} / {{platformName}}',
      authCodeSubjectTemplate: '{{senderDisplayName}}',
      authCodeTextTemplate: '{{senderDisplayName}} {{code}}',
    });

    await expect(
      resolveAndRenderAuthCodeMailProfile({
        db: {} as never,
        profile: {
          kind: 'branded',
          organizationId: ORGANIZATION_ID,
          clinicName: 'Клиника',
          platformName: 'Therapysto',
        },
        code: '654321',
      }),
    ).resolves.toEqual({
      senderDisplayName: 'Клиника / Therapysto',
      subject: 'Клиника / Therapysto',
      text: 'Клиника / Therapysto 654321',
    });
    expect(fakes.fetchClinicTemplate).toHaveBeenCalledWith(
      expect.anything(),
      'clinic_transactional_mail_template',
      ORGANIZATION_ID,
    );
  });

  it('fails closed instead of substituting a platform name while branded owner copy is absent', async () => {
    fakes.fetchClinicTemplate.mockResolvedValueOnce(null);

    await expect(
      resolveAndRenderAuthCodeMailProfile({
        db: {} as never,
        profile: {
          kind: 'branded',
          organizationId: ORGANIZATION_ID,
          clinicName: 'Клиника',
          platformName: 'Therapysto',
        },
        code: '654321',
      }),
    ).rejects.toThrow('BRANDED_MAIL_TEMPLATE_OWNER_COPY_PENDING');
  });
});
