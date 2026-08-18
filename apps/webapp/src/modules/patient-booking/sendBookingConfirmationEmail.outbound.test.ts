/**
 * Письмо-подтверждение записи после переноса на очередь (решение владельца 19.08: «письмо и
 * уведомление не надо ждать — абсолютно точно»).
 *
 * Что доказывается:
 *  1. Функция НЕ ждёт SMTP: она делает ровно одну постановку в очередь и возвращается.
 *  2. Идемпотентность: ключ — `booking.confirmation:<bookingId>`, стабильный между вызовами.
 *     Повторный вызов не создаёт второго сообщения (порт отвечает «уже стоит»).
 *  3. .ics доезжает БАЙТ В БАЙТ: base64 в контенте декодируется обратно в тот же файл, что
 *     собирает `buildIcsContent`. Приёмник, молча роняющий необъявленное поле, — ровно тот
 *     дефект, который раньше отрывал вложение.
 *  4. Отказ постановки не роняет запись: функция возвращает false и не бросает.
 */
import { describe, expect, it } from 'vitest';
import { env } from '@/config/env';
import { buildIcsContent } from '@/shared/lib/buildCalendarLinks';
import {
  BOOKING_CONFIRMATION_PURPOSE,
  sendBookingConfirmationEmail,
} from './sendBookingConfirmationEmail';
import type {
  OutboundMessageContext,
  OutboundMessageQueuePort,
} from '@/modules/messaging/outboundMessageQueuePort';

const INPUT = {
  bookingId: 'bk-1',
  organizationId: 'b0000000-0000-4000-8000-0000000000b0',
  contactEmail: ' person@example.test ',
  slotStart: '2026-09-01T09:00:00.000Z',
  slotEnd: '2026-09-01T10:00:00.000Z',
  serviceTitle: 'Массаж',
  locationLabel: 'Филиал на Ленина',
  contactName: 'Иван',
};

function recordingQueue(result = true): {
  port: OutboundMessageQueuePort;
  calls: OutboundMessageContext[];
} {
  const calls: OutboundMessageContext[] = [];
  return {
    calls,
    port: {
      async enqueue(context) {
        calls.push(context);
        return result;
      },
    },
  };
}

describe('booking confirmation email: одна постановка в очередь вместо ожидания SMTP', () => {
  it('дано: у записи есть email → когда подтверждение → тогда РОВНО одна постановка с purpose=booking.confirmation, каналом email и получателем без пробелов', async () => {
    const q = recordingQueue();

    const enqueued = await sendBookingConfirmationEmail(INPUT, { outboundMessageQueue: q.port });

    expect(enqueued).toBe(true);
    expect(q.calls).toHaveLength(1);
    expect(q.calls[0]!.purpose).toBe(BOOKING_CONFIRMATION_PURPOSE);
    expect(q.calls[0]!.channel).toBe('email');
    expect(q.calls[0]!.recipient).toBe('person@example.test');
    expect(q.calls[0]!.organizationId).toBe(INPUT.organizationId);
  });

  it('дано: та же запись отправлена дважды → когда оба вызова → тогда ключ идемпотентности ОДИН И ТОТ ЖЕ, и второй вызов сообщения не создаёт', async () => {
    const first = recordingQueue(true);
    const second = recordingQueue(false); // очередь уже держит эту строку: ON CONFLICT DO NOTHING

    const firstResult = await sendBookingConfirmationEmail(INPUT, {
      outboundMessageQueue: first.port,
    });
    const secondResult = await sendBookingConfirmationEmail(INPUT, {
      outboundMessageQueue: second.port,
    });

    expect(first.calls[0]!.idempotencyKey).toBe('bk-1');
    expect(second.calls[0]!.idempotencyKey).toBe(first.calls[0]!.idempotencyKey);
    expect(firstResult).toBe(true);
    // Вторая постановка не создала второго письма и второго календарного файла.
    expect(secondResult).toBe(false);
  });

  it('дано: письмо с календарём → когда постановка → тогда icsContent декодируется обратно в ТОТ ЖЕ файл, что собирает buildIcsContent', async () => {
    const q = recordingQueue();

    await sendBookingConfirmationEmail(INPUT, { outboundMessageQueue: q.port });

    const content = q.calls[0]!.content;
    expect(content.icsFilename).toBe('bersoncare-booking-bk-1.ics');
    const decoded = Buffer.from(String(content.icsContent), 'base64').toString('utf-8');
    // Байт в байт против той же сборки, а не «поле не пустое».
    const expectedIcs = buildIcsContent(
      {
        startAt: INPUT.slotStart,
        endAt: INPUT.slotEnd,
        summary: INPUT.serviceTitle,
        location: INPUT.locationLabel,
        bookingId: INPUT.bookingId,
      },
      env.APP_BASE_URL,
    );
    expect(decoded).toBe(expectedIcs);
    expect(decoded).toContain('BEGIN:VCALENDAR');
    expect(content.subject).toBe('Запись подтверждена: Массаж');
    expect(content.html).toContain('подтверждена');
  });

  it('дано: у записи нет email → когда подтверждение → тогда постановки нет вовсе', async () => {
    const q = recordingQueue();

    const enqueued = await sendBookingConfirmationEmail(
      { ...INPUT, contactEmail: '   ' },
      { outboundMessageQueue: q.port },
    );

    expect(enqueued).toBe(false);
    expect(q.calls).toHaveLength(0);
  });

  it('дано: постановка в очередь упала → когда подтверждение → тогда функция возвращает false и НЕ бросает (запись уже подтверждена)', async () => {
    const failing: OutboundMessageQueuePort = {
      async enqueue() {
        throw new Error('42501: permission denied');
      },
    };

    await expect(
      sendBookingConfirmationEmail(INPUT, { outboundMessageQueue: failing }),
    ).resolves.toBe(false);
  });
});
