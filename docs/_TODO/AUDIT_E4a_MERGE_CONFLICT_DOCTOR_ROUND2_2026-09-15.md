# Адверсарный аудит Э4a, ВТОРОЙ круг — «конфликт слияния разбирает врач», серверная механика

Ветка `wt/merge-conflict-doctor`, коммит `ff42b26f5`. Предыдущий круг —
`docs/_TODO/AUDIT_E4a_MERGE_CONFLICT_DOCTOR_2026-09-14.md` (коммит `f44072865`, вердикт FAIL, дефекты D1–D8).
Оракул — `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md` §18/§18б, план — `docs/_TODO/MERGE_MECHANISM_REWRITE_2026-09-14.md`, этап Э4.

## Вердикт: FAIL

Из восьми заявленных закрытий реально закрыты пять (D1, D3, D4, D6, D8). **D2 не закрыт — только переехал:**
«слить» по-прежнему падает на `permission denied`, просто на других шести таблицах, которые остались в
роли врача ВНЕ `SECURITY DEFINER`-двери. **D5 не тронут вовсе.** **D7 закрыт частично.** Отдельно проверенный
пункт владельца (15.09) — отказ врача **не доезжает** до консоли слияния глобального администратора.
Плюс одна новая регрессия, внесённая самой коррекцией (E4).

## Классификация по §24.4 (до проверки)

- Пункты 1–4 — повторяемое поведение. Но гейт и обе двери живут целиком внутри SQL, а миграция на DEV
  намеренно не применена и применять её запрещено, поэтому поведение доказывается прямыми прогонами
  против живой `bcb_webapp_dev` в транзакциях с `ROLLBACK`, а не новыми тестами.
- Права ролей — §10a «⛔ Как НЕ надо» п. 5 прямо запрещает текстовый тест по SQL деплоя: права проверяет
  деплой против живой БД. Поэтому E1 доказан прогоном под `SET LOCAL ROLE app_staff`, не тестом.
- Новых acceptance-тестов не пишу: §24.5 — повторный аудитор ту же поверхность слепо не переписывает.
- Пункты 5–6 — взгляд: `rg`, чтение, интроспекция БД, прогон гейтов привилегий.

---

## E1 (D2 НЕ закрыт). «Слить» по-прежнему падает на `permission denied` — до двери DEFINER

Исполнитель заявляет, что перенос идёт через `app.transfer_staff_approved_platform_user_merge_data`, а не
правами врача. Это верно только для медицинских и пациент-владеемых строк. Идентификационно-аутентификационная
часть слияния осталась в соединении врача (`getPool()` → `SET ROLE app_staff`,
`packages/db-principal/src/index.ts:70,1049`) и НЕ обёрнута в `if (!options?.medicalConflictApproval)`.

Порядок в `packages/platform-merge/src/pgPlatformUserMerge.ts`: строка **434** выполняется **до** двери на
строке **450**.

```
pgPlatformUserMerge.ts:434  await assertAutoMergePasswordCredentialsSafe(...)   ← первый отказ
pgPlatformUserMerge.ts:450  SELECT app.transfer_staff_approved_platform_user_merge_data(...)
```

Прогон под ролью рантайма (живая DEV, каждая проба в своей транзакции с `ROLLBACK`):

```
sudo -u postgres psql -d bcb_webapp_dev
BEGIN; SET LOCAL ROLE app_staff;
SELECT user_id::text FROM user_password_credentials WHERE user_id IN (…) ORDER BY user_id FOR UPDATE;
ERROR:  permission denied for table user_password_credentials      -- pgPlatformUserMerge.ts:1221-1227
UPDATE channel_link_secrets SET user_id = … WHERE user_id = …;
ERROR:  permission denied for table channel_link_secrets           -- :531
UPDATE email_challenges SET user_id = … WHERE user_id = …;
ERROR:  permission denied for table email_challenges               -- :535
UPDATE user_oauth_bindings SET user_id = … WHERE user_id = …;
ERROR:  permission denied for table user_oauth_bindings            -- :807 (mergeOauthBindingsAuto)
DELETE FROM email_send_cooldowns WHERE user_id = …;
ERROR:  permission denied for table email_send_cooldowns           -- :560,:566
DELETE FROM login_tokens WHERE user_id = …;
ERROR:  permission denied for table login_tokens                   -- :568
ROLLBACK;
```

Ни таблицы, ни колонки: у `app_staff` нет права вообще, и у логин-роли тоже нет —

