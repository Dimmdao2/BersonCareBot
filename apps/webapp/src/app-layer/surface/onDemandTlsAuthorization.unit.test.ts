import { describe, expect, it, vi } from 'vitest';
import {
  isOnDemandTlsHostnameAuthorized,
  normalizeAskHostname,
} from '@/app-layer/surface/onDemandTlsAuthorization';
import { PATIENT_DEFAULT_SURFACE } from '@/config/productSurfaces';

const BASE = new URL(PATIENT_DEFAULT_SURFACE.origin).hostname.toLowerCase();

function directory(known: Record<string, string>) {
  return {
    resolveOrganizationIdBySlug: vi.fn(async (slug: string) => known[slug] ?? null),
  };
}

describe('isOnDemandTlsHostnameAuthorized', () => {
  it('разрешает поддомен существующей клиники — без этого новой клинике сертификат выпускают руками', async () => {
    const clinicDirectory = directory({ berson: 'org-1' });
    await expect(
      isOnDemandTlsHostnameAuthorized(`berson.${BASE}`, { clinicDirectory }),
    ).resolves.toBe(true);
  });

  it('отказывает выдуманному поддомену — ACME-заказ не начинается вовсе', async () => {
    const clinicDirectory = directory({ berson: 'org-1' });
    await expect(
      isOnDemandTlsHostnameAuthorized(`vydumannyj.${BASE}`, { clinicDirectory }),
    ).resolves.toBe(false);
  });

  it('поддомен НЕ уходит в проверку собственных доменов: чужая дверь не должна отвечать за наше имя', async () => {
    const customDomainBinding = { isHostnameAskAuthorized: vi.fn(async () => true) };
    await expect(
      isOnDemandTlsHostnameAuthorized(`vydumannyj.${BASE}`, {
        clinicDirectory: directory({}),
        customDomainBinding,
      }),
    ).resolves.toBe(false);
    expect(customDomainBinding.isHostnameAskAuthorized).not.toHaveBeenCalled();
  });

  it('собственный домен клиники решает существующая привязка', async () => {
    const customDomainBinding = {
      isHostnameAskAuthorized: vi.fn(async (h: string) => h === 'app.bersoncare.ru'),
    };
    await expect(
      isOnDemandTlsHostnameAuthorized('app.bersoncare.ru', { customDomainBinding }),
    ).resolves.toBe(true);
    await expect(
      isOnDemandTlsHostnameAuthorized('chuzhoj-domen.ru', { customDomainBinding }),
    ).resolves.toBe(false);
  });

  it('апекс платформы разрешён сам по себе, без обращения к каталогу', async () => {
    const clinicDirectory = directory({});
    await expect(isOnDemandTlsHostnameAuthorized(BASE, { clinicDirectory })).resolves.toBe(true);
    expect(clinicDirectory.resolveOrganizationIdBySlug).not.toHaveBeenCalled();
  });

  it('двухуровневая метка под нашим доменом не считается поддоменом клиники', async () => {
    const customDomainBinding = { isHostnameAskAuthorized: vi.fn(async () => true) };
    await expect(
      isOnDemandTlsHostnameAuthorized(`a.b.${BASE}`, {
        clinicDirectory: directory({ b: 'org-1' }),
        customDomainBinding,
      }),
    ).resolves.toBe(false);
  });

  it('без каталога поддомен не разрешается даже при живой привязке доменов', async () => {
    const customDomainBinding = { isHostnameAskAuthorized: vi.fn(async () => true) };
    await expect(
      isOnDemandTlsHostnameAuthorized(`berson.${BASE}`, { customDomainBinding }),
    ).resolves.toBe(false);
  });
});

describe('normalizeAskHostname', () => {
  it('приводит регистр и снимает завершающую точку', () => {
    expect(normalizeAskHostname(' Berson.Therapygo.RU. ')).toBe('berson.therapygo.ru');
  });

  it('отказывает тому, что хостом не является', () => {
    for (const bad of ['', '   ', 'localhost', 'host:443', 'a..b.ru', '.b.ru', 'http://a.ru', null]) {
      expect(normalizeAskHostname(bad)).toBeNull();
    }
  });
});
