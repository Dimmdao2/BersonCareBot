import { describe, expect, it } from 'vitest';
import { createClinicDirectoryService } from './service';
import type {
  ClinicDirectoryPort,
  OrganizationSlugManagementState,
  SetOrganizationSlugInput,
} from './ports';

/**
 * Владелец 19.08, дословно: «Клинике дается ОДНА смена слаг самостоятельно (за весь период жизни) -
 * остальное через админа только если сами напишут в поддержку». Проверяется ПОВЕДЕНИЕ этого правила,
 * а не наличие поля: что клиника получает и что при этом происходит с именем в базе.
 */
const ORG = '11111111-1111-4111-8111-111111111111';

type Recorded = { reserved: string[]; renamed: string[]; claimed: string[] };

function buildPort(state: OrganizationSlugManagementState, log: Recorded): ClinicDirectoryPort {
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
    renameSlug: async ({ reservedSlug }) => {
      log.renamed.push(reservedSlug);
      return { ok: true, slug: reservedSlug };
    },
  };
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

describe('единственная самостоятельная смена адреса', () => {
  it('первая самостоятельная смена проходит и переименовывает адрес', async () => {
    const log: Recorded = { reserved: [], renamed: [], claimed: [] };
    const service = createClinicDirectoryService(
      buildPort({ currentSlug: 'staraya', selfRenamesUsed: 0, selfRenameAllowed: true }, log),
    );

    const result = await service.setOrganizationSlug(setInput());

    expect(result).toEqual({ ok: true, slug: 'novaya-klinika' });
    expect(log.renamed).toEqual(['novaya-klinika']);
  });

  it('вторая самостоятельная смена отказана — и адрес НЕ забронирован', async () => {
    const log: Recorded = { reserved: [], renamed: [], claimed: [] };
    const service = createClinicDirectoryService(
      buildPort({ currentSlug: 'staraya', selfRenamesUsed: 1, selfRenameAllowed: false }, log),
    );

    const result = await service.setOrganizationSlug(setInput());

    expect(result).toEqual({ ok: false, code: 'self_rename_allowance_spent' });
    // Отказ ДО записи: иначе клиника заняла бы имя и получила отказ уже после, а имя осталось бы
    // висеть за ней и стало бы недоступно другим.
    expect(log.reserved).toEqual([]);
    expect(log.renamed).toEqual([]);
  });

  it('исчерпанное право НИКОГДА не выглядит как занятое имя', async () => {
    const log: Recorded = { reserved: [], renamed: [], claimed: [] };
    const service = createClinicDirectoryService(
      buildPort({ currentSlug: 'staraya', selfRenamesUsed: 1, selfRenameAllowed: false }, log),
    );

    const result = await service.setOrganizationSlug(setInput());

    expect(result.ok).toBe(false);
    // Владелец различает эти два отказа: «имя занято» — про чужое владение, здесь же имя свободно,
    // а исчерпано право. Спутать их значит отправить человека придумывать ненужное новое имя.
    expect(result.ok === false && result.code).not.toBe('slug_unavailable');
  });

  it('админская смена лимит не тратит и проходит после исчерпанного самостоятельного', async () => {
    const log: Recorded = { reserved: [], renamed: [], claimed: [] };
    const service = createClinicDirectoryService(
      buildPort({ currentSlug: 'staraya', selfRenamesUsed: 1, selfRenameAllowed: false }, log),
    );

    const result = await service.setOrganizationSlug(setInput({ initiatedBy: 'platform_admin' }));

    expect(result).toEqual({ ok: true, slug: 'novaya-klinika' });
    expect(log.renamed).toEqual(['novaya-klinika']);
  });

  it('первое присвоение адреса лимитом не ограничено — это не смена', async () => {
    const log: Recorded = { reserved: [], renamed: [], claimed: [] };
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
