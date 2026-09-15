# Адверсарный аудит Э4a, ТРЕТИЙ круг — «конфликт слияния разбирает врач», серверная механика

Ветка `wt/merge-conflict-doctor`. Бриф называет голову `df16e21da`; фактическая голова клона —
`1d9807354` (поверх легли сливы `feat/doctor-ui-rebuild` с чужой работой по настройкам, расписанию и
медиа). Вся поверхность Э4a между этими коммитами **идентична**, поэтому аудит велся по голове клона:

```
git diff --stat df16e21da HEAD -- apps/webapp/db/drizzle-migrations/20260914T220000_doctor_resolves_medical_merge_conflict.sql \
  deploy/postgres/privileges deploy/postgres/generated packages/platform-merge \
  apps/webapp/src/infra/repos/pgPatientMergeCandidate.ts apps/webapp/src/infra/adminAuditLogPresentation.ts \
  apps/webapp/src/app/api/doctor/account-merge-conflicts
(пусто)
```

Оракул — `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18/§18б; план —
`docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, этап Э4a. Предыдущий круг —
`docs/_TODO/AUDIT_E4a_MERGE_CONFLICT_DOCTOR_ROUND2_2026-09-15.md` (вердикт FAIL, дефекты E1–E5).

## Вердикт: FAIL

**E1, E2, E4, E5 и регрессия стены закрыты — проверено исполнением, не чтением.** E3 закрыт только
наполовину: гейт стал детерминированным и заводит по конфликту на КАЖДУЮ организацию (это работает),
но появившийся вместе с ним путь «вторая клиника ещё не решила» **возвращает врачу успех, ничего не
слив**. Действие «слить» из §18б в двухклинической паре не исполняется и молчит об этом.

Отдельно: доверенность двери (единственная строка `patient_merge_candidates`) выписывается той же
ролью, которая в дверь стучится, а радиус двери в этом круге вырос до учётно-аутентификационных таблиц.

## Классификация по §24.4 — до проверки

- Пункты 1, 3, 4 — повторяемое поведение → **исполнение**: живые прогоны против `bcb_webapp_dev`,
  кандидатная миграция + кандидатные права + кандидатные port-context-возможности ставятся ВНУТРИ
  транзакции, которая всегда заканчивается `ROLLBACK`. Миграция на DEV по-настоящему не применяется.
- Пункт 2 — маршрут «отказ → журнал → ссылка»: серверная половина исполнением, презентер — одним
  разовым unit-прогоном на РЕАЛЬНО снятой из БД строке журнала (не на выдуманном ожидании);
  автоматических UI-тестов не писал (§10a).
- Пункты 5, 6, 7 — взгляд + интроспекция + существующие гейты. Новых тестов не писал: §24.5 (повторный
  аудитор ту же поверхность слепо не переписывает) и §10a п.5 (текстовый тест по SQL деплоя запрещён).

⚠️ Бриф ссылается на подраздел §10a «Линейка владельца (15.09)». В клоне такого текста нет:
`grep -rn "Линейка владельца" --include=*.md .` → пусто. Работал по §10a/§10b в их нынешней редакции.

---

## E1 — ЗАКРЫТ. «Слить» проходит целиком под ролью врача

Заявленный прогон воспроизведён дословно и даёт то, что заявлено:

```
RUN_DOCTOR_MEDICAL_MERGE_DOOR_DB=1 node --test deploy/postgres/privileges/doctor-medical-merge-door.devDbProof.test.mjs
→ 1 pass / 0 fail

вывод тела прогона:
  candidate migration applied: 9 owner-ordered blocks
  candidate privileges applied: 412 generated statements
  runtime role installed: session_user=bcb_dev_webapp_staff current_user=app_staff org=a0000000-…-000000000001
  merge returned: {"targetId":"…e1a1","duplicateId":"…e1a2","mergeContactsSaved":[],"mergeCompleted":true}
  after merge: {"duplicate_merged_into":"…e1a1","duplicate_credentials":0,"target_visits":2,"conflict_status":"resolved"}
  RESULT: PASS — merge completed under the doctor runtime role, no privilege refusal
  rolled back; fixture rows left in the database: 0
```

