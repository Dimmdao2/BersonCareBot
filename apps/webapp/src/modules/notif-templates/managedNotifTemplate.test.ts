import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MANAGED_NOTIF_PRESENTATION,
  MANAGED_NOTIF_RENDER_LIMITS,
  ManagedNotifTemplateValidationError,
  SYNTHETIC_NOTIF_TEMPLATE_VARIABLES,
  adaptLegacyNotifTemplate,
  allowedNotifTemplateVariables,
  createDefaultManagedNotifTemplate,
  renderManagedNotifTemplate,
  validateManagedNotifTemplateChannels,
} from './managedNotifTemplate';

describe('managed notification template contract', () => {
  it('rejects unknown, clinical/free-text variables and absolute URLs', () => {
    const base = createDefaultManagedNotifTemplate('created', 'patient').channels;
    expect(() =>
      validateManagedNotifTemplateChannels('created', 'patient', {
        ...base,
        email: { ...base.email, plainText: 'Диагноз: {{diagnosis}}' },
      }),
    ).toThrow(ManagedNotifTemplateValidationError);
    expect(() =>
      validateManagedNotifTemplateChannels('cancelled', 'patient', {
        ...base,
        email: { ...base.email, plainText: 'Причина: {{reason}}' },
      }),
    ).toThrow(ManagedNotifTemplateValidationError);
    expect(() =>
      validateManagedNotifTemplateChannels('created', 'patient', {
        ...base,
        email: { ...base.email, plainText: 'Открыть https://untrusted.example/path' },
      }),
    ).toThrow(ManagedNotifTemplateValidationError);
    expect(() =>
      validateManagedNotifTemplateChannels('created', 'patient', {
        ...base,
        email: { ...base.email, subject: 'Тема\nBcc: hidden@example.test' },
      }),
    ).toThrow(ManagedNotifTemplateValidationError);
  });

  it('uses an exact event/channel policy and never allows patient name or phone', () => {
    const doctor = createDefaultManagedNotifTemplate('created', 'doctor').channels;
    expect(allowedNotifTemplateVariables('created', 'doctor', 'email')).toEqual([
      'date',
      'type',
      'city',
      'organizationName',
    ]);
    expect(allowedNotifTemplateVariables('created', 'doctor', 'telegram')).toEqual([
      'date',
      'organizationName',
    ]);
    expect(() =>
      validateManagedNotifTemplateChannels('created', 'doctor', {
        ...doctor,
        email: { ...doctor.email, plainText: 'Клиент: {{name}}, {{phone}}' },
      }),
    ).toThrow(ManagedNotifTemplateValidationError);
  });

  it('renders escaped server-owned email HTML plus mandatory plain text', () => {
    const rendered = renderManagedNotifTemplate({
      event: 'created',
      audience: 'patient',
      channel: 'email',
      template: createDefaultManagedNotifTemplate('created', 'patient'),
      presentation: {
        ...DEFAULT_MANAGED_NOTIF_PRESENTATION,
        layout: 'organization',
        signature: 'Команда <Клиники>',
        contacts: 'Телефон поддержки',
      },
      variables: { ...SYNTHETIC_NOTIF_TEMPLATE_VARIABLES, organizationName: 'Клиника <Добро>' },
      brandingEnabled: true,
    });
    expect(rendered.channel).toBe('email');
    if (rendered.channel !== 'email') throw new Error('email_render_expected');
    expect(rendered.plainText).toContain('Команда <Клиники>');
    expect(rendered.html).toContain('Клиника &lt;Добро&gt;');
    expect(rendered.html).toContain('Команда &lt;Клиники&gt;');
    expect(rendered.html).not.toContain('<Клиники>');
  });

  it('uses deterministic neutral wrapper when branding is unavailable', () => {
    const rendered = renderManagedNotifTemplate({
      event: 'created',
      audience: 'patient',
      channel: 'email',
      template: createDefaultManagedNotifTemplate('created', 'patient'),
      presentation: {
        ...DEFAULT_MANAGED_NOTIF_PRESENTATION,
        layout: 'organization',
        signature: 'Платная подпись',
        contacts: 'Платные контакты',
      },
      variables: SYNTHETIC_NOTIF_TEMPLATE_VARIABLES,
      brandingEnabled: false,
    });
    if (rendered.channel !== 'email') throw new Error('email_render_expected');
    expect(rendered.plainText).not.toContain('Платная подпись');
    expect(rendered.html).toContain('Название клиники');
  });

  it.each(['telegram', 'max', 'smsc', 'web_push'] as const)(
    'renders a bounded synthetic %s fixture',
    (channel) => {
      const rendered = renderManagedNotifTemplate({
        event: 'created',
        audience: 'patient',
        channel,
        template: createDefaultManagedNotifTemplate('created', 'patient'),
        presentation: DEFAULT_MANAGED_NOTIF_PRESENTATION,
        variables: SYNTHETIC_NOTIF_TEMPLATE_VARIABLES,
        brandingEnabled: false,
      });
      expect(rendered.channel).toBe(channel);
      if (rendered.channel === 'web_push') {
        expect(rendered.title.length).toBeLessThanOrEqual(MANAGED_NOTIF_RENDER_LIMITS.webPushTitle);
        expect(rendered.text.length).toBeLessThanOrEqual(MANAGED_NOTIF_RENDER_LIMITS.webPushText);
      } else {
        if (rendered.channel === 'email') throw new Error('messenger_or_push_render_expected');
        expect(rendered.text).toContain('25 июля');
      }
    },
  );

  it('rejects control-character injection and post-substitution channel overflow', () => {
    const template = createDefaultManagedNotifTemplate('created', 'patient');
    expect(() =>
      renderManagedNotifTemplate({
        event: 'created',
        audience: 'patient',
        channel: 'email',
        template: {
          ...template,
          channels: {
            ...template.channels,
            email: { ...template.channels.email, subject: '{{date}}' },
          },
        },
        presentation: DEFAULT_MANAGED_NOTIF_PRESENTATION,
        variables: {
          ...SYNTHETIC_NOTIF_TEMPLATE_VARIABLES,
          date: 'Сегодня\r\nBcc: hidden@example.test',
        },
        brandingEnabled: false,
      }),
    ).toThrow(ManagedNotifTemplateValidationError);

    expect(() =>
      renderManagedNotifTemplate({
        event: 'created',
        audience: 'patient',
        channel: 'web_push',
        template: {
          ...template,
          channels: { ...template.channels, web_push: { title: 'Запись', text: '{{date}}' } },
        },
        presentation: DEFAULT_MANAGED_NOTIF_PRESENTATION,
        variables: {
          ...SYNTHETIC_NOTIF_TEMPLATE_VARIABLES,
          date: 'x'.repeat(MANAGED_NOTIF_RENDER_LIMITS.webPushText + 1),
        },
        brandingEnabled: false,
      }),
    ).toThrow(ManagedNotifTemplateValidationError);
  });

  it('adapts compatible legacy text and explicitly preserves incompatible tokens', () => {
    const compatible = adaptLegacyNotifTemplate('created', 'patient', 'Запись: {{date}}, {{type}}');
    expect(compatible.compatibility.status).toBe('compatible');
    expect(compatible.template.channels.email.plainText).toBe('Запись: {{date}}, {{type}}');
    expect(compatible.template.channels.telegram.text).not.toContain('{{type}}');

    const incompatible = adaptLegacyNotifTemplate('cancelled', 'patient', 'Причина: {{reason}}');
    expect(incompatible.compatibility).toEqual({
      status: 'incompatible',
      preservedText: 'Причина: {{reason}}',
      forbiddenVariables: ['reason'],
    });
    expect(incompatible.template.channels.email.plainText).not.toContain('{{reason}}');
  });
});
