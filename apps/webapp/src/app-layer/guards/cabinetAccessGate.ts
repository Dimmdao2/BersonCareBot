import type { CabinetAccessResolution, MechanicAccessWarning } from '@/modules/org-entitlements/types';

/** Only the terminal cabinet block closes product entry; billing recovery is handled by callers. */
export function isCabinetEntryBlocked(access: CabinetAccessResolution): boolean {
  return access.state === 'disabled' || access.state === 'unconfigured';
}

const CABINET_NEXT_STATE_LABELS: Record<MechanicAccessWarning['nextState'], string> = {
  read_only: 'только чтение',
  disabled: 'вход в кабинет закрыт',
};

function cabinetWarningDateLabel(until: string): string {
  const [year, month, day] = until.slice(0, 10).split('-');
  return year && month && day ? `${day}.${month}.${year}` : until;
}

/**
 * §5a/2.1a: the `терпение` rung of the CABINET ladder. Without this the rung would be
 * indistinguishable from full access — canon §4a defines it as "works as enabled plus a warning".
 * Date, count and next state all come from the resolver, never from a constant here.
 */
export function cabinetGraceWarningMessage(warning: MechanicAccessWarning): string {
  return `Доступ в кабинет: полный доступ до ${cabinetWarningDateLabel(warning.until)}. Затем — ${CABINET_NEXT_STATE_LABELS[warning.nextState]}. Предупреждений: ${warning.count}.`;
}