```
has_table_privilege('app_staff','public.user_password_credentials','SELECT')          -> f
has_any_column_privilege('app_staff','public.user_password_credentials','SELECT')     -> false
has_table_privilege('bcb_dev_webapp_staff','public.user_password_credentials','SELECT') -> f
(то же для channel_link_secrets/email_challenges/user_oauth_bindings/email_send_cooldowns/login_tokens)
```

**Ввод и неправильный результат.** Врач своей организации жмёт «слить» на своём же pending-конфликте
(`POST /api/doctor/account-merge-conflicts/<id>` `{"action":"merge"}`). Транзакция падает на
`user_password_credentials` ещё до вызова двери → исключение → `500`, конфликт остаётся `pending`,
модалка не гаснет, ничего не перенесено. Действие «слить» из §18б не исполняется никогда.

Это тот же класс, что D2: §1 «Перед приземлением миграции — разбор её прав» требует назвать права, нужные
телу, **чтобы оно исполнилось**, и добавить их в декларацию в этой же ветке. Коррекция разобрала права
для тела `SECURITY DEFINER`-функции, но не для остатка пути, который исполняется правами врача.

## E2. Отказ врача не доезжает до консоли слияния глобального администратора (пункт владельца 15.09)

Статус меняется и строка в журнал пишется — но именно «просто меняется статус» и есть весь эффект.

`app.refuse_staff_patient_medical_merge_conflict` пишет `admin_audit_log` с `action = 'auto_merge_conflict'`
и `details.candidateIds` (миграция, строки ~690–710). Консоль слияния —
`apps/webapp/src/app/app/admin/account-merge/AccountMergeClient.tsx:1-10` — по решению владельца 13.09 не
имеет ни поиска, ни списка: «пара приходит ссылкой из журнала». Единственная ссылка в консоль:

```
apps/webapp/src/components/admin/AuditLogMergeTarget.tsx:64-70
  {mb.length >= 2 && … ? <Link href={`/app/admin/account-merge?targetId=…&duplicateId=…`}>Разобрать и объединить</Link> : null}
```

и она отрисовывается **только** внутри ветки `isMessengerPhoneBindAuditAction(row.action)`:

```
apps/webapp/src/infra/adminAuditLogPresentation.ts:52-54
  isMergeAuditAction(action) -> action === 'user_merge' || action === 'integrator_user_merge'
apps/webapp/src/infra/adminAuditLogPresentation.ts:111-113
  isMessengerPhoneBindAuditAction(action) -> 'messenger_phone_bind_blocked' || 'messenger_phone_bind_anomaly'
```

`auto_merge_conflict` не проходит ни ту, ни другую проверку → `AuditLogMergeTarget` падает в хвост
(строки 77–79) и печатает голый `target_id`. Вдобавок оба парсера ищут `details.targetId`/`details.duplicateId`
(`parseMergeAuditDetails`, строки 28–40) или `details.candidates` (`parseMessengerPhoneBindAuditTargets`,
строки 62–66), а функция кладёт `details.candidateIds` — ни один ключ не совпадает.

**Ввод и неправильный результат.** Врач жмёт «отказать». В `/app/admin/audit-log` глобальный админ видит
строку `auto_merge_conflict` со статусом `error` и единственную доступную кнопку — «закрыть строку»
(`POST /api/admin/audit-log/resolve`, который только проставляет `resolved_at`). Ссылки «Разобрать и
объединить» нет, попасть в `/app/admin/account-merge` для этой пары можно только вручную собрав URL.
Канон §18б: «отказать … и отправить заявку в техподдержку» — заявка до рабочего места не доезжает.

## E3 (D5 НЕ закрыт). Организация конфликта по-прежнему выбирается произвольно

`assertAutomaticMergeHasNoMedicalHistory` коррекция не тронула вообще:

```
git diff f44072865 ff42b26f5 -- packages/platform-merge/src/pgPlatformUserMerge.ts \
  | grep -n "assertAutomaticMergeHasNoMedicalHistory\|LIMIT 1\|ORDER BY"
(пусто — 155 изменённых строк, ни одна не в этой функции)
```

В теле (строки 196–205) остался `SELECT DISTINCT … LIMIT 1` без `ORDER BY`. Когда пара конфликтует в двух
организациях и ни одна не одобрена, в `MergeDependentConflictError.organizationId` попадает произвольная из
них; конфликт записывается ОДНОЙ организации, врач второй не получает ничего. Дальше врач первой организации
жмёт «слить» → гейт с `approvedOrganizationId` возвращает вторую организацию → `MergeDependentConflictError`
летит наружу из `mergeMedicalConflict` без обработчика → `500`, и пара не может быть разобрана никогда.
Канон §18б: «разбирает врач той организации, где возник конфликт» — при двух организациях реализация
обслуживает одну случайную.

