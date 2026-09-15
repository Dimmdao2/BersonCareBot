# Э1, четвёртый независимый адверсарный аудит — блокер слияния в разрезе организации

**Предмет:** клон `/home/dev/dev-projects/bcb-wt-merge-org-gate`, ветка `wt/merge-org-gate`, голова `73421587d`.
**Оракул:** `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18 / §18а / §18б; план
`docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, этап Э1. **Аудитор:** `claude-opus-5`.

## ВЕРДИКТ: FAIL

Логика гейта и reconcile по организации **верна** — 27/27 канонических сценариев на живой DEV сошлись.
Ветка не принимается по двум пунктам:

- **Д1 (в скоупе, блокирующий):** у набора тестов НЕТ зубов ровно на то поведение, которое Э1 вводит.
  Пять именованных инъекций дефектов оставляют ВЕСЬ unit-набор webapp зелёным (302 файла, 1588 тестов),
  при этом каждая инъекция доказанно меняет живое поведение. Это третий круг подряд с тем же диагнозом.
- **Д2 (против приёмочной фразы Э1):** канонический случай «медицина в РАЗНЫХ организациях» по факту
  **не сливается**, когда у обеих сторон есть живая строка `user_phone_history`: движок падает на
  `23505 uq_user_phone_history_user_active` уже ПОСЛЕ пройденного гейта. Дефект живёт и на `origin/main`
  (`078a3dd8d`), то есть веткой не внесён, но приёмочная строка Э1 «две учётки с назначениями в разных
  клиниках сливаются» из-за него неверна.

## Как проверялось

Собственное доказательство, свой id-пространство (`a4c40000-…`), свои фикстуры, движок импортируется из
**исходника** (`packages/platform-merge/src/pgPlatformUserMerge.ts`), а не из `dist`, чтобы устаревшая
сборка не могла подменить предмет проверки. Всё исполняется в ОДНОЙ транзакции на именованной
`bcb_webapp_dev`, каждый сценарий в своём `SAVEPOINT`, внешняя транзакция всегда кончается `ROLLBACK`.

```
sudo -n bash -lc 'cd /home/dev/dev-projects/bcb-wt-merge-org-gate && set -a && \
  source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev && set +a && export NODE_ENV=test && \
  exec apps/webapp/node_modules/.bin/tsx --tsconfig apps/webapp/tsconfig.json \
  docs/audit/merge-org-gate-fourth-audit-live-proof-2026-09-15.mjs'
```

Итог прогона: `28/32 scenarios matched the oracle`,
`residual_rows_after_rollback = {"users":0,"orgs":0,"notes":0,"programs":0,"bookings":0}`,
`index_on_dev_after_rollback = … USING btree (patient_user_id) WHERE (status = 'active'::text)` — DEV
остался ровно в том состоянии, в котором был.

## Точка 1 — гейт по организации: ДЕРЖИТ

Таблица `clinical_visit` намеренно не использовалась. Проверены `doctor_notes` (ключуется на `user_id`),
`clinical_diagnosis`, `symptom_trackings`, `patient_lfk_assignments`, `treatment_program_instances`
(с `AND assignment_source = 'doctor'`), `patient_bookings`, `online_intake_requests`.

| сценарий | ожидание | факт |
|---|---|---|
| `g1` заметки врача в РАЗНЫХ организациях | merge | merge, обе строки на target, 0 осталось на дубликате |
| `g2` заметки врача в ОДНОЙ организации | block | `MergeDependentConflictError: medical_history: … (conflict inside one organization)` |
| `g3` заметка × карточка (разные пробы), одна организация | block | block — организация протаскивается ЧЕРЕЗ пробы, не внутри одной |
| `g4` заметка × карточка, разные организации | merge | merge |
| `g5` / `g6` назначение врача (`assignment_source='doctor'`) одна / разные организации | block / merge | block / merge, обе программы на target с сохранёнными организациями |
| `g7` промо-программы с обеих сторон в одной организации | merge | merge — «отметки промо-упражнений» не блокер (§18) |
| `g8` обе стороны с историей БЕЗ атрибуции клиники (`organization_id IS NULL`) | block | block — `IS NOT DISTINCT FROM` не даёт нехватке данных расширить слияние |
| `g9` `NULL`-организация против реальной | merge | merge — пересечения нет |
| `g10` / `g11` отслеживание симптомов одна / разные организации | block / merge | block / merge |
| `g12` `general_wellbeing` + `warmup_feeling` с обеих сторон | merge | merge, на target ровно по одной живой строке на ключ |
| `g13` / `g14` назначенные упражнения одна / разные организации | block / merge | block / merge, два активных назначения по одному на организацию |
| `g15` пересекающиеся по времени записи на приём + заявки | merge | merge, 2 записи и 2 заявки на target, 0 на дубликате |

