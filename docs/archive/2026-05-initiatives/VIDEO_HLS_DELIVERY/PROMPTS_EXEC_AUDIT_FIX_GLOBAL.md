# VIDEO_HLS_DELIVERY — Composer prompts (copy-paste)

Контекст инициативы:

- `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/00-master-plan.md`
- `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/01-current-state-and-gap-analysis.md`
- `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/02-target-architecture.md`
- `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/03-rollout-strategy.md`
- `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/04-test-strategy.md`
- `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/05-risk-register.md`
- `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md`
- `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/07-post-documentation-implementation-roadmap.md`
- Все phase-файлы в `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/phases/`

Общие правила для всех запусков:

1. Выполняй фазы строго последовательно: `01 -> 02 -> 03 -> 04 -> 05 -> 06 -> 07 -> 08 -> 09 -> 10`.
2. Цикл каждой фазы: `EXEC -> AUDIT -> FIX`. Следующая фаза только после закрытого `FIX`.
3. Ветку не менять. Работать в текущей ветке.
4. Не злоупотреблять full CI: на EXEC/FIX запускай только целевые проверки по затронутой области.
5. Полный pre-push барьер запускать только в финальном prepush шаге: `pnpm install --frozen-lockfile && pnpm run ci`.
6. Не ломать действующую MP4 выдачу до явного gate фаз 08+.
7. Не проксировать видеопоток через Node body; только presigned URL к S3.
8. Не смешивать media worker с integrator projection worker.
9. Новые integration/runtime настройки хранить по правилам проекта (`system_settings`, admin scope; не придумывать env для интеграционных ключей/URL).
10. После каждого EXEC/FIX обновляй `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md`.

Файлы аудитов:

- `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_01.md`
- `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_02.md`
- `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_03.md`
- `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_04.md`
- `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_05.md`
- `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_06.md`
- `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_07.md`
- `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_08.md`
- `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_09.md`
- `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_10.md`
- `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_GLOBAL.md`
- `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PREPUSH_POSTFIX.md`

---

## 01 — EXEC

```text
Выполни phase-01 инициативы VIDEO_HLS_DELIVERY.

Вход:
- docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/phases/phase-01-data-model-and-dual-delivery-foundation.md
- docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/02-target-architecture.md

Сделай:
1) Добавь additive-расширение модели данных для video/HLS в webapp (без изменения текущего MP4 runtime поведения).
2) Обнови типы и чтение новых полей там, где это нужно для последующих фаз.
3) Не включай транскодинг, не меняй current playback path.
4) Обнови документацию по API/медиа, если затронут контракт внутренних типов.
5) Выполни целевые проверки фазы: lint/typecheck/test:webapp по затронутому scope.

Обнови docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md.
```

## 01 — AUDIT

```text
Проведи аудит phase-01 VIDEO_HLS_DELIVERY.

Проверь:
1) Миграции additive и безопасны для отката кода.
2) MP4 path не изменен функционально.
3) Новые поля/типы согласованы с целевой архитектурой phase-02/03.
4) Тесты и проверки фазы реально выполнены.

Сохрани: docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_01.md
Добавь раздел MANDATORY FIX INSTRUCTIONS с severity critical/major/minor.
```

## 01 — FIX

```text
Выполни FIX по docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_01.md.

Сделай:
1) Закрой все critical и major.
2) Для minor: исправь или явно зафиксируй обоснованный defer в AUDIT_PHASE_01.md.
3) Повтори целевые проверки phase-01.
4) Подтверди, что MP4 path остался без регрессии.

Обнови docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md.
```

---

## 02 — EXEC

```text
Выполни phase-02 инициативы VIDEO_HLS_DELIVERY.

Вход:
- docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/phases/phase-02-transcoding-pipeline-and-worker.md
- docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/02-target-architecture.md

Сделай:
1) Реализуй очередь транскодинга и новый пакет apps/media-worker.
2) Добавь claim/retry/idempotency для jobs.
3) Интегрируй FFmpeg запуск в worker (без heavy work в request path webapp).
4) Не проксируй видео через Next.js API body.
5) Выполни целевые проверки фазы: lint/typecheck + worker/unit/integration по затронутому scope.

Обнови docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md.
```

## 02 — AUDIT

