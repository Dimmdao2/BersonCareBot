import { describe, expect, it } from 'vitest';
import {
  addBreakToWorkingDay,
  normalizeBreaks,
  openWorkingDayIntervalForBooking,
  openWorkingHoursForSelection,
} from '@/modules/booking-scheduling/workingDayBreakEdits';

/**
 * Аудит доктор-мобайл-календаря 04.09.2026 (CAL-ACTION-06/07/10): единственный разрешённый
 * тестовый артефакт аудита для нового модуля `workingDayBreakEdits.ts` — общего контракта, которым
 * и сетка календаря, и форма расписания превращают выделение в перерыв или снова открывают его для
 * записи. Слепой kill-set из пяти независимых классов отказа, каждый — молчаливая порча данных
 * записи, если сломать: перерыв «поверх» рабочих часов, перерыв поверх существующей записи, неполное
 * снятие перерыва при частичном пересечении, отсутствие слияния соприкасающихся перерывов и ложное
 * отклонение вплотную стоящих (но не пересекающихся) интервалов.
 *
 * Коррекция 04.09.2026 (CAL-ACTION-04): `openWorkingHoursForSelection` — та же поломка-класс,
 * теперь на расширении рабочих часов, которое до этой коррекции не существовало для «нерабочего
 * времени»/«закрытого слота». Молчаливая порча здесь — врач тапнул «Открыть для записи» на
 * нерабочем интервале, экран отчитался об успехе, а нужная сторона дня не сдвинулась (или сдвинулась
 * не та) — слот остаётся недоступным для записи, хотя выглядит открытым.
 */
describe('addBreakToWorkingDay', () => {
  it('отклоняет выделение, выходящее за рабочие часы дня', () => {
    const result = addBreakToWorkingDay({
      dayStartMinute: 540, // 09:00
      dayEndMinute: 1020, // 17:00
      breaks: [],
      selection: { startMinute: 990, endMinute: 1050 }, // 16:30–17:30, за пределами дня
    });
    expect(result).toEqual({ ok: false, error: 'outside_working_hours' });
  });

  it('отклоняет выделение, пересекающее существующую запись', () => {
    const result = addBreakToWorkingDay({
      dayStartMinute: 540,
      dayEndMinute: 1080,
      breaks: [],
      selection: { startMinute: 840, endMinute: 900 }, // 14:00–15:00
      busy: [{ startMinute: 870, endMinute: 930 }], // запись 14:30–15:30 — пересекается
    });
    expect(result).toEqual({ ok: false, error: 'appointment_overlap' });
  });

  it('НЕ отклоняет выделение, вплотную примыкающее к записи (не пересекается)', () => {
    const result = addBreakToWorkingDay({
      dayStartMinute: 540,
      dayEndMinute: 1080,
      breaks: [],
      selection: { startMinute: 810, endMinute: 870 }, // 13:30–14:30
      busy: [{ startMinute: 870, endMinute: 930 }], // запись 14:30–15:30 — начинается ровно там, где кончается выделение
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.breaks).toEqual([{ startMinute: 810, endMinute: 870 }]);
    }
  });

  it('сливает новый перерыв с вплотную примыкающим существующим', () => {
    const result = addBreakToWorkingDay({
      dayStartMinute: 540,
      dayEndMinute: 1080,
      breaks: [{ startMinute: 780, endMinute: 810 }], // 13:00–13:30
      selection: { startMinute: 810, endMinute: 840 }, // 13:30–14:00, примыкает вплотную
    });
    expect(result).toEqual({ ok: true, breaks: [{ startMinute: 780, endMinute: 840 }] });
  });
});

describe('openWorkingDayIntervalForBooking', () => {
  it('при частичном пересечении режет перерыв, а не снимает целиком', () => {
    const result = openWorkingDayIntervalForBooking({
      dayStartMinute: 540,
      dayEndMinute: 1080,
      breaks: [{ startMinute: 780, endMinute: 900 }], // перерыв 13:00–15:00
      selection: { startMinute: 780, endMinute: 840 }, // открыть только 13:00–14:00
    });
    expect(result).toEqual({ ok: true, breaks: [{ startMinute: 840, endMinute: 900 }] });
  });

  it('отклоняет выделение, не задевающее ни один перерыв', () => {
    const result = openWorkingDayIntervalForBooking({
      dayStartMinute: 540,
      dayEndMinute: 1080,
      breaks: [{ startMinute: 780, endMinute: 840 }],
      selection: { startMinute: 900, endMinute: 960 },
    });
    expect(result).toEqual({ ok: false, error: 'no_break_in_selection' });
  });
});

describe('openWorkingHoursForSelection', () => {
  it('расширяет конец рабочего дня под выделение после текущих часов, не трогая начало', () => {
    const result = openWorkingHoursForSelection({
      dayStartMinute: 540, // 09:00
      dayEndMinute: 1020, // 17:00
      breaks: [{ startMinute: 720, endMinute: 750 }], // 12:00–12:30, уже существующий перерыв
      selection: { startMinute: 1020, endMinute: 1080 }, // 17:00–18:00, после конца дня
    });
    expect(result).toEqual({
      ok: true,
      dayStartMinute: 540,
      dayEndMinute: 1080,
      breaks: [{ startMinute: 720, endMinute: 750 }],
    });
  });

  it('расширяет начало рабочего дня под выделение до текущих часов, не трогая конец', () => {
    const result = openWorkingHoursForSelection({
      dayStartMinute: 540, // 09:00
      dayEndMinute: 1020, // 17:00
      breaks: [],
      selection: { startMinute: 420, endMinute: 480 }, // 07:00–08:00, до начала дня
    });
    expect(result).toEqual({ ok: true, dayStartMinute: 420, dayEndMinute: 1020, breaks: [] });
  });

  it('на дне без рабочих часов открывает ровно выделенный интервал, а не весь день', () => {
    const result = openWorkingHoursForSelection({
      dayStartMinute: 0,
      dayEndMinute: 0, // выходной — рабочих часов нет вовсе
      breaks: [],
      selection: { startMinute: 600, endMinute: 660 }, // 10:00–11:00
    });
    expect(result).toEqual({ ok: true, dayStartMinute: 600, dayEndMinute: 660, breaks: [] });
  });

  it('отклоняет пустое/перевёрнутое выделение', () => {
    const result = openWorkingHoursForSelection({
      dayStartMinute: 540,
      dayEndMinute: 1020,
      breaks: [],
      selection: { startMinute: 1080, endMinute: 1080 },
    });
    expect(result).toEqual({ ok: false, error: 'invalid_interval' });
  });
});

describe('normalizeBreaks', () => {
  it('сливает пересекающиеся и вплотную примыкающие интервалы, отбрасывая пустые', () => {
    const result = normalizeBreaks([
      { startMinute: 900, endMinute: 900 }, // пустой — отбрасывается
      { startMinute: 780, endMinute: 810 },
      { startMinute: 810, endMinute: 840 }, // примыкает к предыдущему
      { startMinute: 600, endMinute: 630 },
    ]);
    expect(result).toEqual([
      { startMinute: 600, endMinute: 630 },
      { startMinute: 780, endMinute: 840 },
    ]);
  });
});