На DEV у всех десяти проб колонка `organization_id` существует и ни в одной таблице нет строк с `NULL`
(замерено: `clinical_visit 17/0`, `clinical_complaint 22/0`, `clinical_diagnosis 14/0`,
`clinical_anamnesis_trauma 3/0`, `…illness 0/0`, `…lifestyle 2/0`, `doctor_notes 1/0`,
`symptom_trackings 293/0`, `patient_lfk_assignments 0/0`, `treatment_program_instances 97/0`), то есть
`NULL`-ветка гейта — оборона, а не рабочий режим.

## Точка 2 — миграция `20260914T214345_scope_active_treatment_program_to_organization.sql`

- **Чистота по §1:** в файле нет `GRANT`, `REVOKE`, `POLICY`, `CREATE/ALTER ROLE`,
  `ALTER DEFAULT PRIVILEGES` — только `DROP INDEX` + `CREATE UNIQUE INDEX`, оба под
  `-- BCB-MIGRATION-OWNER: app_object_owner`. Владелец таблицы в базе — `app_object_owner`, совпадает.
  `BCB-MIGRATION-VERIFY` стоит в ведущем блоке комментариев. `node --test
  deploy/postgres/privileges/migration-order.test.mjs` → `28/28 pass`.
- **Не применена ли уже на DEV** (интроспекция, не журнал):
  `SELECT indexdef FROM pg_indexes WHERE indexname='uq_treatment_program_instances_one_active_per_patient'`
  → `USING btree (patient_user_id) WHERE (status = 'active'::text)`. Старое определение. Запрет владельца
  не нарушен; после всех моих прогонов проверено повторно — то же самое.
- **Откатываемый preflight под ролью-владельцем** (не от superuser): `BEGIN; SET LOCAL ROLE app_object_owner;`
  → `DROP INDEX` / `CREATE INDEX` проходят на живых данных, `BCB-MIGRATION-VERIFY` возвращает `t`,
  `ROLLBACK` — определение индекса вернулось к старому.
- **Старые строки с `organization_id IS NULL`:** новый индекс **строго слабее** старого (набор строк,
  допустимый старым, целиком допустим новым), поэтому существующие данные его нарушить не могут — это и
  подтвердил `CREATE INDEX` на живой таблице. `NULLS NOT DISTINCT` сохраняет для неатрибутированных строк
  ровно прежний инвариант «одна активная программа на пациента».
- **Путь назначения программы не ломается.** `ON CONFLICT` по имени этого индекса в коде нет.
  `createInstanceTree` вставляет с `organization_id`, а `completeActivePromoForDoctorAssignment` закрывает
  прежнюю активную промо-программу через `listInstancesForPatient`, который сужен
  `getCurrentDbPrincipalOrganizationId()`. Все 15 вызовов `listInstancesForPatient*` в коде идут через этот
  же org-суженный порт. То есть приложение опирается на инвариант «одна активная на пациента **внутри
  организации принципала»**, а новый индекс задаёт ровно его.
- **Код без миграции не живёт.** Тот же набор сценариев против нынешнего DEV-индекса (`--old-index`):
  `21/27`, и падают ровно межорганизационные — `r1`, `r3`, `r5`, `r7` дают `23505` на
  `uq_treatment_program_instances_one_active_per_patient`. Миграция обязана приехать вместе с кодом или раньше.

## Точка 3 — `reconcileActiveTreatmentProgramInstancesForMerge`: ДЕРЖИТ

| сценарий | факт |
|---|---|
| `r1` авто, две активные программы врача в РАЗНЫХ организациях | merge, обе остались `active`, по одной на организацию |
| `r2` авто, две активные `course` в ОДНОЙ организации | block: `treatment_program_instances: active program on both merge candidates` |
| `r3` авто, две активные `course` в РАЗНЫХ организациях | merge, обе `active` |
| `r5` ручное, две активные программы врача в РАЗНЫХ организациях | merge, **ничего не закрыто**, обе `active` |
| `r6` авто, промо × врач в ОДНОЙ организации | промо → `completed`, программа врача осталась `active` |
| `r7` авто, промо × врач в РАЗНЫХ организациях | **ничего не закрыто** — промо чужой клиники не тронуто |
| `r8` две независимые пары организаций сразу | обработаны ОБЕ (прежний `r.rows[0]` брал только первую): по одной активной на организацию, оба промо закрыты |
| `r9` осиротевшие активные | на дубликате 0 строк программ; на target не больше одной активной на организацию |

