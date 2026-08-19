# Адверсарный аудит Т12 — «лимит клиентов убран целиком»

**Вердикт: FAIL.** Не потому, что что-то из снятого вернулось: код чист, стены на месте, лестница
доступа ведёт себя ровно так, как исполнитель и описал. FAIL — потому что **вторая половина Т12,
данные, физически не доедет ни до одной базы**: миграция `0050` проштампована временем ниже
водяного знака DEV и попала в занятый слот леджера, а значит мигратор будет вечно докладывать
«already current», ничего не применив, и предохранитель против такого пропуска при этой конкретной
коллизии молчит. Правка — одна строка `when`; но пока она не сделана, `patient_count` останется в
тарифе и в оверрайдах на всех стендах, а решение владельца «убрать целиком» будет выполнено только
в коде.

- Оракул: `docs/OWNER_DECISIONS.md` → «Тарифы и оплата», **Т12** (владелец 19.08: «лимит клиентов -
  убрать»; убирается ЦЕЛИКОМ, а не выставляется в «бесконечность»).
- Что проверялось: ветка `wt/drop-patient-count-20260819`, рабочий коммит `047a8bfa6`.
- Отчёт исполнителя (`docs/REPORTS/PATIENT_COUNT_LIMIT_REMOVAL_2026-08-19.md`) читался как
  заявление; каждый его пункт перепроверен прогоном или инъекцией.
- Все прогоны — на DEV (`bcb_webapp_dev`). Прод не трогался. Все записи в базу шли внутри
  транзакции с `ROLLBACK`; состояние DEV после аудита не изменено.

---

## Находки

### F1 — 🔴 БЛОКЕР. Миграция `0050` не может быть применена никогда: `when` ниже водяного знака и в занятом слоте

Мигратор применяет по водяному знаку (`when > max(created_at)` леджера), а не по содержимому
(AGENTS.md §1, «Миграции после baseline B0»). У `0050` `when = 1800000052000`. На DEV:

```
$ sudo -u postgres psql -d bcb_webapp_dev -c \
  "select max(created_at) as watermark, count(*) from drizzle.__drizzle_migrations;"
   watermark   | count
 --------------+-------
  1800000060000|    55
```

(в ходе аудита знак наблюдался и как `1800000061000` — соседние ветки катают DEV параллельно; любое
из значений на восемь-девять слотов выше `0050`.)

Хуже, чем просто «ниже знака»: слот `1800000052000` **уже занят чужой миграцией**. Хеш строки в
леджере не совпадает с хешем файла `0050`:

```
$ node /tmp/inspect-pending.mjs      # дословная копия findSilentlySkippedMigrations + pending из migrate-local.mjs
watermark              = 1800000061000
0050.when              = 1800000052000
0050.hash              = aaf7883778873c02
ledger row @ that when = 786853cc2679fd81
hash matches 0050?     = false
0050 in silentlySkipped(gate would shout)? = false
0050 in pending(would apply)?              = false
pending tags: [ '0047_the_opening_door_did_not_learn_the_new_alarm_words' ]
```

Именно совпадение по времени и обезоруживает предохранитель. `findSilentlySkippedMigrations`
(`deploy/postgres/privileges/migrate-local.mjs:107-112`) ищет записи, которые *ниже знака И
отсутствуют в леджере*; строка по этому `when` есть — значит `0050` считается применённой, в
`silentlySkipped` не попадает, крикнуть о ней некому. В `pending` она тоже не попадает
(`when < watermark`). Живой прогон обёртки это подтверждает: она ругается на чужую `0047` и **не
упоминает `0050` вовсе**:

```
$ node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev \
    --migrator bcb_dev_migrator --drizzle-folder apps/webapp/db/drizzle-migrations \
    --sudo-postgres --rollback-only
Error: Drizzle journal and bcb_webapp_dev ledger describe different states: 1 migration(s) sit
below the applied watermark 1800000061000 and have no ledger row …
  idx=49 when=1800000051000 tag=0047_the_opening_door_did_not_learn_the_new_alarm_words
```

Статические гейты этого поймать не могут по построению: `check-drizzle-journal-sync`
(`apps/webapp/scripts/check-drizzle-journal-sync.sh`) сверяет журнал сам с собой — уникальность
`idx`/`tag` и строгий рост `when` — и никогда не смотрит в леджер. Поэтому `pnpm lint` у исполнителя
был честно зелёным.

