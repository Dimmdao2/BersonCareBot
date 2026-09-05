# Независимый аудит — canonical HLS delivery cleanup

**Вердикт кандидата: `INDEPENDENT AUDIT PASS, FOR LAND`** (с одним перенесённым чужим блокером ветки, см. §7).

| | |
|---|---|
| Кандидат (product) | `fabf99e60` — «refactor(media): маршрут выдачи видео задаёт медиа, а не настройка» |
| Integration merge | `77abd6e77` (feat/doctor-ui-rebuild `73e22a59f` → `wt/hls-cleanup-20260904`) |
| Ветка | `wt/hls-cleanup-20260904`, merge-base `c4433a70c` |
| Authority | `docs/_TODO/runs/media-hls-cleanup/WORKER_BRIEF.md` (решение владельца 04.09.2026) |
| Слепой kill-set | `docs/_TODO/runs/media-hls-cleanup/KILLSET.md`, составлен ДО чтения тестов |
| Роль | AUDITOR-LIVE, `AGENTS.md` §1, §5, §9–§10b, §19, §21, §24 |

**Kill-set: названо 31, закрыто 31, непойманных 0.** Продуктовый код аудитором не менялся; все временные
fault-injection правки откачены (дерево чисто); full CI, push, deploy не выполнялись; DEV не изменён.

Замечание по вводным: путь authority в брифе миссии указывает на checkout кандидата, где файла нет.
Оракул прочитан по фактическому месту — `/home/dev/dev-projects/BersonCareBot/docs/_TODO/runs/media-hls-cleanup/WORKER_BRIEF.md`.

---

## 1. Фактическая проблема подтверждена независимо

`apps/media-worker/src/processTranscodeJob.ts:409-420` после успешной сборки HLS шлёт `DeleteObjectCommand`
на `media.s3_key` («best-effort: delete the original uploaded source file now that HLS renditions are live»).
До правки резолвер продолжал публиковать `mp4.url=/api/media/{id}`, и обе ветви плееров уходили туда при
фатальной ошибке HLS. То есть «запас» указывал на удалённый объект. Правка устраняет реальный дефект, а не
косметику.

## 2. Маршрут выдачи (kill-set A: K01–K06)

`apps/webapp/src/app-layer/media/resolveMediaPlaybackPayload.ts` выводит маршрут ТОЛЬКО из строки медиа:

- не видео → `delivery:'file'`, `progressive:{url:'/api/media/{id}'}` (K05);
- видео, `isHlsAssetReady` → `delivery:'hls'`, **`progressive: masterUrl ? null : …` → `null`** (K01);
- видео без готового HLS → `delivery:'mp4'`, `progressive` выставлен (K03).

Ни одной ветви, читающей настройку или override (K06). `isHlsAssetReady` — единственное, что осталось в
`modules/media/playbackResolveDelivery.ts`.

**K04 — `program_item_submission` доказан на всю глубину, тремя независимыми звеньями:**
`processTranscodeJob.ts:152` уводит submission в `processProgramSubmissionTranscodeJob` до HLS-ветви →
исход `done_program` в миграции ставит `s3_key = v_output_key`, `hls_master_playlist_s3_key = NULL`,
`hls_artifact_prefix = NULL` → `isHlsAssetReady` false → `delivery:'mp4'` с живым progressive на
свежий транскод, а не на удалённый объект. Отдельный per-file override действительно не нужен.

**K02 — MP4-fallback после fatal HLS отсутствует в обоих плеерах.** `attachProgressive` вызывается ровно
в одной точке — `if (!masterUrl)`. На `Hls.Events.ERROR` с `data.fatal` и на `onVideoError` при
`sourceKind==='hls'` идёт `refreshHlsOnce()`: один refetch, и если новый payload не несёт `hls.masterUrl` —
`finishError('Не удалось воспроизвести видео.')`. Подмены источника нет.
`DoctorMediaPlaybackVideo.tsx`, `PatientMediaPlaybackVideo.tsx` симметричны.

**K18/K19 — второго playback path нет.** Резолвер один, плеера два прежних, `sourceKind` стал производным
(`initialPlaybackSourceKind(payload)`, «Derived, never toggled»), проп `mp4Url` снят у всех 6 call-site — все
они передавали ровно `/api/media/{id}`, который теперь выводится на сервере. Не-media-id ветви
(`HostedVideoEmbed`, прямой `<source src={media.mediaUrl}>`) сохранены.

