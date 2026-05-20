import type { MediaUsageSummary } from "./types";

export function formatMediaUsageSummaryLines(summary: MediaUsageSummary): string[] {
  const lines: string[] = [];
  if (summary.materials > 0) lines.push(`Материалы: ${summary.materials}`);
  if (summary.exercises > 0) lines.push(`Упражнения: ${summary.exercises}`);
  if (summary.clinicalTests > 0) lines.push(`Тесты: ${summary.clinicalTests}`);
  if (summary.recommendations > 0) lines.push(`Рекомендации: ${summary.recommendations}`);
  if (summary.sections > 0) lines.push(`Разделы контента: ${summary.sections}`);
  return lines;
}
