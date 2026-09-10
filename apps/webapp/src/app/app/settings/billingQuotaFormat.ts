import type { OrgQuotaProjection } from '@/modules/org-entitlements/types';

/**
 * §5a stage 6.1 — bytes are the only non-count unit today; everything else is a plain number.
 *
 * Живёт отдельным модулем, потому что одни и те же числа рисуют два соседних блока вкладки «Тариф и
 * биллинг»: список «Использовано из включённого» (серверный) и блок объёма файлов (клиентский).
 * Второго форматтера байт на этой вкладке заводить нельзя — «21.1 ГБ» в одной строке и «21,1 ГБ» в
 * соседней читаются как разные числа.
 */
export function formatQuotaValue(
  value: number,
  unit: OrgQuotaProjection['quota']['unit'],
): string {
  if (unit !== 'bytes') return String(value);
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} КБ`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} ГБ`;
}

export const QUOTA_THRESHOLD_LABEL: Record<OrgQuotaProjection['threshold'], string> = {
  below_warning: '',
  warning: 'Приближается к пределу',
  reached: 'Предел достигнут',
};
