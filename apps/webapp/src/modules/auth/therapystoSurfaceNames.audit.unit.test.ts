/**
 * Аудит TPB-15, круг 1: кто из живых людей какое имя видит.
 *
 * Kill-set (составлен до чтения авторских тестов, §24.5):
 *  K1 диалог passkey у персонала показывает имя платформы персонала;
 *  K2 приложение-аутентификатор показывает то же имя в issuer;
 *  K3 письмо записи пациенту общей поверхности подписано именем пациентского приложения;
 *  K4 пациент клиники видит имя КЛИНИКИ, а не платформенное;
 *  K6 отсутствие поверхности у вызывающего — ошибка, а не подстановка платформенного имени.
 */
import { describe, expect, it, vi } from 'vitest';
import { PATIENT_DEFAULT_SURFACE, STAFF_SURFACE } from '@/config/productSurfaces';
import {
  brandedMailProfile,
  platformMailProfileForRecipientRole,
} from '@/modules/auth/mailProfile';
import { getPasskeyRpConfig } from '@/modules/auth/passkeyAuth';
import { buildTotpUri } from '@/modules/staff-security/totp';
import { sendBookingConfirmationEmail } from '@/modules/patient-booking/sendBookingConfirmationEmail';
import type { MailProfileRequest } from '@/modules/auth/mailProfile';
import type {
  OutboundMessageContext,
  OutboundMessageQueuePort,
} from '@/modules/messaging/outboundMessageQueuePort';

const RETIRED = 'BersonCare';

function recordingQueue(): { port: OutboundMessageQueuePort; calls: OutboundMessageContext[] } {
  const calls: OutboundMessageContext[] = [];
  return {
    calls,
    port: { enqueue: async (ctx: OutboundMessageContext) => (calls.push(ctx), true) },
  };
}

async function bodyOf(mailProfile: MailProfileRequest): Promise<string> {
  const { port, calls } = recordingQueue();
  await sendBookingConfirmationEmail(
    {
      bookingId: 'bk-audit',
      organizationId: 'b0000000-0000-4000-8000-0000000000b0',
      contactEmail: 'person@example.test',
      slotStart: '2026-09-01T09:00:00.000Z',
      slotEnd: '2026-09-01T10:00:00.000Z',
      serviceTitle: 'Массаж',
      locationLabel: 'Филиал на Ленина',
      contactName: 'Иван',
      mailProfile,
    },
    { outboundMessageQueue: port },
  );
  expect(calls).toHaveLength(1);
  return JSON.stringify(calls[0]);
}

describe('TPB-15: имя, которое видит человек', () => {
  it('K1 персонал видит имя staff-поверхности в диалоге passkey', () => {
    const rp = getPasskeyRpConfig();
    expect(rp.rpName).toBe(STAFF_SURFACE.name);
    expect(rp.rpName).not.toContain(RETIRED);
  });

  it('K2 приложение-аутентификатор персонала показывает то же имя', () => {
    const uri = buildTotpUri({ secret: 'JBSWY3DPEHPK3PXP', email: 'doc@example.test' });
    expect(uri).toContain(`issuer=${encodeURIComponent(STAFF_SURFACE.name)}`);
    expect(decodeURIComponent(uri)).not.toContain(RETIRED);
  });

  it('K3 пациент общей поверхности видит в письме записи имя пациентского приложения', async () => {
    const body = await bodyOf(platformMailProfileForRecipientRole('client'));
    expect(body).toContain(PATIENT_DEFAULT_SURFACE.name);
    expect(body).not.toContain(RETIRED);
    // TPB-08: имя платформы персонала пациенту не показываем.
    expect(body).not.toContain(STAFF_SURFACE.name);
  });

  it('K4 пациент клиники видит имя КЛИНИКИ, а не платформенное', async () => {
    const body = await bodyOf(
      brandedMailProfile({
        organizationId: 'b0000000-0000-4000-8000-0000000000b0',
        clinicName: 'Клиника Ромашка',
        platformName: PATIENT_DEFAULT_SURFACE.name,
      }),
    );
    expect(body).toContain('Клиника Ромашка');
    expect(body).not.toContain(RETIRED);
    expect(body).not.toContain(STAFF_SURFACE.name);
    expect(body).not.toContain(`уважением, ${PATIENT_DEFAULT_SURFACE.name}`);
  });

  it('K6 запись без разрешённой поверхности отказывает, а не подставляет имя платформы', async () => {
    const { createVerifiedPublicBooking } = await import(
      '@/app-layer/booking/createVerifiedPublicBooking'
    );
    const deps = { patientBooking: { create: vi.fn() } } as never;
    await expect(
      createVerifiedPublicBooking(
        deps,
        { organizationId: 'b0000000-0000-4000-8000-0000000000b0' } as never,
        '00000000-0000-4000-8000-000000000001',
        'email' as never,
        undefined,
      ),
    ).rejects.toThrow(/mail_profile_required/);
  });
});