**Последствие:** на всех стендах `saas_tariffs.quotas.patient_count` и строки
`saas_org_entitlement_overrides` останутся. На поведение они уже не влияют (код ключ не читает), но
администратор увидит их выгрузкой и примет за действующий лимит — ровно то, чего Т12 требует не
допустить. «Убрано из тарифа» останется невыполненным.

**Что делать (по AGENTS.md §1, файл ещё не применён — переименование разрешено):** назначить `0050`
новый `when` выше `max(created_at)` **обеих** целей (DEV и TEST) непосредственно перед сведением в
`feat`. На момент аудита DEV требует `when > 1800000061000`; TEST не проверялся (см. «НЕ
ПРОВЕРЕНО»).

### F2 — низкая. Комментарий пережил снятый гейт

`apps/webapp/src/modules/org-entitlements/service.ts:663` над `resolveOwnTariffTransition` по-прежнему
объясняет гейт как «специалисты, филиалы **и пациенты**», хотя тем же коммитом список стал
`blockableMechanics: ['clinic_team', 'branches']` (`git show 047a8bfa6 -- .../service.ts`). Поведение
верное, текст рядом с ним — нет. Чинить не стал (аудитор не правит).

### F3 — информационная. `stockQuotaCheck.ts` остался без единого вызывающего

```
$ grep -rn "stockQuotaCheck\|assertStockQuotaAvailable" apps/webapp/src --include=*.ts | grep -v '\.test\.'
(пусто)
```

Файл `apps/webapp/src/infra/repos/stockQuotaCheck.ts` описан в собственном комментарии как
«Compatibility entrypoint for retained callers», но удержанных вызывающих больше нет. Это **не
последствие Т12** (последний трогавший его коммит — `60266ec2a`, задолго до), поэтому в скоуп
решения владельца не входит и здесь только зафиксировано.

---

## Ответы на вопросы миссии

### 1. Убрано, а не спрятано — ПОДТВЕРЖДЕНО

Потолка не осталось ни на одном этаже, и он не переименован.

**Тип запрещает саму возможность.** `apps/webapp/src/infra/repos/transactionQuotaPort.ts:13` —
`export type StockQuotaMechanic = 'branches' | 'files';`. Взять advisory-лок или пройти
`decideStockQuota` под клиентов теперь нельзя даже опечаткой: это ошибка компиляции.

**Все живые точки потолка перечислены и проверены.** Единственный лок-механизм —
`transactionQuotaPort.withinLock`; его вызывающие:

```
$ grep -rn "withinLock\|saas_quota:" apps/webapp/src --include=*.ts | grep -v '\.test\.'
transactionQuotaPort.ts:248,264,272,274,280   (сам порт)
pgSaasBilling.ts:934,1419,1716                (места специалистов)
stockQuotaCheck.ts:21                         (мёртвый файл, F3)
pgPatientFiles.ts:192                         (файлы)
pgBookingEngine.ts:799,871                    (филиалы)
pgOrganizationInvites.ts:115                  (места клиники)
```

Ни одного на пути создания клиента. `ensureInvitedOrganizationClientRelationship`
(`pgPatientOrganizationEnrollment.ts:17-56`) вставляет связь без счёта и без лока; `POST
/api/doctor/clients` (`route.ts:41-46`) гейтится только `requireDoctorWorkspaceApiContext()`.

**Переименованных остатков нет.**

```
$ grep -rniE "patientCount|clientCount|patientsLimit|clientLimit|maxPatients|maxClients|patient_limit|client_limit|patientQuota|clientQuota" \
    apps/webapp/src apps/webapp/db apps/webapp/scripts scripts deploy | grep -v patient_count_used
apps/webapp/scripts/seed-saas-test-walkthrough-fixtures.ts:585,586:  { … patientCount: 5, staffCount: 3 }
```

Единственные попадания — поле фикстуры «сколько пациентов насеять», не лимит (проверено по строкам
580-595).

**В тарифной карте ключа нет.** `MECHANIC_REGISTRY` (`modules/org-entitlements/types.ts:54-89`) —
28 механик, `patient_count` отсутствует; `TariffQuotaMap` (`:138-141`) допускает только `files` и
`branches`; `WARNABLE_QUOTA_MECHANICS = ['files']`. «Бесконечность» нигде не подставлена —
проверено чтением, ключа просто нет.

