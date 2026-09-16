# Adversarial audit: диспетчер очереди пересборки видео — 20.08.2026

Роль: аудитор (не чинил). Проверялись коммиты `4fe5d179f`, `4b04f87d7` на ветке
`wt/media-worker-root-20260819`, против `docs/_TODO/OWNER_PATIENT_WALKTHROUGH_BUGS_2026-08-19.md`
(«Второй живой проход владельца по медиа, 19.08 23:15»). Все прогоны — на живом `bcb_webapp_dev`,
через свой отдельный dev-порт (`5211`, вне 5200/4200/3200/6200), поднятый и погашенный в рамках этого
аудита. ПРОД не трогался.

## Вердикт: **PASS**

Все три заявленных владельцу симптома и все проверяемые владельческие требования подтверждены живыми
уликами, независимо от отчёта исполнителя. Одна находка низкой серьёзности (расхождение отчёта с живой
БД по одной строке грантов, без риска для безопасности) — раздел «Находки» ниже.

---

## 1. Дверь открыта ровно настолько, насколько нужно

**Живые гранты на `public.media_transcode_jobs`** (`information_schema.role_table_grants`):
только `app_object_owner` (владелец), никаких прав у `app_operational_media_worker` или иной роли —
табличная поверхность закрыта полностью.

**RLS-политики на той же таблице** (`pg_policies`):
- `rev10_fail_closed_117` — `false` для списка из 17 ролей, включая `app_operational_media_worker`
  (явный deny-by-default);
- `rev10_named_root_owner_gate_117` / `rev10_seam_business_117` — доступ только
  `CURRENT_USER IN (app_seam_patient_lfk_media_owner, saas_system_health_owner)`.

**EXECUTE на трёх новых корнях** (`aclexplode(pg_proc.proacl)`): у каждого из
`app.claim_media_transcode_job`, `app.read_media_transcode_job_media`,
`app.record_media_transcode_job_outcome` — ровно два грантополучателя: владелец шва
`app_seam_patient_lfk_media_owner` (implicit) и `app_operational_media_worker`. Ни `PUBLIC`, ни другая
роль. Все три — `SECURITY DEFINER` от `app_seam_patient_lfk_media_owner` (проверено `pg_proc.proowner`).

**Стена арендаторов — независимый прогон, не из отчёта.** Вставил строку очереди с
`organization_id` клиники `d0000000-…-0004` на файл клиники `a0000000-…-0001` и вызвал `claim` боевым
маршрутом:
```
claim → {"kind":"idle"}
media_transcode_jobs.status → 'failed', last_error → 'organization_invariant_violation'
```
Чужая работа не выдана и не подвисла — отбита с обозначенным инвариантом. Совпадает с претензией отчёта,
подтверждено отдельно, не переиспользованием его цифр.

**Миграция `0050`**: `grep -niE "GRANT |REVOKE |CREATE ROLE|ALTER ROLE|ALTER DEFAULT PRIVILEGES|CREATE POLICY"`
по файлу — ноль совпадений. Требование §1 не нарушено.

## 2. Оборот действительно замыкается — живой прогон, не чтение

Поднял webapp на своём порту (`5211`), тем же самым маршрутом, что использует боевой воркер
(`apps/media-worker/src/control.ts` → `POST /api/internal/media-worker/control`, тот же URL что и в
`apps/media-worker/src/main.ts`/`workerTick.ts` — проверено по импортам, это не тестовый дублёр, а код,
который реально гоняет `main()` воркера в бесконечном цикле).

