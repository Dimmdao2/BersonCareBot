import { beforeEach, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  runWebappNamedRoot: vi.fn(),
  drizzle: { select: vi.fn(), transaction: vi.fn() },
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: () => fakes.db,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
  runWebappSql: vi.fn(),
  webappSqlFromPgText: vi.fn(),
}));

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: () => fakes.drizzle,
}));

import { pgOperatorHealthReadPort } from '@/infra/repos/pgOperatorHealthRead';
import { enqueueOperatorHealthDigestDeliveries } from '@/infra/repos/pgOperatorHealthDigestDeliveries';
import type { OperatorHealthDigestReadyOutgoingDelivery } from '@/modules/messaging/outgoingDeliveryQueuePort';

const ROOT_SNAPSHOT = {
  dueBacklog: 91,
  deadTotal: 4,
  deadRecent: 1,
  lastOperatorDeadAt: '2026-08-19T04:40:00.000Z',
  blockedRecipientTotal: 87,
  processingCount: 2,
  confirmedSentLast24h: 11,
  oldestDueCreatedAt: '2026-08-17T16:53:20.000Z',
  lastSentAt: '2026-08-19T04:53:20.000Z',
  lastQueueActivityAt: '2026-08-19T04:44:59.000Z',
  dueByChannel: { telegram: 45, web_push: 43, email: 3 },
  dueByKind: { reminder_dispatch: 77, outbound_message: 14 },
  deadByKind: { reminder_dispatch: 4 },
};

function digest(eventId: string): OperatorHealthDigestReadyOutgoingDelivery {
  return {
    organizationId: null,
    eventId,
    kind: 'operator_health_digest',
    channel: 'email',
    maxAttempts: 6,
    nextRetryAt: '2026-08-19T06:00:00.000Z',
    intent: {
      type: 'message.send',
      meta: { eventId, occurredAt: '2026-08-19T06:00:00.000Z', source: 'email' },
      payload: { recipient: { email: 'operator@example.com' }, message: { text: 'line' } },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('оператор видит настоящие числа очереди, а не пустую панель', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ snapshot: ROOT_SNAPSHOT }] });

  const snapshot = await pgOperatorHealthReadPort.getOutgoingDeliveryQueueHealth();

  expect(snapshot.dueBacklog).toBe(91);
  expect(snapshot.deadTotal).toBe(4);
  // Окно отделяет «отказывает сейчас» от «когда-то отказало»: без него один июньский ряд
  // держал бы операторский баннер красным навсегда.
  expect(snapshot.deadRecent).toBe(1);
  expect(snapshot.blockedRecipientTotal).toBe(87);
  expect(snapshot.processingCount).toBe(2);
  expect(snapshot.confirmedSentLast24h).toBe(11);
  expect(snapshot.dueByChannel).toEqual({ telegram: 45, web_push: 43, email: 3 });
  expect(snapshot.dueByKind).toEqual({ reminder_dispatch: 77, outbound_message: 14 });
  expect(snapshot.deadByKind).toEqual({ reminder_dispatch: 4 });
  expect(snapshot.lastSentAt).toBe('2026-08-19T04:53:20.000Z');
  expect(snapshot.lastQueueActivityAt).toBe('2026-08-19T04:44:59.000Z');
  expect(typeof snapshot.oldestDueAgeSeconds).toBe('number');

  expect(fakes.runWebappNamedRoot.mock.calls[0]?.slice(1, 3)).toEqual([
    'app.read_operator_delivery_queue_health()',
    [],
  ]);
  // Прямое чтение отношения здесь — это 42501 под `app_staff`/`app_worker` и упавший ВЕСЬ
  // пятиминутный критический тик: вызов стоит в голом `Promise.all`.
  expect(fakes.drizzle.select).not.toHaveBeenCalled();
});

it('суточная сводка попадает в очередь: строка ставится, а не теряется на отказе', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ inserted: true }] });

  await expect(
    enqueueOperatorHealthDigestDeliveries([digest('digest:1'), digest('digest:2')]),
  ).resolves.toBe(2);

  expect(fakes.runWebappNamedRoot.mock.calls[0]?.slice(1, 3)).toEqual([
    'app.enqueue_operator_health_digest_delivery(text,text,text,integer)',
    ['digest:1', 'email', JSON.stringify({ intent: digest('digest:1').intent }), 6],
  ]);
  // Прямой INSERT под `app_staff` — это 42501, и именно поэтому строк
  // `kind='operator_health_digest'` не появлялось ни разу за всю историю.
  expect(fakes.drizzle.transaction).not.toHaveBeenCalled();
});

it('повторный тик тех же суток не рождает второй сводки', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ inserted: false }] });

  await expect(enqueueOperatorHealthDigestDeliveries([digest('digest:1')])).resolves.toBe(0);
});
