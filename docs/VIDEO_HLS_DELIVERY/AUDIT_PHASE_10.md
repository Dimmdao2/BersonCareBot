# AUDIT — VIDEO_HLS_DELIVERY Phase 10 (Watermark, optional)

**Дата:** 2026-05-03  
**Источник требований:** [phases/phase-10-watermark-and-further-hardening.md](./phases/phase-10-watermark-and-further-hardening.md), [PHASE_10_WATERMARK_POLICY.md](./PHASE_10_WATERMARK_POLICY.md)

| # | Проверка | Вердикт |
|---|----------|---------|
| 1 | Watermark не включён «глобально» без явного флага в БД | **PASS** |
| 2 | Политика PII задокументирована и соблюдается в коде | **PASS** (INFO по трактовке UUID) |
| 3 | Производительность после watermark учтена | **PASS** (эвристика + таймаут в коде); **PENDING (ops)** автоматический benchmark |
| 4 | При выключенном флаге базовый pipeline (ffmpeg graph / таймаут) не меняется | **PASS** (INFO: один SELECT на job) |

---

## 1) Watermark не без явного флага

**Вердикт: PASS**

- **Источник истины:** `system_settings` (`key = 'video_watermark_enabled'`, `scope = 'admin'`). Миграция **`0024_video_watermark_enabled.sql`** задаёт **`{"value": false}`** по умолчанию.
- **Чтение в воркере:** `readVideoWatermarkEnabled` возвращает **`true` только при `j?.value === true`** (строгое булево). Отсутствие строки → **`false`**; строка с `"value": "true"` (строка JSON) → **`false`** — watermark **не** включается случайно.
- **Нет env-переключателя**, который включал бы burn-in без записи в БД: включение только через admin PATCH / SQL в **`video_watermark_enabled`**. Путь к шрифту — **`MEDIA_WORKER_WATERMARK_FONT`** / системные пути (**не** флаг включения).
- **Связь с очередью:** watermark применяется только внутри **`processTranscodeJob`**; если пайплайн HLS выключен (`video_hls_pipeline_enabled`), новые jobs транскода не выполняются — watermark не появляется «сам».

---

## 2) Политика PII

**Вердикт: PASS** (с INFO ниже)

**Документация:** [PHASE_10_WATERMARK_POLICY.md](./PHASE_10_WATERMARK_POLICY.md) — явный выбор варианта **без ПДн в тексте**, допустимый контент: **`id <uuid>`** = `media_files.id`.

**Код:**

- Текст в файл для FFmpeg: только **`watermarkTextLine(mediaId)`** → строка **`id ${mediaId}\n`** (`apps/media-worker/src/ffmpeg/watermarkVideoFilter.ts`). Нет email, телефона, `platform_users.id`, произвольного текста из админки.
- **`drawtext`** использует **`textfile=`**, не пользовательский ввод из HTTP.

**INFO (не провал):** юридическая квалификация **UUID медиа** как персональных данных зависит от юрисдикции и продукта; в документе это оговорено. Риск снижается тем, что флаг по умолчанию **выключен**.

---

## 3) Производительность после watermark

**Вердикт: PASS** по учёту в продукте; **PENDING (ops)** по автоматическому измерению wall-time.

**Зафиксировано в репозитории:**

- Документ **[PHASE_10_WATERMARK_POLICY.md](./PHASE_10_WATERMARK_POLICY.md):** ориентир **+20–50%** wall-time vs тот же граф без `drawtext`; дополнительная нагрузка на **720p + 480p + постер** при включённом watermark.
- **Код:** при `watermarkEnabled === true` таймаут одного вызова ffmpeg: **`min(round(FFMPEG_TIMEOUT_MS × 1.45), FFMPEG_TIMEOUT_MS + 45 min)`** (`processTranscodeJob.ts`).

**Чего нет в репозитории:** автоматизированного benchmark (до/после на эталонном ролике) и отчёта с цифрами по конкретному CPU — это **ops/staging** при необходимости строгого SLA.

---

## 4) Влияние на базовый pipeline при выключенном флаге

**Вердикт: PASS** (с INFO)

**FFmpeg graph и таймаут при `watermarkEnabled === false`:**

- **`composeHlsVideoFilter(..., null)`** возвращает только **`scale=…,format=yuv420p`** без **`drawtext`** (`watermarkVideoFilter.ts`).
- **`transcodeTimeoutMs === ctx.ffmpegTimeoutMs`** (без множителя 1.45).
- **Постер:** **`buildPosterFfmpegArgs`** без третьего аргумента (`-vf` отсутствует), как до phase-10 для пути без watermark.

