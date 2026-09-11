import { withExplicitOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  listBookableBranchesForOrganization,
  listPublicBookableServicesForBranch,
  resolveBookableOnlineLocationForOrganization,
  resolvePublicBookableSpecialistForOrganization,
  type BookableBranchOption,
  type InPersonServiceListItem,
  type OnlineBookingLocationOption,
} from '@/modules/patient-booking/inPersonServicesCatalog';

/**
 * Специалист, названный ссылкой, в том виде, в каком его показывает модуль записи (#926 §17.C).
 *
 * `cardIsReadable` — ответ галки организации «показывать визитки специалистов в модуле записи»
 * (§17.Q, решение владельца 11.09), уже сведённый дверью с собственной публикацией человека.
 * Экран по нему решает ровно одно: даёт ли он перейти к описанию или показывает только имя.
 */
export type BookingEntrySpecialist = {
  id: string;
  fullName: string;
  cardIsReadable: boolean;
};

/**
 * Первый экран записи КАК ФУНКЦИЯ ПАРАМЕТРОВ ссылки (план §6.2).
 *
 * `branches`    — ссылка не назвала филиал: человек выбирает его сам. Если назван специалист,
 *                 список уже сужен до филиалов, где он принимает, и видно его имя (§17.C);
 * `services`    — ссылка зафиксировала филиал (и, возможно, специалиста): показываем услуги;
 * `stale`       — параметр в ссылке протух. Три РАЗНЫХ экрана и ни одного пустого списка (§6.3);
 * `unavailable` — каталог не прочитался. Это не «услуг нет», это отказ, и он слышен.
 */
export type BookingEntryScreen =
  | {
      kind: 'branches';
      branches: BookableBranchOption[];
      onlineLocation: OnlineBookingLocationOption | null;
      /**
       * Специалист из ссылки, если он в ней назван (#926 §17.C). Тогда список филиалов — уже
       * только те, где он принимает (план §6.2), и человек обязан видеть, к кому он идёт.
       */
      specialist: BookingEntrySpecialist | null;
    }
  | {
      kind: 'services';
      branch: { id: string; title: string; cityCode: string };
      specialist: BookingEntrySpecialist | null;
      services: InPersonServiceListItem[];
      /** Пара (филиал, специалист) действующая, но услуг под неё сейчас нет. */
      emptyUnderConditions: boolean;
    }
  | {
      kind: 'stale';
      reason: 'branch_gone' | 'specialist_gone';
      branches: BookableBranchOption[];
      onlineLocation: OnlineBookingLocationOption | null;
    }
  | { kind: 'unavailable' };