Половина D5 про двери **закрыта**: `pgEmailAuth.ts:324-327` и `pgUserByPhone.ts:696-698` больше не
пробрасывают ошибку молча, а всегда зовут `recordPatientMedicalMergeConflict`.

## E4 (НОВАЯ регрессия коррекции). Пять немедицинских конфликтов уезжают в «медицинский конфликт без организации»

Коррекция сняла охрану `if (err.organizationId)` в обеих дверях (`pgEmailAuth.ts`, `pgUserByPhone.ts`) и
`if (!error.organizationId) throw` в `recordPatientMedicalMergeConflict` (`pgPatientMergeCandidate.ts:71-73`).
Но `MergeDependentConflictError` бросает не только медицинский гейт — ещё пять мест, и все они передают
`organizationId = null` (третий аргумент конструктора отсутствует):

```
pgPlatformUserMerge.ts:1056  shared-phone guard: meaningful data on both candidates
pgPlatformUserMerge.ts:1082  patient_bookings: overlapping active slots between merge candidates
pgPlatformUserMerge.ts:1108  patient_lfk_assignments: active template conflict
pgPlatformUserMerge.ts:1269  treatment_program_instances: active program on both merge candidates
pgPlatformUserMerge.ts:1340  test_attempts: open attempt conflict on same stage item
```

Теперь любая из них уходит в `app.record_patient_medical_merge_conflict` с `p_organization_id IS NULL` и
попадает в ветку-аномалию (миграция, строки 84–108): в `admin_audit_log` пишется
`action='auto_merge_conflict_anomaly'`, `status='error'`,
`details.reason='medical_history_without_organization'`, `conflict_key='medical-merge-without-organization:…'`.

**Ввод и неправильный результат.** Человек подтверждает почту, а у двух его учёток пересекаются активные
слоты записи (`patient_bookings`). До коррекции — мягкий `{ ok:false, code:'email_conflict' }` и ничего в
журнале. После — открытая строка `error` в журнале глобального администратора, утверждающая медицинский
конфликт слияния без организации, плюс счётчик открытых конфликтов и алерт оператору
(`apps/webapp/src/modules/admin-incidents/adminIncidentAlertConfig.ts:13,35`). Канон §18 прямо относит
историю записей на приём к «не блокерам ничего и никогда».

## E5 (D7 закрыт частично). Путь проекции всё ещё минует врача

Источник `'projection'` действительно получил живого вызывающего — но не тот путь. Он появился в
`pgEmailPasswordLookup.ts:131-133` (автослияние при входе по паролю). Настоящий путь проекции и ещё два
живых пути по-прежнему теряют медицинский блокер:

```
packages/platform-merge/src/identityProjectionWrite.ts:115   ← collapseIdentityProjectionCandidates,
     вызывается из apps/webapp/src/infra/repos/pgUserProjection.ts:72; обработчика MergeDependentConflictError нет
apps/webapp/src/infra/repos/pgChannelLinkClaim.ts:148        ← ловит, классифицирует, конфликт не записывает
packages/platform-merge/src/messengerPhonePublicBind.ts:185  ← обработчика нет
```

(Проверено: `grep -rn "MergeDependentConflictError" --include=*.ts apps packages` даёт ровно три места
записи — `pgUserByPhone`, `pgEmailAuth`, `pgEmailPasswordLookup`.) По Р3 плана конфликт разбирает врач
своей организации; для этих трёх путей он его не увидит.

---

## Что держит (проверено этим кругом)

- **D1 — закрыт.** Предикат `ON CONFLICT` теперь совпадает с живым индексом.
  ```
  BEGIN;
  INSERT INTO admin_audit_log (…) VALUES (…)
  ON CONFLICT (conflict_key) WHERE conflict_key IS NOT NULL AND resolved_at IS NULL DO UPDATE …;  -- дважды
  SELECT conflict_key, repeat_count FROM admin_audit_log WHERE conflict_key='doctor-refused-medical-merge:probe:aaa:bbb';
   doctor-refused-medical-merge:probe:aaa:bbb | 2
  ROLLBACK;
  ```
  Живой индекс: `idx_admin_audit_log_conflict_open … WHERE conflict_key IS NOT NULL AND resolved_at IS NULL`.

