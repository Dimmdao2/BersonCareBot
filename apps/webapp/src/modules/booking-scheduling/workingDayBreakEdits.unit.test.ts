import { describe, expect, it } from 'vitest';
import {
  addBreakToWorkingDay,
  normalizeBreaks,
  openWorkingDayIntervalForBooking,
} from '@/modules/booking-scheduling/workingDayBreakEdits';

/**
 * Аудит доктор-мобайл-календаря 04.09.2026 (CAL-ACTION-06/07/10): единственный разрешённый
 * тестовый артефакт аудита для нового модуля `workingDayBreakEdits.ts` — общего контракта, которым
 * и сетка календаря, и форма расписания превращают выделение в перерыв или снова открывают его для
 * записи. Слепой kill-set из пяти независимых классов отказа, каждый — молчаливая порча данных
 * записи, если сломать: перерыв «поверх» рабочих часов, перерыв поверх существующей записи, неполное
 * снятие перерыва при частичном пересечении, отсутствие слияния соприкасающихся перерывов и ложное
 * отклонение вплотную стоящих (но не пересекающихся) интервалов.
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
