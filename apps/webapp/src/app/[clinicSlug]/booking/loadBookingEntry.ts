import { withExplicitOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  listBookableBranchesForOrganization,
  listPublicBookableServicesForBranch,
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
          resolveBookableOnlineLocationForOrganization(
            deps,
            input.organizationId,
            listPublicBookableServicesForBranch,
          ),
        ]);
        if (!branches) return { kind: 'unavailable' };

        // Идентификатор из ссылки НИКОГДА не выбирает организацию: она уже разрешена из slug и
        // установлена принципалом. Чужой филиал поэтому просто не находится —
        // `listPublicBookableServicesForBranch` отбивает `branch.organizationId !== organizationId`.
        if (!branchId && !specialistId) {
          return { kind: 'branches', branches, onlineLocation };
        }

        // Специалист в ссылке: анонимная дверь каталога (`app.read_public_booking_catalog`, миграция
        // 0047) не несёт идентичности специалиста вовсе — только уже отфильтрованные по «есть активный
        // специалист» услуги. Резолвить имя специалиста или сузить каталог по нему здесь нечем без
        // новой публичной двери (F1 отчёт audit 19.08, «что проверить не смог» п.2), а
        // `bookingEngine.catalog.listSpecialists` — кабинетный `db.select()`, у анонимного класса
        // `tenant_service` нет для него грантов вовсе (падает 42501). Строить новую дверь — за
        // пределами этого фикса; чтобы параметр не убивал всю страницу, он логируется и игнорируется:
        // посетитель получает настоящий (нефильтрованный по специалисту) каталог вместо «недоступно».
        if (specialistId) {
          console.warn('[clinic-booking] specialist scoping ignored: no public catalog door for it', {
            source: 'app/[clinicSlug]/booking:entry',
            organizationId: input.organizationId,
            specialistId,
          });
        }

        if (!branchId) {
          return { kind: 'branches', branches, onlineLocation };
        }

        const listed = await listPublicBookableServicesForBranch(
          deps,
          input.organizationId,
          branchId,
        );
        if (!listed) return { kind: 'stale', reason: 'branch_gone', branches, onlineLocation };
        return {
          kind: 'services',
          branch: listed.branch,
          specialistName: null,
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
