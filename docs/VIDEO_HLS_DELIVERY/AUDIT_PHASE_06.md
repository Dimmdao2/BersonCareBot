# Phase-06 audit — VIDEO_HLS_DELIVERY (new-upload auto enqueue)

**Дата:** 2026-05-03  
**Область:** автоматическая постановка `media_transcode_jobs` после успешного `POST /api/media/confirm` и `POST /api/media/multipart/complete` при включённых фичефлагах.  
**Референсы:** [phase-06-new-video-hls-default-path.md](./phases/phase-06-new-video-hls-default-path.md), [phase-02-transcoding-pipeline-and-worker.md](./phases/phase-02-transcoding-pipeline-and-worker.md).

---

## 1) Enqueue для новых загрузок: стабильность и идемпотентность

**Вердикт: PASS**

- **Точка вызова:** `maybeAutoEnqueueVideoTranscodeAfterUpload` вызывается только после успешной записи состояния загрузки:
  - `confirm`: после `confirmMediaFileReady === true` (не на раннем `ready`, не на race-ветке без обновления).
  - `multipart complete`: только при `fin.kind === "finalized" || fin.kind === "already_done"`.
- **Идемпотентность постановки:** `enqueueMediaTranscodeJob` проверяет активную job (`pending`/`processing`), возвращает `alreadyQueued: true` при дубликате; вставка защищена обработкой `23505` и повторным чтением job — см. `pgMediaTranscodeJobs.ts`.
- **Повторный complete:** ветка `already_done` снова вызывает `maybeAutoEnqueue…` — безопасно: вторая job не создаётся.
- **Ошибки enqueue:** `maybeAutoEnqueue…` ловит исключения и логирует; upload-ответ не зависит от транскода.

Код:

```12:30:apps/webapp/src/app-layer/media/mediaTranscodeAutoEnqueue.ts
export async function maybeAutoEnqueueVideoTranscodeAfterUpload(mediaId: string): Promise<void> {
  const pipelineOn = await getConfigBool("video_hls_pipeline_enabled", false);
  const autoOn = await getConfigBool("video_hls_new_uploads_auto_transcode", false);
  if (!pipelineOn || !autoOn) {
    return;
  }
  // ...
}
```

```49:101:apps/webapp/src/infra/repos/pgMediaTranscodeJobs.ts
  const dup = await pool.query<{ id: string }>(
    `SELECT id FROM media_transcode_jobs
     WHERE media_id = $1::uuid AND status IN ('pending', 'processing')
     LIMIT 1`,
    [mediaId],
  );
  if (dup.rows[0]) {
    return { ok: true, kind: "queued", jobId: dup.rows[0].id, alreadyQueued: true };
  }
  // INSERT … ON conflict 23505 → re-read active job
```

**Тесты:** `apps/webapp/src/app-layer/media/mediaTranscodeAutoEnqueue.test.ts`; маршруты `confirm/route.test.ts`, `multipart/complete/route.test.ts` проверяют вызов/отсутствие вызова auto-enqueue.

---

## 2) При выключенном флаге enqueue отсутствует

**Вердикт: PASS**

Требуется **оба** флага:

- `video_hls_pipeline_enabled`
- `video_hls_new_uploads_auto_transcode`

Если любой из них `false`, `maybeAutoEnqueue…` возвращается без вызова `enqueueMediaTranscodeJob`.

**Тесты:** явные негативные кейсы «pipeline off» и «auto_transcode off» в `mediaTranscodeAutoEnqueue.test.ts`.

**Примечание (не баг phase-06):** worker при `video_hls_pipeline_enabled === false` в БД только простаивает (`main.ts`), но это не отменяет уже созданные jobs — ожидаемо; новые jobs при выключенных вебапп-флагах не ставятся.

---

## 3) Регрессия upload / confirm / complete flow

**Вердикт: PASS**

- **Контракт ответов:** тела успешных JSON не менялись ради enqueue; hook — `await` после бизнес-успеха, без изменения `ok`/`url`/`mediaId`.
- **Ранний `confirm` при `status === "ready"`:** возврат без повторного enqueue — корректно: повторный confirm не должен плодить работу; «старый готовый без HLS» — зона phase-07 backfill.
- **Race на confirm:** при `confirm_race` (409) enqueue не вызывается у проигравшего запроса — победивший поток уже перевёл файл в `ready` и прошёл через hook.
- **Ошибки finalize multipart:** при `integrity_mismatch`, `finalize_inconsistent_state`, `finalize_failed` auto-enqueue не вызывается (hook только после успешного finalize).

---

## 4) Нагрузка контролируемая перед phase-07

**Вердикт: PASS (с операционной оговоркой)**

- **Очередь:** новые jobs добавляются только при явном включении обоих флагов; объём пропорционален реальным новым загрузкам видео (не legacy backfill).
- **Worker:** один процесс забирает **одну** job за итерацию цикла (`claimNextJob` → `processTranscodeJob` → снова poll). Параллелизм транкодинга масштабируется числом **реплик** worker, а не внутренним «воронкой» в одном процессе.
- **Рекомендация перед phase-07:** зафиксировать в runbook/deployment целевое число инстансов `media-worker` и `POLL_MS`, мониторить длину очереди (`pending`/`processing`) и P95 transcode — как в критериях phase-06 в `phase-06-new-video-hls-default-path.md` («Метрики и проверки перед phase-07»).

