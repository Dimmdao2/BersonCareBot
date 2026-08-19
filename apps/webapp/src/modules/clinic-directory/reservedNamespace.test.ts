import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  RESERVED_ORGANIZATION_SLUGS,
  validateOrganizationSlugCandidate,
} from './organizationSlug';

/**
 * Клиника живёт по адресу `/{slug}`, то есть делит корневое пространство имён с продуктом.
 * Порядок разрешения Next.js отдаёт статический сегмент и файл из `public/` раньше динамического
 * `[clinicSlug]`, поэтому столкновение бьёт всегда в одну сторону: клиника, чьё имя совпало с
 * маршрутом, перестаёт быть достижимой, а её разосланные ссылки умирают молча.
 *
 * Список зарезервированных имён ловит настоящее и протухает в тот день, когда кто-то заводит новый
 * корневой маршрут. Этот тест ловит будущее: он читает ФАКТИЧЕСКИЕ корневые имена с диска и краснеет
 * ровно тогда, когда новый маршрут отбирает адрес у клиники.
 */
const webappRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Имя достижимо как адрес клиники только если формат его вообще пропускает. */
function isClaimableShape(name: string): boolean {
  const validation = validateOrganizationSlugCandidate(name);
  return validation.ok || validation.code === 'reserved_slug';
}

function rootServedNames(): string[] {
  const appSegments = readdirSync(resolve(webappRoot, 'src/app'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const publicEntries = readdirSync(resolve(webappRoot, 'public'), { withFileTypes: true }).map(
    (entry) => entry.name,
  );
  return [...new Set([...appSegments, ...publicEntries])];
}

describe('корневое пространство имён клиник', () => {
  it('ни одно фактически занятое корневое имя не может стать адресом клиники', () => {
    const stolen = rootServedNames()
      .map((name) => name.toLowerCase())
      .filter(isClaimableShape)
      .filter((name) => validateOrganizationSlugCandidate(name).ok);

    expect(stolen).toEqual([]);
  });

  it('корневые имена читаются с диска, а не берутся из списка', () => {
    // Если бы предыдущая проверка читала свой же список, она была бы зелёной всегда.
    // Здесь доказано, что источник — диск: в корне есть имена, и они непустые.
    const names = rootServedNames();
    expect(names.length).toBeGreaterThan(5);
    expect(names).toContain('api');
  });

  it('зарезервированное имя отказано, а обычное имя клиники принято', () => {
    expect(validateOrganizationSlugCandidate('settings')).toEqual({
      ok: false,
      code: 'reserved_slug',
    });
    expect(validateOrganizationSlugCandidate('www')).toEqual({ ok: false, code: 'reserved_slug' });
    expect(validateOrganizationSlugCandidate('postmaster')).toEqual({
      ok: false,
      code: 'reserved_slug',
    });
    expect(validateOrganizationSlugCandidate('tochka-zdorovya')).toEqual({
      ok: true,
      slug: 'tochka-zdorovya',
    });
  });

  it('целиком числовое имя не становится адресом: оно неотличимо от идентификатора', () => {
    expect(validateOrganizationSlugCandidate('12345')).toEqual({
      ok: false,
      code: 'reserved_slug',
    });
    expect(validateOrganizationSlugCandidate('clinic-12345')).toEqual({
      ok: true,
      slug: 'clinic-12345',
    });
  });

  it('живые адреса клиник на TEST под расширенный резерв не попали', () => {
    // Замер 19.08 на bersoncarebot_test: две опубликованные клиники.
    for (const slug of ['saas-test-clinic-a', 'saas-test-clinic-b']) {
      expect(validateOrganizationSlugCandidate(slug)).toEqual({ ok: true, slug });
    }
  });

  it('в резерве нет имени, которое формат и так не пропускает', () => {
    // Мёртвая строка в резерве создаёт ложное чувство закрытой двери.
    const unreachable = [...RESERVED_ORGANIZATION_SLUGS].filter((name) => !isClaimableShape(name));
    expect(unreachable).toEqual([]);
  });
});
