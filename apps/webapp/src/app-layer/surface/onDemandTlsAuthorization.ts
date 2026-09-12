/**
 * Единственное правило «готовы ли мы просить сертификат на это имя» (B7 без wildcard).
 *
 * Решение владельца 12.09.2026 — API регистратора у нас не будет, дословно: «Зачем тебе рег ру
 * апи? Ты охренел? Не будет у тебя их». Wildcard `*.therapygo.ru` Let's Encrypt выдаёт ТОЛЬКО по
 * DNS-01, то есть по праву писать в зону REG.RU, поэтому wildcard снят, и КАЖДОЕ имя теперь
 * выпускается по себе через HTTP-01. Из этого следует ровно одно требование к приложению: поддомен
 * клиники `<slug>.therapygo.ru` обязан проходить тот же on-demand-контроль, что и собственный домен
 * клиники, — иначе новой клинике пришлось бы выпускать сертификат руками, и «адрес поддоменом»
 * (B7a) остался бы неработающим обещанием.
 *
 * Отказ здесь — это не 403 пользователю, а отказ НАЧИНАТЬ ACME-заказ. Поэтому правило намеренно
 * закрытое: разрешаем только имя, которое мы и так обслуживаем.
 */
import { PATIENT_DEFAULT_SURFACE } from '@/config/productSurfaces';
import { extractPatientSubdomainLabel } from '@/app-layer/surface/productionTenantSurfaceLookup';
import { resolvePatientSubdomainOrganization } from '@/modules/clinic-directory/patientSubdomainOrganization';
import type { ClinicDirectoryService } from '@/modules/clinic-directory/service';

export type OnDemandTlsAuthorizationDeps = {
  customDomainBinding?: { isHostnameAskAuthorized(hostname: string): Promise<boolean> } | null;
  clinicDirectory?: Pick<ClinicDirectoryService, 'resolveOrganizationIdBySlug'> | null;
};

/**
 * Caddy присылает имя в параметре запроса. Нормализуем ровно то, что бывает у SNI-имени, и
 * отказываем всему остальному: порт, путь, пробел или пустая строка — это не хост, и гадать за
 * отправителя мы не будем.
 */
export function normalizeAskHostname(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim().toLowerCase().replace(/\.+$/, '');
  if (!value) return null;
  if (!/^[a-z0-9.-]+$/.test(value)) return null;
  if (!value.includes('.') || value.startsWith('.') || value.includes('..')) return null;
  return value;
}

function platformBaseHost(): string | null {
  try {
    return new URL(PATIENT_DEFAULT_SURFACE.origin).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * `true` — мы обслуживаем это имя и согласны на выпуск сертификата.
 *
 * Три взаимоисключающих случая, в этом порядке:
 * 1. сам апекс платформы — наш, всегда да (в конфигурации края у него отдельный блок, так что
 *    сюда он обычно даже не доходит, но правило не должно зависеть от чужой конфигурации);
 * 2. `<label>.<апекс>` — да РОВНО тогда, когда метка разрешается в активную опубликованную
 *    организацию тем же резолвером, что и обычная выдача страницы. Выдуманная метка получает
 *    отказ, и ACME-заказ не начинается вовсе;
 * 3. всё остальное — собственный домен клиники, решает существующая проверка привязки.
 */
export async function isOnDemandTlsHostnameAuthorized(
  rawHostname: string | null | undefined,
  deps: OnDemandTlsAuthorizationDeps,
): Promise<boolean> {
  const hostname = normalizeAskHostname(rawHostname);
  if (!hostname) return false;

  const base = platformBaseHost();
  if (base && hostname === base) return true;

  /* Всё под нашим апексом решается ЗДЕСЬ и целиком. Собственный домен клиники по определению не
     может быть суффиксом нашего собственного, поэтому передавать `что-то.therapygo.ru` в проверку
     привязок нельзя ни при каких условиях: иначе чужая дверь начала бы отвечать за наше имя, и
     двухуровневая метка `a.b.therapygo.ru` — которую обычная выдача страниц не обслуживает —
     получила бы сертификат. */
  if (base && hostname.endsWith(`.${base}`)) {
    const label = extractPatientSubdomainLabel(hostname);
    if (label === null || !deps.clinicDirectory) return false;
    const resolved = await resolvePatientSubdomainOrganization(deps.clinicDirectory, label);
    return resolved.kind === 'resolved';
  }

  if (!deps.customDomainBinding) return false;
  return deps.customDomainBinding.isHostnameAskAuthorized(hostname);
}
