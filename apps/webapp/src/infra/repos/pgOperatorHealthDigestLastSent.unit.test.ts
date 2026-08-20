import { beforeEach, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  runWebappNamedRoot: vi.fn(),
  drizzle: { select: vi.fn(), transaction: vi.fn() },
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: () => fakes.db,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
}));

vi.mock('@/app-layer/db/drizzle', () => ({
  getDrizzle: () => fakes.drizzle,
}));

import { loadLatestSentOperatorHealthDigestAt } from '@/infra/repos/pgOperatorHealthDigestDeliveries';

beforeEach(() => {
  vi.clearAllMocks();
});

it('сводка получает время прошлой отправки, а не отказ очереди', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ last_sent_at: '2026-08-18T06:00:03.221Z' }] });

  await expect(loadLatestSentOperatorHealthDigestAt()).resolves.toBe('2026-08-18T06:00:03.221Z');

  expect(fakes.runWebappNamedRoot.mock.calls[0]?.slice(1, 3)).toEqual([
    'app.read_operator_health_digest_last_sent_at()',
    [],
  ]);
  // Прямое чтение отношения здесь — это 42501 под `app_staff` и упавший тик сводки: на
  // `public.outgoing_delivery_queue` у рабочих ролей вебаппа нет ни одной привилегии.
  expect(fakes.drizzle.select).not.toHaveBeenCalled();
});

it('сводки не было ни разу — это ответ NULL, а не ошибка', async () => {
  fakes.runWebappNamedRoot.mockResolvedValue({ rows: [{ last_sent_at: null }] });

  await expect(loadLatestSentOperatorHealthDigestAt()).resolves.toBeNull();
});