**Одно поведение выношу владельцу вопросом, а не дефектом** — `r4`: при РУЧНОМ слиянии двух активных
программ **врача** внутри ОДНОЙ организации функция переводит программу дубликата в `completed`
(`{"org":ORG_A,"src":"doctor","status":"active","title":"A-target"}`,
`{"org":ORG_A,"src":"doctor","status":"completed","title":"B-duplicate"}`). Раньше закрывающий `UPDATE`
нёс `AND assignment_source = 'promo'`; теперь не несёт. Это осознанное решение исполнителя, оно описано в
`PLATFORM_USER_MERGE.md` и вынуждено новым уникальным индексом `(organization_id, patient_user_id)`.
Но строки канона, разрешающей слиянию ЗАВЕРШИТЬ активное назначение врача, нет: §18а даёт поддержке
«перенести любые данные», а §18б отправляет внутриклинический конфликт к **врачу**, не к поддержке.
Событие в журнал пишется (`treatment_program_events`, `supersededBy: platform_user_merge`), молчаливым
отказ не является.

## Точка 4 — зубы у тестов: НЕТ. Это Д1

Базовая линия: `pnpm --dir apps/webapp test:unit` → `302 passed (302)`, `1588 passed (1588)`.
Каждая инъекция вносилась в `packages/platform-merge/src/pgPlatformUserMerge.ts`, после каждой —
`git checkout --` (дерево восстановлено, проверено `git status`).

| инъекция | `tsc` | unit-набор webapp | живое поведение |
|---|---|---|---|
| `I1` гейт теряет разделение по организации (`ON … IS NOT DISTINCT FROM …` → `ON true`) | чисто | **302/302, 1588/1588 зелёные** | `g1` ломается: пара из РАЗНЫХ клиник перестаёт сливаться (`merge` → `block`) |
| `I2` `IS NOT DISTINCT FROM` → `=` | чисто | **зелёные** | `g8` ломается: две неатрибутированные истории МОЛЧА сливаются (`block` → `merge`) |
| `I3` проба `doctor_notes` выброшена из списка (запись перенесена в transfer-only) | чисто | **зелёные** | `g2` ломается: конфликт заметок внутри одной клиники пропускается (`block` → `merge`) |
| `I4` снят `reason !== 'manual'` в reconcile | чисто | **зелёные** | `r4` ломается: ручной путь поддержки блокируется (`merge` → `block`) |
| `I5` reconcile теряет `t.organization_id IS NOT DISTINCT FROM d.organization_id` | чисто | **зелёные** | `r1` ломается: активные программы в разных клиниках перестают сливаться (`merge` → `block`) |

Каждая инъекция **доказанно** меняет наблюдаемое поведение продукта на живой базе — значит зелёный набор
не объясняется «инъекция была no-op». Типовая конструкция (`BlockingMedicalHistoryRecord` требует
`automaticProbe`) защищает только от записи, оставшейся в списке без пробы; удаление записи целиком
компилируется и не ловится ничем. `accountMergeMedicalHistory.unit.test.ts` подделывает ответ по
подстроке `AS conflict_organization_id` и SQL гейта не исполняет — поэтому он зелёный при любой правке
этого SQL. По §10a такой тест не является доказательством поведения.

Это **не** заявка на «напишите ещё тестов»: §10a прямо разрешает вместо теста живой прогон с записью
увиденного. Но тогда живой прогон обязан быть повторяемым артефактом приёмки этапа, а не разовым
запуском, иначе следующая правка снимет разделение по организации и ничего не покраснеет.

## Точка 5 — радиус поражения

- **Ручной путь поддержки НЕ загейтован по медицине.** `p5_manual_merges_through_same_org_medical_conflict`:
  заметки, карточка и отслеживание симптомов с обеих сторон в ОДНОЙ организации — merge проходит, 2 заметки
  и 2 диагноза на target, 0 на дубликате. Исключение `reason !== 'manual'` у медицинского гейта существовало
  и до этого коммита (`git show HEAD~1` — та же строка).
