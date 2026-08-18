import { cache } from 'react';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import type { OrgEntitlementsPort } from '@/modules/org-entitlements/ports';
import type { MechanicAccessResolution, OrgMechanic } from '@/modules/org-entitlements/types';

/**
 * Одно разрешение механики на запрос вместо одного на виджет.
 *
 * Зачем. Каждый блок страницы спрашивал «а мне можно?» сам, и один рендер `/app/doctor/schedule`
 * разрешал `subscriptions`, `payments` и `branding` по два раза — вместе с ними база перечитывала
 * `saas_billing_subscriptions`, `saas_organization_trials`, `saas_paid_period_policy` и
 * `saas_org_entitlement_overrides` в каждой лишней port-транзакции. Ответ каждый раз тот же:
 * `app.resolve_organization_mechanic_access` — чистое чтение без побочных эффектов.
 *
 * Почему обёртка порта, а не мемо у гейта. `resolveMechanicAccess` спрашивают не только
 * `requireEntitlement*`: тем же портом пользуются брендирование, оплаты и предоплата брони внутри
 * `buildAppDeps`. Мемо у одного гейта оставило бы остальных мимо, поэтому память живёт в
 * ЕДИНСТВЕННОЙ точке — в самом порту, и её получают все потребители сразу.
 *
 * Почему НЕ кэш между запросами. Право меняется ровно тогда, когда клиника платит или админ
 * правит тариф; переживший запрос ответ закрыл бы раздел оплатившему или открыл бы неоплатившему.
 * Память даёт `react.cache` — она живёт РОВНО один серверный запрос, и следующий запрос начинает
 * с пустой. Обычная `Map` в этом файле была бы процессным кэшем НАВСЕГДА: порты собираются на
 * уровне модуля `buildAppDeps.ts`, а не внутри `_buildAppDeps()`, — это проверено живым замером,
 * где после первой загрузки страницы `app.resolve_organization_mechanic_access` переставал
 * вызываться вовсе.
 *
 * Почему не может протечь между арендаторами и принципалами. Ключ — полная тройка
 * (принципал, organizationId, механика). `organizationId` разделяет клиники; `principalKey`
 * разделяет роль и субъект, от которых зависит, вправе ли спрашивающий вообще получить ответ.
 * Смена принципала внутри запроса даёт другой ключ и новое обращение к базе, а не чужой ответ.
 *
 * Отказ не переживает запрос ровно так же, как успех: следующий запрос спрашивает базу заново.
 */
/**
 * Ключ памяти. Экспортирован ради теста: сама поштучная память принадлежит `react.cache` и живёт
 * только внутри серверного запроса, а вот РАЗДЕЛЁННОСТЬ ключа — это то, что здесь написано, и
 * именно она не даёт ответу перейти к другой клинике или к другому принципалу.
 */
export function mechanicAccessMemoKey(organizationId: string, mechanic: OrgMechanic): string {
  const principal = getCurrentDbPrincipal();
  const principalKey = principal
    ? [
        principal.kind,
        'organizationId' in principal ? (principal.organizationId ?? '') : '',
        'platformUserId' in principal ? (principal.platformUserId ?? '') : '',
      ].join(':')
    : 'none';
  return [principalKey, organizationId, mechanic].join(' ');
}

export function withRequestLocalMechanicAccess(port: OrgEntitlementsPort): OrgEntitlementsPort {
  const resolveOnce = cache(
    (
      _memoKey: string,
      organizationId: string,
      mechanic: OrgMechanic,
    ): Promise<MechanicAccessResolution> => port.resolveMechanicAccess(organizationId, mechanic),
  );
  return {
    ...port,
    resolveMechanicAccess: (organizationId: string, mechanic: OrgMechanic) =>
      resolveOnce(mechanicAccessMemoKey(organizationId, mechanic), organizationId, mechanic),
  };
}
