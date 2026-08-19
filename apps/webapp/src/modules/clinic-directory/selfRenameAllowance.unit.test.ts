import { describe, expect, it } from 'vitest';
import { createClinicDirectoryService } from './service';
import type {
  ClinicDirectoryPort,
  OrganizationSlugManagementState,
  SetOrganizationSlugInput,
} from './ports';

/**
 * Владелец 19.08, дословно: «Клинике дается ОДНА смена слаг самостоятельно (за весь период жизни) -
 * остальное через админа только если сами напишут в поддержку».
 *
 * САМО правило проверяется не здесь: решение принимает транзакция внутри `renameSlug`, а транзакцию
 * подделкой не изобразить — её живое доказательство идёт двумя одновременными запросами к DEV.
 * Здесь проверяется ровно то, что осталось за сценарным слоем: он НЕ решает сам, передаёт вниз
 * настоящего инициатора и не переписывает пришедший снизу отказ.
 */
const ORG = '11111111-1111-4111-8111-111111111111';

type Recorded = {
  reserved: string[];
  claimed: string[];
  renamed: { slug: string; initiatedBy: SetOrganizationSlugInput['initiatedBy'] }[];
};

function buildPort(
  state: OrganizationSlugManagementState,
  log: Recorded,
  renameResult: Awaited<ReturnType<ClinicDirectoryPort['renameSlug']>> | null = null,
): ClinicDirectoryPort {
  return {
    resolveOrganizationIdBySlug: async () => null,
    getPublishedSlugForOrganization: async () => state.currentSlug,
    getSlugManagementState: async () => state,
    resolveCanonicalSlug: async () => null,
    isSlugAvailable: async () => true,
    reserveSlug: async ({ slug }) => {
      log.reserved.push(slug);
      return { ok: true, slug };
    },
    claimReservedSlug: async ({ slug }) => {
      log.claimed.push(slug);
      return { ok: true, slug };
    },
    renameSlug: async ({ reservedSlug, initiatedBy }) => {
      log.renamed.push({ slug: reservedSlug, initiatedBy });
      return renameResult ?? { ok: true, slug: reservedSlug };
    },
  };
}

function emptyLog(): Recorded {
  return { reserved: [], claimed: [], renamed: [] };
}

function setInput(over: Partial<SetOrganizationSlugInput> = {}): SetOrganizationSlugInput {
  return {
    organizationId: ORG,
    slug: 'novaya-klinika',
    irreversibleRenameConfirmed: true,
    initiatedBy: 'clinic',
    ...over,
  };
}

describe('единственная самостоятельная смена адреса — сценарный слой', () => {
  it('первая самостоятельная смена доходит до записи как самостоятельная', async () => {
    const log = emptyLog();
    const service = createClinicDirectoryService(
      buildPort({ currentSlug: 'staraya', selfRenamesUsed: 0, selfRenameAllowed: true }, log),
    );

    const result = await service.setOrganizationSlug(setInput());

    expect(result).toEqual({ ok: true, slug: 'novaya-klinika' });
    expect(log.renamed).toEqual([{ slug: 'novaya-klinika', initiatedBy: 'clinic' }]);
  });

  it('сценарный слой НЕ решает сам: устаревшее показание не отменяет поход к двери', async () => {
    // Показание `selfRenameAllowed: false` прочитано отдельным запросом и к моменту записи может
    // быть любым. Если бы слой отказывал по нему, он бы и пропускал по нему: два одновременных
    // запроса читали бы `true` до чужого коммита и потратили пожизненное право дважды.
    const log = emptyLog();
    const service = createClinicDirectoryService(
      buildPort({ currentSlug: 'staraya', selfRenamesUsed: 1, selfRenameAllowed: false }, log, {
        ok: false,
        code: 'self_rename_allowance_spent',
      }),
    );

    const result = await service.setOrganizationSlug(setInput());

    expect(log.renamed).toEqual([{ slug: 'novaya-klinika', initiatedBy: 'clinic' }]);
    expect(result).toEqual({ ok: false, code: 'self_rename_allowance_spent' });
  });

  it('исчерпанное право НИКОГДА не выглядит как занятое имя', async () => {
    const log = emptyLog();
    const service = createClinicDirectoryService(
      buildPort({ currentSlug: 'staraya', selfRenamesUsed: 1, selfRenameAllowed: false }, log, {
        ok: false,
        code: 'self_rename_allowance_spent',
      }),
    );

    const result = await service.setOrganizationSlug(setInput());

    // Владелец различает эти два отказа: «имя занято» — про чужое владение, здесь же имя свободно,
    // а исчерпано право. Спутать их значит отправить человека придумывать ненужное новое имя.
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('self_rename_allowance_spent');
  });

  it('админская смена приходит вниз админской и лимитом не ограничена', async () => {
    const log = emptyLog();
    const service = createClinicDirectoryService(
      buildPort({ currentSlug: 'staraya', selfRenamesUsed: 1, selfRenameAllowed: false }, log),
    );

    const result = await service.setOrganizationSlug(setInput({ initiatedBy: 'platform_admin' }));

    expect(result).toEqual({ ok: true, slug: 'novaya-klinika' });
    // Инициатор доезжает до записи: подмена его на `clinic` тратила бы клинике право за обращение в
    // поддержку, подмена в обратную сторону сняла бы лимит вовсе.
    expect(log.renamed).toEqual([{ slug: 'novaya-klinika', initiatedBy: 'platform_admin' }]);
  });

  it('первое присвоение адреса лимитом не ограничено — это не смена', async () => {
    const log = emptyLog();
    const service = createClinicDirectoryService(
      buildPort({ currentSlug: null, selfRenamesUsed: 0, selfRenameAllowed: false }, log),
    );

    const result = await service.setOrganizationSlug(
      setInput({ irreversibleRenameConfirmed: false }),
    );

    expect(result).toEqual({ ok: true, slug: 'novaya-klinika' });
    expect(log.claimed).toEqual(['novaya-klinika']);
    expect(log.renamed).toEqual([]);
  });
});