Слепая поломка (у двери отбирают `user_password_credentials`) прогон ловит:
`DOCTOR_MEDICAL_MERGE_DOOR_FAULT=privilege …` → 1 pass, где утверждения требуют `RESULT: FAIL` и
`permission denied for table user_password_credentials`. Прогон не зелёный «всегда».

**Атака «не открылась ли учётная таблица самой роли врача».** Нет. Кандидатный артефакт применён в
транзакции, права сняты интроспекцией под каждым именем:

```
user_password_credentials: app_staff SELECT=false/col=false UPDATEcol=false DELETE=false INSERTcol=false | login SELECT=false | seam-owner SELECTcol=true
channel_link_secrets:      app_staff …=false … | login SELECT=false | seam-owner SELECTcol=true
email_challenges:          app_staff …=false … | login SELECT=false | seam-owner SELECTcol=true
user_oauth_bindings:       app_staff …=false … | login SELECT=false | seam-owner SELECTcol=true
email_send_cooldowns:      app_staff …=false … | login SELECT=false | seam-owner SELECTcol=true
login_tokens:              app_staff …=false … | login SELECT=false | seam-owner SELECTcol=true
user_channel_preferences:  app_staff SELECT=true … (права БЫЛИ до ветки, не из этого круга)
seam owner columns on user_password_credentials: SELECT:user_id, UPDATE:user_id
```

Хеш пароля владельцу шва не виден — грант колоночный, только `user_id`. Ни одного нового GRANT роли
врача в сгенерированном артефакте нет (весь diff прав уходит в `app_seam_identity_lookup_owner`).

**Атака «не даёт ли дверь врачу больше, чем два его действия» — см. F2 ниже: даёт, на уровне БД.**

## E2 — ЗАКРЫТ. Отказ доезжает до консоли глобального администратора

Маршрут пройден до конца, каждым звеном.

1. Врач отказывает — живой вызов двери под staff-контекстом своей организации:

```
E2 refuse returned: true
E2 candidate status after refusal: escalated
E2 journal row: {"action":"auto_merge_conflict","status":"error",
  "target_id":"…a2a01",
  "conflict_key":"doctor-refused-medical-merge:a0000000-…-000000000001:…a2a01:…a2a02",
  "details":{"reason":"doctor_refused_medical_merge","conflictId":"09cee54a-…",
             "candidateIds":["…a2a01","…a2a02"],"organizationId":"a0000000-…-000000000001"},
  "resolved_at":null}
```

2. Презентер журнала на ЭТОЙ строке (взята из БД как есть, не придумана):

```
isMergeAuditAction('auto_merge_conflict')              → false
isMessengerPhoneBindAuditAction('auto_merge_conflict') → true
parseMessengerPhoneBindAuditTargets(details)           → ["…a2a01","…a2a02"]  (порядок сохранён)
href → /app/admin/account-merge?targetId=…a2a01&duplicateId=…a2a02
1 passed (vitest --project=unit, временный файл удалён после прогона)
```

3. Консоль этот адрес принимает: `app/app/admin/account-merge/page.tsx:29-37` читает `targetId` и
   `duplicateId` из query и отдаёт их в `AccountMergeClient`.

Пара НЕ переворачивается: сортировка по UUID из `parseMessengerPhoneBindAuditTargets` снята, первым
идёт `anchor_user_id`, он же `targetId` ссылки. Остаточный риск ориентации — см. «Вопросы» №2.

## E3 — ЗАКРЫТ НАПОЛОВИНУ. Гейт стал детерминированным; врач первой клиники получает ложный успех

**Что почи́нено (проверено живьём, две организации, одна пара).** `LIMIT 1` без `ORDER BY` заменён на
`ORDER BY conflict_organization_id NULLS FIRST` и возврат ВСЕХ строк; ошибка несёт `organizationIds`.

```
фикстура: две организации, у обеих учёток квалифицирующая медицинская история в КАЖДОЙ
E3.1 pass1: kind=medical_history organizationIds=["00000000-…-0000000a2b02","a0000000-…-000000000001"]
E3.1 pass2: то же самое
E3.1 pass3: то же самое
E3.2 recorded: [{"org":"a0000000-…001","id":"62ca20bc-…"},{"org":"00000000-…a2b02","id":"be41a2d8-…"}]
E3.2 rows: две pending-строки, по одной на организацию, обе reason=medical_history:projection
```

