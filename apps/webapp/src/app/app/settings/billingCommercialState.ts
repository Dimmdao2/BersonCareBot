import type { EffectiveOrgCommercialAccess } from '@/modules/org-entitlements/types';

function formatRuDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Human-readable commercial access state for the owner-facing «Тариф и биллинг» tab. Never
 * surfaces the raw `source`/`lifecycle` enum values to the owner — Defect #2 2026-07-25: the tab
 * used to always render a hardcoded "no tariff connected" sentence regardless of the organization's
 * actual state. Order of checks matters: `grace`/`blocked`/`read_only` are lifecycle outcomes that
 * can only be reached via a trial, so they are checked before the plain `source === "trial"` case.
 */
export function describeCommercialAccessState(access: EffectiveOrgCommercialAccess): string {
  // #1069 §2.13 (owner 01.08): «единственное что надо это какой выбран или назначен тариф… нет
  // активного тарифа и нет триала → доступа нет». No compatibility/no-trial carve-out — a
  // tariff-less organization with no active trial is simply unassigned.
  if (access.tariffId === null) {
    return 'Тариф не назначен — доступа нет. Выберите тариф в админке, чтобы вернуть работу кабинета.';
  }
  if (access.lifecycle === 'grace') {
    return access.trialGraceEndsAt
      ? `Пробный период завершён — включён льготный период до ${formatRuDate(access.trialGraceEndsAt)}.`
      : 'Пробный период завершён — включён льготный период.';
  }
  if (access.lifecycle === 'blocked') {
    return 'Доступ заблокирован — обратитесь к администратору платформы.';
  }
  if (access.lifecycle === 'read_only') {
    return 'Доступ только для чтения: всё созданное видно и выгружается, но создавать и менять нельзя — обратитесь к администратору платформы.';
  }
  if (access.source === 'trial') {
    return access.trialEndsAt
      ? `Пробный период активен до ${formatRuDate(access.trialEndsAt)}.`
      : 'Пробный период активен.';
  }
  // "assignment" or "post_trial_tariff" with lifecycle "active" — a real tariff is in force.
  return 'Тариф активен.';
}
