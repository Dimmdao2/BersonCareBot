# FAIL — D17 (`8e49a07f6`): суженный корень доставки потерял стену арендатора

**Вердикт: FAIL.** Блокер: миграция `20260823T030000_integrator_tenant_role_reaches_delivery_roots.sql`
переписала тело `app.read_integrator_clinic_delivery_credential(text,uuid)` с `plpgsql` на `sql` и
вместе с этим **выбросила сверку организации с принятым контекстом**. Узкая роль, войдя с контекстом
СВОЕЙ клиники, читает SMTP/SMSC/бот-токены ЧУЖОЙ. Доказано живьём на именованной DEV в откате.

Аудитор: независимый (Opus, оркестратор), клон `bcb-wt-d17-integrator-20260823`, ветка
`wt/d17-integrator-20260823`. Проверялись коммиты `132de6191` (салваж) и `8e49a07f6`.
Оракул: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D17 — «узкая роль интегратора не
мешает доставке». Отчёт автора: `docs/_TODO/runs/integrator-cleanup/D17_INTEGRATOR_LOST_EXECUTE_2026-08-23.md`.
`--execute`, TEST, PROD, push не выполнялись; правок в чужую работу нет (`git status` чист, кроме этого файла).

---

## Блокер 1 — стена арендатора вырезана из тела суженного корня

**Было** (миграция `20260821T050000_add_vk_messenger_settings.sql:31-58`, `LANGUAGE plpgsql`):

```sql
DECLARE
  v_organization_id uuid := app.current_org_id();
BEGIN
  PERFORM app.require_attested_context_for_roles('app_seam_settings_integrator_owner'::name,
                                                 ARRAY['app_tenant_service'::name]::name[]);
  IF p_organization_id IS NULL OR p_organization_id <> v_organization_id THEN
    RAISE EXCEPTION 'clinic credential organization context denied' USING ERRCODE = '42501';
  END IF;
  ...
  WHERE setting.organization_id = v_organization_id          -- строка выбирается ПО КОНТЕКСТУ
```

**Стало** (`20260823T030000_...sql:19-36`, `LANGUAGE sql`):

```sql
  SELECT app.require_attested_context_for_roles(...);
  SELECT setting.value_json FROM public.system_settings AS setting
   WHERE p_organization_id IS NOT NULL
     ...
     AND setting.organization_id = p_organization_id          -- строка выбирается ПО АРГУМЕНТУ
```

`app.current_org_id()` из тела исчез совсем: `grep -c current_org_id` по новой миграции → `0`.
`app.require_attested_context_for_roles` организацию не проверяет по построению — у неё нет такого
аргумента (`deploy/postgres/port-context/contract.sql:520-560`); проверку делал именно вырезанный
`current_org_id()`, и `app_integrator_tenant_service` в его списке ролей есть, то есть сохранить сверку
было можно.

### Живое доказательство (именованная DEV `bcb_webapp_dev`, одна транзакция, `ROLLBACK`)

Кандидат (миграция + `privileges.bcb_webapp_dev.sql`) материализован в транзакции; в
`public.system_settings` посажена строка `clinic_smtp_outbound` для организации **B**
(`d0000000-…-0004`); принят порт-контекст узкой роли для организации **A** (`a0000000-…-0001`);
вызов сделан под `SET LOCAL ROLE app_integrator_tenant_service`:

```text
cross_org_credential_read={"leaked": "ORG_B_SMTP_SECRET"}   <-- чужой секрет прочитан
own_org_credential_read=NULL
cross_org_calendar_read={"value": "dev-proof@example.com"}  <-- чужой google_calendar_id прочитан
```

**Контроль, что дело именно в вырезанной сверке.** То же тело, что было ДО D17, с единственной
правкой — роль в гейте заменена на узкую (это и есть минимальное корректное изменение D17):

```text
OLDBODY_narrowrole_cross_org=DENIED:42501:clinic credential organization context denied
OLDBODY_narrowrole_own_org=NULL
```

То есть узкой роли для доставки достаточно замены роли в гейте; переписывание тела на `sql` со снятием
`current_org_id()` для задачи не требовалось и стену снесло.

**Что утекает:** `clinic_smtp_outbound` (пароль почтового ящика клиники), `clinic_smsc_api_key`,
`clinic_telegram_bot_token`, `clinic_max_bot_api_key`, `clinic_vk_community_access_token` — секреты
доставки чужого арендатора. Плюс тем же способом `google_refresh_token`/`google_calendar_id` чужой
клиники через `read_integrator_google_calendar_setting` (у этого корня до D17 гейта не было вовсе, так
что это не регресс, но заявленный в комментарии `declaration.ts:4070-4072` «точный org-скоуп в теле»
там тоже отсутствует).

