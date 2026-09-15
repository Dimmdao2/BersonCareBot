# Адверсарный аудит Э4a — «конфликт слияния разбирает врач», серверная механика

Ветка `wt/merge-conflict-doctor`, коммит `f44072865`. Оракул — `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md`
§18/§18б, план — `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, этап Э4.

## Вердикт: FAIL

Стена и отсутствие утечки — держат. Оба действия врача по факту не исполняются: «отказать» падает на
`42P10`, «слить» — на `42501`. Новый уникальный индекс ломает четыре уже живые двери.

Классификация по §24.4: пункты 1–4 — поведение, но новые SQL-функции на DEV отсутствуют (миграция
намеренно не применялась, применять запрещено), а гейт живёт целиком внутри SQL. Поэтому поведение
доказано прямыми прогонами SQL против живой DEV в транзакциях с `ROLLBACK`, а не новыми тестами: §10a
«✅ Как надо» прямо запрещает заводить новый DB-тест до отдельного аудита ролей и owner-go, а fake-клиент
проверял бы наш же текст SQL (§10a «⛔ ТЕСТ НЕ ДУБЛИРУЕТ КОД»). Пункты 5–6 — взгляд.

## Дефекты

### D1. «Отказать» всегда падает: арбитр `ON CONFLICT` не совпадает с индексом (п. 3)

`app.refuse_staff_patient_medical_merge_conflict` пишет в `admin_audit_log` с
`ON CONFLICT (conflict_key) WHERE resolved_at IS NULL`. Живой частичный уникальный индекс —
`idx_admin_audit_log_conflict_open ... WHERE conflict_key IS NOT NULL AND resolved_at IS NULL`.
Предикат индекса не выводится из предиката инференса, индекс арбитром не выбирается.

```
psql bcb_webapp_dev (BEGIN … ROLLBACK)
INSERT INTO public.admin_audit_log (…) VALUES (…)
ON CONFLICT (conflict_key) WHERE resolved_at IS NULL DO UPDATE SET details = EXCLUDED.details;
ERROR:  there is no unique or exclusion constraint matching the ON CONFLICT specification

-- та же вставка с правильным арбитром:
ON CONFLICT (conflict_key) WHERE conflict_key IS NOT NULL AND resolved_at IS NULL DO UPDATE …
INSERT 0 1
```

Последствие: врач жмёт «отказать» → исключение → `500`, конфликт остаётся `pending`, заявка до консоли
глобального администратора не доходит. Канон §18б: «отказать — и отправить заявку в техподдержку».
Тот же дефект уже живёт в `app.pre_session_messenger_channel_resolve` — это не задача этой ветки, но
показывает, что шаблон копируется.

### D2. «Слить» всегда падает: ни одна runtime-роль не может перенести медицинские строки (п. 3)

`mergeMedicalConflict` зовёт `mergePlatformUsersInTransaction` на собственном соединении врача
(`getPool()` под staff-принципалом). `transferMedicalHistoryForMerge` безусловно выполняет
`UPDATE clinical_visit SET patient_user_id = …`, а права на эту колонку есть только у `app_object_owner`.

```
BEGIN; SET LOCAL ROLE app_staff;
UPDATE public.clinical_visit SET patient_user_id = …;
ERROR:  permission denied for table clinical_visit          (то же под app_patient)

SELECT rolname, has_column_privilege(rolname,'public.clinical_visit','patient_user_id','UPDATE')
  FROM pg_roles WHERE rolcanlogin AND rolname LIKE 'bcb_dev%';
  bcb_dev_webapp_patient | f
  bcb_dev_webapp_staff   | f
  bcb_dev_integrator     | f
  bcb_dev_webapp_global_admin | f
