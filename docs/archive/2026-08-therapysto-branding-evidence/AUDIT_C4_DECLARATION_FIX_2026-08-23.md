# Аудит фикса регрессий `C4`: утечка шаблона между арендаторами и корень bootstrap

**FAIL, NOT FOR LAND**

Блокирующих: `2`. Неблокирующих: `2`. Инъекций: посажено `5`, убито `5`, не поймано `0`.

Дата: 2026-08-23. Проверяемый коммит: `e61afcf69` (`fix(c4): bind mail template lookup to DB principal`),
ветка `wt/therapysto-night-20260823`, `HEAD` `7fc43c431`. Клон
`/home/dev/dev-projects/bcb-wt-therapysto-night-20260823`.
Оракул: `IMPLEMENTATION_PLAN.md:679` — пункт `C4`.

---

## Коротко

Само тело правки верное: предикат `setting.organization_id = app.current_org_id()` закрывает утечку и **не**
ломает штатный путь — это доказано живым замером на DEV, не рассуждением. Но правка приземлена в **одну из двух**
копий одной и той же функции и в **уже применённую** миграцию, поэтому ни одна существующая база её не получает,
а один штатный операторский шаг возвращает уязвимое тело обратно. Утечка на живой DEV **сегодня открыта**.

---

## 1. Главное: правка закрывает утечку, но её возвращает вторая копия того же корня — БЛОКЕР

Замер сделан заново, своими значениями, rollback-only, на живой `bcb_webapp_dev`. Полный скрипт закоммичен:
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_C4_DEV_PROOF_2026-08-23.sql`.

Принципал — организация X `a0000000-…-000000000001` («Точка Здоровья»), аргумент — организация Y
`e0000000-…-000000000001` («DEV Isolated Clinic»). Обеим в той же транзакции положен свой
`clinic_transactional_mail_template` с меткой `AUDIT-X-OWN` / `AUDIT-Y-FOREIGN`.

Команда:

```
sudo -n -u postgres psql -X -A -F'|' -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -f docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_C4_DEV_PROOF_2026-08-23.sql
```

Вывод (одна транзакция, три состояния тела подряд, в конце `ROLLBACK`):

| ключ | значение | что это значит |
| --- | --- | --- |
| `before_foreign_tag` | `AUDIT-Y-FOREIGN` | **тело, которое стоит на DEV прямо сейчас, отдаёт шаблон чужой клиники** |
| `before_own_tag` | `AUDIT-X-OWN` | своя клиника читается |
| `after_foreign_tag` | `<null>` | кандидат `e61afcf69` чужую клинику не отдаёт — утечка закрыта |
| `after_own_tag` | `AUDIT-X-OWN` | **штатный путь `C4` цел**: своя клиника получает свой шаблон |
| `after_own_smtp_no_error` | `ok:<null>` | остальные пять ключей корня не сломаны предикатом |
| `after_no_context` | `DENIED 42501` | без принятого контекста корень отказывает, а не отдаёт строку |
| `overlay_foreign_tag` | `AUDIT-Y-FOREIGN` | **после применения оверлея из репозитория утечка возвращается** |

Владелец функции после `CREATE OR REPLACE` проверен отдельно и не менялся: `app_seam_settings_integrator_owner`.

### БЛОКЕР 1 — вторая, незащищённая копия того же корня в активном runtime-оверлее

`app.read_integrator_clinic_delivery_credential(text,uuid)` определена в репозитории **дважды**:

- `apps/webapp/db/drizzle-migrations/20260823T010000_mail_profile_reaches_auth_delivery.sql:179-202` — здесь
  предикат добавлен (`:200`);
- `deploy/postgres/integrator-server-runtime-config.sql:308-332` — здесь предиката **нет** (`:330` — последнее
  условие `WHERE`).

Это не мёртвая легаси-копия. Её редактировал **тот же слайс `C4`**: коммит `7b1ef9ba6` добавил в её allow-list
именно новый ключ `clinic_transactional_mail_template`. Файл числится активным корнем в
`scripts/check-legacy-access-census.mjs:22` и его читаемость жёстко ассертится при выкатке
(`deploy/host/deploy-test-saas.sh:2052`, `:2398`).

Оверлей применяется `install_integrator_server_runtime_config_overlay()`
(`deploy/host/deploy-test-saas.sh:841-849`) внутри `run_strict_post_migration_closure()` (`:1931`), то есть
**после** миграционной цепочки; входная точка — `deploy-test-saas.sh --post-migration-closure` (`:2343`).
`CREATE OR REPLACE` из оверлея перезаписывает исправленное тело уязвимым.

Доказано не чтением скрипта, а поведением: строка `overlay_foreign_tag` выше получена применением блока
`:308-332` **дословно из файла репозитория** поверх исправленного тела в той же транзакции — чужой шаблон
вернулся.

Смягчающее: автоматического вызова этой закрывающей последовательности сегодня нет — `deploy-test.sh`
перестал её звать (`deploy/host/deploy-test.sh:376`, снято `fe7aa07d9` 12.08.2026). То есть это не «каждый
деплой», а «один документированный операторский шаг». Классификация как блокера — по правилу брифа
(«Если найдёшь второй незащищённый — это блокер») и потому, что расхождение двух копий не ловит ни один гейт
(см. неблокирующую 1).

### БЛОКЕР 2 — правка не доезжает ни до одной существующей базы

`e61afcf69` меняет **уже применённый** файл миграции. Идентичность миграции — `tag`, а не хеш
(`AGENTS.md`, «Pending — всё, чего нет в ledger по `tag`»). Тег уже в журнале DEV:

```
$ sudo -n -u postgres psql -X -A -t -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
    -c "SELECT tag FROM drizzle.__drizzle_migrations WHERE tag LIKE '20260823T010000%';"