Врач второй организации больше не получает пустоту, врач первой не получает `500`.

**🔴 Что НЕ почи́нено — дефект, из-за которого круг FAIL.**

```
E3.3 doctor1 merge returned: {"targetId":"…a2a01","duplicateId":"…a2a02",
                              "mergeContactsSaved":[],"mergeCompleted":false}
E3.3 rows after: org2 → status=pending
                 org1 → status=resolved, payload={"source":"projection","doctorApproved":true}
E3.3 duplicate.merged_into_id after doctor1 pressed merge: null      ← НИЧЕГО НЕ СЛИТО
E3.4 doctor2 merge returned: {… "mergeCompleted":true}
E3.4 duplicate.merged_into_id: …a2a01                                ← слилось только у второго
```

Дверь в этой ветке (миграция, строки ~322–331) перестала бросать
`medical_merge_blocked_by_another_organization`: вместо исключения она молча помечает строку своей
клиники `resolved` + `doctorApproved:true` и возвращает `false`. Движок честно отдаёт это наружу
(`pgPlatformUserMerge.ts:427` → `mergeCompleted:false`). **Дальше сигнал теряется:**

```
apps/webapp/src/infra/repos/pgPatientMergeCandidate.ts:200-221
  await withTwoUserLifecycleLocksExclusive(…, async (client) => {
    await mergePlatformUsersInTransaction(…);      ← результат не читается
  });
  return true;                                      ← всегда true

apps/webapp/src/app/api/doctor/account-merge-conflicts/[conflictId]/route.ts:50-58
  if (!resolved) → 403; иначе → NextResponse.json({ ok: true, action: 'merge' })

grep -rn "mergeCompleted" --include=*.ts apps packages | grep -v node_modules
  → только объявление, две точки возврата и .d.ts. Потребителей в продукте НЕТ.
```

**Вход и неправильный исход.** У пары есть медицинский конфликт в клинике A и в клинике B. Врач
клиники A открывает свой конфликт и жмёт «слить» (`POST /api/doctor/account-merge-conflicts/<id>`
`{"action":"merge"}`). Ответ — `200 {"ok":true,"action":"merge"}`. Фактически:
`platform_users.merged_into_id` остался `NULL`, человек так и живёт двумя учётками, а строка конфликта
клиники A ушла из списка врача как «разобранная». Врач получил слово «слито» за действие, которого не
произошло, и вернуться к этому конфликту ему уже нечем. §18б: «слить — „да, это мой клиент", под свою
ответственность» — действие обязано либо исполниться, либо честно сказать, что не исполнилось.

## E4 — ЗАКРЫТ. Немедицинские конфликты больше не выглядят медицинскими

Охрана вернулась на верном уровне — по типу ошибки, а не по наличию организации:
`pgPatientMergeCandidate.ts:71` — `if (error.kind !== 'medical_history') return null;`.
`kind: 'medical_history'` проставлен РОВНО в одном месте — медицинском гейте
(`pgPlatformUserMerge.ts:206`); остальные пять бросков (`:1058` shared-phone, `:1084` bookings,
`:1110` ЛФК, `:1271` программы, `:1342` попытки теста) конструктор опций не передают, поэтому
получают дефолт `merge_dependency`.

Живой прогон (две учётки, НИ ОДНОЙ медицинской записи):

```
E4.1 overlapping active booking slots: kind=merge_dependency orgIds=[] classify=merge_blocked_booking_overlap
E4.2 active LFK template on both sides: kind=merge_dependency orgIds=[] classify=merge_blocked_lfk_conflict
E4 admin_audit_log rows:            before=1361 after=1361 (delta 0)
E4 patient_merge_candidates rows:   before=1    after=1    (delta 0)
```

Ноль строк в журнале → ноль открытых конфликтов → оператора никто не дёргает
(`adminIncidentAlertConfig.ts` реагирует на `auto_merge_conflict*`, которых не появилось).
Программы и попытки теста живьём не заводил (фикстура требует чужих обязательных полей); они того же
класса по конструкции — доказано перечислением всех шести точек броска выше.

## E5 — ЗАКРЫТ. Все три пути проекции записывают блокер