## 3. Мёртвые consumer-ы (kill-set B: K07–K13)

Точный поиск по живому коду (`apps deploy tools`, `*.ts|*.tsx|*.mjs|*.js`) — **ноль вхождений** для:
`video_default_delivery`, `video_delivery_override`, `fallbackUsed`, `fallback_used`, `fallback_count`,
`fallbackTotal`, `hlsResolves`, `mp4Resolves`, `prefer=`.

Снято по поверхностям: registry `runtime('admin','global',…)`, `AUTHENTICATED_RUNTIME_STRING_KEYS`,
`ADMIN_SCOPE_KEYS` + PATCH-валидация, `adminSettingsData` (parser + required-key + prop),
`VideoSystemSettingsSection` (селектор целиком), `videoDeliveryStrategySelectItems`,
`parseVideoDeliveryOverride`/`VideoDeliveryOverride`, `parsePreferParam` и сам `request` в route,
`MediaPlaybackPayload.fallbackUsed`, `mp4` → `progressive` (nullable), `schema.ts` (колонка + CHECK).

Сравнивающая аналитика снята там, где она сравнивала выдачи: `videoPlayback.byDelivery` и
`fallbackTotal(Last1h)` в системном здоровье и его строгой zod-схеме, таблица «просмотры по типу доставки»
в `ReminderStatsSection`, карточки «Выдача HLS»/«Выдача MP4» в платформенном дашборде,
`hlsResolves`/`mp4Resolves` через ports/service/types/оба репозитория.

**K13 — обратная ошибка не допущена:** `docs/archive/**` и принятые audit-records не переписаны; из живых
доков обновлены только `AGENTS.md`, `api.md`, `media.md`, `PATIENT_MEDIA_PLAYBACK_VIDEO.md`,
`CONFIGURATION_ENV_VS_DATABASE.md`, `SCALING_AND_LAUNCH_CAPACITY.md`.

**Граница зафиксирована явно (не находка, а принятое решение кандидата):** оставшийся `byDelivery` — это
`videoPlaybackClient.byDelivery`, разрез *клиентских ошибок* по фактически отданному маршруту, а не сравнение
выдач. Он описывает продукт («где ломается») и попадает под «HLS ошибки можно оставить пока», поэтому
удалению по authority не подлежит.

## 4. Сохранённая телеметрия (kill-set C: K14–K17)

`media_hls_proxy_error_events` и `media_playback_client_events` кандидатом **не тронуты вовсе** — ни одного
из этих путей нет в списке файлов `fabf99e60` (`hlsProxyErrorEvents.ts`, `hlsDeliveryProxy.ts`,
`playbackClientEvents.ts`, `playback/events/route.ts`, retention-маршрут, `hlsProxyTelemetry.ts`).
Переименования в ложную общую метрику нет (K16): `reportPlaybackIssue` по-прежнему шлёт `eventClass`
`hls_fatal` / `hls_js_unsupported` / `hls_import_failed` / `video_error` с `delivery`.
Колонка `delivery` жива и остаётся частью ключа агрегата — `ON CONFLICT (organization_id, bucket_hour,
delivery)` совпадает с `media_playback_stats_hourly_org_bucket_delivery_uidx` (K17).

## 5. Миграция и права (kill-set E: K20–K27) — разбор по телу, §1

Файл: `apps/webapp/db/drizzle-migrations/20260904T170000_delivery_is_the_media_not_a_setting.sql` (855 строк).

**K24 — прав не выдаёт.** Ни `GRANT`, ни `REVOKE`, ни `CREATE/ALTER/DROP ROLE`, ни `POLICY`, ни
`ALTER DEFAULT PRIVILEGES`. Единственные совпадения по маске — `SECURITY DEFINER` в телах функций.
Каждый блок несёт ровно один маркер: `-- BCB-MIGRATION-OWNER: <role>` либо `-- BCB-MIGRATION-BACKFILL`
(последний — на `DELETE FROM public.system_settings`, data-only). `postgres` в owner-маркерах нет.

**Разобрано по телу, шесть функций:**