```text
Проведи аудит phase-02 VIDEO_HLS_DELIVERY.

Проверь:
1) apps/media-worker изолирован от integrator worker.
2) Очередь устойчива к повторным попыткам и не создает дубликаты.
3) FFmpeg ошибки не валят API.
4) Нет выполнения транскодинга внутри route handlers.
5) Выполнены и приложены результаты целевых проверок.

Сохрани: docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_02.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## 02 — FIX

```text
Выполни FIX по docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_02.md.

Сделай:
1) Закрой critical и major.
2) Для minor: фикс или обоснованный defer.
3) Повтори целевые проверки phase-02.
4) Подтверди, что webapp request path не содержит FFmpeg/heavy jobs.

Обнови docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md.
```

---

## 03 — EXEC

```text
Выполни phase-03 инициативы VIDEO_HLS_DELIVERY.

Вход:
- docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/phases/phase-03-storage-layout-and-artifact-management.md

Сделай:
1) Внедри layout хранения HLS артефактов (master/variants/segments/poster) в private S3.
2) Согласуй coexistence MP4 + HLS (MP4 сохраняется как fallback/source).
3) Добавь безопасный cleanup/purge для HLS артефактов.
4) Выполни целевые проверки фазы: purge tests + manifest smoke.

Обнови docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md.
```

## 03 — AUDIT

```text
Проведи аудит phase-03 VIDEO_HLS_DELIVERY.

Проверь:
1) Layout S3 стабилен и предсказуем для playback resolver.
2) MP4 не удаляется преждевременно.
3) Cleanup не затрагивает чужие/нецелевые объекты.
4) Артефакты HLS реально воспроизводимы через master playlist.

Сохрани: docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_03.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## 03 — FIX

```text
Выполни FIX по docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_03.md.

Сделай:
1) Закрой critical и major.
2) Для minor: фикс или обоснованный defer.
3) Повтори целевые проверки phase-03.
4) Подтверди сохранность MP4 fallback.

Обнови docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md.
```

---

## 04 — EXEC

```text
Выполни phase-04 инициативы VIDEO_HLS_DELIVERY.

Вход:
- docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/phases/phase-04-playback-api-and-delivery-strategy.md

Сделай:
1) Реализуй единый playback endpoint и resolver delivery strategy (mp4/hls/auto).
2) Сохрани session-based access control.
3) Реализуй fallback на MP4, если HLS не ready.
4) Добавь observability без логирования полных presigned URL.
5) Выполни целевые проверки фазы: route tests + resolveDelivery unit tests.

Обнови docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md.
```

## 04 — AUDIT

```text
Проведи аудит phase-04 VIDEO_HLS_DELIVERY.

Проверь:
1) Контракт playback стабилен и документирован.
2) Ветки fallback покрыты и реально работают.
3) Нет proxy video-streaming через Node response.
4) Access checks и ошибки (401/404/feature flag) обрабатываются корректно.

Сохрани: docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_04.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## 04 — FIX

```text
Выполни FIX по docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_04.md.

Сделай:
1) Закрой critical и major.
2) Для minor: фикс или обоснованный defer.
3) Повтори целевые проверки phase-04.
4) Подтверди, что playback API не ломает существующий MP4 путь.

Обнови docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md.
```

---

## 05 — EXEC

```text
Выполни phase-05 инициативы VIDEO_HLS_DELIVERY.

Вход:
- docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/phases/phase-05-player-integration-and-dual-mode-frontend.md
- docs/ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md

Сделай:
1) Интегрируй dual-mode player: HLS (hls.js / native Safari) + MP4 fallback.
2) Реализуй корректные состояния loading/error/retry.
3) Не логируй presigned URL в клиентскую телеметрию.
4) Внедри изменения минимально инвазивно в patient content playback.
5) Выполни целевые проверки фазы: unit + smoke e2e по playback.

Обнови docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md.
```

## 05 — AUDIT

```text
Проведи аудит phase-05 VIDEO_HLS_DELIVERY.

Проверь:
1) HLS реально играет на Chrome/Safari и не ломает MP4-only кейсы.
2) Есть корректный fallback при ошибке HLS.
3) Нет утечек памяти (destroy hls instance на unmount).
4) UI не регрессирует по patient page.

