# Независимый аудит: `5b49c199a` — эквайринговый колбэк проводит платёж под собственным арендатором

- Кандидат: `5b49c199a` на `wt/acquiring-webhook-fix-20260905` (16 файлов: миграция, декларация, 2 generated-пары, 4 продуктовых модуля, 4 файла тестов).
- Дефект владельца (MONEY-12): деньги списаны эквайрером, а `patient_payment.status` навсегда `pending`; вебхук отвечал 5xx, провайдер ретраил бесконечно.
- Роль аудита: `auditor-live` по §24.4/§24.5. Kill-set составлен ДО чтения диффа и тестов, по authority брифа.
- Вердикт: **PASS**. Kill-set: **27 пунктов, 27 закрыто, 0 непойманных.** Один класс был закрыт продуктовым кодом, но НЕ ловился приёмочным тестом — аудитор один раз усилил утверждение (§24.5), продуктовый код не менял.

## 0. Классификация «тест или взгляд» (§24.4)

| природа требования | способ доказательства |
|---|---|
| settlement/идемпотентность/стены арендатора/закрытый набор ключей — повторяемое поведение | blind kill-set + поведенческий `devDbProof` на живой DEV внутри `BEGIN … ROLLBACK` + именованные fault injection |
| миграция, контракт statement-owner, декларация, отсутствие широких relation-грантов | взгляд по итоговому состоянию: механические гейты репозитория + introspection живой DEV |

## 1. Слепой kill-set → чем закрыт

Составлен до чтения диффа (27 пунктов, группы A–G). Ниже — каждый пункт и его доказательство.

### A. Стены арендатора и принципал

| # | поломка | доказательство | вердикт |
|---|---|---|---|
| K1 | настройки провайдера читаются без скоупа клиники → колбэк видит чужой секрет | **инъекция аудитора `config_tenant_scope`** (снят фильтр `setting.organization_id = v_org`) → тест 2 КРАСНЫЙ | убит |
| K2 | `UPDATE` без предиката организации → чужая строка по коллизии `provider_ref` | инъекция `tenant_scope` → тест 1 КРАСНЫЙ (`expected 'not_found'`, `actual 'already_processed'`) | убит |
| K3 | организация берётся из тела вебхука, а не из принципала | взгляд: `v_org uuid := app.current_org_id()`, аргументов организации у обеих функций нет; `expect(functionArgs).not.toContain(ORGANIZATION_ID)` в unit-тесте | убит |
| K4 | SECURITY DEFINER не ограничивает себя `app.current_org_id()` | тот же `tenant_scope`; на DEV политики `patient_payment` для `app_seam_payment_webhook_owner` — `rev10_named_root_owner_gate_143` + `rev10_seam_business_143`, обе матчат по `CURRENT_USER` и строк НЕ сужают, значит фильтр тела — единственная стена, и инъекция это подтверждает | убит |
| K5 | безпринципальный `db.select()` под FORCE RLS → 0 строк молча читается как «платёж не найден» | взгляд + introspection: relation-путь удалён из порта целиком; `app_tenant_service` перечислен в `REVOKE ALL PRIVILEGES ON TABLE public.patient_payment` и не имеет НИ ОДНОГО гранта, и ни одной политики на эту таблицу для него нет — двойная стена | убит |

### B. Идемпотентность и машина состояний

| # | поломка | доказательство | вердикт |
|---|---|---|---|
| K6 | повтор колбэка переписывает терминальную строку | инъекция `terminal_guard` → тест 1 КРАСНЫЙ | убит |
| K7 | повтор повторно запускает побочные эффекты | взгляд: после `settleAcquiringWebhookPayment` сервис только возвращает исход, маршрут только формирует ответ — побочных эффектов на пути нет | убит |
| K8 | нет предиката `pending` → отменённый/возвращённый платёж воскресает | взгляд + `terminal_guard`: compare-and-set `WHERE … AND payment.status = 'pending'`, плюс ранний выход на `IN ('paid','failed','refunded')` | убит |
| K9 | событие отказа приводит к `paid` | взгляд: `acquiringSettlementStatusFor` (`succeeded→paid`, `canceled|failed→failed`, иначе `null` без обращения к ledger) + **инъекция аудитора `settle_status_whitelist`** → тест 3 КРАСНЫЙ | убит |

### C. Аутентификация колбэка (маршрут кандидатом не изменён — `git diff` по `route.ts` пуст)