| Функция | Owner | Что делает тело | Signature/OID |
|---|---|---|---|
| `record_media_playback_resolution_event` | `app_seam_telemetry_media_owner` | `SELECT` на `media_files` (org-проверка), `INSERT` в `media_playback_resolution_events` (org,user,media,delivery) | 4-арг → **3-арг**, старая перегрузка `DROP`-нута явно |
| `increment_media_playback_resolution_stat` | `app_seam_telemetry_media_owner` | `SELECT` на `media_files`, `INSERT … ON CONFLICT DO UPDATE` на `media_playback_stats_hourly` | 4-арг → **3-арг**, старая `DROP`-нута |
| `read_curated_playback_health_pre_0196` | `saas_system_health_owner` | `STABLE`, только `SELECT` по трём телеметрийным таблицам; возвращает `totalResolutions` + `uniquePlaybackPairsFirstSeenInWindow` | тело переписано, сигнатура та же |
| `read_platform_media_row` | `app_seam_patient_lfk_media_owner` | `STABLE`, `SELECT` по `media_files` без снятой колонки | **DROP+CREATE** (меняются OUT-колонки), `regprocedure` идентичен, OID новый |
| `record_media_transcode_job_outcome` | `app_seam_patient_lfk_media_owner` | `SELECT … FOR UPDATE OF job`, `UPDATE` `media_files`/`media_transcode_jobs` по закрытому списку исходов | тело переписано |
| `create_patient_program_submission_media` | `app_seam_patient_lfk_media_owner` | `SELECT` enrollment/folders/identity, `INSERT` `media_folders`/`media_files` без снятой колонки | тело переписано |

Runtime `EXECUTE`/динамического SQL, ссылающегося на снятые колонки, ни в одном теле нет (K23).
`SELECT … FOR UPDATE OF job` в `record_media_transcode_job_outcome` — не новый, табличная привилегия
модификации у роли уже объявлена. Смены owner/`SECURITY`-режима ни у одной функции нет (K22).

**Удаление колонок разобрано в обратную сторону (§1) и доказано против ЖИВОГО каталога, а не по grep:**

```
sudo -u postgres psql -d bcb_webapp_dev  -- read-only
  pg_proc.prosrc ~* 'fallback_used|fallback_count|video_delivery_override'
```
вернул ровно шесть функций — и это ровно те шесть, которые миграция переписывает или дропает. Ни одной
функции вне охвата миграции (K20). Зависимых view/matview — ноль; единственный зависимый constraint —
`media_files_video_delivery_override_check`, уходящий вместе с колонкой и снятый из `schema.ts`.

**Декларация и артефакты (K25/K26):**

| Гейт | Результат |
|---|---|
| `generate-cli.mjs --check` | 4/4 артефакта совпадают **побайтно** |
| `generate-cli.mjs --all --port-context-only` + `git status` | перегенерация не дала diff |
| `generate-cli.mjs --gaps` | `unresolved=0 gaps=0` на обеих базах |
| `generate-cli.mjs --census` | 208 ACTIVE relations, 3373 файла, patient-door инвариант цел |
| `tsc --noEmit --strict -p deploy/postgres/privileges` | exit 0 |
| `pnpm run test:db-privileges` | **175 pass / 0 fail** (154 skip — devDbProof без живой БД) |

`function-census.ts` перевёл обе telemetry-функции на трёхаргументную сигнатуру и вычистил снятые колонки;
`declaration.ts` и `relation-access.ts` — тоже. Грант на несуществующую колонку исключён.

**K27 — owner-aware rollback-only candidate preflight выполнен на именованной DEV:**

```
bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot
→ PASS: pending=1 total=117 reapplied=0 unapplied=0 … ROLLBACK
```
Прогон шёл из точного candidate checkout через NOLOGIN `bcb_dev_migrator` и объявленных owner-ролей
(в логе видны `SET ROLE` на `app_seam_patient_lfk_media_owner`, `app_seam_platform_analytics_owner`,
`can_create_public = f`), одной транзакцией, завершённой `ROLLBACK`. Миграция не применялась, TEST/PROD не
трогались, временная БД не создавалась. Контрольная проверка ПОСЛЕ прогона: все три колонки на месте
(`count = 3`), четырёхаргументные функции живы — откат состоялся, DEV не изменён.

## 6. Тесты и fault injection (kill-set G: K30–K31)

Кандидат тронул 4 тест-файла; три — механическое обновление фикстур под снятые поля. Содержательно
добавлены **два** теста в `resolveMediaPlaybackPayload.unit.test.ts`, оба на устойчивое поведение
(вход — строка медиа, выход — payload), без буквального UI-текста, кнопок, count/layout/исходных строк.

**Fault injection — оба новых теста доказанно несущие (по одному разу на класс, всё откачено):**

