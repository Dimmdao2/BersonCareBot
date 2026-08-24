# Аудит `C4`, круг 2 — доставка предиката арендатора в живые базы

**PASS, FOR LAND**

Блокирующих: `0`. Неблокирующих: `4`. Инъекций: посажено `5`, убито `5`, не поймано `0`.

Дата: 2026-08-23. Проверяемый коммит: `c06a2daa1` (`fix(c4): deliver tenant-bound mail profile roots #1005`).
Ветка `wt/therapysto-night-20260823`, `HEAD` `22b986019` (слияние `feat/doctor-ui-rebuild`, пришло в ветку
через 10 минут ПОСЛЕ проверяемого коммита и к `C4` отношения не имеет). Клон
`/home/dev/dev-projects/bcb-wt-therapysto-night-20260823`. Оракул: `IMPLEMENTATION_PLAN.md:679`, пункт `C4`.
Вход: круг 1 — `AUDIT_C4_DECLARATION_FIX_2026-08-23.md` (`FAIL`, два блокера).

Отчёта автора нет (прогон оборван портом на 35-й минуте); всё, что он заявил в сообщении коммита, проверено
здесь заново своими руками и своими значениями.

---

## Коротко

**Оба блокера круга 1 закрыты, и это доказано поведением на живой `bcb_webapp_dev`, а не чтением файлов.**
Обе копии корня — миграционная и рантайм-оверлейная — теперь несут предикат арендатора; применение оверлея
дословно из репозитория поверх исправленного тела чужой шаблон больше НЕ возвращает. Правка доехала до живой
базы отдельной forward-миграцией `20260823T043206`, её тег в леджере DEV, и живые тела всех трёх корней
совпадают с репозиторием.

Сверх заявленного автором нашлась и **вторая, не названная в круге 1 регрессия того же слайса `C4`**, которую
этот коммит тоже закрывает: слайс снял с корня охрану `app.require_attested_context_for_roles(...)`,
существовавшую с `20260821T050000`. Без неё контекст класса `staff` читает SMTP-пароль, токен бота и шаблон
писем своей клиники. Восстановление охраны проверено инъекцией.

Заявление автора «make VERIFY reject the vulnerable body» верно КАК ТЕКСТ и неверно КАК ГЕЙТ: маркер
`BCB-MIGRATION-VERIFY` в этом репозитории **не читает никто** (§3). Это не регрессия коммита, но и не
доказательство — считать его гейтом нельзя.

---

## 1. Блокер 1 круга 1 — снят: обе копии корня несут предикат

Проверено тем же способом, каким ловилось: блок `deploy/postgres/integrator-server-runtime-config.sql:308-336`
извлечён из файла **дословно** (`sed -n '308,336p'`, `md5 8fc5dd68de6bb6d5309fade177f1e4dd`) и применён поверх
исправленного тела в той же транзакции с `ROLLBACK`.

Принципал X — `d0000000-…-000000000004` («DEV Demo Clinic»), чужая клиника Y —
`26aca960-950d-4f39-b67d-fcfbe06a6530` («Клиника Успех Б2»). Метки свои: `R2A-DEMO-OWN`, `R2A-USPEH-FOREIGN`
(ни круг 1, ни автор такими не мерили). Скрипт закоммичен: `AUDIT2_C4_DEV_PROOF_2026-08-23.sql`.

```
sudo -n -u postgres psql -X -A -F'|' -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -f docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT2_C4_DEV_PROOF_2026-08-23.sql
```

| состояние тела | `foreign_tag` | `own_tag` | `no_context` | владелец после `CREATE OR REPLACE` |
| --- | --- | --- | --- | --- |
| живое на DEV после миграций | `<null>` | `R2A-DEMO-OWN` | `DENIED 42501` | `app_seam_settings_integrator_owner` |
| **оверлей репозитория дословно** | **`<null>`** | `R2A-DEMO-OWN` | `DENIED 42501` | `app_seam_settings_integrator_owner` |

Строка `overlay_foreign_tag` круга 1 была `AUDIT-Y-FOREIGN`; теперь на том же месте `<null>`. Утечки через
вторую копию нет. Оверлей заодно догнал миграцию по ключу `clinic_vk_community_access_token`, которого в нём
не хватало, — до этого коммита две копии расходились ещё и списком ключей.

## 2. Блокер 2 круга 1 — снят: правка доехала до живой базы

Правка внесена не в применённый файл, а отдельной forward-миграцией
`apps/webapp/db/drizzle-migrations/20260823T043206_deliver_c4_mail_profile_tenant_binding.sql` — имя сортируется
последним, поэтому она приезжает и в существующие базы, и в свежий cutover.