**В базе потолка тоже нет.** Ни триггеров, ни CHECK-ограничений на таблицах записи клиента:

```
$ sudo -u postgres psql -d bcb_webapp_dev -c "select tgname … from pg_trigger … where relname in
    ('org_enrollments','platform_users','be_organization_members');"     → (0 rows)
$ … "select conname … from pg_constraint … contype='c';"                → (0 rows)
```

**Что осталось — и почему это не потолок.** Строка `patient_count` встречается ещё в четырёх
местах, все безобидны: три комментария в коде, объясняющих, что тут стояло раньше
(`pgPatientOrganizationEnrollment.ts:43`, `service.test.ts:751`,
`check-transaction-quota-port-boundary.mjs:17`), и колонка-счётчик `patient_count_used` в
`deploy/postgres/c5a-platform-operations-runtime.sql:161,193,234,246`. Последнюю прочитал целиком:
обе функции — `LANGUAGE sql STABLE`, чистый `count(*)`, никакого сравнения с лимитом; и код её
больше не выбирает (`pgOrgEntitlements.ts:353-355,376-378` берут только `clinic_team_used`,
`files_used`, `branches_used`). Это отчётный счётчик, а не дверь. Исполнитель это сам записал
(«НЕ СДЕЛАНО» п.2) — подтверждаю.

Отдельно: новое тело `app.resolve_organization_mechanic_access` из `0050` **тоже содержит строку
`patient_count`** — в комментарии, объясняющем удаление. В логике (`WHEN p_mechanic = ANY (ARRAY['files',
'branches'])`) её нет.

### 2. Ничего лишнего не унесено — ПОДТВЕРЖДЕНО тремя живыми инъекциями

Стены не в приложении, а в базе, поэтому проверял их живьём на DEV, настоящим mTLS-логином
`bcb_dev_webapp_staff` через настоящий порт-контекст. Клиника A =
`a0000000-0000-4000-8000-000000000001`, клиника B = `e0000000-0000-4000-8000-000000000001`.

**Инъекция 1 — сотрудник клиники B заявляет своим контекстом клинику A:**

```
$ psql "$DATABASE_URL_STAFF" -c "BEGIN; SELECT app.begin_port_context('717e67dd-…',
    ROW(1,'staff','app_staff','relation',NULL,decode('0355fd5e…','hex'),
        'bfe03cfe-…'/*актор клиники B*/, NULL, 'a0000000-…-0001'/*чужая клиника*/, NULL, NULL));"
ERROR:  port context organization claim is not an active membership of the actor
CONTEXT: PL/pgSQL function assert_port_context_claim(...) line 17 at RAISE
```

**Инъекция 2 — тот же сотрудник, честный контекст своей клиники, пишет строку клиента в чужую:**

```
--- context installed ---   role=app_staff   my_org=e0000000-…-0001
--- видит только своё ---   e0000000-…-0001 | 1
--- ATTACK: INSERT into foreign org a0000000-…-0001 ---
ERROR:  new row violates row-level security policy for table "org_enrollments"
```

**Контроль (та же команда, но в свою клинику) — проходит,** значит отказ выше не «отказывает всему»:

```
INSERT 0 1
--- rows visible after own-org insert ---   e0000000-…-0001 | 2
ROLLBACK
```

**Инъекция 3 — принципал без роли рабочего места (пациент) пишет карточку клиента в СВОЕЙ клинике:**

```
$ psql "$DATABASE_URL_PATIENT" …begin_port_context(patient/relation, org=a0000000-…-0001)…
    role=app_patient   my_org=a0000000-…-0001
--- ATTACK: INSERT INTO public.org_enrollments … ---
ERROR:  permission denied for table org_enrollments
```

То есть роль рабочего места требуется не только маршрутом: без неё привилегии на таблицу нет вовсе.

**Маршрутный слой проверен инъекцией в код.** Транзиентный тест
(`src/app/api/doctor/clients/auditT12.tmp.test.ts`, после прогона удалён) утверждает: гейт роли
отказал → `createManualOrganizationClient` не вызван (403); организация берётся из контекста, а
`organizationId` в теле запроса игнорируется. Чтобы утверждение не было пустым, в `route.ts` была
внесена поломка — схема тела получила `organizationId`, а вызов стал
`parsed.data.organizationId ?? gate.ctx.organizationId`:

```
AssertionError: expected '33333333-…' to be '22222222-…'
 Test Files  1 failed (1) · Tests  1 failed | 3 passed (4)
```

Поломка откачена (`git checkout --`), тест снова 4/4 зелёные.

### 3. Данные — ПОДТВЕРЖДЕНО по эффекту (но см. F1: применить нечем)

Оба backfill-шага `0050` прогнаны на живом DEV дословно, внутри транзакции с `ROLLBACK`, с
замером до и после и с отпечатками (`md5`) карт тарифа по каждой строке.

**Сколько чистится (цифра, которую исполнитель не смог измерить):**

```
 tariffs_total | tariffs_to_clean | overrides_total | overrides_to_delete
 --------------+------------------+-----------------+---------------------
             8 |                1 |              28 |                   1
```

Конкретно: тариф `ПОЛНЫЙ ДОСТУП - РАЗРАБОТЧИК` с `quotas.patient_count = {"kind":"unlimited",…}`
и один оверрайд организации `a0000000-…-0001`.

**После шагов:**

```
UPDATE 1 · DELETE 1
--- осталось patient_count в тарифах / оверрайдах ---            0 | 0
--- у КАКОЙ-ЛИБО строки изменилась любая другая карта? ---       (0 rows)
--- пропал ли оверрайд другой механики? ---                      (0 rows)
--- выжившие механики оверрайдов ---   24 разных, 27 строк (booking, branches, files, courses, …)
ROLLBACK
```

Чужие механики не задеты ни в одной строке.

**Осиротевших строк по снятой механике нет.** Прошёлся по ВСЕМ `text`/`varchar`/`json`/`jsonb`
колонкам всех базовых таблиц базы (анонимный `DO`-блок с `format('… LIKE ''%patient_count%''')`):

```
NOTICE:  HIT 2 rows -> public.admin_audit_log.details (jsonb)
NOTICE:  HIT 1 rows -> public.saas_billing_invoices.tariff_snapshot (jsonb)
NOTICE:  HIT 1 rows -> public.saas_tariffs.quotas (jsonb)              ← чистит шаг 1
NOTICE:  HIT 1 rows -> public.saas_org_entitlement_overrides.mechanic  ← чистит шаг 2
NOTICE:  HIT 1 rows -> public.admin_audit_log.target_id (text)
NOTICE:  TOTAL hit-rows across all text/json columns: 6
```

Две таблицы за пределами миграции — и обе трогать НЕЛЬЗЯ, это не сироты, а история:
`admin_audit_log` — журнал действий администратора (переписанный журнал перестаёт быть журналом);
`saas_billing_invoices.tariff_snapshot` — замороженный слепок тарифа на момент счёта. Проверил, что
слепок не превращается в лимит на экране: `tariffSnapshot` не читается ни одним `.tsx`
(единственное попадание — мок в `TeamSection.ui.test.tsx`), а код берёт из него только
`price_minor`/`currency`/`billing_period` (`pgSaasBilling.ts:276-290`) и чек
(`fiscalReceipt.ts:43`). Замороженная `quotas.patient_count` внутри инертна.

**Прав в миграции нет — проверено, а не заявлено.** `grep -nE "GRANT|REVOKE|CREATE ROLE|ALTER
ROLE|ALTER DEFAULT PRIVILEGES|…POLICY|OWNER TO"` по `0050` даёт единственное попадание — атрибут
функции `STABLE SECURITY DEFINER` (не выдача прав). `node scripts/check-migration-privileges.mjs` →
`OK (52 migration files)`.

**Шаг 3 (функция) — прогнан целиком, а не прочитан.** Файл разобран настоящим парсером мигратора
(`parseOwnerStatements`): три шага, два `backfill`, третий с владельцем
`app_seam_org_commerce_owner`, `schemaCreate: app`, `languageUsage: plpgsql`. Затем воспроизведена
преамбула обёртки (временное членство + `GRANT CREATE ON SCHEMA app` + `GRANT USAGE ON LANGUAGE
plpgsql`) и всё исполнено с `ROLLBACK`:

```
RESET RESET UPDATE 1 · SET RESET RESET DELETE 1 · SET SET CREATE FUNCTION RESET
 owner = app_seam_org_commerce_owner
 proacl = {…=X/…, app_patient=X/…, app_staff=X/…, app_tenant_service=X/…}   ← не изменился
REVOKE REVOKE REVOKE ROLE · ROLLBACK
```

Отдельно проверил риск форвард-`CREATE OR REPLACE`, снятого с тела `0022`: не откатывает ли он
чужие поздние правки. Живое тело функции на DEV **побайтово совпадает с телом `0022`** (только
хвостовой перевод строки), а других миграций, трогающих эту функцию, в репозитории нет
(`grep -l resolve_organization_mechanic_access` → только `0022` и `0050`). Разница `0022 → 0050` —
одна строка `ARRAY['files', 'patient_count', 'branches']` → `ARRAY['files', 'branches']` плюс
комментарий. Замена безопасна.

### 4. Гейт покрытия — ПОДТВЕРЖДЕНО инъекцией

Снятой механики гейт не требует: он строит список требований из `MECHANIC_REGISTRY`
(`check-s4-entitlement-coverage.ts:47`), а `patient_count` оттуда удалён, и в `DECLARED_NO_SURFACE`
не спрятан (`grep patient_count protectedActionRegistry.ts` → пусто). То есть механика не
«объявлена без поверхности», а перестала существовать.

Контроль над соседними не потерян. Инъекция: у обеих карт механики `files` подменён ключ на
`courses` (то есть `files` осталась без единого маппинга — точная форма «тихо потеряли соседа»):

```
$ pnpm --dir apps/webapp exec vitest run src/app-layer/entitlements/protectedActionRegistryCoverage.unit.test.ts
- []
+ [ { "id": "files", "message": "unregistered mechanic surface" } ]
 Test Files  1 failed (1) · Tests  1 failed | 7 passed (8)
```

Инъекция откачена, файл снова зелёный (8/8).

Заодно проверил второй гейт, который исполнитель тоже правил, —
`check-transaction-quota-port-boundary.mjs`: из `protectedTables` ушла `orgEnrollments`. Не унесло
ли это охрану с остальных? Инъекция — временный production-файл с `tx.insert(beBranches)` мимо
порта квот:

```
$ node scripts/check-transaction-quota-port-boundary.mjs ; echo EXIT=$?
check-transaction-quota-port-boundary: quota-port bypass detected.
  - apps/webapp/src/infra/repos/auditT12Injection.tmp.ts: contains a quota-consuming mutation without transactionQuotaPort.withinLock
EXIT=1
$ rm …tmp.ts && node scripts/check-transaction-quota-port-boundary.mjs ; echo EXIT=$?
check-transaction-quota-port-boundary: OK
EXIT=0
```

Гейт и его самотест (`--self-test`: «3 bypass forms rejected», «canonical port writer accepted») в
порядке.

### 5. Последствие, найденное исполнителем — ПОДТВЕРЖДАЮ, живым прогоном

Утверждение исполнителя («клиника в рунге „только чтение“ теперь заводит клиентов») **верно**.
Точное поведение — не «гейт ослаб», а «гейта на этом маршруте больше нет вовсе»: маршрут не просто
пропускает `read_only`, он **ни разу не обращается к тарифу**.

Прогон (транзиентный тест, порт отвечает `state: 'read_only'`, `mutationAllowed: false` на ЛЮБУЮ
механику; и маршрут, и `requireEntitlementForMutation` — настоящие):

```
✓ лестница ЖИВА: та же резолюция отказывает мутации там, где гейт ещё стоит
    requireEntitlementForMutation(ctx, 'branches') → ok:false, HTTP 403,
    { error: 'commercial_read_only', mechanic: 'branches' }
✓ а создание клиента в том же рунге ПРОХОДИТ и тариф не спрашивает
    POST /api/doctor/clients → HTTP 200, { ok:true, created:true }
    createManualOrganizationClient вызван 1 раз
    resolveMechanicAccess НЕ вызван ни разу
 Test Files  1 passed (1) · Tests  4 passed (4)
```

Механика подтверждается и чтением кабинетного гейта: `isCabinetEntryBlocked`
(`app-layer/guards/cabinetAccessGate.ts:12-14`) возвращает `true` только на `disabled` и
`unconfigured` — `read_only` он пропускает, и второго крепления лестницы к этому маршруту нет.