```

Артефакт прода даёт то же: `GRANT UPDATE ("anamnesis_text", "duration", … ) … TO "app_staff"` — без
`patient_user_id`. Конфликт по построению означает медицинские строки с обеих сторон, поэтому «слить»
не может завершиться никогда. Состояние досталось в наследство от прежних вызывающих движка слияния,
но действие врача ветка объявляет рабочим, а §1 «Перед приземлением миграции — разбор её прав» требует
назвать права, нужные телу, чтобы оно **исполнилось**, и добавить их в декларацию в этой же ветке.

### D3. Новый неупорядоченный индекс ломает четыре живые двери (п. 4)

Живые `app.record_public_booking_merge_candidates`, `app.claim_unbound_patient_invite_email`,
`app.redeem_patient_invite_email`, `app.redeem_patient_invite_session` вставляют кандидатов с
`ON CONFLICT (organization_id, anchor_user_id, candidate_user_id) WHERE status = 'pending' DO NOTHING` —
то есть называют арбитром упорядоченный индекс. Новый `uq_…_unordered_pair` строже: пара в обратном
порядке даёт `23505` мимо арбитра.

```
-- копия обоих индексов на временной таблице, BEGIN … ROLLBACK
INSERT … (org, A, B, 'medical_history:email_bind', 'pending');         INSERT 0 1
INSERT … (org, B, A, 'invite_redeem_identity_conflict', 'pending')
  ON CONFLICT (organization_id, anchor_user_id, candidate_user_id) WHERE status='pending' DO NOTHING;