| # | поломка | доказательство | вердикт |
|---|---|---|---|
| K10 | подпись проверяется ПОСЛЕ записи | взгляд: `verifyWebhook` на `route.ts:108`, `handleAcquiringWebhookEvent` — на `:129`; между ними ещё сверка `verifiedProviderPaymentId !== providerPaymentId` | убит |
| K11 | пустая/отсутствующая подпись считается валидной | взгляд: `const secret = providerCfg.webhookSecret?.trim(); if (!secret) return webhook_secret_missing` | убит |
| K12 | подпись сверяется секретом, выбранным не для этого арендатора | взгляд: организация резолвится ИЗ самой ссылки платежа (`resolveAcquiringWebhookOrganization`), секрет берётся из настроек уже принятой клиники → колбэк для A физически не может быть проверен секретом B; **инъекция аудитора `settle_context_gate`** (снят `require_accepted_context`) → тест 4 КРАСНЫЙ | убит |

### D. Безопасность неизвестного входа

| # | поломка | доказательство | вердикт |
|---|---|---|---|
| K13 | неизвестная ссылка платежа → исключение/500/создание строки | взгляд: пустая или неоднозначная ссылка → `RETURN 'not_found'`, `cardinality(v_ids) <> 1` не выбирает победителя; маршрут отвечает `jsonOk({ignored:true})` | убит |
| K14 | неизвестный провайдер → тихий фолбэк на дефолтного | взгляд: `getPaymentProviderAdapter` бросает → 400 до любого SQL | убит |
| K15 | ошибка SQL проглочена и провайдеру уходит 200 | взгляд: отказ чтения настроек → **503** с логом категории (`capability_denied`/`repository_unavailable`), отказ settlement → исключение наверх, ретрай провайдера сохраняется | убит |

### E. Отсутствие регрессии

| # | поломка | доказательство | вердикт |
|---|---|---|---|
| K16 | сломан путь наличных staff-платежей | взгляд: `addCashPayment`/`runPatientPaymentMutation` кандидатом не тронуты (в диффе только удаление неиспользуемого импорта `isNotNull`); блок `describe('patient payment cash write principal')` сохранён целиком; целевые Vitest **3 файла / 27 PASS** | убит |
| — | новая дверь по `kind === 'organization'` перехватывает чужих читателей настроек | взгляд: `payments.getSettings` вызывается ровно из одного места вне сервиса — маршрута эквайринга; staff-принципал (`admin/settings`) и patient-принципал идут прежними ветками | закрыт |

### F. Права и объекты БД (взгляд + introspection, не тест)

| # | поломка | доказательство | вердикт |
|---|---|---|---|
| K17 | `app_tenant_service` получил широкие relation-гранты | `privileges.bcb_webapp_dev.sql:16126-16133`: `app_tenant_service` в списке `REVOKE ALL PRIVILEGES ON TABLE public.patient_payment`, гранта нет; получает ТОЛЬКО `GRANT EXECUTE` на две функции | убит |
| K18 | владельцу SECURITY DEFINER не хватает права на фактическое тело | разбор по телу: settle — `SELECT(id,kind,organization_id,provider,provider_payment_id,status)` + `UPDATE(status)`, `FOR UPDATE`/`FOR SHARE` в теле НЕТ, значит табличная привилегия модификации не нужна; config — `SELECT(key,scope,organization_id,value_json)`. Ровно это и объявлено (`relationSurfaces`) и ровно это выдано в generated. Живой прогон под настоящими ролями и FORCE RLS — 4/4 | убит |
| K19 | нет закреплённого `search_path` → перехват | взгляд: обе функции `SET search_path = pg_catalog`, все обращения квалифицированы; generated повторяет `SET "search_path" TO pg_catalog` | убит |
| K20 | смена сигнатуры оставляет устаревшую перегрузку / расходится `function_identity` | introspection DEV: обеих функций до миграции НЕТ (0 строк), значит `CREATE OR REPLACE` создаёт, а не переопределяет; existing-функции шва не тронуты, `DROP+CREATE` нет | убит |

### G. Контракт миграции