Тег в леджере DEV:

```
$ sudo -n -u postgres psql -X -A -t … -c "SELECT tag FROM drizzle.__drizzle_migrations WHERE tag LIKE '20260823%' ORDER BY tag;"
20260823T002500_pre_session_login_uses_two_named_doors
20260823T010000_mail_profile_reaches_auth_delivery
20260823T010000_patient_subdomain_slug_and_custom_domain_uniqueness
20260823T011000_reject_numeric_organization_slug_claims
20260823T021426_broadcast_drafts_belong_to_doctor_and_clinic
20260823T023138_pre_session_default_auth_otp_channel
20260823T043206_deliver_c4_mail_profile_tenant_binding
```

Живое состояние тел ПОСЛЕ (корень и обе перегрузки), интроспекцией, а не по отчёту:

| корень | признак | позиция в `pg_get_functiondef` | владелец |
| --- | --- | ---: | --- |
| `app.read_integrator_clinic_delivery_credential(text,uuid)` | `AND setting.organization_id = app.current_org_id()` | `790` | `app_seam_settings_integrator_owner` |
| то же | `require_attested_context_for_roles` | `225` | — |
| `app.email_auth_start_challenge(uuid,text,text,bigint,text,text)` | `mail_profile_required` | `356` | `app_seam_email_otp_owner` |
| то же | `public.email_challenges` | `0` (ловушка ничего не пишет) | — |
| `app.email_auth_start_challenge(…,text,text,uuid,text,text)` (11 арг.) | `mailProfile` | `4954` | `app_seam_email_otp_owner` |
| то же | `require_accepted_context` | `572` | — |

В круге 1 первая строка этой таблицы была `0`. Тело корня, снятое с живой базы, совпадает с телом миграции
дословно (сверено выводом `pg_get_functiondef`).

## 3. Проба `VERIFY`: текст отвергает уязвимое тело — но её никто не исполняет

**Как текст проба работает.** Я выполнил её дословно (`sed -n '4p'` из файла миграции) против пяти состояний
тела в той же транзакции:

| тело | результат пробы |
| --- | --- |
| живое на DEV | `true` |
| оверлей репозитория | `true` |
| предикат снят в миграционной копии (`ИНЪ-1`) | **`false`** |
| предикат снят в копии оверлея (`ИНЪ-2`) | **`false`** |
| «совместимость», сохраняющая точную подстроку (`ИНЪ-4`) | `true` — проба обманута |

Прежняя проба на снятие предиката не реагировала вовсе; новая на прямое снятие реагирует. Это улучшение
реальное. Но она осталась подстрочной: `ИНЪ-4` держит точную подстроку `AND setting.organization_id =
app.current_org_id()` на месте и дописывает вторую ветку `OR` ниже по `WHERE` — утечка открыта, проба зелёная.

**Главное: маркер не читает никто.** Поиск по всему репозиторию вне каталога миграций и документации:

```
$ grep -rn "MIGRATION-VERIFY" --exclude-dir=node_modules --exclude-dir=.git . \
    | grep -vE "^\./docs|^\./AGENTS.md|drizzle-migrations"
$ echo $?
1
```

Ни `deploy/postgres/privileges/migration-order.mjs`, ни `migrate-local-parse.mjs`, ни
`apps/webapp/scripts/run-webapp-drizzle-migrate.mjs` этот маркер не разбирают: единственная проба прогонщика —
`renderObjectPresenceSql` (`migration-order.mjs:534`), и она спрашивает только
`to_regprocedure(<сигнатура>) IS NOT NULL`, то есть «функция существует», а не «в ней есть предикат».
То же самое уже фиксировал ряд `D15b/7a Ш8` в `NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` («маркер декоративный»).

Поэтому строку сообщения коммита «make VERIFY reject the vulnerable body» принимаю только в узком смысле:
текст пробы стал строже, гейтом он не стал и уязвимое тело не остановит.

## 4. Штатный путь цел — замерено по всем шести ключам

Своими значениями, каждый ключ положен своей клинике, чтение под принятым контекстом `app_tenant_service`
организации X, затем то же чтение с аргументом чужой клиники Y:

| ключ | своя клиника | чужая клиника |
| --- | --- | --- |
| `clinic_smtp_outbound` | `R2A-clinic_smtp_outbound` | `<null>` |
| `clinic_smsc_api_key` | `R2A-clinic_smsc_api_key` | `<null>` |
| `clinic_telegram_bot_token` | `R2A-clinic_telegram_bot_token` | `<null>` |
| `clinic_max_bot_api_key` | `R2A-clinic_max_bot_api_key` | `<null>` |
| `clinic_vk_community_access_token` | `R2A-clinic_vk_community_access_token` | `<null>` |
| `clinic_transactional_mail_template` | `R2A-clinic_transactional_mail_template` | `<null>` |
| `smtp_outbound` (не в allow-list) | `<null>` | `<null>` |