ERROR:  duplicate key value violates unique constraint "pmc_unordered"
```

Последствие: после записи медицинского конфликта (A,B) редким пациента по инвайту/публичной брони с
обратным порядком пары получает исключение вместо штатного `conflicting_identity`.

### D4. Запись конфликта перехватывает чужую строку кандидата (п. 4)

В `app.record_patient_medical_merge_conflict` `INSERT … ON CONFLICT DO NOTHING` без цели, а запасной
`UPDATE` ищет пару **без учёта `reason`**. Существующая `pending`-строка другого происхождения
(`invite_redeem_identity_conflict`, `public_booking_phone_collision`) переписывается в
`medical_history:*`, её payload склеивается.

```
-- реплика, BEGIN … ROLLBACK: была строка invite_redeem_identity_conflict {"x":1}
reason: medical_history:email_bind | payload: {"x": 1, "source": "email_bind"}
```

Прежний конфликт исчезает из журнала, а врачу открывается модалка на паре, которая медицинским
конфликтом не была.

### D5. Организация конфликта выбирается произвольно, и «не своя» теряется совсем (п. 1, 3)

Гейт возвращает `SELECT DISTINCT … LIMIT 1` без `ORDER BY`. Когда пара конфликтует в двух организациях,
какая из них попадёт в ошибку — не определено (в прогоне вернулась B при конфликте и в A, и в B).
Дальше:

- `pgEmailAuth.claimVerifiedEmail`: `if (err.organizationId !== organizationId) throw err;` — прежде
  этот класс ошибки давал мягкий `{ ok: false, code: 'email_conflict' }`. Выше по стеку
  `modules/auth/emailAuth.ts` ловит только `23505`, поэтому подтверждение почты завершается
  необработанным исключением, challenge не удаляется, и конфликт **не записывается никому**;
- `pgUserByPhone`: та же ветка молча пробрасывает ошибку без записи.

Канон §18б: конфликт разбирает врач той организации, где он возник. Здесь врач не видит его нигде.

```
-- семантика гейта, прогон на DEV (BEGIN … ROLLBACK)
A. данные в РАЗНЫХ организациях, без одобрения      -> 0 строк  (канон: не блокер)  ✔
B. одна организация, без одобрения                  -> эта организация              ✔
C. одна организация, её врач одобрил                -> 0 строк                      ✔
D. конфликт в A и B, врач A одобрил                 -> B (продолжает блокировать)   ✔
F. конфликт в A и B, без одобрения                  -> B (порядок не задан)         ✘
```

### D6. Пара с `organization_id IS NULL` объявляется конфликтом без организации (п. 4)

`ON duplicate.organization_id IS NOT DISTINCT FROM target.organization_id` считает NULL равным NULL, а
`organization_id` во всех пробируемых медицинских таблицах nullable (`information_schema.columns`:
`clinical_*`, `doctor_notes`, `treatment_program_instances` — все `YES`; на DEV сегодня таких строк 0).
Такой конфликт приходит с `organizationId = null`, обе двери его не записывают, слияние блокируется
навсегда и не достаётся ни одному врачу.

### D7. Путь проекции по-прежнему минует врача (п. 6)

`recordPatientMedicalMergeConflict` вызывается только из `email_bind` и `phone_bind`. Значение
`'projection'` принимают и SQL-функция, и union в `pgPatientMergeCandidate.ts`, но ни один вызывающий
его не передаёт: конфликты, возникшие на `POST /api/integrator/events`, как и раньше уходят только
в `admin_audit_log`. Мёртвая ветка внутри слоя плюс невыполненное Р3 для этого пути.

### D8. Ничто не гасит `pending`-конфликт, кроме двух действий врача (п. 4)

У `markResolvedForUserPair`, `dismissCandidate`, `upsertPendingCandidate`, `listPendingByOrganization`
вызывающих нет (было и до ветки). Если пару сольют из консоли глобального администратора, строка
останется `pending`: индикатор врача не гаснет, а его «слить» на уже слитой паре падает.

## Что держит

- **Стена (п. 1) — PASS.** Организация берётся из сессии (`requireDoctorWorkspaceApiContext`), а не из
  запроса; `conflictId` чужой организации не находится ни в одной двери. `read_staff_…` и
  `refuse_staff_…` фильтруют по `app.current_org_id()`, `mergeMedicalConflict` и сводка — по org сессии,
  репозиторий повторно сверяет `organizationId` снимка. Без контекста порта
  `app.require_accepted_context` бросает, пустой `current_org_id()` даёт пустой результат — обе двери
  fail-closed. `EXECUTE` выдан узко (`app_staff` / `app_patient`), `PUBLIC` отозван,
  `search_path = pg_catalog`, владелец — `app_seam_identity_lookup_owner`. Придирка без последствий:
  при чужом снимке репозиторий бросает, а не возвращает `null`, — вместо `403` получится `500`.
- **Утечка (п. 2) — PASS.** Назначения обеих сторон ограничены `candidate.organization_id`
  (`treatment_program_instances` + `patient_lfk_assignments`), шаблон ЛФК подхватывается только свой или
  платформенный, иначе строка выпадает на INNER JOIN. ФИО и последняя активность — ровно то, что канон
  §18б разрешает показать. Пути для назначений, заметок или карточки другой организации нет.
- **Ровно два действия (п. 3) — PASS по поверхности.** `z.enum(['merge','refuse']).strict()`; ни
  блокировки, ни удаления, ни правки чужих данных. Перенос трогает только `patient_user_id` /
  `user_id` / `platform_user_id`, `organization_id` медицинских строк не меняется. Конфликт другой
  организации после одобрения врача продолжает блокировать (прогон D). Исполняются эти действия,
  однако, никогда — D1 и D2.
- **Миграция (п. 5) — PASS.** `GRANT/REVOKE/CREATE ROLE/ALTER ROLE/DEFAULT PRIVILEGES/CREATE POLICY`
  в файле нет; владельцы помечены; `pnpm run check:db-privileges-generated` — «артефакты соответствуют
  декларации побайтно» для трёх баз; колоночные гранты seam-владельцу покрывают все девять отношений,
  к которым обращаются тела.
- **Миграция на DEV не применялась — подтверждено интроспекцией.** Трёх функций в `app` нет,
  `patient_merge_candidates_status_check` без `escalated`,
  `to_regclass('public.uq_patient_merge_candidates_org_pending_unordered_pair')` — NULL.

## Версия гейта против канона §18 (отдельный вопрос ведущему)

Разрез по организации совпадает с каноном (прогоны A–D). Снятие проб с `patient_bookings` и
`be_appointments` тоже совпадает: §18 прямо называет историю записей не блокером. Расхождение —
квалифицирующий набор: §18 перечисляет «назначенные упражнения» и «отслеживание симптомов», а
`automaticProbe` нет ни у `patient_lfk_assignments`, ни у трекинга симптомов (это состояние досталось
от прежней редакции, ветка его не создавала). Получается перекос: модалка врача показывает ЛФК-назначения
как подробности конфликта, а гейт по ним конфликт не поднимает. Столкновение с `wt/merge-org-gate`
разрешает ведущий.