Сохрани: docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_05.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## 05 — FIX

```text
Выполни FIX по docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_05.md.

Сделай:
1) Закрой critical и major.
2) Для minor: фикс или обоснованный defer.
3) Повтори целевые проверки phase-05.
4) Подтверди, что MP4 fallback и UX ошибок отрабатывают стабильно.

Обнови docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md.
```

---

## 06 — EXEC

```text
Выполни phase-06 инициативы VIDEO_HLS_DELIVERY.

Вход:
- docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/phases/phase-06-new-video-hls-default-path.md

Сделай:
1) Для новых video uploads включи авто enqueue в transcode pipeline через флаг.
2) Обеспечь идемпотентность enqueue (ровно один job на media в активных статусах).
3) Не трогай legacy библиотеку автоматически.
4) Выполни целевые проверки фазы: integration enqueue + negative flag off.

Обнови docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md.
```

## 06 — AUDIT

```text
Проведи аудит phase-06 VIDEO_HLS_DELIVERY.

Проверь:
1) Для новых загрузок enqueue стабилен и идемпотентен.
2) При выключенном флаге enqueue отсутствует.
3) Нет регрессии upload/confirm/complete flow.
4) Нагрузка контролируемая перед phase-07.

Сохрани: docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_06.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## 06 — FIX

```text
Выполни FIX по docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_06.md.

Сделай:
1) Закрой critical и major.
2) Для minor: фикс или обоснованный defer.
3) Повтори целевые проверки phase-06.
4) Подтверди отсутствие duplicate jobs.

Обнови docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md.
```

---

## 07 — EXEC

```text
Выполни phase-07 инициативы VIDEO_HLS_DELIVERY.

Вход:
- docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/phases/phase-07-backfill-legacy-library.md

Сделай:
1) Реализуй backfill runner для legacy video библиотеки с dry-run и limit.
2) Добавь безопасные лимиты/троттлинг/пауза-возобновление.
3) Добавь отчетность по прогрессу и причинам failed.
4) Выполни целевые проверки фазы: dry-run correctness + backfill smoke.

Обнови docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md.
```

## 07 — AUDIT

```text
Проведи аудит phase-07 VIDEO_HLS_DELIVERY.

Проверь:
1) Runner не создает неограниченные циклы и уважает лимиты.
2) Dry-run не пишет в БД.
3) Ошибочные файлы маркируются корректно, без падения процесса.
4) Есть операционный отчет по статусам backfill.

Сохрани: docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_07.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## 07 — FIX

```text
Выполни FIX по docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_07.md.

Сделай:
1) Закрой critical и major.
2) Для minor: фикс или обоснованный defer.
3) Повтори целевые проверки phase-07.
4) Подтверди, что MP4 playback unaffected.

Обнови docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md.
```

---

## 08 — EXEC

```text
Выполни phase-08 инициативы VIDEO_HLS_DELIVERY.

Вход:
- docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/phases/phase-08-default-switch-to-hls.md
- docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/03-rollout-strategy.md

Сделай:
1) Выполни gate readiness и задокументируй verdict.
2) Переключи default delivery на auto/hls по плану rollout.
3) Убедись, что fallback на MP4 доступен и проверен.
4) Выполни целевые проверки фазы: playback smoke + rollback rehearsal.

Обнови docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md.
```

## 08 — AUDIT

```text
Проведи аудит phase-08 VIDEO_HLS_DELIVERY.

Проверь:
1) Gate условия выполнены (coverage/ошибки/Safari/runbook).
2) Переключение default не ломает старый контент.
3) Rollback к mp4 выполняется быстро и предсказуемо.
4) Наблюдаемость delivery ratio достаточна для операционного контроля.

Сохрани: docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_08.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## 08 — FIX

```text
Выполни FIX по docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_08.md.

Сделай:
1) Закрой critical и major.
2) Для minor: фикс или обоснованный defer.
3) Повтори целевые проверки phase-08.
4) Подтверди rollback playbook.

Обнови docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md.
```

---

## 09 — EXEC

```text
Выполни phase-09 инициативы VIDEO_HLS_DELIVERY.

Вход:
- docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/phases/phase-09-signed-urls-ttl-and-private-access.md
- docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md