**Утверждение отчёта автора, которое не выполняется:** «Both validate the exact current organization in
their bodies» и «Оба settings-корня … валидируют точную текущую организацию». Ни один из двух не
сверяет аргумент с принятым контекстом.

**Почему это не поймали:** тест автора принимает контекст для организации фикстуры и вызывает корень с
ТОЙ ЖЕ организацией — кросс-арендного вызова в нём нет. Артефакт прав чинит только выражение гейта
(см. наблюдение 5), остальное тело идёт из миграции, и его не сверяет ничто.

---

## Находка 2 (средняя) — allowlist ключей расширен молча

Новое тело добавило в список читаемых ключей `clinic_transactional_mail_template`, которого не было в
теле от 21.08. В отчёте это не названо. Вызывающего у ключа нет вообще:

```bash
grep -rn "clinic_transactional_mail_template" --include='*.ts' --include='*.mjs' --include='*.sql' . \
  | grep -v node_modules | grep -v deploy/postgres/generated
# единственная строка — сама новая миграция
```

В TS-типе `IntegratorClinicDeliveryCredentialKey`
(`apps/integrator/src/infra/db/publicSystemSettings.ts:120-125`) такого ключа тоже нет. Расширение
поверхности чтения без потребителя и без объявления.

## Находка 3 (средняя) — гейт делегированного хелпера расширен ДВУМЯ ролями, объявлена одна

`declaration.ts` объявил у mechanic-корня `delegatesTo: ['app.saas_billing_effective_tariff(uuid,uuid)']`,
и генератор перенёс в гейт хелпера ВЕСЬ execute-список корня. В артефакте:

```diff
-'app.saas_billing_effective_tariff(uuid,uuid)' … ARRAY['app_clinic_billing','app_patient','app_platform_settings','app_staff']
+'app.saas_billing_effective_tariff(uuid,uuid)' … ARRAY['app_clinic_billing','app_integrator_tenant_service','app_patient','app_platform_settings','app_staff','app_tenant_service']
```

То есть добавлена не только узкая роль, но и `app_tenant_service`. Отчёт называет только первую
(«helper-gate принимает узкий контекст»). Прямой эксплуатации нет: `GRANT EXECUTE` у хелпера остался
единственным (`TO "app_platform_settings"`, `privileges.bcb_webapp_dev.sql:7556`), поэтому расширение
снимает только второй эшелон, а не первый. Но в отчёте изменение должно быть названо целиком.

## Находка 4 (низкая) — отказ по запрещённому ключу стал тихим `NULL`

Старое тело на неразрешённый ключ поднимало `42501 'clinic credential key denied'`. Новое просто не
находит строку и возвращает `NULL`, а вызывающий (`fetchIntegratorClinicDeliveryCredentialValueJson`)
трактует `NULL` как «у клиники не настроено». Живой замер: `denied_key_behaviour=NULL`. Это тот же
класс, что уже описан в `BOOKING_REMINDERS_AND_CALENDAR_2026-08-19.md` («пустой `catch` превращал 42501
в „календарь не подключён“»), — теперь он воспроизведён на уровне тела корня.

---

## Наблюдения (не находки, но следующему читателю нужны)

5. **Гейт в миграции — не источник истины.** Артефакт прав сам переписывает выражение гейта в тело
   (`privileges.bcb_webapp_dev.sql:2491-2525`, `BCB_RUNTIME_DEFINER_GATES_VERIFIED`). Инъекция «вернуть
   в теле миграции старую роль гейта у credential-корня» оставляет тест автора **зелёным**, потому что
   артефакт чинит тело обратно (проверено: `installed_body=NARROW_GATE_INSTALLED`). Практическое
   следствие: из миграции реально «доезжает» всё тело КРОМЕ гейта — ровно та часть, где и живёт
   блокер 1, и её не сверяет ни артефакт, ни тест.
6. **`resolve_organization_mechanic_access`: инициализатор в `DECLARE` до гейта.** Формально пункт 4
   брифа («гейт первым оператором, без `DECLARE`-инициализаторов до него») не выполнен:
   `v_current_organization_id uuid := app.current_org_id();` вычисляется раньше `PERFORM`-гейта. Это
   ПРЕД-существующее тело (миграция D17 меняет в нём только строку массива ролей), и оно fail-closed —
   `current_org_id()` сам поднимает `42501` без принятого контекста. У `saas_billing_effective_tariff`
   инициализатор безобидный (`statement_timestamp()`), гейт первый. У обоих `sql`-корней гейт —
   первый оператор (подтверждено живьём: `*_without_context=42501`).
