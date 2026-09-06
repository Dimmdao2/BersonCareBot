import type { AppointmentFormDraft } from './DoctorAppointmentForm';
import { parseRublesInput, rublesToMinor } from '@/app/app/settings/bookingSoloAdminApi';

/**
 * PAY-APPT-01/02/03: ОДИН снимок для создания и для правки записи.
 *
 * Создание (`.../appointments/manual`) и правка (`.../manual-reschedule`) принимают одни и те же
 * поля, поэтому и собираются они здесь одинаково: второго «финансового» контракта для формы врача
 * не заводится, и расходиться им негде. Этим же контрактом пользуется страница приёма, создающая
 * обычную календарную запись (ENCOUNTER-APPOINTMENT-04).
 *
 * Отсутствие поля значит «не переопределяем»: сервер возьмёт цену услуги и политику предоплаты сам.
 * Поэтому нетронутая врачом форма не превращает каталожную цену в ручной снимок и не снимает
 * денежный замок правки уже оплаченной записи.
 */
export type AppointmentFinancialRequestFields = {
  /** Минорные единицы (копейки). Дробных денег контракт не принимает вовсе. */
  priceMinor?: number | null;
  prepayment?: { mode: 'disabled' | 'percent' | 'full_price'; percentBps: number | null } | null;
};

export class AppointmentFormFinancialsError extends Error {}

/** Ровно те режимы, которые врач вправе поставить конкретной записи (owner acceptance, K1). */
const OVERRIDABLE_MODES = new Set(['disabled', 'percent', 'full_price']);

function priceMinorFromInput(raw: string): number | null {
  const trimmed = raw.trim();
  // Пустое поле — не «ноль рублей», а «цена берётся из услуги»: обнулять стоимость молча нельзя.
  if (!trimmed) return null;
  let rubles: number;
  try {
    rubles = parseRublesInput(trimmed);
  } catch {
    throw new AppointmentFormFinancialsError('Укажите стоимость числом.');
  }
  const minor = rublesToMinor(rubles);
  if (!Number.isSafeInteger(minor) || minor < 0) {
    throw new AppointmentFormFinancialsError('Укажите стоимость числом.');
  }
  return minor;
}

function percentBpsFromInput(raw: string): number {
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.');
  const percent = Number(normalized);
  if (!normalized || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new AppointmentFormFinancialsError('Укажите процент предоплаты от 0 до 100.');
  }
  const bps = Math.round(percent * 100);
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 10_000) {
    throw new AppointmentFormFinancialsError('Укажите процент предоплаты от 0 до 100.');
  }
  return bps;
}

export function appointmentFinancialRequestFields(
  draft: Pick<
    AppointmentFormDraft,
    'priceRubles' | 'priceOverridden' | 'prepayment' | 'prepaymentOverridden'
  >,
): AppointmentFinancialRequestFields {
  const fields: AppointmentFinancialRequestFields = {};
  if (draft.priceOverridden) {
    fields.priceMinor = priceMinorFromInput(draft.priceRubles);
  }
  // Режим, которого нет в словаре записи (например фиксированная сумма клиники), остаётся
  // политикой услуги: врач его видит, но переопределением он не становится.
  if (draft.prepaymentOverridden && draft.prepayment && OVERRIDABLE_MODES.has(draft.prepayment.mode)) {
    const mode = draft.prepayment.mode as 'disabled' | 'percent' | 'full_price';
    fields.prepayment = {
      mode,
      percentBps: mode === 'percent' ? percentBpsFromInput(draft.prepayment.percent) : null,
    };
  }
  return fields;
}

/** Врач тронул деньги записи — правку надо отправить, даже если время осталось прежним. */
export function hasAppointmentFinancialEdits(
  draft: Pick<AppointmentFormDraft, 'priceOverridden' | 'prepaymentOverridden'>,
): boolean {
  return draft.priceOverridden || draft.prepaymentOverridden;
}
