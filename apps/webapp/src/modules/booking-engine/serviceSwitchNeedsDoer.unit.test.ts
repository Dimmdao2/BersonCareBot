/**
 * #1102 S-02. Оракул — слова владельца 11.09 из
 * `docs/_TODO/SERVICE_IS_ENABLED_ONLY_WHEN_SOMEBODY_DOES_IT_2026-09-11.md`, не реализация:
 *
 *  §1.2 «Услуга не включена, то есть она может создаться, но она не может включиться. Если у неё
 *       не назначен, соответственно, специалист.»
 *  §2   «Услугу мы можем включить галочкой или выключить. Это её просто быстрое отображение, не
 *       меняя её настроек и привязок.»
 *
 * Дорогой молчаливый отказ, ради которого написано: клиника поднимает выключатель услуги, которую
 * никто не оказывает, кабинет молчит и показывает её включённой — а мастер записи её не отдаёт
 * (INNER JOIN по живому пересечению), и запись на неё физически невозможна. Клиника узнаёт об
 * этом от пациента, а не от продукта.
 *
 * Обратная сторона того же правила проверяется тем же файлом: если отказ повесить на всю запись
 * услуги, а не на ПЕРЕХОД «выключена → включена», клиника перестанет мочь выключить сломанную
 * услугу и переименовать уже включённую — тупик, из которого нет выхода изнутри кабинета.
 *
 * Проверяется публичная граница модуля (`createBookingEngineService(...).services.upsertService`),
 * потому что именно она — единственная запись услуги: маршруты `POST /services` и
 * `PATCH /services/[id]` ходят только через неё, отдельного guard, который маршрут мог бы забыть
 * позвать, здесь нет (§5 «один общий проход»).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  enterWithMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import { userFacingMessage } from '@/shared/errors/userFacingError';
import { createBookingEngineService } from './service';
import type { BookingEngineCorePort } from './ports';
import type { BeClinicService } from './types';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const SERVICE_ID = '22222222-2222-4222-8222-222222222222';
const SPECIALIST_ID = '33333333-3333-4333-8333-333333333333';
const BRANCH_ID = '44444444-4444-4444-8444-444444444444';

function serviceRow(isActive: boolean): BeClinicService {
  return {
    id: SERVICE_ID,
    organizationId: ORG_ID,
    title: 'Услуга',
    description: null,
    durationMinutes: 60,
    bufferAfterMinutes: 0,
    priceMinor: 100000,
    isActive,
    prepaymentApplicable: false,
    usableInPackages: false,
    onlinePaymentApplicable: false,
    publicWidgetVisible: true,
    adminManualOnly: false,
    sortOrder: 10,
  };
}

/**
 * Порт подделан целиком: у сервиса больше сотни методов, и перечислять их по именам значило бы
 * переписывать этот файл при каждом новом методе, ничего при этом не проверяя.
 */
function buildService(input: {
  previous: BeClinicService | null;
  doers: { serviceId: string; specialistId: string; branchId: string }[];
}) {
  const upsertService = vi.fn(async (row: { isActive: boolean }) => serviceRow(row.isActive));
  const named: Record<string, unknown> = {
    getService: vi.fn(async () => input.previous),
    listServiceDoerIntersections: vi.fn(async () => input.doers),
    upsertService,
  };
  const memo = new Map<string, unknown>();
  const port = new Proxy({} as BookingEngineCorePort, {
    get(_target, property: string) {
      if (property in named) return named[property];
      if (!memo.has(property)) memo.set(property, vi.fn());
      return memo.get(property);
    },
    has: () => true,
  });
  return { service: createBookingEngineService(port), upsertService };
}

function switchTo(isActive: boolean) {
  return {
    organizationId: ORG_ID,
    id: SERVICE_ID,
    title: 'Услуга',
    description: null,
    durationMinutes: 60,
    bufferAfterMinutes: 0,
    priceMinor: 100000,
    isActive,
    prepaymentApplicable: false,
    usableInPackages: false,
    onlinePaymentApplicable: false,
    publicWidgetVisible: true,
    adminManualOnly: false,
    sortOrder: 10,
  };
}

const DOER = { serviceId: SERVICE_ID, specialistId: SPECIALIST_ID, branchId: BRANCH_ID };

describe('услуга включается только тогда, когда её кто-то делает (#1102 §1.2)', () => {
  it('не даёт поднять выключатель услуги, которую никто не оказывает, и объясняет причину', async () => {
    const { service, upsertService } = buildService({ previous: serviceRow(false), doers: [] });

    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('booking');
      const error = await service.services.upsertService(switchTo(true)).catch((e: unknown) => e);

      // Запись не состоялась: иначе в базе стоит «включена», а записаться нельзя.
      expect(upsertService).not.toHaveBeenCalled();
      // Отказ обязан дойти до человека словами. Текст не сверяется — сверяется то, что отказ
      // помечен как показываемый пользователю: маршрут по этому признаку отдаёт 409 с
      // объяснением, а непомеченная ошибка ушла бы в 500 без единого слова.
      expect(userFacingMessage(error) ?? '', 'отказ обязан назвать причину человеку').not.toBe('');
    });
  });

  it('даёт поднять выключатель, как только пересечение появилось', async () => {
    const { service, upsertService } = buildService({ previous: serviceRow(false), doers: [DOER] });

    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('booking');
      await service.services.upsertService(switchTo(true));
    });

    // Владелец §2.2: «как только назначили специалиста, назначили филиал… её можно включать».
    expect(upsertService).toHaveBeenCalledOnce();
  });

  it('выключить услугу и править уже включённую можно всегда, даже без исполнителя', async () => {
    const off = buildService({ previous: serviceRow(true), doers: [] });
    const rename = buildService({ previous: serviceRow(true), doers: [] });

    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('booking');
      await off.service.services.upsertService(switchTo(false));
      await rename.service.services.upsertService({ ...switchTo(true), title: 'Другое название' });
    });

    // Иначе клиника, у которой пересечения кончились, заперта: сломанную услугу не выключить и
    // не переименовать, потому что любая её запись упирается в отсутствующего исполнителя.
    expect(off.upsertService).toHaveBeenCalledOnce();
    expect(rename.upsertService).toHaveBeenCalledOnce();
  });
});
