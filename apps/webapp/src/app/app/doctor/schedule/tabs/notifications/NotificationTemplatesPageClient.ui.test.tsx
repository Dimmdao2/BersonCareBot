// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  ManagedNotifPresentationEntry,
  ManagedNotifTemplateEntry,
} from '@/modules/notif-templates/managedNotifTemplate';
import { NotificationTemplatesPageClient } from './NotificationTemplatesPageClient';

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

const metadata = {
  revision: 1,
  effectiveSource: 'organization' as const,
  updatedAt: null,
  updatedBy: null,
  writeToken: 'revision-1',
};

const templates: ManagedNotifTemplateEntry[] = [
  {
    event: 'created',
    audience: 'patient',
    legacyText: '',
    legacyIsDefault: false,
    legacyCompatibility: { status: 'compatible', preservedText: '', forbiddenVariables: [] },
    managed: {
      version: 1,
      revision: 1,
      channels: {
        email: { subject: 'Запись подтверждена', plainText: 'Ждём вас' },
        telegram: { text: 'Ждём вас' },
        max: { text: 'Ждём вас' },
        smsc: { text: 'Ждём вас' },
        web_push: { title: 'Запись подтверждена', text: 'Ждём вас' },
      },
    },
    metadata,
  },
];

const presentation: ManagedNotifPresentationEntry = {
  presentation: {
    version: 1,
    revision: 1,
    layout: 'organization',
    signature: 'Клиника',
    contacts: 'Контакты',
    logoAssetId: null,
    avatarAssetId: null,
  },
  metadata,
};

describe('NotificationTemplatesPageClient entitlement visibility', () => {
  it('keeps published texts readable but makes every template mutation control unavailable in read-only access', () => {
    render(
      <NotificationTemplatesPageClient
        endpoint="/api/doctor/notification-templates"
        templates={templates}
        presentation={presentation}
        brandingMutationAvailable={false}
      />,
    );

    expect(screen.getByLabelText('Подпись')).toBeDisabled();
    expect(screen.getByLabelText('Контакты')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Нейтральное' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Сохранить оформление' })).toBeDisabled();
    expect(
      screen.getByLabelText('Подтверждение записи → пациенту — Тема письма'),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });
});
