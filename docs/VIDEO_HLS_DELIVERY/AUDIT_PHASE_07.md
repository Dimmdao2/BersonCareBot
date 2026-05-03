# Phase-07 audit — VIDEO_HLS_DELIVERY (legacy library backfill)

**Дата:** 2026-05-03  
**Область:** `runVideoHlsLegacyBackfill` (`apps/webapp/src/app-layer/media/videoHlsLegacyBackfill.ts`), CLI `apps/webapp/scripts/video-hls-backfill-legacy.ts`.  
**Референсы:** [phase-07-backfill-legacy-library.md](./phases/phase-07-backfill-legacy-library.md), [phase-02](./phases/phase-02-transcoding-pipeline-and-worker.md).

---

## 1) Runner: нет неограниченных циклов, лимиты соблюдаются

**Вердикт: PASS**

- **Цикл:** `while (processed < effectiveLimit)` — выход при достижении лимита, при пустом батче (`batch.length === 0`), при неполном последнем батче (`batch.length < take`), при `rest <= 0` после батча.
- **effectiveLimit:** `resolveEffectiveLimit` — при `limit > 0` минимум с `defaultRunCap`; при `limit === 0` используется `defaultRunCap` (дефолт **10 000**, верхняя граница в CLI **1 000 000** — всё равно конечное число итераций).
- **Размер батча:** `clampBackfillBatchSize` → по умолчанию 50, максимум **500**; фактический `take = min(batchSize, effectiveLimit - processed)`.
- **Троттлинг:** `clampBackfillSleepMs` между батчами (максимум **600 000** ms); при `sleepMs === 0` паузы нет.
- **Курсор:** монотонное `m.id > $cursor` + `ORDER BY m.id ASC` + `LIMIT` — каждый батч двигается вперёд; повтор одних и тех же строк в одном запуске без изменения данных маловероятен.

Код:

```204:266:apps/webapp/src/app-layer/media/videoHlsLegacyBackfill.ts
  const effectiveLimit = resolveEffectiveLimit(opts.limit, opts.defaultRunCap);
  let cursor: string | null = opts.cursorAfterMediaId;
  let processed = 0;

  while (processed < effectiveLimit) {
    const take = Math.min(
      clampBackfillBatchSize(opts.batchSize),
      effectiveLimit - processed,
    );
    if (take <= 0) break;

    const batch = await fetchLegacyBackfillBatch(pool, {
      batchSize: take,
      cursorAfterMediaId: cursor,
      cutoffCreatedBefore: opts.cutoffCreatedBefore,
      includeFailed: opts.includeFailed,
    });

    if (batch.length === 0) break;
    // ...
    if (batch.length < take) break;
    const rest = effectiveLimit - processed;
    if (rest <= 0) break;

    const sleepMs = clampBackfillSleepMs(opts.sleepMsBetweenBatches);
    if (sleepMs > 0) await sleepFn(sleepMs);
  }
```

---

## 2) Dry-run не пишет в БД (мутации через enqueue)

**Вердикт: PASS** (с уточнением ниже)

- При `dryRun: true` ветка `enqueue(row.id)` **не вызывается** — нет вставки в `media_transcode_jobs`, нет `UPDATE media_files` из `enqueueMediaTranscodeJob`.

```235:237:apps/webapp/src/app-layer/media/videoHlsLegacyBackfill.ts
      if (opts.dryRun) {
        continue;
      }
```

- **Уточнение:** после прогона runner всегда выполняет **только чтение** для отчёта: `loadHistogram`, `loadFailedReasons` (SELECT). Это не enqueue и не изменение медиа; для ops «dry-run = нет постановки в очередь / нет изменений статуса транскода».

- **CLI:** файл состояния `--state-file` обновляется **только при `--commit** — при dry-run checkpoint на диск не пишется (см. `06-execution-log.md` / комментарии в скрипте).

- **Тест:** `videoHlsLegacyBackfill.test.ts` — «dry-run does not call enqueue».

---

## 3) Ошибочные файлы: маркировка без падения процесса

**Вердикт: PASS** (разделение ролей runner vs worker)

- **Runner:** для каждого кандидата `enqueue` обёрнут в `try/catch`; исключения учитываются в `report.enqueue.errors`, процесс продолжается. Неуспешные результаты `EnqueueTranscodeResult` (`not_video`, `not_readable`, и т.д.) только инкрементируют счётчики.

```239:253:apps/webapp/src/app-layer/media/videoHlsLegacyBackfill.ts
      try {
        const out = await enqueue(row.id);
        if (!out.ok) {
          if (out.error === "not_video") report.enqueue.notVideo += 1;
          // ...
          continue;
        }
        // ...
      } catch {
        report.enqueue.errors += 1;
      }