function reportBookingEntryFailure(organizationId: string, error: unknown): void {
  const chain: unknown[] = [];
  for (
    let link: unknown = error;
    link && chain.length < 4;
    link = (link as { cause?: unknown }).cause
  ) {
    chain.push(link);
  }
  const code =
    chain
      .map((link) => (link as { code?: unknown } | null)?.code)
      .find((value): value is string => typeof value === 'string') ?? 'unknown';
  console.error('[clinic-booking] entry catalog read failed', {
    category: code === '42501' ? 'capability_denied' : 'repository_unavailable',
    errorClass: error instanceof Error ? error.name : 'unknown',
    code,
    message: error instanceof Error ? error.message : String(error),
    source: 'app/[clinicSlug]/booking:entry',
    organizationId,
  });
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadBookingEntryScreenRsc(input: {
  organizationId: string;
  branchId: string | null;
  specialistId: string | null;
}): Promise<BookingEntryScreen> {
  const deps = buildAppDeps();
  const branchId = input.branchId && UUID_PATTERN.test(input.branchId) ? input.branchId : null;
  const specialistId =
    input.specialistId && UUID_PATTERN.test(input.specialistId) ? input.specialistId : null;

  try {
    return await withExplicitOrganizationPrincipal(
      { organizationId: input.organizationId, source: 'app/[clinicSlug]/booking:entry' },
      async (): Promise<BookingEntryScreen> => {
        const onlineLocationFor = (narrowToSpecialistId: string | null) =>
          resolveBookableOnlineLocationForOrganization(
            deps,
            input.organizationId,
            listPublicBookableServicesForBranch,
            narrowToSpecialistId,
          );

        // `null` у специалиста — одинаковый отказ на все три причины (нет такого, чужой,
        // неактивен): различать их наружу значит дать перебирать людей по форме ответа (§3.3).
        // Экран у них поэтому тоже один — §6.3, `specialist_gone`. Публичность его карточки в
        // этот отбор больше не входит (§17.Q): она решает только читаемость описания.
        //
        // Идентификатор из ссылки НИКОГДА не выбирает организацию: она уже разрешена из slug и
        // установлена принципалом, а дверь берёт её из принятого контекста. Чужой идентификатор
        // поэтому просто не находится.
        //
        // Несужённый онлайн-приём читается здесь же: без специалиста в ссылке это ответ, а с ним —
        // то, что покажет экран отказа. Лишнего обращения к двери на обычном пути не появляется.
        const [branches, specialist, clinicOnlineLocation] = await Promise.all([
          listBookableBranchesForOrganization(deps, input.organizationId),
          specialistId
            ? resolvePublicBookableSpecialistForOrganization(
                deps,
                input.organizationId,
                specialistId,
              )
            : Promise.resolve(null),
          onlineLocationFor(null),
        ]);
        if (!branches) return { kind: 'unavailable' };

        // Отказ по специалисту возвращает человека на ОБЫЧНЫЙ первый экран клиники (§6.3):
        // и филиалы, и онлайн-приём здесь не сужены — специалиста из ссылки больше нет.
        const specialistGone = (): BookingEntryScreen => ({
          kind: 'stale',
          reason: 'specialist_gone',
          branches,
          onlineLocation: clinicOnlineLocation,
        });

        if (specialistId && !specialist) return specialistGone();

        const onlineLocation = specialist
          ? await onlineLocationFor(specialist.id)
          : clinicOnlineLocation;

        // Первый экран со специалистом — только те филиалы, где он ДЕЙСТВИТЕЛЬНО принимает
        // (план §6.2). Не осталось ни одного и онлайн-приёма у него тоже нет — это тот же случай
        // «больше не принимает записи», а не пустой список (план §6.3).
        const reachableBranches = specialist
          ? branches.filter((branch) => specialist.branchIds.includes(branch.id))
          : branches;
        if (specialist && reachableBranches.length === 0 && !onlineLocation) {
          return specialistGone();
        }

        const entrySpecialist: BookingEntrySpecialist | null = specialist
          ? {
              id: specialist.id,
              fullName: specialist.fullName,
              cardIsReadable: specialist.cardIsReadable,
            }
          : null;

        // План §6.2 обещает первым экраном со специалистом «услуги этого специалиста, с
        // филиалом(ами), где он принимает». Здесь первым экраном остаются ФИЛИАЛЫ — сужённые до
        // тех, где он действительно принимает, — и это не расхождение, а его единственное честное
        // прочтение: услуга записывается в КОНКРЕТНЫЙ филиал, и до выбора филиала списка услуг не
        // существует. У специалиста филиалов может быть несколько, а адрес — это то, ради чего
        // человек и смотрит на экран: показать услуги, не сказав, куда идти, значит спросить его
        // об этом позже и без повода.
        if (!branchId) {
          return {
            kind: 'branches',
            branches: reachableBranches,
            onlineLocation,
            specialist: entrySpecialist,
          };
        }

        const listed = await listPublicBookableServicesForBranch(
          deps,
          input.organizationId,
          branchId,
          specialist?.id ?? null,
        );
        if (!listed) {
          return { kind: 'stale', reason: 'branch_gone', branches: reachableBranches, onlineLocation };
        }
        return {
          kind: 'services',
          branch: listed.branch,
          specialist: entrySpecialist,
          services: listed.services,
          emptyUnderConditions: listed.services.length === 0,
        };
      },
    );
  } catch (error) {
    reportBookingEntryFailure(input.organizationId, error);
    return { kind: 'unavailable' };
  }
}