```
packages/platform-merge/src/identityProjectionWrite.ts:115 (collapseIdentityProjectionCandidates)
  ← apps/webapp/src/infra/repos/pgUserProjection.ts:80-84   catch → recordPatientMedicalMergeConflict(error,'projection')
apps/webapp/src/infra/repos/pgChannelLinkClaim.ts:167-169    catch → recordPatientMedicalMergeConflict(err,'phone_bind')
packages/platform-merge/src/messengerPhonePublicBind.ts:185  ← mapMergeFailure кладёт исходную ошибку в cause,
  apps/webapp/src/app-layer/integrator/messengerPhoneHttpBindExecute.ts:119-121 достаёт cause и записывает
```

Третий путь заодно перестал врать типом: `merge_blocked_medical_history_support_required` добавлен в
`MessengerPhoneLinkFailureCode`, а `classifyMergeFailure` теперь смотрит на `err.kind`, а не на
подстроку в тексте сообщения.

Мелочь, не дефект: `upsertIdentityProjection` импортируется в `pgUserProjection.ts:21` и не
вызывается — мёртвый импорт, второй вызывающий `collapseIdentityProjectionCandidates`
(`identityProjectionWrite.ts:388`) живых вызывающих не имеет.

## Регрессия стены — ЗАКРЫТА, но стена НЕ восстановлена: пересечения ОБЪЯВЛЕНЫ

Честная формулировка: предикат в тело не вернули. Десять пар «корень → отношение» помечены
`crossesTenantWall: { why: … }` в `declaration.ts` и записаны в `name-census.json`
(`definerRootsCrossingTenantWall`) — это штатный механизм гейта, а не его отключение: гейт требует
причину ≥40 символов, а отдельный тест краснеет на пометке, которой больше нечего объяснять.

Читаю причины против тела и считаю их правдивыми: семь `clinical_*`, `doctor_notes` и
`treatment_program_instances` читаются по ВСЕМ организациям намеренно — дверь ищет клинику, у которой
блокер ещё не снят; `patient_merge_candidates` — второй подзапрос ищет одобрение ДРУГОЙ клиники.
Наружу дверь не отдаёт ни строки: возвращает `boolean`.

```
pnpm run check:db-privileges-generated
  ok bcb_webapp_dev / bersoncarebot_test / therapysto_prod — побайтно, 3 базы + port-context, EXIT=0
node --test deploy/postgres/privileges/definer-tenant-predicate.test.mjs \
     deploy/postgres/privileges/function-census.test.mjs
  1..29 # pass 29 # fail 0
```

«Починка не сняла ничего другого»: диff миграции за этот круг трогает только `record_…` и
`transfer_…`; тело `read_staff_…` (поверхность утечки) не изменено ни байта, диф `name-census.json` —
только десять добавленных строк, ни одного удаления.

## Миграция — ЧИСТА по §1 и на DEV НЕ ПРИМЕНЕНА

```
grep -nEi "^\s*(GRANT|REVOKE|CREATE ROLE|ALTER ROLE|ALTER DEFAULT PRIVILEGES|CREATE POLICY|…)" <миграция>
  → ничего (exit 1). Единственное совпадение слова GRANT во всём файле — имя таблицы
    content_access_grants_webapp на строке 409.

интроспекция bcb_webapp_dev:
  new_functions_present=0
  status_check=CHECK (status = ANY (ARRAY['pending','resolved','dismissed']))   ← без 'escalated'
  uq_unordered=NULL
  drizzle.__drizzle_migrations LIKE '%doctor_resolves%' = 0
```

---

## 🔴 F1 (дефект круга). «Слить» отвечает успехом, не слив

См. E3 выше. Место сигнала: `pgPlatformUserMerge.ts` возвращает `mergeCompleted`,
`pgPatientMergeCandidate.ts:200-221` его выбрасывает, маршрут отвечает `{ok:true}`.

## 🔴 F2 (находка по пункту 1 брифа). Доверенность двери выписывает та же роль, что в неё стучится

Декларация обосновывает права двери словами «the exact pair is authorized by the current-clinic
pending conflict». На живой базе это не так: `app_staff` имеет КОЛОНОЧНЫЙ `INSERT` на все столбцы
`patient_merge_candidates` (табличного `INSERT` нет — `has_table_privilege` = false, поэтому в глаза
не бросается), а RLS требует лишь `organization_id = app.current_org_id()`. Прогон под настоящей
ролью врача:

```
фикстура: две учётки, НЕ записанные в клинику, без медицинской истории, у каждой пароль
acting as app_staff in org a0000000-…-000000000001
FORGED ROW: app_staff inserted its own pending medical_history conflict — INSERT SUCCEEDED
door returned: true
after door: {"dup_creds":0,"tgt_creds":1,"st":"resolved"}      ← учётные строки дубликата перенесены
```

**Честная атрибуция:** сам грант существовал ДО Э4a (`git show f44072865^:…privileges.bcb_webapp_dev.sql`
уже содержит его), и HTTP-маршрута, пишущего произвольную строку в `patient_merge_candidates`, сегодня
нет — `upsertPendingCandidate` вызывающих вне `modules/patient-merge-candidate/service.ts` не имеет.
Изменилось в ЭТОМ круге другое: за ту же самодельную доверенность дверь теперь двигает
`user_password_credentials`, `channel_link_secrets`, `email_challenges`, `user_oauth_bindings`,
`login_tokens`, `email_send_cooldowns`. То есть эшелон «дверь узкая, потому что доверенность внешняя»
держится сейчас только на отсутствии маршрута.

---

## Вопросы ведущему/владельцу (§24.6 — находка без строки канона задачей не становится)

1. **Двухклиническое ожидание — новый режим, которого в §18б нет.** Канон знает два действия врача и
   ничего не говорит про «одобрил, но ждём вторую клинику». Реализация ввела третий исход молча.
   Безопасный дефолт до решения владельца: отвечать врачу отдельным кодом («учтено, ждём вторую
   клинику»), а не `ok:true`, и не убирать конфликт с его индикатора до фактического слияния.
2. **Кто переживает слияние — по-прежнему зависит от посторонней строки** (наблюдение прошлого круга,
   не закрыто). Если упорядоченный слот `(anchor, candidate)` занят чужим немедицинским кандидатом,
   `record_…` (миграция, строки ~152–168) вставляет медицинскую строку в ОБРАТНОЙ ориентации; `refuse_…`
   берёт пару из строки, поэтому `candidateIds` — и ссылка админа — поедут наоборот. `pickMergeTargetId`
   здесь не применяется, канон выжившего для врачебного слияния не задаёт.
3. **Отказ не держится** (наблюдение прошлого круга, не закрыто): после `escalated` следующая привязка
   почты/телефона поднимет гейт заново и заведёт новый конфликт тому же врачу.
4. **Поверхность владельца шва.** `app_seam_identity_lookup_owner` владеет на живой DEV 21 функцией и
   получил в этом круге в том числе табличный `DELETE` на `user_password_credentials`. Отдельный
   seam-владелец под перенос слияния снял бы связку «дефект в любой из 21 функции ⇒ доступ к учётным
   строкам».
5. **Гейт против §18 (прежнее расхождение, не этого круга).** `patient_bookings` по-прежнему БЛОКИРУЕТ
   слияние (`E4.1` выше — merge не прошёл), а §18 прямо относит историю записей к «не блокерам ничего
   и никогда». Столкновение с `wt/merge-org-gate` разрешает ведущий.

## НЕ СДЕЛАНО

- Сквозной HTTP-прогон обеих дверей врача — невозможен: миграция ветки на DEV не применена и применять
  её запрещено. Поведение доказано прогонами настоящего движка и настоящих функций под настоящими
  рантайм-ролями внутри транзакции с `ROLLBACK`.
- Живые фикстуры для «двух активных программ» и «открытых попыток теста» (E4) — вместо них
  перечисление всех шести точек броска и живая проверка двух из них.
- Экраны Э4b (Р4) — следующий этап, вне скоупа.
- Full CI по ветке не гонялся: аудит не меняет продуктовый код.

## Строка вердикта для накопителя ветки (в `feat` не пишу — ветка закрыта владельцем)

`FAIL — аудит Э4a (3-й круг, 1d9807354): E1/E2/E4/E5 и стена закрыты живыми прогонами; E3 — гейт детерминирован, но «слить» при конфликте в двух клиниках отвечает ok:true, не слив (mergeCompleted выбрасывается в pgPatientMergeCandidate.ts:221); отдельно — доверенность двери выписывает сама роль app_staff, а радиус двери вырос до учётных таблиц.`
