/**
 * Шов постановки исходящего сообщения. Доказывается ровно то, что обещано в дизайне:
 *  1. вызывается ОДИН объявленный корень с точной сигнатурой — не сырой INSERT в таблицу;
 *  2. постановка стоит ОДНО обращение к базе, а не «сколько получится»;
 *  3. содержимое уходит в корень как один jsonb-аргумент дословно — .ics в том числе.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  runWebappNamedRoot: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: () => fakes.db,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
}));

import { createPgOutboundMessageQueue } from './pgOutboundMessageQueue';

const ORG = 'b0000000-0000-4000-8000-0000000000b0';
const ICS = Buffer.from('BEGIN:VCALENDAR\r\nEND:VCALENDAR', 'utf-8').toString('base64');

const CONTEXT = {
  organizationId: ORG,
  purpose: 'booking.confirmation',
  idempotencyKey: 'bk-1',
  channel: 'email' as const,
  recipient: 'person@example.test',
  content: {
    text: 'Ваша запись подтверждена.',
    html: '<p>ok</p>',
    subject: 'Запись подтверждена',
    icsContent: ICS,
    icsFilename: 'bersoncare-booking-bk-1.ics',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('outbound message enqueue seam', () => {
  it('дано: контекст сообщения → когда постановка → тогда ровно ОДИН вызов объявленного корня с точной сигнатурой и семью аргументами', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [{ enqueued: true }] });

    await expect(createPgOutboundMessageQueue().enqueue(CONTEXT)).resolves.toBe(true);

    // Одно обращение к базе на постановку — это и есть «оптимизированно по запросам».
    expect(fakes.runWebappNamedRoot).toHaveBeenCalledTimes(1);
    expect(fakes.db.execute).not.toHaveBeenCalled();
    const [, identity, args] = fakes.runWebappNamedRoot.mock.calls[0]!;
    expect(identity).toBe('app.enqueue_outbound_message(uuid,text,text,text,text,jsonb,integer)');
    expect(args).toEqual([
      ORG,
      'booking.confirmation',
      'bk-1',
      'email',
      'person@example.test',
      JSON.stringify(CONTEXT.content),
      6,
    ]);
  });

  it('дано: содержимое с .ics → когда постановка → тогда base64 доезжает до корня БАЙТ В БАЙТ внутри jsonb-аргумента', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [{ enqueued: true }] });

    await createPgOutboundMessageQueue().enqueue(CONTEXT);

    const contentArg = JSON.parse(String(fakes.runWebappNamedRoot.mock.calls[0]![2][5]));
    expect(contentArg.icsContent).toBe(ICS);
    expect(contentArg.icsFilename).toBe('bersoncare-booking-bk-1.ics');
  });

  it('дано: строка уже стоит в очереди (ON CONFLICT DO NOTHING) → когда постановка → тогда false, а не «успешно отправлено»', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [{ enqueued: false }] });

    await expect(createPgOutboundMessageQueue().enqueue(CONTEXT)).resolves.toBe(false);
  });
});