Без принятого контекста корень отказывает: `no_context = DENIED 42501` во всех измеренных состояниях.
Роль реального вызывающего сходится с охраной: `mailProfile.ts:66-73` читает шаблон внутри
`runWithOrganizationPrincipal(organizationId, …)`, а организационный принципал в port-context режиме ставит
`SET LOCAL ROLE app_tenant_service` (`apps/integrator/src/infra/principal/organizationPrincipal.ts:57`) —
ровно ту роль, которую разрешает `require_attested_context_for_roles(…, ARRAY['app_tenant_service'])`.
`app_seam_settings_integrator_owner` имеет `EXECUTE` и на охрану, и на `app.current_org_id()` (`t`/`t`).

## 5. Инъекции — свои, пять, все по живому телу на DEV, все rollback-only

| # | что подменено | ожидание | факт | итог |
| --- | --- | --- | --- | --- |
| `ИНЪ-1` | из тела **миграции** `20260823T043206` удалена строка предиката | утечка возвращается | `foreign_tag = R2A-USPEH-FOREIGN`, проба `false` | убита |
| `ИНЪ-2` | из тела **оверлея** `integrator-server-runtime-config.sql` удалена та же строка | утечка возвращается | `foreign_tag = R2A-USPEH-FOREIGN`, проба `false` | убита |
| `ИНЪ-3` | удалена охрана `require_attested_context_for_roles` (предикат оставлен) | межарендаторской утечки нет, но класс контекста перестаёт сужаться | под контекстом класса `staff`: с охраной `DENIED 42501`, без охраны `R2A-DEMO-OWN` | убита |
| `ИНЪ-4` | «совместимость», сохраняющая точную подстроку предиката: вторая ветка `OR` по `p_key = 'clinic_transactional_mail_template'` | утечка при зелёной пробе | `foreign_tag = R2A-USPEH-FOREIGN`, проба `true` | убита замером, **не пробой** |
| `ИНЪ-5` | штатный маршрут восстановления из круга 1: блок корня из **уже применённой** `20260823T010000` применён в одиночку (`--reapply` этого тега) | предикат уцелеет, охрана слетит | под `staff`: до — `DENIED 42501`, после — `R2A-DEMO-OWN` | убита |

Посажено `5`, убито `5`, не поймано `0`. `ИНЪ-3` и `ИНЪ-4` убиты только моим замером: **ни одна из пяти не
краснеет ни в одном гейте репозитория** — корня нет в `declaration.portContext.functions`, поэтому
`definer-tenant-predicate.test.mjs` (`:65-70`) его субъектом не берёт. Неблокирующая находка `НБ-1` круга 1
в силе без изменений; автор её и не закрывал («Not done: D17 declaration coverage»).

## 6. Миграция: прав не выдаёт, владелец объявлен

```
$ grep -niE "\b(grant|revoke|create[[:space:]]+role|alter[[:space:]]+role|alter[[:space:]]+default[[:space:]]+privileges|create[[:space:]]+policy|alter[[:space:]]+policy|drop[[:space:]]+policy|enable[[:space:]]+row[[:space:]]+level[[:space:]]+security|force[[:space:]]+row[[:space:]]+level[[:space:]]+security|owner[[:space:]]+to)\b" \
    apps/webapp/db/drizzle-migrations/20260823T043206_deliver_c4_mail_profile_tenant_binding.sql
$ echo $?
1
```

Совпадений `0`. Каждый из трёх блоков несёт `-- BCB-MIGRATION-OWNER` (`app_seam_email_otp_owner` ×2,
`app_seam_settings_integrator_owner`), `SCHEMA-CREATE` и `LANGUAGE-USAGE`. Владельцы живых тел после прогона
не изменились (§2). Шаговые проверки полного CI это подтверждают отдельно:
`check-migration-privileges: OK (60 migration files)`, `check-drizzle-migration-order: OK`,
`run-webapp-drizzle-migrate transaction-safe migration layout check: OK`.

## 7. Постороннее расхождение — не наше