Независимый прогон «новое видео» (без ручной вставки строки очереди — через боевой `enqueue`):
```
UPDATE media_files SET video_processing_status=NULL, hls_master_playlist_s3_key=NULL … (симуляция новой загрузки)
POST /api/internal/media-transcode/enqueue {"mediaId":"f9508a4e…"} → {"ok":true,"jobId":"2acb19b8…","alreadyQueued":false}
POST control {"type":"claim",...} → {"kind":"claimed","job":{"id":"2acb19b8…", "organizationId":"a0000000-…-0001", "attempts":1}}   # НИ ОДНОГО 42501
POST control {"type":"done_hls",...} → {"ok":true,"result":null}
SELECT media_files → video_processing_status='ready', hls_master_playlist_s3_key заполнен
SELECT media_transcode_jobs → status='done'
```
Состояние в БД изменилось по всей цепочке, не только ответ маршрута. Отдельно проверены `load` с чужим
`lockedBy` (вернул `null`, работу не отдал) и `processing` (перевёл `video_processing_status` в
`processing` до завершения) — оба через реальный HTTP-путь, не unit-мок.

Все временные строки/изменения (тестовый job, флаги `video_processing_status`/`hls_*` на файле
`f9508a4e…`) откачены обратно к исходным значениям по завершении; `git status` в рабочем дереве чист.

## 3. Оба симптома владельца

1. **«Новое видео не прикрепляется, тишина».** Причина была не в enqueue (он и раньше работал), а в
   том, что диспетчер не мог взять ни одной работы из очереди — воспроизведено и починено прогоном
   выше: `claim` до правки на этом же маршруте (по отчёту исполнителя, тоже A/B на `bcb_webapp_dev`)
   отвечал `42501 accepted organization context required`; после — берёт и доводит до `done`. Симптом
   снят для случая, когда строка очереди появляется (то есть для любого нового `enqueue`).
2. **«Старое видео вечно с заглушкой, но по клику открывается».** Живой независимый прогон: файл в
   состоянии `ready/pending` (плейлист `NULL`) с существующей строкой очереди → `claim`→`processing`→
   `done_hls` → `ready/ready` с восстановленным `hls_master_playlist_s3_key`. Заглушка снимается для
   файлов, у которых строка очереди ЕСТЬ. Отчёт **не** заявляет, что это чинит все возможные вечные
   заглушки — прямо противоположное: раздваивает ответ и называет случай «файла без строки очереди»
   находкой, не работой (см. п.4).

## 4. Застрявшие файлы (находка, не работа — как и просил бриф)

Оба файла из замера 19.08 (`95e0d9e1…`, `c9398444…`, `video/quicktime`, `status='pending'`,
`preview_status='skipped'`, `video_processing_status` пусто) на живом `bcb_webapp_dev` **сейчас**:
```sql
SELECT id FROM media_transcode_jobs WHERE media_id IN ('c9398444…','95e0d9e1…');  →  0 rows
```
У них нет строки очереди вовсе. Эта правка их не подбирает по двум независимым причинам:
- `app.claim_media_transcode_job` берёт работу из `media_transcode_jobs` — для этих файлов там нечего
  брать;
- `reconcile` (`POST /api/internal/media-transcode/reconcile {"limit":50}` — прогнан живьём:
  `{"candidatesScanned":0,"queuedNew":0,...}`) их тоже не заводит: `mediaReadableSql()` в
  `mediaHlsLegacySqlFilters.ts` требует `status NOT IN ('pending','deleting','pending_delete')` — у
  обоих файлов `status='pending'` на уровне самого `media_files`, они исключены из кандидатов на
  уровне «читаемости», ещё до проверки `video_processing_status`.

Это не входит в скоуп правки и не должно — фиксирую как находку владельцу/ведущему, не завожу работу.

## 5. Текст отказа не разошёлся с живой БД

```sql
SELECT pg_get_functiondef('app.current_org_id'::regproc);
```
Подтверждено буква в букву: функция ищет контекст в `app_ext.accepted_port_contexts` только для
`target_role IN ('app_staff','app_clinic_billing','app_patient','app_integrator_request',
'app_tenant_service','app_worker')`; на отсутствии строки — `RAISE EXCEPTION … ERRCODE='42501'`.
`app_operational_media_worker` в этом списке нет. Диагноз отчёта о «мёртвых прямых грантах» верен —
воркер физически не мог набрать контекст, который прошёл бы предикат политики.

## Находки

### Н1 (низкая серьёзность): self-grant на `app.enqueue_media_transcode_job_core` не снят на живом DEV

