import { describe, expect, it, vi } from 'vitest';
import { createPreviewHeartbeat } from './previewHeartbeat.js';

/**
 * Строка «Превью медиа» объявлена в манифесте обязательной, с отметкой не реже раза в минуту и
 * протуханием через три. Проверяется здесь ровно это обещание, а не форма записи.
 */
function heartbeat(intervalMs = 60_000) {
  const report = vi.fn(async () => undefined);
  let clock = 1_000;
  const hb = createPreviewHeartbeat({ report, intervalMs, now: () => clock });
  return { report, hb, advance: (ms: number) => (clock += ms) };
}

describe('отметка живости очереди превью', () => {
  it('первая отметка ставится сразу: запуск воркера — тоже факт', async () => {
    const { report, hb } = heartbeat();

    await hb.reportIfDue();

    expect(report).toHaveBeenCalledTimes(1);
  });

  it('внутри окна повторной записи в базу нет', async () => {
    const { report, hb, advance } = heartbeat();
    await hb.reportIfDue();

    advance(59_000);
    await hb.reportIfDue();

    expect(report).toHaveBeenCalledTimes(1);
  });

  /*
   * Главное свойство (находка независимого аудита 13.09): отметка НЕ зависит от того, была ли
   * работа и крутится ли рядом двухчасовая пересборка видео. Прежняя версия ставила отметку
   * хвостом оборота, и на долгой перекодировке строка протухала, зажигая владельцу ложную тревогу.
   * Здесь за всё окно не случилось ни одного `record` — отметка обязана появиться всё равно.
   */
  it('окно истекло без единого наряда — отметка всё равно ставится', async () => {
    const { report, hb, advance } = heartbeat();
    await hb.reportIfDue();

    advance(60_000);
    await hb.reportIfDue();

    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenLastCalledWith({ processed: 0, errors: 0, durationMs: 0 });
  });

  it('сделанное и отказы за окно приходят в отметке и обнуляются после неё', async () => {
    const { report, hb, advance } = heartbeat();
    await hb.reportIfDue();

    hb.record('preview_processed', 700);
    hb.record('preview_error', 300);
    hb.record('idle', 5_000);
    advance(60_000);
    await hb.reportIfDue();

    expect(report).toHaveBeenLastCalledWith({ processed: 1, errors: 1, durationMs: 1_000 });

    advance(60_000);
    await hb.reportIfDue();

    expect(report).toHaveBeenLastCalledWith({ processed: 0, errors: 0, durationMs: 0 });
  });

  it('отказ записи не съедается молча — его видит вызывающий', async () => {
    const failure = new Error('control unavailable');
    const hb = createPreviewHeartbeat({
      report: async () => {
        throw failure;
      },
      intervalMs: 60_000,
    });

    await expect(hb.reportIfDue()).rejects.toBe(failure);
  });
});