| # | поломка | доказательство | вердикт |
|---|---|---|---|
| K21 | `GRANT`/`REVOKE`/`CREATE ROLE`/`ALTER ROLE`/`ALTER DEFAULT PRIVILEGES`/`CREATE POLICY` в миграции | `grep -niE` по файлу → **NONE**; права целиком в `deploy/postgres/privileges/` | убит |
| K22 | имя не `YYYYMMDDTHHMMSS_slug.sql` / нарушен порядок | `findMigrationNameViolations` = `[]`, `findMigrationTimestampCollisions` = `[]`; `20260904T230000…` — последний по времени из 116 | убит |
| K23 | нет маркера statement-owner / `postgres` владельцем | оба блока начинаются с `-- BCB-MIGRATION-OWNER:` (`app_seam_payment_webhook_owner`, `app_seam_settings_runtime_owner`), далее `SCHEMA-CREATE: app` и `LANGUAGE-USAGE: plpgsql` в требуемом порядке; `findMigrationStaticViolations` = `[]` | убит |
| K24 | нет `BCB-MIGRATION-VERIFY` / не оставлен проверяемый след | probe в ведущем блоке: `to_regprocedure(...) IS NOT NULL` по обеим сигнатурам | убит |
| K25 | `CREATE OR REPLACE` поверх чужой функции без `REHOME-FUNCTION` | introspection: функций не существует, маркер не требуется | убит |
| K26 | декларация и generated разошлись | независимо прогнано: `generate-cli --check` и `--port-context-only --check` — **все 6 артефактов побайтно**, exit 0 | убит |
| K27 | нет индекса на горячей колонке поиска | новых колонок нет; поиск попадает в существующий частичный `idx_patient_payment_acquiring_webhook_authority (provider, provider_payment_id) WHERE kind='acquiring' AND …` | убит |

## 2. Fault injection: что сломано → какое утверждение покраснело

Шесть независимых классов. Два — механикой самого кандидата (`ACQUIRING_WEBHOOK_SETTLEMENT_FAULT`), четыре — инъекции аудитора в тело миграции с восстановлением из git.

| класс | что сломано | покрасневшее утверждение |
|---|---|---|
| стена арендатора при settlement | `AND payment.organization_id = v_org` → `OR true` | тест 1: `expected 'not_found'`, `actual 'already_processed'` |
| терминальная защита | снят ранний выход + `status='pending'` → `status IS NOT NULL` | тест 1: состояние ledger после повтора |
| стена арендатора при чтении конфига | снят `setting.organization_id = v_org` | тест 2: обе клиники видят один секрет |
| **закрытый набор ключей** | `p_key NOT IN (…)` → `FALSE` | тест 2: `'leaked'` вместо `'none'` — **утверждение добавлено этим аудитом** |
| белый список целевых статусов | `p_status NOT IN ('paid','failed')` → выключен | тест 3: исключение `…status_unsupported` не поднято |
| гейт принятого контекста | снят `PERFORM app.require_accepted_context(...)` | тест 4: 42501 не поднят |

Непойманных классов: **0**. Все временные правки продуктового кода откачены драйвером через `git checkout`; дерево после прогонов чистое, `git status` пуст.

### Единственная правка аудитора и почему она сделана

Класс «дверь конфига можно увести на любой другой `admin`-ключ клиники» продуктовым кодом ЗАКРЫТ (закрытый набор из двух ключей в теле), но приёмочный тест его НЕ ловил: третье чтение доставало вложенный путь `#>> '{value,providers,0,webhookSecret}'`, который равен NULL у ЛЮБОГО ключа, не являющегося списком провайдеров. Инъекция `key_set` при исходном тексте теста оставалась **зелёной** — то есть «дверь отказала» и «дверь отдала токен бота» читались одинаково.

Отказ дорогой и молчаливый (§10a ступень 2): за этой дверью лежат `telegram_bot_token`, `auth_altcha_hmac_secret`, `apple_oauth_private_key` той же клиники, а симптомов у утечки нет. Поэтому §24.5 «недостающий приёмочный тест аудитор пишет один раз»: третье чтение теперь наблюдает ВЕСЬ возврат двери (`IS NULL → 'none'`, иначе `'leaked'`), а ключ-приманка сеется внутри той же откатываемой транзакции, чтобы «отказ» не путался с «читать было нечего». Добавлена инъекция `key_set`, закрепляющая проверку. Продуктовый код аудитом не изменён.

## 3. Owner-aware rollback-only preflight и живое доказательство

Миграция к DEV/TEST/PROD НЕ применялась; временная база не создавалась.

1. **Preflight из точного candidate checkout** (§1; из worktree — через канонический эквивалент `--preflight`):
   `node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --migrator bcb_dev_migrator --drizzle-folder apps/webapp/db/drizzle-migrations --sudo-postgres --rollback-only` → exit 0,
   `pending=1 total=116 reapplied=0 unapplied=0`, `ROLLBACK`. Оба `CREATE FUNCTION` выполнены под настоящими statement-owner ролями через `SET LOCAL ROLE` (`session_user=bcb_dev_migrator`, `current_user=app_seam_payment_webhook_owner` / `app_seam_settings_runtime_owner`, `can_create_public=f`), членства мигратора сняты в той же транзакции.