7. **Легаси-оверлей расходится с объявлением, и он применяется.**
   `deploy/postgres/integrator-server-runtime-config.sql:235,308` пересоздаёт ОБА суженных корня
   **без гейта**, `:347-348` переназначает владельца на `app_owner`, `:575-577` выдаёт `EXECUTE`
   логину-интегратору. Запись от 19.08 («ни один deploy-скрипт его не применяет») **неверна**:
   `deploy-test-saas.sh:1931` зовёт `install_integrator_server_runtime_config_overlay` внутри
   `run_strict_post_migration_closure`, то есть ПОСЛЕ миграций. Штатная code-only выкатка
   (`deploy-test.sh`) закрывающую последовательность не гоняет, поэтому обычный деплой D17 не
   переспорит, но полный reset — переспорит. Это чужой пред-существующий долг, не работа D17; помечено,
   чтобы устаревшая запись 19.08 не вводила следующего в заблуждение.
8. **Цепочка материализации проверена только со стороны вебаппа.** Тест доводит
   `replace_appointment_reminder_generation` → строка `outgoing_delivery_queue` (`pending`,
   `appointment_reminder`) — это цельная цепочка, а не один вызов, пункт закрыт. Но нога, на которой
   регрессия и произошла (интегратор читает credential/calendar и отдаёт провайдеру), покрыта только
   одиночными вызовами корней. Сквозной доставки в доказательстве нет.

---

## Что проверено и ПРОШЛО

| Пункт брифа | Как проверял (независимо от команд автора) | Итог |
| --- | --- | --- |
| 1. Перепись 15 корней верна | свой `grep -rn` по `apps/`, `packages/`, `tools/` без ограничения на `src`, плюс сверка по таблице возможностей на DEV: `select proname, target_role, session_login from app_ext.port_context_capabilities join pg_proc …` | **PASS** |
| 2. Два суженных корня не отобраны у вебаппа | `grep` по всему репо (`ts/tsx/mjs/js/sql/json/sh/md`) — вызывающий только `apps/integrator/src/infra/db/publicSystemSettings.ts:140,172,191`; динамических имён нет (`grep -E "app\.\$\{\|'app\.' *\+"` → 0) | **PASS** |
| 3. Узкая роль проходит, чужой принципал отказывает | прогон теста автора на DEV: baseline **GREEN**, все `*_without_context=42501` | **PASS** |
| 3a. Fault injection по КАЖДОМУ праву отдельно | 6 отдельных инъекций: снятие `EXECUTE` у каждого из трёх корней и откат гейт-роли у каждого из трёх (на уровне артефакта, где гейт и живёт) → **RED во всех шести** | **PASS** |
| 4. Стена не расширена | табличных привилегий у `app_integrator_tenant_service` во ВСЁМ кластере: до кандидата `1` (`integrator.user_reminder_occurrences DELETE`), после кандидата `1` — тот же; отношений с любым DML в `public/app/app_ext/integrator` — `1`; `EXECUTE` на `app.*`: `6 → 9`, ровно три двери | **PASS** |
| 4a. Миграция без прав | `grep -nEi 'GRANT|REVOKE|CREATE POLICY|ALTER ROLE|CREATE ROLE'` → единственное совпадение — слово «Grants» в комментарии | **PASS** |
| 4b. Артефакт побайтно | `node deploy/postgres/privileges/generate-cli.mjs --all --check` → 4×`совпадает побайтно`, `exit=0` | **PASS** |
| 5. Тест автора не ослаблен | воспроизведён 1/1 зелёным; краснеет по своей причине на шести отдельных инъекциях (выше) | **PASS**, но с дырой: кросс-арендного вызова в нём нет (см. блокер 1) |

Замечание по классификации 13 «узкая дверь не нужна»: проверил своей рукой четыре, включая обе
названные в брифе. `replace_appointment_reminder_generation` — единственный вызывающий
`apps/webapp/src/infra/repos/pgAppointmentReminderMaterialization.ts:54`, у логина интегратора
объявленной возможности на этот корень НЕТ вовсе. `record_reminder_occurrence_finalized_projection` —
у `bcb_dev_integrator` объявлены `app_integrator_request` и `app_operational_delivery_worker`, роли
арендатора среди них нет. `record_integrator_support_delivery_attempt` — `app_integrator_request`.
`resolve_organization_mechanic_access` — контекст класса `relation`, у логина интегратора он ровно
`app_integrator_tenant_service`, поэтому дверь ему и нужна. Классификация автора подтверждается.