20260823T010000_mail_profile_reaches_auth_delivery
20260823T010000_patient_subdomain_slug_and_custom_domain_uniqueness
```

Поэтому `migrate-dev.sh --execute` эту миграцию больше не проиграет, и живое тело на DEV осталось прежним —
проверено прямым запросом уже **после** всех моих транзакций:

```
$ … -c "SELECT strpos(pg_get_functiondef(
      'app.read_integrator_clinic_delivery_credential(text,uuid)'::regprocedure),'current_org_id');"
0
```

То есть на единственной живой базе, которой касается ветка, утечка **открыта прямо сейчас**, и в ветке нет
шага, который её закрывает. Штатный маршрут восстановления существует и в `AGENTS.md` назван:
`bash deploy/host/migrate-dev.sh --execute --reapply 20260823T010000_mail_profile_reaches_auth_delivery`.
Он не выполнен и в коммите не упомянут.

Отдельно: собственная проба миграции этого не заметит. `-- BCB-MIGRATION-VERIFY` (строка `:4`) проверяет только
наличие подстроки `clinic_transactional_mail_template` в теле — она есть и в уязвимом теле. Предикат пробой не
покрыт, поэтому даже `--reapply` не докажет, что правка приехала.

На свежий cutover TEST это не распространяется: тега нет в `deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql`
(`grep -c` → `0`), значит миграция там отработает и привезёт исправленное тело — после чего его может
перезаписать оверлей из блокера 1.

---

## 2. Нет ли второго такого же корня — обход всех definer-корней слайса

Слайс `C4` = `7b1ef9ba6`, `cf4750a16`, `421a0be56`, `e61afcf69`. Полный перечень `CREATE [OR REPLACE] FUNCTION`
по всем `*.sql` слайса (`git show --unified=0 … | grep`):

| корень | где | читает стенованную таблицу с аргументом-организацией? | вердикт |
| --- | --- | --- | --- |
| `app.email_auth_start_challenge(uuid,text,text,bigint,text,text)` | миграция `:7-20`; оверлей `organization-member-invites-rls.sql` | нет — тело только `RAISE EXCEPTION` (fail-closed trap) | чисто |
| `app.email_auth_start_challenge(…,text,text,uuid,text,text)` (11 арг.) | миграция `:26-167`; тот же оверлей | нет: `email_send_cooldowns`/`email_challenges` ключуются по `user_id`, `outgoing_delivery_queue` — запись. Корень pre-session, организации в контексте ещё нет по построению; все 11 аргументов покрыты `hash_port_typed_args` в `require_accepted_context` (`:56-69`) | чисто |
| `app.read_integrator_clinic_delivery_credential(text,uuid)` | миграция `:179-202` **и** `integrator-server-runtime-config.sql:308-332` | да | **вторая копия не защищена — блокер 1** |

Обе копии `email_auth_start_challenge` слайс синхронизировал корректно; `organization-member-invites-rls.sql`
входит в общую цепочку оверлеев (`deploy/host/runtime-overlay-rehydrate-lib.sh:88`), и там расхождения нет.
Расхождение ровно одно — то, что в блокере 1.

---

## 3. `FC-2` — правка теста, а не кода: проверено самостоятельно

Вызывающего искал сам, не по отчёту. Полный перечень упоминаний в коде (не в SQL-артефактах):

```
apps/webapp/src/infra/repos/pgEmailAuth.ts:72   FROM app.email_auth_start_challenge($1::uuid, … $11)
apps/webapp/src/infra/repos/pgEmailAuth.ts:78   'app.email_auth_start_challenge(uuid,text,text,bigint,text,text,text,text,uuid,text,text)'
apps/webapp/src/infra/repos/pgEmailAuth.startChallenge.unit.test.ts:51   (та же 11-аргументная строка)
deploy/postgres/privileges/port-context-catalog.test.mjs:224              (та же, правка e61afcf69)
deploy/postgres/privileges/declaration.ts:3335, :4382                     (11 арг., execute: ['app_pre_session'])
deploy/postgres/privileges/declaration.ts:4376                            (6 арг., execute: [], purpose 'legacy-mail-profile-required-trap')
```

**Вызова шестиаргументной сигнатуры в репозитории не осталось** — единственное её упоминание вне SQL — запись
в декларации о самой ловушке. Рантайм зовёт 11-аргументную (`pgEmailAuth.ts:71-78`), передавая ровно 11
плейсхолдеров. Значит `FC-2` — действительно правка устаревшего каталога, а не маскировка живого дефекта.

Дополнительно: до `e61afcf69` этот тест был обязан краснеть, а не молчать. `port-context-catalog.test.mjs:232-250`
требует для каждого корня списка ровно одну `pre_session`-возможность и `execute === ['app_pre_session']`;
6-аргументная ловушка объявлена с `execute: []` и возможности не имеет. Проверено инъекцией (см. §4, `ИНЪ-4`).

---

## 4. Инъекции — свои, пять штук; три из них по живому телу на DEV

Все — rollback-only на DEV либо во временно правленом файле с восстановлением. Дерево после прогона чистое
(`git status --porcelain` пуст, `sed -n '78p' pgEmailAuth.ts` вернул исходную 11-аргументную строку).

| # | что подменено | ожидание | факт | итог |
| --- | --- | --- | --- | --- |
| `ИНЪ-1` | из тела кандидата убран `AND setting.organization_id = app.current_org_id()` | замер краснеет | `after_foreign_tag = AUDIT-Y-FOREIGN` | убита |
| `ИНЪ-2` | предикат перенесён на **соседнюю колонку** того же отношения: `setting.updated_by IS NOT DISTINCT FROM app.current_org_id()` (гейт по подстроке остался бы зелёным) | краснеет | `ERROR: permission denied for table system_settings` — колоночные гранты владельца шва не дают читать `updated_by` | убита |
| `ИНЪ-3` | правдоподобная «совместимость»: `AND (setting.organization_id = app.current_org_id() OR p_key = 'clinic_transactional_mail_template')` — подстрока `current_org_id` на месте, честный путь зелёный, дыра открыта ровно под новый ключ `C4` | краснеет | `after_foreign_tag = AUDIT-Y-FOREIGN`, `after_own_tag = AUDIT-X-OWN` | убита |
| `ИНЪ-4` | `port-context-catalog.test.mjs:224` возвращён к 6-аргументной сигнатуре | краснеет | `not ok 8 … app.email_auth_start_challenge(uuid,text,text,bigint,text,text) must resolve to exactly one pre_session capability, got 0`; `# fail 1` | убита |
| `ИНЪ-5` | в **продуктовом** `pgEmailAuth.ts:78` идентичность named-root подменена на 6-аргументную | краснеет | `FAIL src/infra/repos/pgEmailAuth.startChallenge.unit.test.ts`; `Tests 1 failed | 1 passed` | убита |

