import type { MediaWorkerPreviewTickResult } from './workerTick.js';

/**
 * Отметка живости очереди превью для «Здоровья системы».
 *
 * Раньше строку `media.preview.process` писала HTTP-дверь вебаппа, которую будил host-cron раз в
 * минуту. Дверь снята вместе с обработчиком (М7, `docs/_TODO/STORAGE_PACKAGES_2026-09-10.md`), и
 * отметку теперь ставит тот, кто действительно делает работу. Смысл строки от этого стал честнее:
 * она протухает, когда умер ВОРКЕР, а не когда умер cron.
 *
 * Отметка идёт не на каждый оборот: воркер опрашивает очередь раз в несколько секунд, и писать
 * строку так часто значило бы платить записью в базу за молчание. Окно — `intervalMs`; за него
 * копятся сделанное и отказы, а `durationMs` считает только время, реально потраченное на наряды.
 *
 * Счёт и отметка РАЗВЕДЕНЫ намеренно (находка независимого аудита 13.09). Прежняя версия ставила
 * отметку хвостом оборота, и пока шла пересборка видео — а её потолок `FFMPEG_TIMEOUT_MS` равен
 * двум часам — отметка не появлялась вовсе. Манифест при этом объявляет «не реже раза в минуту» и
 * протухание через три минуты, то есть любое видео длиннее трёх минут зажигало владельцу ложное
 * «Превью медиа устарело». Теперь `record` только копит, а `reportIfDue` зовёт отдельный цикл,
 * который ничего тяжёлого не ждёт.
 */
export type PreviewHeartbeat = {
  /** Учесть исход оборота очереди превью. В базу не пишет. */
  record(result: MediaWorkerPreviewTickResult, tickDurationMs: number): void;
  /** Поставить отметку, если окно истекло. Первый вызов отмечает сразу. */
  reportIfDue(): Promise<void>;
};

export function createPreviewHeartbeat(params: {
  report: (values: { processed: number; errors: number; durationMs: number }) => Promise<void>;
  intervalMs: number;
  now?: () => number;
}): PreviewHeartbeat {
  const now = params.now ?? (() => Date.now());
  let processed = 0;
  let errors = 0;
  let durationMs = 0;
  let reportedAt: number | null = null;

  return {
    record(result, tickDurationMs) {
      if (result === 'preview_processed') {
        processed += 1;
        durationMs += tickDurationMs;
      }
      if (result === 'preview_error') {
        errors += 1;
        durationMs += tickDurationMs;
      }
    },
    async reportIfDue() {
      const at = now();
      /* Первый вызов отмечается сразу: запуск воркера — тоже факт, и он должен быть виден. */
      if (reportedAt !== null && at - reportedAt < params.intervalMs) return;
      await params.report({ processed, errors, durationMs });
      reportedAt = at;
      processed = 0;
      errors = 0;
      durationMs = 0;
    },
  };
}