- **Предпросмотр и кнопка консоли больше не гасятся.** `p5_preview_and_console_button_allow_overlapping_bookings`:
  пересекающиеся записи на приём, один комплекс ЛФК и две активные программы врача в одной организации —
  `buildMergePreview` даёт `hardBlockers: []`, `mergeAllowed: true`, `canSubmitManualMerge` → `true`,
  ручной merge проходит. Прошлый дефект Д2 (`active_bookings_time_overlap`) закрыт.
- **Тот же вход на АВТОМАТИЧЕСКОМ пути по-прежнему блокируется** (`p5_auto_path_still_blocked_on_the_same_fixture`).
- **Старый текст ошибки никто не потерял.** `classifyMergeFailure` матчит `medical_history:`; сообщение
  гейта начинается ровно с него. Удалённые коды hard blocker (`active_bookings_time_overlap`,
  `active_lfk_template_conflict`, `active_treatment_program_conflict`, `open_test_attempt_conflict`,
  `shared_phone_both_have_meaningful_data`) не встречаются больше нигде в `*.ts`/`*.tsx`, а `hardBlockerUi`
  имеет запасной вариант для неизвестного кода.

### Д2 — приёмочная фраза Э1 по факту не выполняется

`m5_cross_org_medical_pair_with_live_phone_history_is_the_canon_case`: у target заметка врача в клинике A,
у дубликата — в клинике B (канон прямо разрешает слияние), и у КАЖДОГО есть строка `user_phone_history`
с `valid_to IS NULL`.

```
FAIL m5 … expected=merge actual=CRASH
     error: duplicate key value violates unique constraint "uq_user_phone_history_user_active"
```

Гейт пропускает пару правильно, а безусловный `UPDATE user_phone_history SET platform_user_id = target`
падает на частичном уникальном индексе `(platform_user_id) WHERE valid_to IS NULL`. Это не
`MergeConflictError`: `classifyMergeFailure` относит `23505` к `channel_already_bound_to_other_user`, то
есть человек получает причину «этот канал уже привязан к другому пользователю» вместо настоящей.
Та же поломка на ручном пути поддержки (`m2`) — значит «поддержка может слить всегда» неверно.

Строка `UPDATE user_phone_history …` идентична на `origin/main` (`078a3dd8d`), гейта на main нет вовсе —
**веткой дефект не внесён**. Масштаб на сегодняшних данных: из 319 канонических клиентов DEV у **93**
есть живая строка `user_phone_history`; при этом пар канонических клиентов, делящих нормализованный
контакт, на DEV сейчас **0**, то есть прямо сейчас дефект латентный. Он станет массовым ровно тогда,
когда §18 сделает слияние массовым сценарием.

Рядом тем же классом: `m1` — ручное слияние двух учёток, у которых один автор оставил заметку в один день
в одной организации, падает на `uq_doctor_notes_daily_author`. `m3` — тот же `23505` на горячем
автоматическом пути привязки телефона. `m4` (связи со специалистом) обработан корректно: дубль
переводится в `ended`, обе строки переезжают.

## Наблюдения (не дефекты, работы не заводить)

1. Канонический предпосадочный маршрут `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root …`
   на DEV **отказывает** — и не из-за этой миграции: `bcb_webapp_dev records 1 migration(s) as applied
   whose objects are not in the catalog … absent: constraint org_enrollments_portal_activation_check on
   public.be_booking_form_fields (from 20260914T111500_leads_core)`. Это расхождение леджера соседней
   ветки. До приземления Э1 его кто-то должен закрыть.
2. `drizzle-orm@0.45.2` не умеет `NULLS NOT DISTINCT` на частичном уникальном ИНДЕКСЕ (метод есть только у
   unique-CONSTRAINT), поэтому `apps/webapp/db/schema/treatmentProgramInstances.ts` объявляет индекс без
   него. Миграция и схема-декларация разошлись; `drizzle-kit generate` выдаст дрейф.
3. `docs/ARCHITECTURE/PLATFORM_USER_MERGE.md` ссылается на регрессию в `pgPlatformUserMerge.test.ts`,
   файл удалён в `a380533b4` (#1074) до этой ветки.
4. `mergeFailureClassification.ts` держит мёртвые ветки `patient_bookings: overlapping` и `test_attempts` —
   таких сообщений движок больше не бросает.

## Что осталось за рамками этого хода

Полный `pnpm run ci`, живая приёмка на TEST, галочка Э1 в плане, приземление и пуш. Никакого продуктового
кода не изменено: после всех инъекций `git status` чист, DEV держит прежний индекс и 0 остаточных строк.