Сделай:
1) Параметризуй TTL presigned URL через `system_settings` (admin scope).
2) Сохрани private access модель и доступ через playback API checks.
3) Реализуй безопасное поведение при истечении URL (повторный запрос playback).
4) Выполни целевые проверки фазы: TTL unit + manual expiry/reload smoke.

Обнови docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md.
```

## 09 — AUDIT

```text
Проведи аудит phase-09 VIDEO_HLS_DELIVERY.

Проверь:
1) TTL действительно берется из DB settings, а не из нового env.
2) Истечение URL не ломает пользовательский просмотр.
3) Bucket остается private, нет анонимного доступа.
4) Полные presigned URL не попадают в логи/внешнюю телеметрию.

Сохрани: docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_09.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## 09 — FIX

```text
Выполни FIX по docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_09.md.

Сделай:
1) Закрой critical и major.
2) Для minor: фикс или обоснованный defer.
3) Повтори целевые проверки phase-09.
4) Подтверди соблюдение политики env-vs-db.

Обнови docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md.
```

---

## 10 — EXEC

```text
Выполни phase-10 инициативы VIDEO_HLS_DELIVERY.

Вход:
- docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/phases/phase-10-watermark-and-further-hardening.md

Сделай:
1) Реализуй watermark как опциональный режим с явным флагом.
2) Зафиксируй policy по PII (или выбери non-PII watermark).
3) Оцени и зафиксируй влияние на производительность pipeline.
4) Выполни целевые проверки фазы: ffmpeg args snapshot + visual smoke.

Обнови docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md.
```

## 10 — AUDIT

```text
Проведи аудит phase-10 VIDEO_HLS_DELIVERY.

Проверь:
1) Watermark не включен глобально без флага.
2) Политика PII задокументирована и соблюдается.
3) Производительность после watermark измерена.
4) Нет влияния на базовый pipeline при выключенном флаге.

Сохрани: docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_10.md
Добавь MANDATORY FIX INSTRUCTIONS.
```

## 10 — FIX

```text
Выполни FIX по docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PHASE_10.md.

Сделай:
1) Закрой critical и major.
2) Для minor: фикс или обоснованный defer.
3) Повтори целевые проверки phase-10.
4) Подтверди безопасный rollback (выключение watermark-флага).

Обнови docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md.
```

---

## GLOBAL AUDIT

```text
Проведи глобальный аудит всей инициативы VIDEO_HLS_DELIVERY после завершения phase-01..10.

Проверь:
1) Фазы выполнены строго последовательно, у каждой есть EXEC/AUDIT/FIX и закрытый gate.
2) MP4 fallback не сломан ни на одном этапе.
3) Heavy work находится только в apps/media-worker; request path webapp легкий.
4) Playback API и фронтенд согласованы по контракту (delivery/mp4/hls/fallback/expires).
5) Rollout/rollback задокументированы и проверены.
6) Настройки runtime соответствуют правилам env-vs-db (`system_settings` для runtime-политик).
7) Документация синхронизирована: api.md, execution-log, roadmap, phase-файлы.
8) Выданы MANDATORY FIX INSTRUCTIONS с severity.

Сохрани: docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_GLOBAL.md
```

## GLOBAL FIX

```text
Выполни global fix по docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_GLOBAL.md.

Сделай:
1) Закрой все critical и major из глобального аудита.
2) Для minor: исправь или явно оформи defer с обоснованием.
3) Повтори целевые проверки по затронутым зонам (без лишнего full CI).
4) Обнови docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/06-execution-log.md итоговой записью по global fix.
```

---

## PREPUSH POSTFIX AUDIT

```text
Выполни финальный prepush postfix audit перед push.

Сделай:
1) Проверь, что закрыты phase fixes и global fix (нет незакрытых critical/major).
2) Проверь `git status` и исключи несвязанные файлы из commit.
3) Запусти pre-push барьер строго один раз на актуальном дереве:
   - pnpm install --frozen-lockfile
   - pnpm run ci
4) Если CI не прошел: исправь причины и повтори pre-push барьер.
5) Подготовь краткий отчет: что проверено, какие риски остались, что deferred.

Сохрани: docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/AUDIT_PREPUSH_POSTFIX.md
```