Логины интегратора широкую роль действительно потеряли — на DEV и TEST у `bcb_*_integrator` в
`pg_auth_members` шесть ролей, `app_tenant_service` среди них нет. Предпосылка D17 верна.

---

## Что чинить (границы аудита — не чинил)

Минимальная правка, закрывающая блокер и сохраняющая цель D17: вернуть телу
`read_integrator_clinic_delivery_credential` сверку `p_organization_id` с `app.current_org_id()` и
выборку строки по контексту, а не по аргументу — то есть взять тело от 21.08 и заменить в нём ТОЛЬКО
роль в гейте (этот вариант проверен контролем выше: узкая роль проходит для своей организации и
получает `42501` на чужую). Заодно решить, нужен ли `clinic_transactional_mail_template` в allowlist,
и назвать в отчёте вторую роль, добавленную в гейт `saas_billing_effective_tariff`.

Отдельным вопросом владельцу (в план D17 этого пункта нет, поэтому это НЕ задача аудита):
`read_integrator_google_calendar_setting` тоже выбирает строку по аргументу, а не по контексту.
До D17 у него гейта не было, так что регрессии нет, но стена там такая же дырявая.

## Границы прогона

DEV не изменена: все прогоны — `BEGIN … ROLLBACK`, чужие файлы не трогались, `--execute` не
запускался, TEST/PROD/push не касался. `lint`/`typecheck` автора заново не гонял — бриф аудита их не
требовал; `--all --check` перегнал сам.

---

## Круг 3 — возвращена стена арендатора

**Итог:** FAIL-блокер закрыт без отката прав D17. `read_integrator_clinic_delivery_credential`
снова берёт организацию из принятого контекста, сверяет с ней аргумент и отказывает `42501` при
несовпадении. Узкая `app_integrator_tenant_service` по-прежнему проходит три нужных корня. Этот
раздел исправляет ошибочные утверждения предыдущего отчёта о сохранённой стене credential-root.

### Все переписанные тела: построчно «было → стало»

#### `app.read_integrator_clinic_delivery_credential(text,uuid)`

| Было до исправления | Стало в круге 3 | Что сохранено / возвращено |
| --- | --- | --- |
| `LANGUAGE sql` | `LANGUAGE plpgsql` | Возвращена возможность явных проверок и `42501`. |
| Сразу `SELECT require_attested_context_for_roles(... app_integrator_tenant_service ...)` | `DECLARE v_organization_id uuid; v_value jsonb; BEGIN`, затем первым оператором `PERFORM require_attested_context_for_roles(... app_integrator_tenant_service ...)` | Узкое право D17 сохранено; в `DECLARE` нет инициализаторов. |
| Организация контекста не читалась | После гейта `v_organization_id := app.current_org_id()` | Организация снова берётся из принятого контекста. |
| `p_organization_id IS NOT NULL` только фильтровал выборку | `p_organization_id IS NULL OR p_organization_id <> v_organization_id` → `42501` | Аргумент только сверяется с контекстом. |
| Allowlist был расширен `clinic_transactional_mail_template` | Пять прежних credential-ключей: SMTP, SMSC, Telegram, MAX, VK | Неавторизованное расширение удалено. |
| Запрещённый ключ давал тихий `NULL` | `p_key NOT IN (...)` → `42501` | Возвращён fail-closed отказ. |
| `setting.organization_id = p_organization_id` | `setting.organization_id = v_organization_id` | Кросс-арендная выборка по аргументу устранена. |
| SQL возвращал строку напрямую | `SELECT ... INTO v_value; RETURN v_value` | Семантика допустимого чтения сохранена. |

#### `app.read_integrator_google_calendar_setting(text,uuid)`

| Было | Стало в D17 / круге 3 | Что не потерялось |
| --- | --- | --- |
| `LANGUAGE sql`, без `DECLARE` и без контекстного гейта | `LANGUAGE sql`; первым оператором добавлен `SELECT require_attested_context_for_roles(... app_integrator_tenant_service ...)` | Переменных, которые могла потерять смена языка, не было. |
| Две ветки: глобальные OAuth-ключи при `p_organization_id IS NULL` и clinic calendar-ключи при ненулевом аргументе | Те же две ветки и те же allowlist, `scope = 'admin'`, `LIMIT 1` | Кроме гейта тело не изменено. |