Красных до инъекций: `0` (полный CI `rc=0`, см. §5). Красных после каждой инъекции: `≥1`, перечислено выше.
Не пойманных: `0`.

`ИНЪ-2` стоит отметить отдельно: её убил не поведенческий гейт, а колоночный слой прав — «перенос предиката на
соседнюю колонку» физически не исполняется, потому что владелец шва не имеет `SELECT` на `updated_by`. Это
работающая вторая стена, но она случайна для данной правки: колонка `organization_id` владельцу шва как раз
доступна, поэтому `ИНЪ-3` через неё прошла бы незамеченной без поведенческого замера.

---

## 5. Полный CI по ветке

Через общий замок хоста, как требует `AGENTS.md`:

```
/home/dev/brain/host-orch/run-tests.sh "pnpm run ci"
```

| поле | значение |
| --- | --- |
| `rc` | `0` |
| длительность | `562 s` (`ACQUIRED 07:07:51 → RELEASED 07:17:13`, до этого ~7 мин в очереди за чужим прогоном) |
| `HEAD` до | `7fc43c4319093c7b8ad45ed2ac39616a3898d874` |
| `HEAD` после | `7fc43c4319093c7b8ad45ed2ac39616a3898d874` |
| `runs/ci-last.json` | `{"sha":"7fc43c43…","headAfter":"7fc43c43…","movedDuringRun":false,"stepsExit":0,"exitCode":0}` |

