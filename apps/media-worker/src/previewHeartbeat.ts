import type { MediaWorkerTickResult } from './workerTick.js';

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
 */
export type PreviewHeartbeat = {
  afterTick(result: MediaWorkerTickResult, tickDurationMs: number): Promise<void>;
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
    async afterTick(result, tickDurationMs) {
      if (result === 'preview_processed') {
        processed += 1;
        durationMs += tickDurationMs;
      }
      if (result === 'preview_error') {
        errors += 1;
        durationMs += tickDurationMs;
      }
      const at = now();
      /* Первый оборот отмечается сразу: запуск воркера — тоже факт, и он должен быть виден. */
      if (reportedAt !== null && at - reportedAt < params.intervalMs) return;
      await params.report({ processed, errors, durationMs });
      reportedAt = at;
      processed = 0;
      errors = 0;
      durationMs = 0;
    },
  };
}
