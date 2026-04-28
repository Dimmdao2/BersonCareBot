import type { ReminderLinkedObjectType, ReminderRule } from "@/modules/reminders/types";

const LINKED_TYPES: ReminderLinkedObjectType[] = ["lfk_complex", "content_section", "content_page"];

/**
 * Упрощённый выбор «следующего напоминания» для Phase 3 (README §3.3 / риск §9):
 * среди включённых правил с привязкой к объекту — самое свежее по `updatedAt`.
 */
export function pickNextReminderRuleForHome(rules: ReminderRule[]): ReminderRule | null {
  const candidates = rules.filter(
    (r) => r.enabled && r.linkedObjectType != null && LINKED_TYPES.includes(r.linkedObjectType),
  );
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}
