import type { SpecialistTaskRow } from "./types";

function isOverdue(task: SpecialistTaskRow, nowMs: number): boolean {
  if (task.completedAt || !task.dueAt) return false;
  const dueMs = Date.parse(task.dueAt);
  return !Number.isNaN(dueMs) && dueMs < nowMs;
}

/** Picks the best open task for Hero summary: overdue important → overdue → important → nearest due → oldest. */
export function pickNextImportantOrOverdue(
  openTasks: SpecialistTaskRow[],
  nowMs = Date.now(),
): SpecialistTaskRow | null {
  if (openTasks.length === 0) return null;
  const score = (t: SpecialistTaskRow): number => {
    const overdue = isOverdue(t, nowMs);
    const dueMs = t.dueAt ? Date.parse(t.dueAt) : Number.POSITIVE_INFINITY;
    const createdMs = Date.parse(t.createdAt);
    if (overdue && t.isImportant) return 0;
    if (overdue) return 1;
    if (t.isImportant) return 2;
    if (!Number.isNaN(dueMs)) return 3 + dueMs / 1e15;
    return 4 + (Number.isNaN(createdMs) ? 0 : createdMs / 1e15);
  };
  return [...openTasks].sort((a, b) => score(a) - score(b))[0] ?? null;
}

export function isSpecialistTaskOverdue(task: SpecialistTaskRow, nowMs = Date.now()): boolean {
  return isOverdue(task, nowMs);
}
