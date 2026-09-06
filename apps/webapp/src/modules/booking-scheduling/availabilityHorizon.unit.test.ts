/**
 * BAH-01/BAH-02: горизонт онлайн-записи задаёт КЛИНИКА, а не константа в коде.
 *
 * Какие поломки ловит (по одной фразе на класс):
 *  - клиника поставила 7 дней, а выдача доступных дней всё равно кончается на 14-м дне (старый
 *    hardcode `addDays(today, 13)` или новый hardcode 30) — пациент видит не тот календарь, и
 *    никто этого не замечает: список непустой, просто чужой длины;
 *  - клиент подставил `date` за горизонтом и получил слоты в обход первого списка — бронь уезжает
 *    дальше, чем клиника вообще планирует работать;
 *  - горизонт прочитан не для той организации — клиника A получает горизонт клиники B.
 *
 * Oracle — решение владельца `docs/_TODO/BOOKING_AVAILABILITY_HORIZON_2026-09-04.md` (BAH-01, BAH-02),
 * не текущая реализация. Слой самый дешёвый: границы диапазона видит сервис, поднимать БД/HTTP/UI
 * ради них незачем (AGENTS.md §10b «самый дешёвый публичный слой»).
 *
 * Время фиксируется `vi.setSystemTime`: без этого тест зависел бы от даты прогона (§10a, п. 6).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBookingSchedulingService } from './service';
import type { BookingSchedulingPort } from './ports';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const BRANCH_ID = '33333333-3333-4333-8333-333333333333';
const SERVICE_ID = '44444444-4444-4444-8444-444444444444';

/** Полдень в Москве 10.09.2026 — локальная дата не съезжает на соседнюю при пересчёте зоны. */
const NOW = '2026-09-10T09:00:00.000Z';
const TODAY = '2026-09-10';

function buildService(horizonByOrg: Record<string, number>) {
  const getSlots = vi.fn(async () => []);
  const getAvailabilityHorizonDays = vi.fn(async (organizationId: string) => {
    const days = horizonByOrg[organizationId];
    if (days == null) throw new Error(`no horizon configured for ${organizationId}`);
    return days;
  });
  const resolveCanonicalInPersonContext = vi.fn(
    async ({ organizationId }: { organizationId: string }) => ({
      organizationId,
      branchId: BRANCH_ID,
      specialistId: null,
      roomId: null,
      serviceId: SERVICE_ID,
      durationMinutes: 60,
      bufferAfterMinutes: 0,
      branchTimezone: 'Europe/Moscow',
    }),
  );
  const port = {
    getSlots,
    getAvailabilityHorizonDays,
    resolveCanonicalInPersonContext,
  } as unknown as BookingSchedulingPort;
  return {
    service: createBookingSchedulingService(port),
    getSlots,
    getAvailabilityHorizonDays,
  };
}

function requestedRange(getSlots: ReturnType<typeof vi.fn>) {
  const call = getSlots.mock.calls[0]?.[0] as { dateFrom: string; dateTo: string } | undefined;
  return call ? { from: call.dateFrom, to: call.dateTo } : null;
}

describe('booking availability horizon (BAH-01, BAH-02)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('окно доступных дней равно горизонту клиники, а не фиксированным 14 дням', async () => {
    const { service, getSlots, getAvailabilityHorizonDays } = buildService({ [ORG_A]: 7 });

    await service.getInPersonSlots({
      organizationId: ORG_A,
      branchId: BRANCH_ID,
      serviceId: SERVICE_ID,
    });

    // 7 дней ВКЛЮЧАЯ сегодня: 10.09 … 16.09. Старый hardcode дал бы 23.09, новый «30» — 09.10.
    expect(requestedRange(getSlots)).toEqual({ from: TODAY, to: '2026-09-16' });
    expect(getAvailabilityHorizonDays).toHaveBeenCalledWith(ORG_A);
  });

  it('каждая клиника получает свой горизонт, а не горизонт соседней', async () => {
    const { service, getSlots } = buildService({ [ORG_A]: 7, [ORG_B]: 30 });

    await service.getInPersonSlots({
      organizationId: ORG_B,
      branchId: BRANCH_ID,
      serviceId: SERVICE_ID,
    });

    expect(requestedRange(getSlots)).toEqual({ from: TODAY, to: '2026-10-09' });
  });

  it('прямой запрос даты за горизонтом не отдаёт слоты в обход списка дней', async () => {
    const { service, getSlots } = buildService({ [ORG_A]: 7 });

    // Первый день ЗА горизонтом (17.09 при горизонте 7) и заведомо далёкая дата.
    await expect(
      service.getInPersonSlots({
        organizationId: ORG_A,
        branchId: BRANCH_ID,
        serviceId: SERVICE_ID,
        date: '2026-09-17',
      }),
    ).resolves.toEqual([]);
    await expect(
      service.getInPersonSlots({
        organizationId: ORG_A,
        branchId: BRANCH_ID,
        serviceId: SERVICE_ID,
        date: '2027-01-01',
      }),
    ).resolves.toEqual([]);
    // Прошлое закрыто той же дверью: вчерашний день тоже вне окна.
    await expect(
      service.getInPersonSlots({
        organizationId: ORG_A,
        branchId: BRANCH_ID,
        serviceId: SERVICE_ID,
        date: '2026-09-09',
      }),
    ).resolves.toEqual([]);

    expect(getSlots).not.toHaveBeenCalled();
  });

  it('последний день внутри горизонта по прямому запросу остаётся доступен', async () => {
    const { service, getSlots } = buildService({ [ORG_A]: 7 });

    await service.getInPersonSlots({
      organizationId: ORG_A,
      branchId: BRANCH_ID,
      serviceId: SERVICE_ID,
      date: '2026-09-16',
    });

    expect(requestedRange(getSlots)).toEqual({ from: '2026-09-16', to: '2026-09-16' });
  });

  it('онлайн-выдача читает горизонт той же клиники и закрывает тот же обход по дате', async () => {
    const { service, getSlots, getAvailabilityHorizonDays } = buildService({ [ORG_A]: 7 });

    await service.getOnlineSlots({ organizationId: ORG_A, category: 'general' });
    expect(getAvailabilityHorizonDays).toHaveBeenCalledWith(ORG_A);
    expect(requestedRange(getSlots)).toEqual({ from: TODAY, to: '2026-09-16' });

    getSlots.mockClear();
    await expect(
      service.getOnlineSlots({ organizationId: ORG_A, category: 'general', date: '2026-09-17' }),
    ).resolves.toEqual([]);
    expect(getSlots).not.toHaveBeenCalled();
  });
});