Здесь по-прежнему используется `setting.organization_id = p_organization_id`. Как зафиксировал независимый
аудит, это предсуществующее поведение, а не регрессия D17; исправление этого отдельного owner question в
границы круга 3 не входило.

#### `app.resolve_organization_mechanic_access(uuid,text)`

Миграция получает всё установленное тело через `pg_get_functiondef` и меняет только точные якоря:

| Было | Стало | Что не потерялось |
| --- | --- | --- |
| Gate-массив `app_patient, app_staff, app_tenant_service` | Тот же массив + `app_integrator_tenant_service` | Узкая роль D17 сохранена без удаления прежних ролей. |
| `v_current_organization_id uuid := app.current_org_id()` | `v_current_organization_id uuid;` | Инициализация перенесена после гейта: `v_current_organization_id := app.current_org_id()`. |
| `v_now timestamptz := statement_timestamp()` | `v_now timestamptz;` | Инициализация перенесена после гейта: `v_now := statement_timestamp()`. |

Первым оператором после `BEGIN` остаётся gate. Все проверки совпадения организации, чтения,
вычисления механика и `RETURN` остаются побайтово частью исходного `pg_get_functiondef`: миграция их
не пересобирает и не заменяет.

#### `app.saas_billing_effective_tariff(uuid,uuid)`

| Было | Стало | Что не потерялось |
| --- | --- | --- |
| Gate-массив `app_clinic_billing, app_patient, app_platform_settings, app_staff` (либо тот же массив уже с `app_tenant_service`) | Полный generated execute-массив: `app_clinic_billing, app_integrator_tenant_service, app_patient, app_platform_settings, app_staff, app_tenant_service` | Названы обе добавленные роли; прежние роли сохранены. |
| `v_now timestamptz := statement_timestamp()` | `v_now timestamptz;` | `v_now := statement_timestamp()` перенесён сразу после гейта. |

Первым оператором после `BEGIN` остаётся gate. Проверка `p_tariff_id`, snapshot-запрос, fallback и
возвращаемый тариф не меняются. Узкая роль не получает прямой `EXECUTE` на helper: принятый контекст
доходит только по существующему `delegatesTo` от mechanic-root.

### Права и объекты миграции

Миграция меняет четыре существующие функции, новых таблиц/колонок/политик не создаёт. Владельцы
остаются `app_seam_settings_integrator_owner` и `app_seam_org_commerce_owner`; требования к отношениям
не расширены. Нужные `EXECUTE` и gate-массивы по-прежнему определяются только
`deploy/postgres/privileges/declaration.ts` и генератором. В миграции нет `GRANT`, `REVOKE` или
`CREATE POLICY`; новых строк декларации круг 3 не потребовал.

### Доказательство круга 3

- `RUN_D17_INTEGRATOR_ROOTS_DB=1 node --test deploy/postgres/privileges/integrator-narrow-delivery-roots.devDbProof.test.mjs`
  → **PASS 1/1** на именованной DEV в `BEGIN … ROLLBACK`: чужой аргумент под принятым контекстом
  клиники A дал `clinic_cross_org=42501`; своя организация прошла; без контекста все три корня дали
  `42501`; mechanic вернул `1`; медицинских relation-прав узкой роли `0`; материализация оставила
  `result=current`, `inserted=1` и одну pending `appointment_reminder` queue-row.
- Fault injection: во временной копии тела mismatch-проверка была ослаблена до проверки `NULL`, а
  выборка возвращена на `setting.organization_id = p_organization_id`. Та же команда теста выше
  стала **RED**: assertion показал `'ALLOWED' !== '42501'` именно для `clinic_cross_org`. После
  возврата исправления та же команда снова **PASS 1/1**.
- `bash deploy/host/migrate-dev.sh --preflight` → **PASS**, rollback-only owner-ordered проверка:
  `pending=2 total=55`, `reapplied=0`, `unapplied=0`. `--execute` не запускался.
- `node deploy/postgres/privileges/generate-cli.mjs --all` → сгенерированы все privilege/allowlist
  артефакты; `node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only` →
  сгенерированы оба capability-артефакта; `node deploy/postgres/privileges/generate-cli.mjs --all --check`
  → четыре privilege/allowlist-артефакта совпали побайтно.
- `pnpm run typecheck` → **PASS**.
- `pnpm run lint` → **PASS**, `0` ошибок; остались `2` предсуществующих warning в
  `AppointmentPaymentSection.tsx`.
- `node --test deploy/postgres/privileges/definer-tenant-predicate.test.mjs` → **PASS 14/14**.

Границы соблюдены: TEST, PROD и push не трогались; галочки плана не менялись.