`app.email_auth_find_email_challenge_for_confirm` пришёл из
`apps/webapp/db/drizzle-migrations/20260822T100000_pre_session_email_and_signup_roots_accept_their_named_context.sql`,
коммит `bf276bb3a` от **22.08 10:34**, автор — общая ветка `feat/doctor-ui-rebuild` (`git branch --contains`
даёт её и десяток соседних `wt/*`). Ни один коммит слайса `C4` (`7b1ef9ba6`, `cf4750a16`, `421a0be56`,
`e61afcf69`, `c06a2daa1`) этот файл и этот корень не трогает. Расхождение exact-gate на DEV reconcile — не
следствие `C4`; в скоуп не беру, как и велит бриф.

## 8. Соответствие пункту `C4` плана владельца

`IMPLEMENTATION_PLAN.md:679`. Коммит `c06a2daa1` скоуп не расширяет: новой таблицы, нового ключа настроек,
второго резолвера и второго корня в нём нет — он чинит стену внутри уже объявленного пункта и восстанавливает
охрану, которая существовала до слайса. Ровно те три тела, что слайс переписал, и переписаны обратно
корректно. Требования, которого нет в плане владельца, в коммите не нашёл.

## 9. Полный CI по ветке — зелёный со второго прогона, первый был красен по устаревшему билд-артефакту

Оба прогона — через общий замок хоста, как требует `AGENTS.md`.

| поле | прогон 1 | прогон 2 |
| --- | --- | --- |
| команда | `run-tests.sh "pnpm run ci"` | `run-tests.sh "pnpm build:webapp && pnpm run ci"` |
| `rc` | **`2`** | **`0`** |
| длительность | `217 s` (`08:14:16 → 08:17:53`) | `685 s` (`ACQUIRED 08:19:50 → RELEASED 08:31:15`) |
| `HEAD` до / после | `22b986019` / `22b986019` | `22b986019` / `22b986019` |
| `runs/ci-last.json` | `{"sha":"22b98601…","headAfter":"22b98601…","movedDuringRun":false,"stepsExit":2,"exitCode":2}` | `{"sha":"22b98601…","headAfter":"22b98601…","movedDuringRun":false,"stepsExit":0,"exitCode":0}` |

Причину красноты прогона 1 не принимал на веру и не списывал на «мигает». Падал ровно один шаг — `typecheck`
приложения `webapp`, тремя ошибками одного вида:

```
apps/webapp typecheck: .next/types/validator.ts(4202,39): error TS2307:
  Cannot find module '../../src/app/api/doctor/web-push/status/route.js'
  … /subscribe/route.js … /unsubscribe/route.js
```

Цепочка фактов, каждый проверен:

1. каталога `apps/webapp/src/app/api/doctor/web-push/` в дереве нет — маршруты удалены коммитом `08f0fc3c7`
   («fix(webapp): separate admin notification boundaries», 23.08 **07:10**) из `feat/doctor-ui-rebuild`;
2. `08f0fc3c7` **не является предком** проверяемого `c06a2daa1` (`git merge-base --is-ancestor` → `NO`); он
   пришёл в ветку слиянием `22b986019` в **08:09:42**, то есть через 10 минут после коммита;
3. падавший файл `apps/webapp/.next/types/validator.ts` — генерируемый артефакт сборки, не в git, `mtime`
   **07:56:50**, то есть создан ДО слияния, когда удалённые маршруты ещё существовали;
4. в цепочке `ci:steps` шаг `pnpm build:webapp`, который этот файл перегенерирует, стоит **после**
   `pnpm typecheck` — поэтому в дереве, где последняя сборка старше удаления маршрута, `pnpm run ci`
   детерминированно красен на typecheck, пока сборку не прогнать отдельно;
5. прогон 2 сначала пересобрал webapp, затем прогнал ту же цепочку целиком — `rc=0`.

`c06a2daa1` трогает только три `*.sql`-файла и модуль TypeScript уронить не может. Красноту прогона 1 отношу
к состоянию рабочего дерева после слияния, а не к проверяемому коммиту; зачётным считаю прогон 2.

## 10. Состояние DEV после прогона — догнан полностью

Селекция pending выполнена не глазами, а тем же модулем, которым её делает прогонщик
(`migration-order.mjs`: `readMigrationFolder` + `selectPendingMigrations` + `findForeignLedgerRows`) против
живого леджера `bcb_webapp_dev`:

```
files= 59  ledger= 59  pending= []  foreign= 0
```

Права и посадочные места переживают `CREATE OR REPLACE` (он сохраняет ACL и владельца) — проверено, а не
предположено:

| проверка | значение |
| --- | --- |
| `EXECUTE app_pre_session` на 11-аргументный корень | `t` |
| `EXECUTE app_pre_session` на 6-аргументную ловушку | `f` (ловушка недостижима — как и объявлено) |
| строк возможности порта у 11-аргументного корня | `1` |
| `EXECUTE app_tenant_service` на корень чтения кредов | `t` |