```

- **Превышение размера:** в runner строки с `size_bytes > maxSizeBytes` пропускаются (`skippedOversized`), без исключения процесса.

- **Транскод / FFmpeg:** установка `video_processing_status = 'failed'` и `video_processing_error` при ошибке пайплайна выполняется в **`apps/media-worker`** (`processTranscodeJob.ts`), не в runner — это ожидаемое разделение; phase-07 runner ставит job, worker маркирует сбой.

- **Нюанс vs текст phase-07 doc:** явная пометка «unsupported codec» через ffprobe в runner **не реализована** — классификация ошибки остаётся на worker + текст в `video_processing_error`.

---

## 4) Операционный отчёт по статусам backfill / прогрессу

**Вердикт: PASS**

- Итоговый JSON включает:
  - **`statusHistogram`** — распределение readable `video/*` по `video_processing_status` (в т.ч. `(null)`, `none`, `pending`, `processing`, `ready`, `failed`).
  - **`failedReasons`** — до 25 групп по `video_processing_error` для строк со статусом `failed`.
  - Счётчики **`enqueue.*`**, **`candidatesScanned`**, **`batches`**, **`skippedOversized`**, **`lastMediaId`** для чекпоинта.

CLI печатает отчёт через `console.log(JSON.stringify(report, null, 2))`.

**Примечание:** в UI термин «hls_ready» не используется как значение колонки — в БД готовность HLS отражается как `video_processing_status = 'ready'` (и наличие master-ключа у worker); отчёт опирается на фактические статусы.

---

## Сводка findings

| ID        | Серьёзность | Статус    | Описание |
|-----------|-------------|-----------|----------|
| FIND-P07-1 | Minor      | **CLOSED** | Уточнено в [phase-07-backfill-legacy-library.md](./phases/phase-07-backfill-legacy-library.md) (секция «Тесты») и в комментарии к модулю: dry-run без enqueue; отчёт — read-only SQL. |
| FIND-P07-2 | Minor      | **DEFERRED** | Статус `pending_backfill` в CHECK и приоритет jobs — вне v1; см. backlog phase doc / приоритетный SELECT worker (опционально). |
| FIND-P07-3 | Minor      | **CLOSED (INFO)** | Без смены кода: `failed` + `video_processing_error` задаётся в `apps/media-worker` при сбое транскода (MF-5). |

---

## FIX (post-audit execution)

**Дата FIX:** 2026-05-03

| ID           | Серьёзность | Статус           | Резолюция |
|--------------|---------------|------------------|-----------|
| FIX-P07-C    | Critical      | **CLOSED (N/A)** | Открытых critical по аудиту не было. |
| FIX-P07-M    | Major         | **CLOSED (N/A)** | Открытых major по аудиту не было. |
| FIND-P07-1   | Minor         | **CLOSED**       | Документация dry-run / read-only отчёт (phase-07 doc + модуль). |
| FIND-P07-2   | Minor         | **DEFERRED**     | Как в таблице findings; отдельная задача при phase-08+ при необходимости приоритизации очереди. |
| FIND-P07-3   | Minor         | **CLOSED**       | Подтверждена ответственность worker; runner не дублирует маркировку FFmpeg. |

**Повтор целевых проверок phase-07 (на окружении агента):**  
`pnpm --dir apps/webapp exec vitest run src/app-layer/media/videoHlsLegacyBackfill.test.ts` — **OK** (8 tests).  
`pnpm install --frozen-lockfile && pnpm run ci` — **OK** (exit 0).

**MP4 progressive playback (не затронут backfill):**

- Выдача MP4 по-прежнему идёт через **`GET /api/media/[id]`** → `getMediaS3KeyForRedirect` → presigned **исходный** объект `s3_key` (`apps/webapp/src/app/api/media/[id]/route.ts`).
- Backfill только вызывает **`enqueueMediaTranscodeJob`** (очередь + при необходимости `video_processing_status='pending'` до транскода); исходный ключ файла не удаляется — **`processTranscodeJob`** явно сохраняет источник по `s3_key` (комментарий end-to-end в `apps/media-worker/src/processTranscodeJob.ts`).

---

## MANDATORY FIX INSTRUCTIONS

При любых изменениях backfill-runner или `enqueueMediaTranscodeJob` в контексте phase-07:

### MF-1 — Ограниченный цикл и лимиты

- **Правило:** каждый запуск должен иметь **верхнюю границу** обработанных кандидатов (`effectiveLimit` / `--limit` / `defaultRunCap`); при добавлении новых веток цикла — сохранять явные `break` при пустом результате и исчерпании лимита.
- **Проверка:** unit-тест или ручной прогон с `--limit=1`; при больших `--default-run-cap` — код-ревью на отсутствие `while (true)` без счётчика.

### MF-2 — Semantics dry-run

- **Правило:** при `dryRun === true` **запрещён** вызов `enqueueMediaTranscodeJob` (и любых мутаций очереди/статуса медиа через enqueue). Чтение для отчёта — допустимо; изменение `--state-file` на диске — только согласованно с продуктом (сейчас: только при `--commit`).
- **Проверка:** тест «enqueue mock not called»; при добавлении side-effect — расширить тест.

### MF-3 — Устойчивость к ошибкам enqueue

- **Правило:** ошибки одной строки не должны завершать процесс целиком; сохранять счётчики и логировать/агрегировать в отчёте.
- **Проверка:** тест на `enqueue` throw → инкремент `errors`; негативные коды `EnqueueTranscodeResult` → соответствующие счётчики.

### MF-4 — Отчётность для ops

- **Правило:** финальный вывод должен позволять оценить прогресс библиотеки: хотя бы гистограмма по `video_processing_status` и сводка по `failed` с текстом ошибки.
- **Проверка:** не удалять `statusHistogram` / `failedReasons` без замены; при смене схемы статусов — обновить SQL в `loadHistogram` / `loadFailedReasons`.

### MF-5 — Согласованность с worker

- **Правило:** не дублировать установку `failed` в runner для FFmpeg — источник истины после постановки job остаётся **media-worker**. Runner только ставит очередь и отчитывается о результатах enqueue.
- **Проверка:** регрессия phase-02 тестов worker при изменении статусов.

---

**Definition of Done (этот документ):** пункты 1–4 проверены; findings зафиксированы; MANDATORY FIX INSTRUCTIONS добавлены для последующих правок.