Замечу: замок реально работал — в 06:58 его держал прогон соседнего агента из
`/home/dev/dev-projects/bcb-wt-night-b3-20260823`, мой встал в очередь и взял лок в 07:07:51.

### `PhoneMessengerAuthFlow.ui.test.tsx` — утверждение автора о нестабильности не подтверждается

На слово не принимал. В логе полного CI имя файла не встречается ни разу и падений нет вовсе
(`grep -nE "^not ok|Tests +[0-9]+ failed|FAIL "` — пусто). Отдельно прогнал файл пять раз подряд:

```
/home/dev/brain/host-orch/run-tests.sh "for i in 1 2 3 4 5; do pnpm -C apps/webapp exec vitest --run --project=ui PhoneMessengerAuthFlow; done"
```

`5/5`: `Test Files 1 passed (1)`, `Tests 7 passed (7)` в каждом прогоне. Файл слайс `C4` не трогал
(`git log -- '*PhoneMessengerAuthFlow*'` — последний коммит `ed9a343ad`, к `C4` отношения не имеет).
Регрессии, спрятанной за словом «нестабильный», здесь нет — но и нестабильности нет: утверждение
недоказуемо в этом состоянии ветки и в отчёте автора лишнее.

---

## 6. Миграция: прав не выдаёт

Проверено грепом, не глазами:

```
$ grep -niE "\b(grant|revoke|create[[:space:]]+role|alter[[:space:]]+role|alter[[:space:]]+default[[:space:]]+privileges|create[[:space:]]+policy|alter[[:space:]]+policy|drop[[:space:]]+policy|enable[[:space:]]+row[[:space:]]+level[[:space:]]+security|force[[:space:]]+row[[:space:]]+level[[:space:]]+security|owner[[:space:]]+to)\b" \
    apps/webapp/db/drizzle-migrations/20260823T010000_mail_profile_reaches_auth_delivery.sql
$ echo $?
1
```

Совпадений нет. Контракт statement-owner соблюдён: у каждого блока — `-- BCB-MIGRATION-OWNER`
(`app_seam_email_otp_owner`, `app_seam_settings_integrator_owner`), где нужно — `SCHEMA-CREATE` и
`LANGUAGE-USAGE` (строки `1-3`, `23-25`, `170`, `176-178`).

Права под новое тело: тело кандидата зовёт `app.current_org_id()` от имени владельца шва. Проверено, что право
есть, а не предположено:

```
$ … -c "SELECT has_function_privilege('app_seam_settings_integrator_owner','app.current_org_id()','EXECUTE');"
t
```

Артефакты привилегий перегенерировать не требуется: тела функций в `deploy/postgres/generated/privileges.*.sql`
не хранятся (там только `ALTER`/`GRANT`/`REVOKE`), а `relationSurfaces` корня в
`deploy/postgres/privileges/function-census.ts:8312` не меняются — вызов функции отношением не является.

---

## 7. Соответствие пункту `C4` плана владельца