Идемпотентный claim:

```36:47:apps/media-worker/src/jobs/claim.ts
 * Claim one pending job using `FOR UPDATE SKIP LOCKED` + transition to `processing`.
```

---

## Сводка findings

| ID   | Серьёзность | Статус   | Описание |
|------|-------------|----------|----------|
| —    | —           | —        | Блокирующих расхождений с критериями phase-06 не выявлено. |

---

## FIX (post-audit execution)

**Дата FIX:** 2026-05-03

| ID        | Серьёзность | Статус   | Резолюция |
|-----------|-------------|----------|-----------|
| FIX-P06-1 | Critical    | **CLOSED (N/A)** | Открытых critical по аудиту не было. |
| FIX-P06-2 | Major       | **CLOSED (N/A)** | Открытых major по аудиту не было. |
| FIX-P06-3 | Minor       | **CLOSED** | Подтверждение отсутствия дубликатов активных jobs: частичный уникальный индекс `media_transcode_jobs_one_active_per_media` в миграции `0019_media_transcode_jobs_queue.sql`; регрессионный unit-тест на ветку `23505` в `pgMediaTranscodeJobs.test.ts` (гонка INSERT). |
| FIX-P06-4 | Minor       | **DEFERRED** | Единый ops-runbook (число реплик `media-worker`, `POLL_MS`, алёрты по очереди / P95 transcode) привязать к подтверждённому systemd unit и строкам в `docs/ARCHITECTURE/SERVER CONVENTIONS.md` — вне кода webapp; критерии уже в [phase-06-new-video-hls-default-path.md](./phases/phase-06-new-video-hls-default-path.md) («Метрики и проверки перед phase-07»). |

**Повтор целевых проверок phase-06 (на окружении агента):**  
`pnpm install --frozen-lockfile && pnpm --dir apps/webapp exec vitest run src/app-layer/media/mediaTranscodeAutoEnqueue.test.ts src/app/api/media/confirm/route.test.ts src/app/api/media/multipart/complete/route.test.ts src/infra/repos/pgMediaTranscodeJobs.test.ts`  
и полный **`pnpm run ci`**.

**Duplicate jobs:** в БД не может существовать двух строк со статусом `pending` или `processing` для одного `media_id` (уникальный partial index); приложение дополнительно проверяет активную job до INSERT и обрабатывает `23505`.

---

## MANDATORY FIX INSTRUCTIONS

Использовать этот блок при любом **последующем** изменении цепочки upload → confirm/complete → transcode. Если аудит или CI выявляют нарушение — исправление **обязательно** до merge, без откладывания на phase-07.

### MF-1 — Два флага (gate)

- **Правило:** auto-enqueue из webapp разрешён **только** если оба ключа в `system_settings` дают `true`: `video_hls_pipeline_enabled` и `video_hls_new_uploads_auto_transcode`.
- **Проверка:** unit-тесты `maybeAutoEnqueueVideoTranscodeAfterUpload` для каждого выключенного флага; не удалять без явной замены контракта.

### MF-2 — Идемпотентность job на `media_id`

- **Правило:** не более одной активной (`pending`/`processing`) job на медиа; гонки — через unique index + обработку `23505` или эквивалент.
- **Проверка:** регрессионные тесты на повторный confirm/complete; при изменении `pgMediaTranscodeJobs` — сохранить семантику `alreadyQueued`.

### MF-3 — Upload path не должен зависеть от enqueue

- **Правило:** ошибки DB/логики enqueue **не** переводят confirm/complete в 5xx; wrap/log в `maybeAutoEnqueue…` или аналоге.
- **Проверка:** тест «enqueue throw → `logger.error`, клиент успех не ломается»; ручной smoke: успешный ответ при недоступной очереди (по возможности).

### MF-4 — Точки вызова только после успеха finalize

- **Правило:** не вызывать auto-enqueue на ветках `ready` без свежего `confirmMediaFileReady`, на 409 race loser, на ошибках multipart finalize.
- **Проверка:** `confirm/route.test.ts`, `multipart/complete/route.test.ts` — assert `maybeAutoEnqueue…` / мок.

### MF-5 — Нагрузка перед phase-07

- **Правило:** не включать массово `video_hls_new_uploads_auto_transcode` на prod без capacity review: число worker-реплик, CPU/RAM, S3 egress, метрики очереди.
- **Проверка:** чеклист из phase-06 doc; при всплеске — уменьшить реплики или временно выключить auto-флаг (старый контент не затронут).

---

**Definition of Done (этот документ):** четыре проверочных пункта секций 1–4 зафиксированы с вердиктом; MANDATORY FIX INSTRUCTIONS добавлены для предотвращения регрессий до phase-07.