Отчёт и коммит `4fe5d179f` заявляют «снят один избыточный self-grant EXECUTE у
`app.enqueue_media_transcode_job_core`» как свершившийся факт (раздел «Права», без оговорки). Живая
проверка:
```sql
SELECT proacl FROM pg_proc WHERE oid = 'app.enqueue_media_transcode_job_core(uuid)'::regprocedure;
→ {app_seam_patient_lfk_media_owner=X/app_seam_patient_lfk_media_owner}
```
Грант **по-прежнему на месте** на `bcb_webapp_dev`. В `declaration.ts` действительно стоит `execute: []`,
и сгенерированный артефакт (`deploy/postgres/generated/privileges.bcb_webapp_dev.sql:4848-4849`)
содержит `REVOKE ALL … FROM PUBLIC` + `REVOKE ALL … FROM <явный список ролей>` без этой строки в
списке — то есть артефакт такую ревокацию не производит вовсе (владелец объекта туда не входит по
построению), а полный `migrate-dev.sh --execute`/reconcile, который применил бы это, по признанию самого
отчёта (п.5 «НЕ СДЕЛАНО») не проходил на DEV из-за четырёх функций соседней ветки — и именно этот пункт
не попал в перечисленный список того, что было применено «точечно». Разница между декларируемым и живым
состоянием реальна, хоть и не создаёт риска: право отозвать/выдать себе EXECUTE у объекта и так есть
implicit у владельца (`app_seam_patient_lfk_media_owner`), эскалации нет. Дефект — в точности
формулировки отчёта: «снят» правильнее было отнести к «точечно применённым» через ту же оговорку, что и у
остальных пунктов НЕ СДЕЛАНО, а не подать отдельным пунктом как факт.

**Рекомендация, не работа:** при следующем reconcile на DEV эта строка доедет автоматически вместе с
остальным диффом; отдельного действия не требуется, кроме уточнения текста отчёта, если он будет
использоваться как источник состояния позже.

## НЕ ПРОВЕРЕНО

- `operator_job_status` под `app_operational_media_worker` (пункт 3 «НЕ СДЕЛАНО» отчёта) — не
  перепроверялся живьём в этом аудите, не входит в вопросы брифа.
- `pgAdminTranscodeHealthMetrics.ts` под `app_staff` (пункт 4 отчёта) — не перепроверялся, не входит в
  вопросы брифа.
- `reconcile-access.mjs` полный прогон на DEV — не перезапускался; со слов отчёта и по независимо
  проверенным строкам `app_ext.port_context_capabilities`/грантам похоже на правду, но сам скрипт не
  гонялся в этом аудите.
- Выкатка на TEST — по брифу и признанию отчёта не сделана; аудит это не проверял и не эмулировал (бриф
  требовал DEV, не TEST).
- Реальная перекодировка ffmpeg (`apps/media-worker` целиком, включая сам процесс с S3) — не запускалась
  ни в отчёте, ни в этом аудите; проверялся только путь диспетчера к БД (ровно то, что было сломано).
- `pnpm test:media-worker`, `pnpm test:db-principal`, `pgMediaWorkerControl.unit.test.ts` — числа отчёта
  (16/16, 31/31, 8 проверок) не перезапускались повторно в этом аудите; сам факт существования и
  поведенческого содержания теста (мок границы `runWebappNamedRoot`, а не текста) проверен чтением файла.

## Итог

Дверь диспетчера не шире необходимого (табличные гранты, RLS fail-closed, EXECUTE — ровно
`app_operational_media_worker`), миграция без GRANT/REVOKE, полный оборот работы подтверждён живым
прогоном через боевой маршрут с изменением состояния в БД, оба симптома владельца проверены раздельно
и оценка отчёта («лечится» / «остаётся находкой») подтверждается независимо, диагноз про
`app.current_org_id()` совпадает буква в букву с живой БД. Единственное расхождение — находка Н1, не
блокирующая, не расширяющая права, только неточность формулировки отчёта.
