import { AsyncLocalStorage } from 'node:async_hooks';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';

/**
 * ОДНА точка, по которой узнаётся анонимная воронка публичной записи.
 *
 * Организационный принципал вебаппа проецируется на класс контекста `tenant_service`, и по этому
 * классу ходят ТРИ разные вещи: публичная запись снаружи, кабинетные маршруты абонементов и два
 * вебхука эквайринга. Двери из миграции 0043 объявлены только для первой. Если признак публичной
 * записи написать как «принципал организации», то маршруты абонементов и вебхуки молча уедут в
 * чужие двери и получат отказ или (хуже) чужую выборку — поэтому признак ключуется по `source`,
 * а не по виду принципала.
 *
 * Список источников закрытый и совпадает с местами, где сама воронка ставит принципал. Новая
 * публичная точка входа обязана добавить сюда свою строку — иначе она попадёт на реляционный
 * путь, которого у класса `tenant_service` нет, и страница снова отдаст «Каталог недоступен».
 */
export const PUBLIC_BOOKING_PRINCIPAL_SOURCES = [
  'app/book/[slug]:load-cities',
  'app/book/[slug]:load-services',
  'app/book:load-direct-slot-context',
  'api/booking/public/slots:GET',
  'api/booking/public/form-fields:GET',
  'api/booking/public/create:POST',
  'api/booking/public/create/confirm:POST',
] as const;

const PUBLIC_BOOKING_SOURCE_SET: ReadonlySet<string> = new Set(PUBLIC_BOOKING_PRINCIPAL_SOURCES);

export function isPublicBookingPrincipalSource(source: string | null | undefined): boolean {
  return typeof source === 'string' && PUBLIC_BOOKING_SOURCE_SET.has(source);
}

/** True only inside the anonymous public booking funnel, never for any other tenant principal. */
export function isCurrentPublicBookingPrincipal(): boolean {
  const principal = getCurrentDbPrincipal();
  return principal?.kind === 'organization' && isPublicBookingPrincipalSource(principal.source);
}

export type PublicBookingRuntimeSettings = {
  minNoticeHours: number;
  maxConsecutiveSlotHours: number;
};

type PublicBookingScope = { settings: PublicBookingRuntimeSettings | null };

const scopeStorage = new AsyncLocalStorage<PublicBookingScope>();

/**
 * Обе настройки записи (`booking_min_notice_hours`, `booking_max_consecutive_slot_hours`) приходят
 * ВНУТРИ снимка слотов — отдельной двери под них нет и заводить её незачем: за один шаг выбора
 * времени они читаются ровно один раз. Но порт спрашивает их отдельным вызовом, у которого на
 * входе только `organizationId`, — филиала и услуги, без которых снимок не прочитать, там уже нет.
 *
 * Поэтому значения запоминаются на время одной области принципала публичной записи. Область живёт
 * ровно столько же, сколько сам принципал (обе ставит `withExplicitOrganizationPrincipal`), так что
 * значение одной клиники не может достаться другой, а между запросами не переживает ничего.
 */
export function runInPublicBookingPrincipalScope<T>(fn: () => Promise<T>): Promise<T> {
  return scopeStorage.run({ settings: null }, fn);
}

export function rememberPublicBookingRuntimeSettings(settings: PublicBookingRuntimeSettings): void {
  const scope = scopeStorage.getStore();
  if (scope) scope.settings = settings;
}

export function currentPublicBookingRuntimeSettings(): PublicBookingRuntimeSettings | null {
  return scopeStorage.getStore()?.settings ?? null;
}
