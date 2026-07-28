/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NotificationTemplatesPageClient } from './NotificationTemplatesPageClient';
import {
  DEFAULT_MANAGED_NOTIF_PRESENTATION,
  createDefaultManagedNotifTemplate,
  type ManagedNotifTemplateEntry,
} from '@/modules/notif-templates/managedNotifTemplate';
import {
  NOTIF_TEMPLATE_AUDIENCES,
  NOTIF_TEMPLATE_DEFAULTS,
  NOTIF_TEMPLATE_EVENTS,
} from '@/modules/notif-templates/notifTemplatesService';

const { apiJsonMock } = vi.hoisted(() => ({ apiJsonMock: vi.fn() }));
vi.mock('@/shared/lib/apiJson', () => ({ apiJson: apiJsonMock }));

const templates: ManagedNotifTemplateEntry[] = NOTIF_TEMPLATE_EVENTS.flatMap((event) =>
  NOTIF_TEMPLATE_AUDIENCES.map((audience) => ({
    event,
    audience,
    legacyText: NOTIF_TEMPLATE_DEFAULTS[event][audience],
    legacyIsDefault: true,
    legacyCompatibility: {
      status: 'compatible' as const,
      preservedText: NOTIF_TEMPLATE_DEFAULTS[event][audience],
      forbiddenVariables: [],
    },
    managed: createDefaultManagedNotifTemplate(event, audience),
    metadata: {
      revision: 0,
      effectiveSource: 'hardcoded' as const,
      updatedAt: null,
      updatedBy: null,
      writeToken: null,
    },
  })),
);

describe('NotificationTemplatesPageClient', () => {
  beforeEach(() => vi.clearAllMocks());

  it('groups templates by audience and exposes per-channel safe variable buttons', () => {
    render(
      <NotificationTemplatesPageClient
        endpoint="/api/doctor/notification-templates"
        templates={templates}
        presentation={{
          presentation: DEFAULT_MANAGED_NOTIF_PRESENTATION,
          metadata: {
            revision: 0,
            effectiveSource: 'hardcoded',
            updatedAt: null,
            updatedBy: null,
            writeToken: null,
          },
        }}
      />,
    );

    const patientSection = screen.getByRole('region', { name: 'Уведомления клиенту' });
    const doctorSection = screen.getByRole('region', { name: 'Уведомления специалисту' });
    expect(within(patientSection).getAllByRole('textbox')).toHaveLength(6);
    expect(within(doctorSection).getAllByRole('textbox')).toHaveLength(6);
    expect(
      within(patientSection).queryByRole('button', { name: 'телефон' }),
    ).not.toBeInTheDocument();
    expect(
      within(doctorSection).queryByRole('button', { name: 'телефон' }),
    ).not.toBeInTheDocument();

    const patientCreatedText = within(patientSection).getByLabelText(
      'Подтверждение записи → пациенту — Текст письма',
    ) as HTMLTextAreaElement;
    patientCreatedText.focus();
    patientCreatedText.setSelectionRange(
      patientCreatedText.value.length,
      patientCreatedText.value.length,
    );
    fireEvent.click(within(patientSection).getAllByRole('button', { name: 'дата и время' })[1]!);
    expect(patientCreatedText.value).toContain('{{date}}');
  });

  it('uses save responses to refresh template and presentation revision metadata', async () => {
    const savedTemplate: ManagedNotifTemplateEntry = {
      ...templates[0]!,
      metadata: {
        revision: 1,
        effectiveSource: 'organization',
        updatedAt: '2026-07-21T11:00:00.000Z',
        updatedBy: 'owner',
        writeToken: '2026-07-21T11:00:00.000Z',
      },
      managed: { ...templates[0]!.managed, revision: 1 },
    };
    apiJsonMock.mockResolvedValueOnce({ ok: true, template: savedTemplate }).mockResolvedValueOnce({
      ok: true,
      presentation: {
        presentation: { ...DEFAULT_MANAGED_NOTIF_PRESENTATION, revision: 1 },
        metadata: {
          revision: 1,
          effectiveSource: 'organization',
          updatedAt: '2026-07-21T11:01:00.000Z',
          updatedBy: 'owner',
          writeToken: '2026-07-21T11:01:00.000Z',
        },
      },
    });
    render(
      <NotificationTemplatesPageClient
        endpoint="/api/doctor/notification-templates"
        templates={templates}
        presentation={{
          presentation: DEFAULT_MANAGED_NOTIF_PRESENTATION,
          metadata: {
            revision: 0,
            effectiveSource: 'hardcoded',
            updatedAt: null,
            updatedBy: null,
            writeToken: null,
          },
        }}
      />,
    );

    const patientSection = screen.getByRole('region', { name: 'Уведомления клиенту' });
    fireEvent.click(within(patientSection).getAllByRole('button', { name: 'Сохранить' })[0]!);
    await waitFor(() =>
      expect(within(patientSection).getByText('organization, ревизия 1')).toBeInTheDocument(),
    );
    expect(apiJsonMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        body: expect.stringContaining('"expectedUpdatedAt":null'),
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить оформление' }));
    await waitFor(() =>
      expect(screen.getByText('Источник: organization, ревизия 1')).toBeInTheDocument(),
    );
    expect(apiJsonMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        body: expect.stringContaining('2026-07-21T11:00:00.000Z'),
      }),
    );
  });
});
