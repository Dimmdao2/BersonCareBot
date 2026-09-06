import { DateTime } from 'luxon';
import { cn } from '@/lib/utils';
import {
  appointmentStatusLabel,
  isCancelledAppointmentStatus,
  isPaymentPendingAppointment,
} from '@/modules/booking-calendar/appointmentStatusLabels';
import {
  DOCTOR_APPOINTMENT_PAYMENT_PENDING_EVENT_CLASS,
  type DoctorAppointmentStatusRole,
} from '../doctorVisual';

export const doctorCalendarNonWorkingClassNames = ['doctor-calendar-nonworking'] as const;

/**
 * Canonical «today» marker of doctor calendar surfaces: a rounded rectangle on the doctor
 * control radius, never a circle or an oval. Styled in `app/styles/doctor.css` so every
 * calendar surface — including FullCalendar-rendered cells — shares one shape.
 */
export const DOCTOR_CALENDAR_TODAY_MARKER_CLASS = 'doctor-calendar-today-marker';

export type DoctorCalendarWorkingInterval = {
  startAt: string;
  endAt: string;
};

export type DoctorCalendarBackgroundRange = {
  id: string;
  start: string;
  end: string;
};

/**
 * Returns the complement of working intervals for every visible local date.
 * Calendar screens use the same ranges and the same shared CSS class, while
 * retaining their own FullCalendar orchestration and loading strategy.
 */
export function buildDoctorCalendarNonWorkingRanges(
  workingIntervals: readonly DoctorCalendarWorkingInterval[],
  timeZone: string,
  visibleDayKeys: readonly string[],
  slotMinMinute = 0,
  slotMaxMinute = 24 * 60,
): DoctorCalendarBackgroundRange[] {
  const intervalsByDay = new Map<string, Array<{ startMs: number; endMs: number }>>();

  for (const interval of workingIntervals) {
    const start = DateTime.fromISO(interval.startAt, { setZone: true }).setZone(timeZone);
    const end = DateTime.fromISO(interval.endAt, { setZone: true }).setZone(timeZone);
    const dayKey = start.toISODate();
    if (!start.isValid || !end.isValid || !dayKey) continue;
    const dayIntervals = intervalsByDay.get(dayKey) ?? [];
    dayIntervals.push({ startMs: start.toMillis(), endMs: end.toMillis() });
    intervalsByDay.set(dayKey, dayIntervals);
  }

  for (const dayKey of visibleDayKeys) {
    if (!intervalsByDay.has(dayKey)) intervalsByDay.set(dayKey, []);
  }

  const ranges: DoctorCalendarBackgroundRange[] = [];
  for (const [dayKey, intervals] of intervalsByDay) {
    intervals.sort((left, right) => left.startMs - right.startMs);
    const localDay = DateTime.fromISO(dayKey, { zone: timeZone });
    if (!localDay.isValid) continue;
    const dayStartMs = localDay.plus({ minutes: slotMinMinute }).toMillis();
    const dayEndMs = localDay.plus({ minutes: slotMaxMinute }).toMillis();
    let cursor = dayStartMs;
    let rangeIndex = 0;

    for (const interval of intervals) {
      const intervalStart = Math.max(interval.startMs, dayStartMs);
      const intervalEnd = Math.min(interval.endMs, dayEndMs);
      if (intervalStart > cursor) {
        ranges.push({
          id: `nonwork:${dayKey}:${rangeIndex++}`,
          start: new Date(cursor).toISOString(),
          end: new Date(intervalStart).toISOString(),
        });
      }
      cursor = Math.max(cursor, intervalEnd);
    }

    if (cursor < dayEndMs) {
      ranges.push({
        id: `nonwork:${dayKey}:${rangeIndex}`,
        start: new Date(cursor).toISOString(),
        end: new Date(dayEndMs).toISOString(),
      });
    }
  }

  return ranges;
}

export function formatDoctorCalendarHour(hour: number): string {
  return String(hour).padStart(2, '0');
}

/**
 * The appointment fields every doctor calendar view needs to colour an event. Structural on
 * purpose: `CalendarAppointmentEvent` satisfies it, and this module stays free of the booking
 * feed's full shape.
 */
export type DoctorCalendarAppointmentAppearance = {
  status: string;
  prepaymentPending?: boolean;
  branchColor?: string | null;
  packageUsageRef?: string | null;
  packageTitle?: string | null;
};

/**
 * Surface (background + text) and border are kept apart so the payment-pending status can repaint
 * the border WITHOUT fighting the surface. Tailwind's `!border-*` utilities live in
 * `@layer utilities`; a `!important` declaration in unlayered `doctor.css` ranks BELOW a layered
 * one, so emitting both and hoping the CSS class wins would silently lose. Instead the border
 * utility is simply not emitted when the status owns the border.
 */
const APPOINTMENT_SURFACES = {
  package: { surface: '!bg-violet-500/15 text-violet-900', border: '!border-violet-500/40' },
  branch: { surface: 'text-foreground', border: '' },
  // R10 «чуть темнее для всего»; прошлые дополнительно приглушаются через .fc-event-past.
  default: { surface: '!bg-primary/15 text-foreground', border: '!border-primary/35' },
} as const;

/**
 * Appointment event classes shared by every doctor calendar view (schedule day/week/month and the
 * «Сегодня» mini calendar). Both used to keep their own copy of this ladder, which is how the
 * amber payment tint ended up living in two places.
 *
 * §3.7: background/border are `!`-important — in timeGrid FullCalendar paints the event with an
 * inline style (its default blue) that beats a plain Tailwind utility; an important author rule
 * wins the cascade. Text/dash/line-through stay ordinary utilities.
 *
 * PAY-APPT-14: an appointment awaiting payment keeps whatever surface colour it already had
 * (branch, package or default) and only adds the shared status treatment on top.
 */