2. **Живое доказательство под фактическим принципалом tenant-service:** `RUN_ACQUIRING_WEBHOOK_SETTLEMENT_DB=1 node --test deploy/postgres/privileges/patient-acquiring-webhook-settlement.devDbProof.test.mjs` → **4/4 PASS** на `bcb_webapp_dev`, всё внутри `BEGIN … ROLLBACK`, с настоящими ролями, FORCE RLS и настоящими политиками; контекст открывается `app.begin_port_context` по capability-id из committed generated-артефакта, а не по выдуманному.
3. **DEV после всех прогонов не изменена:** обеих функций нет (0), пробной клиники нет (0), пробных строк ledger нет (0), строки в `drizzle.__drizzle_migrations` нет (0).
4. Без env-флага файл пропускается целиком: `# skipped 4` — общий `test:db-privileges` не начнёт ходить в БД.

## 4. Разбор прав миграции перед приземлением (§1)

1. **Создаёт:** две SECURITY DEFINER-функции в `app`. Таблиц, колонок, индексов, политик и ролей не создаёт и не меняет.
2. **Под какой ролью исполняется тело:** `app.settle_patient_acquiring_webhook_payment` — `app_seam_payment_webhook_owner` (тот же владелец, что у существующего резолвера); `app.read_acquiring_webhook_booking_payment_setting` — `app_seam_settings_runtime_owner` (тот же, что у пациентского близнеца). Рантайм-роль — `app_tenant_service`, только `EXECUTE`.
3. **Что нужно, чтобы тело ИСПОЛНИЛОСЬ:** settle — `SELECT` на шести колонках `public.patient_payment` + `UPDATE(status)`; `FOR UPDATE`/`FOR SHARE` в теле нет, поэтому табличная привилегия модификации не требуется. config — `SELECT` на четырёх колонках `public.system_settings`. По RLS: обе таблицы под `FORCE RLS`, владельцы шва проходят своими role-targeted политиками (`rev10_named_root_owner_gate_*` restrictive + `rev10_seam_business_*` permissive), сужения по организации политики не дают — арендатора держит тело функции, и инъекции это подтверждают.
4. **Чего нет в декларации:** ничего. Обе способности и оба `rev10Function` с `relationSurfaces` объявлены в этой же ветке; `generate-cli --check` и `--port-context-only --check` — побайтно.

## 5. Прогоны

| проверка | результат |
|---|---|
| `migrate-local.mjs --rollback-only` (owner-aware preflight) | exit 0, `pending=1/116`, ROLLBACK |
| `devDbProof` на `bcb_webapp_dev`, чисто | **4/4 PASS** |
| `devDbProof`, 6 fault injection | 6/6 покраснели соответствующие тесты |
| `devDbProof` без env-флага | `# skipped 4` |
| `generate-cli --check` | 4 артефакта побайтно, exit 0 |
| `generate-cli --port-context-only --check` | 2 артефакта побайтно, exit 0 |
| `findMigrationNameViolations` / `StaticViolations` / `TimestampCollisions` | `[]` / `[]` / `[]` |
| целевые Vitest (`service.unit`, `pgPatientPayments.principal.unit`, `pgSystemSettings.preauth.unit`) | **3 файла / 27 PASS** |
| `eslint` по изменённому файлу проверки | exit 0 |

Full CI не гонялся намеренно (бриф): целевые и phase-гейты уже даны воркером на этом SHA, аудит добавляет только недостающий независимый сигнал.

## 6. Наблюдения вне скоупа (НЕ findings, §24.6 — рекомендация/вопрос, работой не становятся)

1. Ветка `kind === 'organization'` в `readBookingPaymentSettingThroughItsOwnDoor` оживляет заодно и второй вебхук — `api/payments/webhook/[provider]` (`processProviderWebhook` тоже идёт под организационным принципалом и тоже был на мёртвом relation-пути). Радиус тот же арендатор и та же пара ключей, стены не расширены; расходится только ИМЯ двери (`patient-payment.webhook.*`) с её вторым потребителем. Стоит ли переименовать способность в нейтральную — вопрос владельцу/ведущему, не дефект.
2. На `(provider, provider_payment_id)` уникального ограничения нет, поэтому дублирующая ссылка внутри одной клиники теоретически выразима. Кандидат ведёт себя fail-closed (`cardinality <> 1 → not_found`, победитель не выбирается) — ровно как существующий резолвер. Заводить уникальный индекс — отдельное продуктовое решение, в scope брифа его нет.
