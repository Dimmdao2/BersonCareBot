/**
 * Тупик на промахе в имени клиники: страница отказа даёт выход на общий вход — и только на
 * поддомене НАШЕГО пациентского домена.
 *
 * Владелец 11.09.2026 набрал руками несуществующий поддомен и получил страницу, которая
 * предлагала «попросить отправить ссылку заново», хотя никакой ссылки он не открывал. Его слова:
 * «вместо того, чтобы показать, что такой страницы не существует, или просто редиректнуть,
 * например, на главную страницу входа в терапиго, что правильно сделать было бы».
 *
 * Что здесь закреплено и что этим ловится:
 *   1. на поддомене пациентского домена в теле отказа есть ссылка на общий вход — иначе человек
 *      снова упирается в тупик;
 *   2. на ЧУЖОМ домене этой ссылки нет — иначе отказ начинает рекламировать платформу там, где о
 *      ней не спрашивали;
 *   3. статус остаётся 404 и не зависит от того, выдуман слаг или существует, но неактивен, —
 *      иначе рушится решение B4a/B5 «один и тот же ответ на весь хост».
 */
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TenantSurfaceLookup } from '@/shared/lib/surface/requestSurface';

const tenantLookupRuntime = vi.hoisted(() => ({
  current: undefined as TenantSurfaceLookup | undefined,
}));

vi.mock('@/app-layer/surface/productionTenantSurfaceLookup', () => ({
  productionTenantSurfaceLookup: (hostname: string) =>
    (tenantLookupRuntime.current ?? (async () => ({ status: 'unknown' as const })))(hostname),
}));

const STAFF_ORIGIN = 'https://stf.exit.test';
const PATIENT_ORIGIN = 'https://pat.exit.test';

async function loadProxy() {
  vi.resetModules();
  vi.stubEnv('APP_BASE_URL', STAFF_ORIGIN);
  vi.stubEnv('PATIENT_APP_ORIGIN', PATIENT_ORIGIN);
  const proxyModule = await import('@/proxy');
  return (request: NextRequest, tenantLookup?: TenantSurfaceLookup) => {
    tenantLookupRuntime.current = tenantLookup;
    return proxyModule.proxy(request, {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    });
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

function requestFor(host: string, path = '/'): NextRequest {
  return new NextRequest(`https://${host}${path}`, {
    headers: { host, 'x-forwarded-proto': 'https' },
  });
}

describe('промах в имени клиники — выход есть, лишнего нет', () => {
  it('поддомен пациентского домена: 404 и ссылка на общий вход', async () => {
    const proxy = await loadProxy();
    const response = await proxy(requestFor(`net-takoy-kliniki.${new URL(PATIENT_ORIGIN).hostname}`));
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).toContain(`href="${PATIENT_ORIGIN}/"`);
    expect(body).toContain('Открыть общий вход');
    // Про «ссылку, которую надо попросить заново» здесь речи нет: человек набрал адрес руками.
    expect(body).not.toContain('попросите отправить её заново');
  });

  it('чужой домен: 404 без всякого выхода на платформу', async () => {
    const proxy = await loadProxy();
    const response = await proxy(requestFor('shop.chuzhoy-domen.test'));
    expect(response.status).toBe(404);
    const body = await response.text();
    expect(body).not.toContain(PATIENT_ORIGIN);
    expect(body).toContain('попросите отправить её заново');
  });

  it('неактивная организация неотличима от выдуманного слага: тот же 404 и то же тело', async () => {
    const proxy = await loadProxy();
    const host = `zakrytaya.${new URL(PATIENT_ORIGIN).hostname}`;
    const inactive = await proxy(requestFor(host), async () => ({ status: 'inactive' as const }));
    const invented = await proxy(requestFor(`vydumannaya.${new URL(PATIENT_ORIGIN).hostname}`));
    expect(inactive.status).toBe(404);
    expect(invented.status).toBe(404);
    expect(await inactive.text()).toBe(await invented.text());
  });
});
