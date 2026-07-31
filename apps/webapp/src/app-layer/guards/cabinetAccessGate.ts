import type { CabinetAccessResolution } from '@/modules/org-entitlements/types';
import {
  accessNotificationConditionFor,
  dueAccessNotifications,
  renderAccessNotification,
} from '@/modules/org-entitlements/accessNotifications';

/** Only the terminal cabinet block closes product entry; billing recovery is handled by callers. */
export function isCabinetEntryBlocked(access: CabinetAccessResolution): boolean {
  return access.state === 'disabled' || access.state === 'unconfigured';
}

/**
 * §5a/2.1a + 2.6a: the `терпение` rung of the CABINET ladder. Without this the rung would be
 * indistinguishable from full access — canon §4a defines it as "works as enabled plus a warning".
 * The text is the owner's row, rendered verbatim (§5a item 2.6a) — same mechanism as
 * `entitlementGraceWarningMessages`, so the cabinet ladder is not a second place that composes
 * its own sentence, count or next-state wording in code.
 */
export function cabinetGraceWarningMessages(
  warning: NonNullable<CabinetAccessResolution['warning']>,
  variables: Readonly<Record<string, string>>,
  now: Date = new Date(),
): string[] {
  // §5a item 7.0 — the condition follows the REAL period that lapsed (money vs trial), not a
  // constant. The condition still lives in the owner's row; this only picks which outcome happened.
  const condition = accessNotificationConditionFor(warning.periodSource);
  if (condition === null) return [];
  return dueAccessNotifications({
    notifications: warning.notifications,
    periodEndsAt: warning.periodEndsAt,
    now,
    condition,
  }).map((rule) => renderAccessNotification(rule.template, variables));
}