**INFO:** на каждый job добавлен **один SQL `SELECT`** для чтения флага (`watermarkEnabled.ts`). Это не меняет кодирование видео и не меняет лимиты ffmpeg при выключенном watermark; это единственная постоянная добавка к пути выполнения job.

---

## Findings

| ID | Уровень | Описание | Статус |
|----|---------|----------|--------|
| — | Critical | В аудите не выявлено. | **N/A → CLOSED** |
| — | Major | В аудите не выявлено. | **N/A → CLOSED** |
| P10-0 | Minor / INFO | Нет CI-бенчмарка wall-time транскода с/без watermark; есть эвристика и множитель таймаута. | **CLOSED (defer docs)** — см. FIX § Minor P10-0 |
| P10-1 | Minor / INFO | Один дополнительный read `system_settings` на каждый transcode job (в т.ч. при выключенном watermark). | **CLOSED (accept)** — см. FIX § Minor P10-1 |

---

## FIX (2026-05-03)

**Critical / Major:** открытых не было — в таблице Findings статусы **N/A → CLOSED** подтверждены; код не менялся только под эти пункты.

### Minor P10-0 — CLOSED (defer docs)

**Решение:** не вводить CI-бенчмарк ffmpeg (нестабильные runners, зависимость от бинарника и эталонного ассета; избыточно для текущего SLA). Зафиксировано в **[PHASE_10_WATERMARK_POLICY.md](./PHASE_10_WATERMARK_POLICY.md)** секция **«Benchmark wall-time (CI vs ops)»**: эвристика + таймаут в коде = канон для v1; численный замер на staging/host — **опционально (ops)**.

### Minor P10-1 — CLOSED (accept)

**Решение:** один **`SELECT`** на job признан приемлемым (микро-latency, не меняет ffmpeg graph при выключенном watermark). Кэширование флага в процессе воркера **не** вводилось — избегаем рассинхрона с админкой без TTL-политики.

### Безопасный rollback (подтверждение)

Выключение **`video_watermark_enabled`** в админке или через SQL даёт: новые транскоды **без** watermark; существующие HLS **не** инвалидируются; рестарт воркера **не** требуется. Детали: **[PHASE_10_WATERMARK_POLICY.md](./PHASE_10_WATERMARK_POLICY.md) § Rollback (безопасный)**.

**Повтор целевых проверок phase-10**

- `pnpm --dir apps/media-worker exec vitest run src/ffmpeg/watermarkVideoFilter.test.ts src/workerToolkit.test.ts` — **OK** (9 tests).
- `pnpm install --frozen-lockfile && pnpm run ci` — **OK** (exit 0).

---

## MANDATORY FIX INSTRUCTIONS

**MF-1 (источник включения watermark)**  
Не добавлять **env** или скрытый default, который **включает** burn-in watermark без **`system_settings.video_watermark_enabled === true`** (admin). Ключ — в **`ALLOWED_KEYS`**, запись через admin Settings / **`updateSetting`**. Env **`MEDIA_WORKER_WATERMARK_FONT`** только задаёт путь к TTF, не включает watermark.

**MF-2 (содержимое watermark)**  
Текст burn-in разрешать **только** через **`watermarkTextLine` / политику non-PII** (`id` + UUID медиа). **Запрещено** подставлять email, ФИО, телефон, `platform_users.id`, session id, произвольные строки из API без отдельной политики и ревью.

**MF-3 (граф ffmpeg при выключенном флаге)**  
При **`readVideoWatermarkEnabled === false`** не добавлять **`drawtext`** в **`-vf`**, не увеличивать **`transcodeTimeoutMs`** множителем watermark, не передавать **`videoFilter`** в **`buildPosterFfmpegArgs`**.

**MF-4 (производительность и таймауты)**  
При изменении фильтра **`drawtext`** / preset / битрейтов пересмотреть **[PHASE_10_WATERMARK_POLICY.md](./PHASE_10_WATERMARK_POLICY.md)** и формулу таймаута в **`processTranscodeJob`**; не снижать лимит так, что массовый транскод с watermark стабильно получает `ffmpeg_*_exit` по timeout.

**MF-5 (rollback)**  
Выключение watermark — **`video_watermark_enabled = false`** в админке (или SQL + зеркало integrator по правилам проекта). Уже выгруженные HLS **не** перекодируются автоматически; новые jobs идут без burn-in.

**MF-6 (auditing / логи)**  
Поле **`watermark`** в логе **`transcode completed`** оставлять булевым индикатором политики; не логировать содержимое **`watermark.txt`** и полные пути в production-debug без необходимости.

---

## Definition of Done (закрытие P10-0)

- Зафиксировано в **`PHASE_10_WATERMARK_POLICY.md`** (benchmark CI vs ops); численный замер на железе остаётся **опционально (ops)** и не блокирует FIX аудита.