`IMPLEMENTATION_PLAN.md:679` — «Расширить existing SMTP config только sender display data, добавить один
org-scoped transactional template setting и один mail-profile resolver/renderer. Не трогать doctor
broadcasts/mass mailing кроме сохранения текущего поведения».

- один org-scoped setting: ключ `clinic_transactional_mail_template` добавлен в единственный существующий корень
  чтения clinic-кредов, нового корня и новой таблицы нет — соответствует;
- один resolver/renderer: `apps/integrator/src/integrations/email/mailProfile.ts`,
  `resolveAndRenderAuthCodeMailProfile` — единственная точка; параллельного резолвера нет;
- broadcasts/mass mailing: `deliveryAdapter.ts` меняет тему/текст **только** при наличии `payload.authCode`
  (`«Non-auth transactional/broadcast mail keeps its existing subject/text behavior»`), `sendEmailRoute.ts`
  требует `mailProfile` только для `code`-ветки — текущее поведение рассылок сохранено;
- fail-closed без owner-copy: `readBrandedTemplate` бросает `BRANDED_MAIL_TEMPLATE_OWNER_COPY_PENDING`, а не
  подменяет клинику платформенным именем — ровно как записано в плане.

Сам `e61afcf69` скоуп `C4` не расширяет: он чинит стену внутри уже объявленного пункта. Требования, которого
нет в плане, я в нём не нашёл.

---

## 8. Неблокирующие находки

**НБ-1. Новый предикат не держит ничто.** Гейт `deploy/postgres/privileges/definer-tenant-predicate.test.mjs`
(тот, что заведён 22.08 на вопрос владельца «в соседней функции не забудут поставить?») берёт предметы из
`declaration.portContext.functions` (`:65-70`), а `app.read_integrator_clinic_delivery_credential(text,uuid)` в
этой структуре **отсутствует** — она объявлена только в `function-census.ts:8312`. Её близнец
`app.read_integrator_google_calendar_setting(text,uuid)` в декларации есть (`declaration.ts:4067`). Поэтому
этот корень не был предметом гейта до правки — и не стал им после: снятие предиката завтра не покраснеет
нигде. Отдельно: тела из `deploy/postgres/*.sql`-оверлеев вообще не входят в поверхность артефактов
(`function-body-surface.mjs:14-18` — только `schema-pre.sql` + `drizzle-migrations`), поэтому расхождение
блокера 1 не видит ни один гейт.

Это находка, а не задача: соответствующего пункта в плане владельца нет. **Вопрос владельцу:** заводить ли
покрытие этого корня гейтом D17 (внести его в `declaration.portContext.functions`) и парность двух копий —
или это отдельная работа вне `C4`.

**НБ-2. `BCB-MIGRATION-VERIFY` не различает исправленное тело и уязвимое.** Проба (`:4`) ищет подстроку
`clinic_transactional_mail_template` — она есть в обоих телах. После `--reapply` проба скажет «ок» независимо
от того, приехал предикат или нет. Усиление пробы до проверки предиката — тоже вопрос владельцу, а не правка
в рамках этого аудита.

---

## Что НЕ сделано

- Продуктовый код не менялся; ничего не чинил — обе блокирующие находки оставлены владельцу и фиксеру.
- PROD и TEST не трогал; порт `5200` не занимал. Все замеры — `bcb_webapp_dev`, каждый в транзакции с
  `ROLLBACK`. Состояние DEV после аудита проверено: `0` оставленных строк `clinic_transactional_mail_template`,
  `0` оставленных возможностей порта, живое тело функции прежнее.
- Живой end-to-end прогон брендированного письма через интегратор не гонял: он требует поднятого интегратора и
  реального SMTP, а `C4` намеренно fail-closed без owner-copy шаблона, которого владелец ещё не написал.
  Штатный путь доказан на уровне БД (`after_own_tag = AUDIT-X-OWN`) и чтением цепочки вызовов
  (`mailProfile.ts:67-73` — `runWithOrganizationPrincipal(organizationId, …)` с тем же `organizationId`,
  который уходит аргументом; класс контекста `tenant_service` обязан нести организацию —
  `packages/db-principal/src/portContext.ts:360-368`).
- Не проверял слайсы `C1`, `C2`, `C3`, `C5` — вне брифа.