- **D3 — закрыт.** Предикат нового индекса сужен до `status='pending' AND reason LIKE 'medical_history:%'`
  (миграция строка 37; `db/schema/patientMergeCandidate.ts:52`), поэтому строки живых дверей в него не входят.
  Реплика обоих индексов на временной таблице, `BEGIN … ROLLBACK`:
  ```
  INSERT (org, A, B, 'medical_history:email_bind', 'pending')                         -> INSERT 0 1
  INSERT (org, B, A, 'invite_redeem_identity_conflict', 'pending')
    ON CONFLICT (organization_id, anchor_user_id, candidate_user_id) WHERE status='pending' DO NOTHING -> INSERT 0 1
  INSERT (org, A, B, 'public_booking_phone_collision', …) тем же арбитром                -> INSERT 0 0 (штатный DO NOTHING)
  итог: 2 строки, исключений нет
  ```
  Живые арбитры дверей (интроспекция DEV): `claim_unbound_patient_invite_email`,
  `record_public_booking_merge_candidates`, `redeem_patient_invite_email`, `redeem_patient_invite_session` —
  все `ON CONFLICT (organization_id, anchor_user_id, candidate_user_id) WHERE status='pending' DO NOTHING`.

- **D4 — закрыт.** Поиск существующего кандидата теперь фильтрует `reason LIKE 'medical_history:%'`, запасной
  `UPDATE` чужой строки удалён; вместо него занятый упорядоченный слот обходится вставкой в обратной
  ориентации, а если заняты оба — конфликт уходит в `admin_audit_log`
  (`medical-merge-candidate-slots-full:…`). Чужая pending-строка не переписывается.

- **D6 — закрыт.** `organization_id IS NULL` больше не теряется: пишется аномалия в `admin_audit_log`
  (та же ветка, что в E4 — механизм рабочий, проблема в том, кого в неё теперь заводят).

- **D8 — закрыт по сути.** Слияние из консоли глобального администратора гасит индикатор врача:
  `manualPlatformUserMerge.ts:49-56` зовёт `app.resolve_platform_patient_medical_merge_conflicts`, которая
  переводит pending-медицинские строки пары в `resolved`.

- **Стена (пункт 1) — PASS, не регрессировала.** `read_staff_…` в коррекции не менялась
  (`git diff f44072865 ff42b26f5` по файлу миграции трогает только `record_…`, `refuse_…` и добавляет две
  новые функции). Новая дверь `transfer_staff_approved_platform_user_merge_data` берёт организацию из
  `app.current_org_id()` (устанавливается `set_config('app.org', …)`, `db-principal/src/index.ts:813`), а не
  из запроса; чужой `conflictId` не находится (`candidate.organization_id = v_organization_id` + пара +
  `reason LIKE 'medical_history:%'`) → `RETURN false`; пустой контекст → `42501`. `EXECUTE` — только
  `app_staff`. `IF NOT EXISTS (… FOR UPDATE)` синтаксически валиден (проверено `DO $$ … $$` на DEV).
  **Оговорка:** это единственная из пяти новых функций БЕЗ `app.require_accepted_context` — она вызывается
  внутри уже открытой staff-транзакции. Стену это не ломает (org + точная строка — и есть capability), но
  подписанного чекпоинта порта у неё нет, в отличие от остальных четырёх.

- **Утечка (пункт 2) — PASS, не регрессировала.** Тело `read_staff_…` байт-в-байт прежнее; назначения обеих
  сторон ограничены `candidate.organization_id`, шаблон ЛФК — свой или платформенный (INNER JOIN).

- **Ровно два действия (пункт 3) — PASS по поверхности.** `z.enum(['merge','refuse']).strict()`
  (`[conflictId]/route.ts:7`); ни блокировки, ни удаления, ни правки чужих данных. Дверь переноса меняет
  только идентификационные колонки, `organization_id` медицинских строк не трогает. Врач другой организации
  с обеих сторон блокирует перенос: `RAISE 'medical_merge_blocked_by_another_organization'` (миграция,
  строки 274–302).

- **Миграция (пункт 5) — PASS.**
  ```
  grep -nEi "^\s*(GRANT|REVOKE|CREATE ROLE|ALTER ROLE|ALTER DEFAULT PRIVILEGES|CREATE POLICY|…)" <миграция>  -> none
  pnpm run check:db-privileges-generated -> артефакты соответствуют декларации побайтно (3 базы + port-context), EXIT=0
  node --test deploy/postgres/privileges/definer-tenant-predicate.test.mjs \
       deploy/postgres/privileges/function-census.test.mjs -> 29/29 pass, EXIT=0
  ```

- **Миграция на DEV НЕ применялась — подтверждено интроспекцией.**
  ```
  sudo -u postgres psql -d bcb_webapp_dev -At
  count(*) в app по пяти новым именам функций                                     -> 0
  pg_get_constraintdef(patient_merge_candidates_status_check)                     -> ARRAY['pending','resolved','dismissed']  (без 'escalated')
  to_regclass('public.uq_patient_merge_candidates_org_pending_unordered_pair')    -> NULL
  индексы patient_merge_candidates: pkey, idx_…_org_status, uq_…_org_pending_pair (старый, упорядоченный)
  ```