Итог: неоплаченная клиника в рунге «только чтение» заводит новых клиентов, тогда как филиалы, курсы,
запись и внешний календарь ей по-прежнему отказывают (эти кейсы в
`requireEntitlementReadOnlyRefusesWrites.test.ts` сохранены, удалён ровно один — про карточку
клиента, и удаление честно помечено комментарием со ссылкой на отчёт).

**Чинить не стал — и не должен.** Пункта об этом в решении владельца нет: Т12 говорит про лимит,
а не про лестницу. По AGENTS.md §24.6 находка без строки в плане владельца — вопрос ему, а не
работа. Вопрос владельцу формулируется так: *должна ли неоплаченная клиника в рунге «только чтение»
сохранять право заводить новых клиентов?* Безопасный дефолт, если ответ «нет»: гейт коммерческого
состояния на маршруте, не привязанный к квотной механике (иначе механика вернётся с чёрного хода).

---

## Гейты, прогнанные аудитом

| Гейт | Команда | Результат |
|---|---|---|
| Покрытие S4 (базовый) | `vitest run …/protectedActionRegistryCoverage.unit.test.ts` | 8/8 зелёные |
| Оба поведенческих теста исполнителя + read-only набор | `vitest run …/route.route.test.ts …/noClientCeiling.test.ts …/requireEntitlementReadOnlyRefusesWrites.test.ts …/protectedActionRegistryCoverage.unit.test.ts` | 4 файла, 25/25 зелёные |
| Границы порта квот | `node scripts/check-transaction-quota-port-boundary.mjs` (+ `--self-test`) | OK / 3 формы обхода отклонены |
| Права в миграциях | `node scripts/check-migration-privileges.mjs` | OK (52 файла) |
| Синхронность журнала drizzle | `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` | OK (и это часть проблемы — см. F1) |
| Обёртка мигратора против DEV | `migrate-local.mjs … --rollback-only` | Ошибка про чужую `0047`; `0050` не упомянута (F1) |
| Полное тело `0050` через преамбулу обёртки | `psql … BEGIN … ROLLBACK` | Все три шага прошли, владелец и ACL не изменились |
| lint + typecheck + весь webapp-suite, под общим замком хоста | `/home/dev/brain/host-orch/run-tests.sh "pnpm lint && pnpm typecheck && pnpm test:webapp"` | `rc=0` за 317 с. Lint OK по всем гейтам; typecheck Done по всем пакетам; **384 файла пройдено, 4 пропущено; 1779 тестов пройдено, 12 пропущено, 0 упало** — цифры исполнителя сошлись с моими |

---

## НЕ ПРОВЕРЕНО

1. **Водяной знак TEST.** Правка `when` по F1 обязана быть выше `max(created_at)` **обеих** целей,
   а TEST живёт на отдельном боксе; бриф ограничивал прогоны DEV. Значение TEST снять перед
   сведением в `feat` — иначе есть шанс починить `when` под DEV и заново промахнуться мимо TEST.
2. **Полный `pnpm ci`.** Прогнал `pnpm lint && pnpm typecheck && pnpm test:webapp` под общим замком
   хоста — зелено (см. таблицу выше). Остальные шаги `ci` (`test`, `test:db-principal`,
   `test:db-privileges`, `build`, `build:webapp`, `audit`) НЕ гонялись.
3. **Живой клик-through в браузере.** Кабинет врача руками/скриншотом не открывался: все прогоны —
   маршрутные и на уровне базы. Для F1 и вопроса №5 это ничего не меняет, но «готово» по канону без
   живой проверки не объявляется.
4. **Данные TEST и PROD.** Замер «сколько строк вычистится» сделан только на DEV (1 тариф + 1
   оверрайд). На других стендах числа свои и не снимались; ПРОД не трогался вовсе.
5. **Задел на будущее в `check-transaction-quota-port-boundary`.** Проверено, что снятие
   `orgEnrollments` из `protectedTables` не ослабило охрану оставшихся таблиц. Вопрос «а не
   понадобится ли `org_enrollments` под какой-то будущей квотой» не рассматривался — это дизайн, а
   не гейт.
6. **F3 по существу.** Что `stockQuotaCheck.ts` мёртв — установлено; нужен ли он кому-то как
   точка расширения, не выяснялось. Вне скоупа Т12.