export function doctorCalendarAppointmentClassName(
  appointment: DoctorCalendarAppointmentAppearance,
): string {
  if (isCancelledAppointmentStatus(appointment.status))
    return '!bg-destructive/15 text-destructive/80 !border-destructive/20 line-through';
  const { surface, border } =
    appointment.packageUsageRef || appointment.packageTitle
      ? APPOINTMENT_SURFACES.package
      : appointment.branchColor
        ? APPOINTMENT_SURFACES.branch
        : APPOINTMENT_SURFACES.default;
  return isPaymentPendingAppointment(appointment)
    ? cn(surface, DOCTOR_APPOINTMENT_PAYMENT_PENDING_EVENT_CLASS)
    : cn(surface, border);
}

export type DoctorAppointmentStatusView = {
  /** Подпись статуса — только из общего словаря; экран её не сочиняет. */
  label: string;
  /**
   * Роль в semantic status-палитре doctor-зоны. `null` — у статуса собственной роли нет
   * (перенос и обычные «создана»/«подтверждена»); цвет тогда выбирает сама поверхность.
   */
  role: DoctorAppointmentStatusRole | null;
  /**
   * `true` — с записью реально что-то произошло: отмена, ожидание оплаты или перенос. Строка
   * списка показывает только такие статусы, панель деталей — любой.
   */
  notable: boolean;
};

/**
 * PAY-APPT-13/17: единственная лесенка «какой статус записи показать и какой он роли» для всех
 * doctor-поверхностей — строки списка, сеток календаря и панели деталей записи.
 *
 * Порядок не косметический. Отмена важнее ожидания оплаты (отменённая неоплаченная запись — это
 * отмена, а не два статуса подряд). Ожидание оплаты важнее самого `status`, потому что
 * `prepaymentPending` приходит из фида отдельным фактом и живёт при ЛЮБОМ статусе записи: платёж
 * завис в `pending`, а запись осталась `confirmed`. Панель деталей раньше читала только `status`
 * и показывала зелёную «Подтверждена» там, где сетка и список уже писали «Ожидает оплаты».
 */
export function doctorAppointmentStatusView(appointment: {
  status: string;
  prepaymentPending?: boolean;
}): DoctorAppointmentStatusView {
  if (isCancelledAppointmentStatus(appointment.status))
    return { label: appointmentStatusLabel(appointment.status), role: 'cancelled', notable: true };
  if (isPaymentPendingAppointment(appointment))
    return {
      label: appointmentStatusLabel('awaiting_payment'),
      role: 'payment-pending',
      notable: true,
    };
  return {
    label: appointmentStatusLabel(appointment.status),
    role: null,
    notable: appointment.status === 'rescheduled',
  };
}

/**
 * PAY-APPT-14: оформление ожидания оплаты — это РАМКА и маркер, привязанные к коробке события,
 * поэтому коробка обязана существовать во всех видах календаря.
 *
 * В dayGrid (месяц) FullCalendar по умолчанию (`display: 'auto'`) рисует событие со временем как
 * `.fc-daygrid-dot-event`: `border-style: none`, ширина рамки 0 и вообще без поверхности. Класс
 * при этом на элементе остаётся, то есть отказ молчаливый — фиолетовая рамка и цвет филиала просто
 * исчезают, а врач видит ожидающую оплату запись неотличимой от оплаченной. Замерено живым
 * рендером FullCalendar 6.1.21: `display:'block'` → `fc-daygrid-block-event fc-h-event`, рамка
 * `2px solid rgb(109,40,217)` и фон филиала; `display:'auto'` → `fc-daygrid-dot-event`, рамка
 * `none`/`0px`, фон прозрачный.
 */
export function doctorCalendarAppointmentDisplay(fcViewType: string): 'block' | 'auto' {
  return fcViewType.startsWith('dayGrid') ? 'block' : 'auto';
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return null;
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

/** Branch hex → translucent `rgba(...)`; `null` for anything that is not a `#rrggbb` value. */
export function doctorCalendarBranchColorRgba(hex: string, alpha: number): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/**
 * Inline branch tint FullCalendar applies to an event. Cancelled and package appointments carry
 * their own surface, so they opt out; an appointment awaiting payment does NOT — PAY-APPT-14 keeps
 * the branch colour and lets the shared status class repaint only the border.
 */
export function doctorCalendarAppointmentBranchColors(
  appointment: DoctorCalendarAppointmentAppearance,
): { backgroundColor?: string; borderColor?: string } {
  if (
    !appointment.branchColor ||
    isCancelledAppointmentStatus(appointment.status) ||
    appointment.packageUsageRef ||
    appointment.packageTitle
  ) {
    return {};
  }
  const backgroundColor = doctorCalendarBranchColorRgba(appointment.branchColor, 0.16);
  const borderColor = doctorCalendarBranchColorRgba(appointment.branchColor, 0.42);
  if (!backgroundColor || !borderColor) return {};
  // FullCalendar writes `borderColor` as an inline style, which an `!important` author rule still
  // beats — but the branch border is dropped anyway when the status owns it, so the intent is
  // readable from the data instead of resting on one cascade rule.
  return isPaymentPendingAppointment(appointment)
    ? { backgroundColor }
    : { backgroundColor, borderColor };
}
