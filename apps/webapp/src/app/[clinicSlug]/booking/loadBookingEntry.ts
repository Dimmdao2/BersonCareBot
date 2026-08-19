import { withExplicitOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  listBookableBranchesForOrganization,
  listInPersonServicesForBranch,
  resolveBookableOnlineLocationForOrganization,
  type BookableBranchOption,
  type InPersonServiceListItem,
  type OnlineBookingLocationOption,
} from '@/modules/patient-booking/inPersonServicesCatalog';

/**
 * Первый экран записи КАК ФУНКЦИЯ ПАРАМЕТРОВ ссылки (план §6.2).
 *
 * `branches`    — ссылка ничего не зафиксировала: человек выбирает филиал сам;
 * `services`    — ссылка зафиксировала филиал (и, возможно, специалиста): показываем услуги;
 * `stale`       — параметр в ссылке протух. Три РАЗНЫХ экрана и ни одного пустого списка (§6.3);
 * `unavailable` — каталог не прочитался. Это не «услуг нет», это отказ, и он слышен.
 */
export type BookingEntryScreen =
  | {
      kind: 'branches';
      branches: BookableBranchOption[];
      onlineLocation: OnlineBookingLocationOption | null;
    }
  | {
      kind: 'services';
      branch: { id: string; title: string; cityCode: string };
      specialistName: string | null;
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
        const [branches, onlineLocation] = await Promise.all([
          listBookableBranchesForOrganization(deps, input.organizationId),
          resolveBookableOnlineLocationForOrganization(deps, input.organizationId),
        ]);
        if (!branches) return { kind: 'unavailable' };

        // Идентификатор из ссылки НИКОГДА не выбирает организацию: она уже разрешена из slug и
        // установлена принципалом. Чужой филиал поэтому просто не находится — `listInPersonServices
        // ForBranch` отбивает `branch.organizationId !== organizationId`, а специалисты и услуги
        // фильтруются по той же организации.
        if (!branchId && !specialistId) {
          return { kind: 'branches', branches, onlineLocation };
        }

        let specialistName: string | null = null;
        if (specialistId) {
          const specialists = deps.bookingEngine
            ? await deps.bookingEngine.catalog.listSpecialists(input.organizationId)
            : [];
          const specialist = specialists.find(
            (item) =>
              item.id === specialistId &&
              item.organizationId === input.organizationId &&
              item.isActive,
          );
          if (!specialist) {
            return { kind: 'stale', reason: 'specialist_gone', branches, onlineLocation };
          }
          specialistName = specialist.fullName;
        }

        // Только специалист, без филиала: филиал всё равно выбирает человек, но список сужается до
        // тех, где этот специалист принимает. Пустой список означал бы, что специалист фактически
        // не принимает нигде, — это экран «специалист ушёл», а не пустой список.
        if (!branchId) {
          const withSpecialist: BookableBranchOption[] = [];
          for (const branch of branches) {
            const listed = await listInPersonServicesForBranch(
              deps,
              input.organizationId,
              branch.id,
              specialistId,
            );
            if (listed && listed.services.length > 0) withSpecialist.push(branch);
          }
          if (withSpecialist.length === 0) {
            return { kind: 'stale', reason: 'specialist_gone', branches, onlineLocation };
          }
          return { kind: 'branches', branches: withSpecialist, onlineLocation };
        }

        const listed = await listInPersonServicesForBranch(
          deps,
          input.organizationId,
          branchId,
          specialistId,
        );
        if (!listed) return { kind: 'stale', reason: 'branch_gone', branches, onlineLocation };
        return {
          kind: 'services',
          branch: listed.branch,
          specialistName,
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