---

## Наблюдения (не дефекты — вопрос владельцу/ведущему, §24.6)

1. **Поверхность seam-владельца выросла на порядок.** `app_seam_identity_lookup_owner` владеет 16 функциями
   (интроспекция DEV) — до сих пор это был узкий шов опознавания личности. Декларация добавляет ему
   `SELECT/INSERT/UPDATE/DELETE` примерно на 45 отношениях, включая `be_payments`, `be_payment_intents`,
   `be_patient_packages`, `native_push_targets`, `media_files`, `message_log`, `product_analytics_*`.
   `SECURITY DEFINER` исполняется правами владельца, поэтому радиус поражения любого дефекта в остальных
   15 функциях этого владельца вырос вместе с ним. Отдельный seam-владелец под перенос слияния снял бы это.
2. **Кто переживает слияние — зависит от посторонней строки.** Дверь всегда сливает `candidate_user_id`
   в `anchor_user_id` (`pgPatientMergeCandidate.ts:197-201`), а ориентация пары в строке зависит от того,
   был ли занят упорядоченный слот чужим кандидатом (лечение D4). `pickMergeTargetId`, которым пользуются
   остальные пути, здесь не применяется. Канон выбор выжившего для врачебного слияния не задаёт.
3. **Отказ не держится.** После `refuse` строка становится `escalated` и уходит с индикатора врача, но пара
   не помечена «разные люди»: следующая привязка почты/телефона снова поднимет гейт, `record_…` не найдёт
   pending-строки и заведёт новую — врач получит тот же конфликт опять. Канон §18б говорит только, что врач
   ничего не блокирует; что делать с повтором — не сказано.
4. **Гонка на «слить» даёт `500`.** Второй одновременный запрос получает `RETURN false` из двери →
   `MergeConflictError` из `pgPlatformUserMerge.ts:456` → наружу без обработчика. Состояние целостное
   (полперехода не остаётся), но ответ пользователю — `500` вместо `409/403`.
5. **Мёртвое внутри слоя (пункт 6).** У новых дверей вызывающие есть (оба маршрута).
   Мёртвыми остаются: `medicalConflictApprovedForOrganizationId` — опция объявлена
   (`pgPlatformUserMerge.ts:43`), читается как фолбэк (`:419`), но НИ ОДИН вызывающий её больше не передаёт;
   `upsertPendingCandidate`, `listPendingByOrganization`, `dismissCandidate`, `markResolvedForUserPair` —
   у всех четырёх только обёртки в `modules/patient-merge-candidate/service.ts` и ни одного маршрута
   (состояние досталось от предыдущего круга, ветка его не создавала).
6. **Проверка организации у `record_…` стала недостижимой.** `recordPatientMedicalMergeConflict` теперь
   всегда работает под `runWithDbBootstrapPrincipal` → `contextClass = 'pre_session'`
   (`portContextRuntime.ts:296-297`), поэтому ветка `IF current_setting('role') = 'app_patient' AND
   p_organization_id IS DISTINCT FROM app.current_org_id()` не исполняется никогда, и организация
   принимается от вызывающего без сверки в БД. Через HTTP это не достижимо (организация выводится из
   медицинских строк, а не из ввода), но эшелон защиты потерян.

## Версия гейта против канона §18 (отдельный вопрос ведущему)

Без изменений с прошлого круга — коррекция гейт не трогала. Разрез по организации совпадает с §18; снятие
проб с `patient_bookings`/`be_appointments` тоже (§18 прямо называет историю записей не блокером).
Расхождение прежнее: §18 перечисляет «назначенные упражнения» и «отслеживание симптомов», а `automaticProbe`
нет ни у `patient_lfk_assignments`, ни у трекинга симптомов. Перекос сохраняется: модалка врача показывает
ЛФК-назначения как подробности конфликта, а гейт по ним конфликт не поднимает. Столкновение с
`wt/merge-org-gate` разрешает ведущий.

## НЕ СДЕЛАНО

- Живой прогон обеих дверей врача end-to-end — невозможен: миграция ветки на DEV не применена и применять её
  запрещено (общая база). Поведение доказано прямыми прогонами SQL под ролями рантайма против живой DEV.
- Экраны Э4 (Р4) — следующий этап, вне скоупа этого аудита.
- Новые acceptance-тесты не писались (§24.5 — повторный аудитор ту же поверхность слепо не переписывает;
  §10a запрещает текстовый тест на права и SQL деплоя).