| Инъекция | Ожидание | Факт |
|---|---|---|
| `progressive: { url: progressivePath }` безусловно (возврат исходного бага: HLS-ready снова отдаёт MP4) | краснеет K01-тест | **1 failed** — «publishes no progressive route once HLS is ready» |
| `progressive: null` безусловно (до-HLS и submission теряют путь) | краснеют K03+K04 | **2 failed** — «…untrusted HLS artifact key» и «…patient submission, whose transcode leaves no HLS master» |

Независимые прогоны на кандидате: resolver-тесты 5/5; `src/app-layer/media/`, `src/modules/media/`,
`src/modules/platform-analytics/`, `src/modules/system-settings/`, `src/app/api/media/`,
`pgPlatformAnalyticsRoot` — **21 файл / 183 теста PASS**; webapp `tsc --noEmit` exit 0; `eslint` по всем
изменённым webapp-файлам кандидата exit 0; `git diff --check` чисто.

## 7. Пересечение с принятыми коммитами (kill-set F: K28–K29)

**K29 — принятая чёрная safe-area рамка цела.** Merge `77abd6e77` наложил doctor-ui поверх очищенного
плеера без потерь: `DoctorMediaPlaybackVideo` получил проп `isFullscreen` и вешает
`doctor-fullscreen-media-video`; `DoctorModal` использует `doctor-fullscreen-media-close`; правила
`env(safe-area-inset-*)` в `doctor.css` на месте. MP4-fallback merge не вернул — playback-файлы кандидата
побайтно совпадают с `fabf99e60`.

**K28 — один красный тест на ветке, НЕ от кандидата.**

`apps/webapp/src/app/app/settings/BillingSection.ui.test.tsx:87` падает:
`findByText('Понижение недоступно: освободите места специалистов, филиалы.')`.

Причина установлена точно: принятый toast-коммит `05706d9b5` перевёл `PayTariffButton.tsx` с
inline-рендера (`{error ? <p className="text-xs text-destructive">{error}</p> : null}`, удалён) на
`toast.error(...)`. `BillingSection.ui.test.tsx` не монтирует `<Toaster/>`, поэтому строки в документе нет.
Тот же класс уже правился в `151df535c` («remove markup-bound toast assertion», принято в `6108884d7`) —
но там сняли одну такую привязку, а эту, приезжающую через `BillingSection → PayTariffButton`, пропустили.

Доказательство непричастности кандидата: `fabf99e60` не трогает ни `BillingSection`, ни `PayTariffButton`,
ни `ClientToaster`; `BillingSection.tsx` и `BillingSection.ui.test.tsx` побайтно одинаковы на HEAD и на
`feat/doctor-ui-rebuild`; единственный изменивший `PayTariffButton.tsx` коммит на ветке — `05706d9b5`.

Это находка ПРОТИВ уже принятой работы, а не невыполненный пункт authority кандидата, поэтому по §24 и по
запрету аудит-разгона она не становится ни FAIL кандидата, ни моей правкой. Передаю как есть.

**Прогон UI-наборов:** `src/app/app/settings/`, `src/app/app/admin/`, `src/app/app/doctor/` —
**52 файла PASS / 1 FAIL**, единственный fail — описанный выше.

## 8. НЕ СДЕЛАНО

- **Полный CI не запускался** — прямо запрещено миссией.
- **Живой браузерный кадр плеера не снимался.** На боксе нет chromium; проверка fatal-HLS-ветви сделана
  чтением обоих плееров и fault injection на резолвере, а не кликом. Владельческая приёмка «ошибка вместо
  подмены» на устройстве остаётся за владельцем.
- **Миграция на DEV не применена** (по миссии — только rollback-only preflight). Реальный
  `--execute` + reconcile обязателен штатным entrypoint после landing; DROP+CREATE `read_platform_media_row`
  меняет OID, поэтому reconcile после миграции здесь не формальность.
- **`BillingSection.ui.test.tsx` не чинился** (§7): чужой scope, чинить продуктовый/тестовый код принятой
  работы аудитору запрещено.

## 9. Передача

**F1 (блокирует зелёный full CI ветки, не кандидата).** Снять markup-bound assertion в
`apps/webapp/src/app/app/settings/BillingSection.ui.test.tsx:87` тем же решением, что уже принято в
`151df535c` — либо смонтировать `<Toaster/>`, либо убрать привязку к буквальному тексту, по owner-решению о
вредных interface-shape тестах. Правка локализована в одном файле → работа оркестратора, не отдельного
worker. Критерий зелёного: `vitest run src/app/app/settings/` без fail.
