import { describe, expect, it } from 'vitest';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { withExplicitOrganizationPrincipal } from './withOrganizationPrincipal';
import { isCurrentPublicBookingPrincipal } from './publicBookingPrincipal';

/**
 * Что сломается без этого теста — две поломки, обе дорогие и обе молчаливые.
 *
 * 1. Источник не доезжает до принципала. Тогда `isCurrentPublicBookingPrincipal()` не срабатывает
 *    НИКОГДА, вся публичная воронка уходит на реляционный путь, которого у класса `tenant_service`
 *    нет, и каждая опубликованная клиника снова отдаёт «Каталог недоступен» — ровно тот отказ,
 *    из-за которого публичная запись стояла неделю. До 19.08 `withExplicitOrganizationPrincipal`
 *    именно так и делал: проверял `source` на непустоту и выбрасывал его.
 *
 * 2. Признак публичной воронки написан как «принципал организации». Тогда под него попадают
 *    кабинетные маршруты абонементов и вебхуки эквайринга — они ходят под ТЕМ ЖЕ видом принципала,
 *    но дверей публичной записи для них не объявлено; их чтения молча уедут в чужие двери.
 *
 * Oracle — контракт миграции 0043 и `SCHEME.md` §3: арендаторский класс ходит именованными
 * корнями, а корни публичной записи объявлены только для публичной воронки.
 */
const organizationId = '53000000-0000-4000-8000-0000000000a1';

async function principalSourceUnder(source: string): Promise<string | undefined> {
  return withExplicitOrganizationPrincipal({ organizationId, source }, async () => {
    const principal = getCurrentDbPrincipal();
    return principal?.kind === 'organization' ? principal.source : undefined;
  });
}

async function isPublicUnder(source: string): Promise<boolean> {
  return withExplicitOrganizationPrincipal({ organizationId, source }, async () =>
    isCurrentPublicBookingPrincipal(),
  );
}

describe('public booking principal — the funnel is told apart from every other tenant principal', () => {
  it('carries the declared source onto the organization principal itself', async () => {
    await expect(principalSourceUnder('app/book/[slug]:load-cities')).resolves.toBe(
      'app/book/[slug]:load-cities',
    );
    await expect(principalSourceUnder('api/booking/memberships/catalog:GET')).resolves.toBe(
      'api/booking/memberships/catalog:GET',
    );
  });

  it.each([
    'app/book/[slug]:load-cities',
    'app/book/[slug]:load-services',
    'app/book:load-direct-slot-context',
    'api/booking/public/slots:GET',
    'api/booking/public/form-fields:GET',
    'api/booking/public/create:POST',
    'api/booking/public/create/confirm:POST',
  ])('recognises the public funnel entry point %s', async (source) => {
    await expect(isPublicUnder(source)).resolves.toBe(true);
  });

  it.each([
    'api/booking/memberships/catalog:GET',
    'api/booking/memberships/purchase:POST',
    'api/booking/payment-status:GET',
    'app-layer/booking:created-effects',
  ])('does not capture the other tenant principal at %s', async (source) => {
    await expect(isPublicUnder(source)).resolves.toBe(false);
  });

  it('is false outside any principal at all', () => {
    expect(isCurrentPublicBookingPrincipal()).toBe(false);
  });
});