**Оговорка про маршрут:** `bash deploy/host/migrate-dev.sh --preflight` из ЭТОГО клона не запускается —
`FATAL: DEV API env path guard failed`, потому что в worktree нет `./.env` и `apps/webapp/.env.dev`
(`migrate-dev.sh:19-20`, `:96`). Значит заявленный автором «migrate-dev owner preflight PASS» выполнялся не
отсюда, и повторить его тем же маршрутом я не мог. Конечное состояние это не меняет и проверено напрямую:
тег в леджере, тела трёх корней совпадают с репозиторием, `pending=0`, `foreign=0`, права на месте.

## 11. Неблокирующие находки и вопросы владельцу

**`НБ-1` (перенесена из круга 1 без изменений). Предикат по-прежнему не держит ни один гейт.**
`app.read_integrator_clinic_delivery_credential(text,uuid)` отсутствует в
`declaration.portContext.functions` — она объявлена только в `function-census.ts:8312`, а
`definer-tenant-predicate.test.mjs:65-70` берёт субъекты именно из декларации. Все пять моих инъекций
проходят полный CI зелёными. Автор её не закрывал и честно написал «Not done: D17 declaration coverage».
**Вопрос владельцу остаётся тот же:** вносить ли корень в декларацию, чтобы завтрашнее снятие предиката
краснело само.

**`НБ-2`. `BCB-MIGRATION-VERIFY` в этом репозитории не читает ни один прогонщик** (§3). Текст пробы стал
строже — на прямое снятие предиката отвечает `false`, — но исполнять его некому, и подстрочную форму
обманывает `ИНЪ-4`. Как доказательство «правка приехала» маркер использовать нельзя. Вопрос владельцу:
заводить ли исполнение проб в прогонщике — это работа вне `C4`.

**`НБ-3`. Тело корня в уже применённой `20260823T010000` осталось несинхронизированным.** Оно несёт предикат
арендатора, но НЕ несёт охрану `require_attested_context_for_roles`. В штатной цепочке это безвредно:
`20260823T043206` сортируется позже и перекрывает. Но именно `--reapply 20260823T010000` — маршрут
восстановления, названный в `AGENTS.md` и в моём круге 1, — применённый в одиночку, снимает охрану
(`ИНЪ-5`: под контекстом класса `staff` до — `DENIED 42501`, после — `R2A-DEMO-OWN`). Это ровно тот класс,
который уже описан как «находка A: `--reapply` в одиночку разоружает definer-функцию»
(`docs/REPORTS/MIGRATION_ORDER_AUDIT_2026-08-19.md`). Пункта в плане владельца под это нет — вопрос, а не задача.

**`НБ-4`. Корень стал отказывать молча, а не ошибкой.** До слайса `C4` тело (`20260821T050000`,
`generated/prod-to-target/schema-pre.sql`) поднимало `42501` при `p_organization_id <> app.current_org_id()`
и при ключе вне allow-list. Нынешняя SQL-форма в тех же случаях возвращает `NULL` (см. строку `smtp_outbound`
в §4). Утечки это не создаёт и штатный путь `C4` fail-closed сохраняет (`readBrandedTemplate` на `null`
бросает `BRANDED_MAIL_TEMPLATE_OWNER_COPY_PENDING`), но чужой промах теперь неотличим от «не настроено».
Изменение внесено слайсом, а не этим коммитом; называю, в скоуп не беру.

---

## Что НЕ сделано

- Продуктовый код не менялся; ничего не чинил. Все четыре неблокирующие находки оставлены владельцу.
- Покрытие корня гейтом `D17` в скоуп не заводил — это вопрос владельцу из круга 1, как и велит бриф.
- PROD и TEST не трогал; порт `5200` не занимал. Все замеры — `bcb_webapp_dev`, каждый в транзакции с
  `ROLLBACK`; после прогонов живое тело корня, его владелец и `pending=0` перепроверены отдельно.
- Живой end-to-end прогон брендированного письма через интегратор не гонял: `C4` намеренно fail-closed без
  owner-copy шаблона, которого владелец ещё не написал. Штатный путь доказан на уровне БД (шесть ключей, §4)
  и сверкой роли вызывающего с allow-list охраны.
- Расхождение exact-gate по `email_auth_find_email_challenge_for_confirm` не чинил и не исследовал глубже
  установления происхождения (§7) — оно не наше.
- Слайсы `C1`, `C2`, `C3`, `C5` вне брифа и не проверялись.
