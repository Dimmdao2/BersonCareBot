# BROADCAST_DRAFT_SAVE — независимый аудит круга 2, 2026-08-23

**PASS** — черновик рассылки теперь принадлежит паре «врач + клиника»: миграция разрешает или удаляет ровно
неразрешимые легаси-строки, ключ конфликта не может столкнуться на выкатке, а `500` из обхода владельца закрыт
на живой DEV — включая ту ветку `ON CONFLICT DO UPDATE`, из-за которой круг 1 получил `FAIL`.

Аудит: коммит `74c6246b6`, ветка `wt/broadcast-draft-20260823`, дерево
`bcb-wt-broadcast-draft-20260823` (в нём поверх правки уже слит `feat/doctor-ui-rebuild`, `a301d26dc`).
Оракул — `docs/_TODO/OWNER_WALKTHROUGHS/2026-08-23_TEST_FULL_WALK.md`: «`Сохранить черновик` отвечает `500`».
Вход — `FAIL` круга 1 (`BROADCAST_DRAFT_SAVE_AUDIT_2026-08-23.md`). Канон — `AGENTS.md`.
Ничего не чинил и не коммитил в чужие файлы. `--execute`, TEST, PROD, deploy, push не запускались.
Все пробы — свои, rollback-only, на именованной `bcb_webapp_dev`; `bersoncarebot_test` — только чтение.

## Итог по пунктам брифа

| # | Пункт | Природа | Вердикт |
|---|---|---|---|
| 1 | миграция делает ровно то, что написано (бэкфилл и удаление) | взгляд + прогон | **PASS** |
| 2 | шесть состояний строки ведут себя как заявлено | тест (свой) | **PASS**, плюс два состояния сверх брифа |
| 3 | нигде не осталось «один черновик на врача на платформу» | взгляд (свой поиск) | **PASS** в живом пути; одна оговорка про тест-дубль |
| 4 | чужая клиника не видна и не переписывается | тест (свой) | **PASS**, доказано двумя стенами |
| 5 | тест автора краснеет по своей причине на каждой инъекции | взгляд + прогон | **PASS** |
| — | стена не расширена, `--all --check` побайтно, в миграции нет прав | взгляд + прогон | **PASS** |

---

## 1. Порядок в миграции: столкновение нового ключа НЕДОСТИЖИМО — PASS

Главный подозреваемый брифа — «у врача ДВА черновика, разрешаемых в ОДНУ клинику, и новый уникальный ключ
падает». Это состояние не может существовать: до миграции действует
`broadcast_drafts_doctor_user_id_key UNIQUE (doctor_user_id)`, то есть строка у врача физически одна.
Проверил не рассуждением, а попыткой (в транзакции, `ROLLBACK`):

```
Q1_two_drafts_one_doctor=refused_23505_duplicate key value violates unique constraint
```

Два черновика одного врача (в разные клиники) СУБД не принимает. Следовательно `ADD CONSTRAINT … UNIQUE
(doctor_user_id, organization_id)` в том же `ALTER TABLE`, что снимает старый ключ, не может встретить дубль —
старый ключ строго сильнее нового. Констрейнт с ожидаемым именем присутствует и на DEV, и на TEST:

```
bcb_webapp_dev   → broadcast_drafts_doctor_user_id_key|UNIQUE (doctor_user_id)
bersoncarebot_test → broadcast_drafts_doctor_user_id_key|UNIQUE (doctor_user_id)   rows=0  null_org=0
```

`DROP CONSTRAINT` без `IF EXISTS` поэтому не «повезло», а опирается на реальное имя в обеих базах.

**Порядок исполнения ролей проверил отдельно, а не по маркерам в тексте.** Файл распарсен тем же модулем, что
и оба прогонщика (`deploy/postgres/privileges/migrate-local-parse.mjs`): 3 statement — `#1 backfill`,
`#2/#3 owner=app_object_owner`. `BCB-MIGRATION-BACKFILL` в `migrate-local.mjs:471-476` исполняется после
`RESET ROLE; RESET SESSION AUTHORIZATION;`, а `deploy-test.sh:300` зовёт мигратор с `--sudo-postgres`, то есть
бэкфилл идёт локальным суперпользователем и не упирается ни в `FORCE RLS` (политики таблицы объявлены только
`TO app_staff`, для мигратора применимых политик нет), ни в `REVOKE ALL … FROM bcb_test_migrator`
(`privileges.bcb_webapp_dev.sql:12797`). Свою пробу гонял в этой же раскладке ролей, а не «голым SQL от
postgres на всё».

**Окна `42P10` на выкатке нет.** Новый код целится в ключ, которого до миграции не существует, поэтому важен
порядок деплоя: `deploy/host/deploy-test.sh` останавливает юниты (`:285`), затем мигрирует (`:299-302`), сводит
права и только потом перезапускает службы (`:383`);
`deploy-test-saas.sh` — та же последовательность (`:2448` stop → `:2532` migrate). Приложение со старой схемой
не обслуживает трафик.

## 2. Шесть состояний строки — PASS, и ещё два сверх брифа

Своя проба (не harness автора): фикстуры сеются в транзакцию, кандидатная миграция исполняется из своего файла
под теми же owner/backfill-классами, затем измеряется каждое состояние, всё завершается `ROLLBACK`.

| состояние строки | ожидание | измерено |
|---|---|---|
| врач с ОДНИМ активным членством | черновик сохранён и получил свою клинику | `S1_single_active=26aca960-…|1|true` (тот же `id`) |
| врач с ДВУМЯ активными членствами | черновик удалён | `S2_two_active=0` |
| врач БЕЗ членств | черновик удалён | `S3_zero_membership=0` |
| врач с ЕДИНСТВЕННЫМ, но `disabled` членством ⁽ᵃ⁾ | черновик удалён | `S4_disabled_only=0` |
| врач с активным + отключённым членством ⁽ᵃ⁾ | черновик уходит в АКТИВНУЮ клинику | `S5_active_plus_disabled=d0000000-…-0004|1` |
| строка, у которой клиника уже проставлена | не тронута | `S6_already_scoped=1|true|A2 already-scoped` |

⁽ᵃ⁾ — эти два состояния тест автора не проверяет; я добавил их, потому что именно на них ломается фильтр
`status = 'active'`, а он и решает, куда уедет строка. Итог схемы после миграции:

```
POST_null_rows=0   POST_not_null=true
POST_keys=broadcast_drafts_doctor_user_id_organization_id_key{UNIQUE (doctor_user_id, organization_id)}
POST_policies=rev10_context_gate_67:*,rev10_saas_org_dormant_p0_8_3:*   POST_owner=app_object_owner|forcerls=true
verify_probe=true
```

Последняя строка — это собственная проба миграции `-- BCB-MIGRATION-VERIFY:` из шапки файла, выполненная как
`SELECT`: она даёт `true` на пост-состоянии, то есть будущие прогонщики смогут доказать применённость этой
миграции (`AGENTS.md` §«каждая миграция оставляет проверяемый след»). Политики и владелец таблицы не изменились,
`FORCE RLS` на месте.

**Проба чувствительна — две свои инъекции в саму миграцию:**

- снят весь бэкфилл → `ERROR: column "organization_id" of relation "broadcast_drafts" contains null values`
  (`SET NOT NULL` останавливает выкатку, тихо мимо не проедет);
- снят фильтр `WHERE membership.status = 'active'` → `S4_disabled_only=1` (черновик уехал в клинику, где врач
  ОТКЛЮЧЁН) и `S5_active_plus_disabled=GONE|0` (черновик врача с одной живой клиникой удалён). Два разных
  симптома, оба ловятся.

## 3. «Один черновик на врача» — своим поиском, PASS с одной оговоркой

Искал не по одному слову: точный `broadcast_drafts` по всему дереву (без `node_modules`), camelCase
`broadcastDraft|BroadcastDraft` по `apps/webapp/src`, и отдельно любой `UNIQUE`/`_key`/`INDEX` по
`doctor_user_id` во всех `.sql/.ts/.mjs`. Что нашлось и что с этим:

- **Схема.** Единственный уникальный ключ по `doctor_user_id` во всём репозитории — тот самый, который
  миграция и заменяет. Второго нет ни в оверлеях (`p0-5-role-split.sql`, `p0-5b-grants.sql`,
  `phase4-force-rls-cutover.sql`, `phase4-locked-helper-rls-policies.sql` упоминают таблицу только как
  org-scoped цель политик/грантов), ни в `relation-access.ts:2480`, ни в дампе
  `docs/ARCHITECTURE/DB_DUMPS/public_bcb_webapp_dev_schema.sql` (там таблицы нет вовсе — 0 вхождений).
- **Код записи/чтения.** Единственный живой путь — `pgBroadcastDrafts.ts`; других `INSERT`/`DELETE` по
  таблице в приложении нет. Комментарий-шапка обновлён вместе с ключом.
- **Клиент.** `BroadcastForm.tsx` грузит черновик серверным экшеном (`loadDraftAction`), никакого
  `localStorage`/`sessionStorage` под черновик нет — переключение клиники не может отдать чужой кэш.
- **Оговорка (не дефект, но назову).** `inMemoryBroadcastDrafts.ts` по-прежнему `Map` по одному
  `doctorUserId`, и сигнатура порта `loadDraft(doctorUserId)` клинику не несёт. В живом продукте этот дубль
  недостижим — `webappReposAreInMemory()` (`config/env.ts:378`) включает его только в Vitest без БД и в
  `next build` без `DATABASE_URL`. Но как модель реального ключа он теперь неверен: тест на этом дубле не
  увидит смешивания клиник.
- **Снимок A→B.** `deploy/postgres/generated/prod-to-target/schema-post.sql:564` всё ещё несёт старый ключ и
  nullable-колонку. Это не дефект коммита: артефакт пересобирается отдельной рутиной с ЖИВОЙ DEV
  (`scripts/refresh-prod-to-target-cutover.mjs`, гейт `pnpm run check:prod-to-target-cutover`), и сейчас
  миграция на DEV не применена. **При приземлении** после `migrate-dev.sh --execute` снимок надо пересобрать,
  иначе гейт в `deploy-test-full-reset.sh:37` покраснеет.

## 4. Чужая клиника: не видна и не переписывается — PASS, две стены

Своя проба под НАСТОЯЩИМ путём порта (`app.begin_port_context`, роль `app_staff`, кандидатный
`GRANT INSERT (organization_id)` ставится внутри транзакции), запрос чтения — побайтно форма `loadDraft`
из кода, запрос записи — побайтно форма `saveDraft` c `app.current_org_id()`:

```
B0_who=app_staff|org=26aca960-…
B1_loadDraft_A_before=1|A2 legacy-single          ← легаси-строка после бэкфилла ВИДНА (в круге 1 было 0)
B2_loadDraft_A_after=1|A2 save-A-2|same_id=true   ← два сохранения подряд: ветка ON CONFLICT DO UPDATE, та же строка
B2b: INSERT с ЛИТЕРАЛОМ чужой клиники → ERROR: new row violates row-level security policy; строк осталось 0
B3_loadDraft_B_before=0                            ← в клинике B черновика клиники A не видно
B4_loadDraft_B_after=1|A2 save-B-1                 ← в клинике B появляется СВОЙ черновик
B5_loadDraft_A_again=1|A2 save-A-2                 ← клиника A читает свой, он не перезаписан
B6_physical_rows=2|26aca960-…~A2 save-A-2  a0000000-…-0001~A2 save-B-1
```

Это закрывает `FAIL` круга 1 по своей причине: там повторное сохранение давало `42501` и легаси-строка была
невидима навсегда; здесь та же последовательность проходит и читается.

**Что именно держит изоляцию, проверил инъекцией, а не доверием.** Ослабил арендную политику до
`USING (true) WITH CHECK (true)` — и та же проба немедленно покраснела: `B3_loadDraft_B_before=1`,
`B4=2`, `B5_loadDraft_A_again=2|A2 save-B-1`, то есть клиника B читает и вытесняет черновик клиники A.
Значит изоляцию даёт живая политика, а не форма запроса.

**Про форму запроса — наблюдение, не находка.** `loadDraft` фильтрует только `WHERE doctor_user_id = $1` и
клинику берёт из RLS; путь записи в том же файле про клинику ГОВОРИТ явно (`app.current_org_id()` в `VALUES`).
Сегодня это безопасно: `loadDraftAction` идёт через `requireDoctorAccess → requireDoctorWorkspaceContext →
stampStaffPrincipal(ctx.organizationId)` (`requireRole.ts:314`), то есть читающий принципал несёт ту же
клинику, что и пишущий, а составной ключ гарантирует не больше одной подходящей строки. Замечание в том, что
асимметрия оставляет `rows[0]` без собственной защиты, если чтение когда-нибудь уедет на definer-путь мимо RLS.
Строки плана владельца под это нет — это ВОПРОС ведущему, а не работа (§«запрет аудит-разгона»).

## 5. Тест автора: слепые зоны круга 1 закрыты, инъекции честные — PASS

Прогнал сам, все четыре конфигурации:

```bash
RUN_BROADCAST_DRAFT_SAVE_DB=1 node --test …/broadcast-draft-save.devDbProof.test.mjs        # exit 0, 2/2
BROADCAST_DRAFT_SAVE_FAULT=omit-backfill …      # not ok 1: ERROR: column "organization_id" … contains null values
BROADCAST_DRAFT_SAVE_FAULT=omit-not-null …      # not ok 1: not_null expected 'true', actual 'false'
BROADCAST_DRAFT_SAVE_FAULT=weaken-org-policy …  # not ok 1: foreign_before expected '0', actual '1'
```

Каждая инъекция валит СВОЙ тест и по СВОЕЙ причине — три разных симптома, не «упало что-нибудь». Тест 2
(rollback-postcheck) во всех трёх остаётся зелёным, то есть красный не от мусора в базе.

Обе слепые зоны, названные в круге 1, закрыты по факту, а не на словах (сверил по diff файла):
`DELETE` съехал в сев фикстур и больше не стоит перед каждой пробой — ветка `ON CONFLICT DO UPDATE` реально
исполняется (`clinic_a_repeat=1|…clinic-a-second|true`, у меня независимо `B2_…|same_id=true`);
`insertSql(f, requestedOrganizationId)` с литеральным uuid заменён на `app.current_org_id()`, то есть тест
теперь ходит формой прод-кода.

**Что тест круга 2 ПОТЕРЯЛ относительно круга 1:** ушла прямая проба `foreign_probe` — «`INSERT` с литералом
чужой клиники отбивается `42501`». Само свойство живо, я его измерил отдельно (`B2b` выше), но регрессионного
теста на него в файле больше нет. Это про покрытие, а не про поведение, поэтому на вердикт не влияю.

## 6. Стена не расширена — PASS

Круг 2 трогает четыре файла (`git show --stat 74c6246b6`): миграция, `pgBroadcastDrafts.ts`, тест, отчёт.
`declaration.ts` в нём НЕ менялся, то есть новых прав этот круг не просит вообще.

```bash
node deploy/postgres/privileges/generate-cli.mjs --all --check   # exit 0, 4/4 артефакта побайтно
```

Точный поиск запрещённых команд по файлу миграции (`GRANT|REVOKE|CREATE/ALTER/DROP POLICY|CREATE/ALTER ROLE|
ALTER DEFAULT PRIVILEGES|SECURITY DEFINER|BYPASSRLS|SET SESSION AUTHORIZATION|RESET ROLE`) — exit 1, ни одного
вхождения. Миграция меняет только данные, nullability и уникальный ключ; новый индекс рождается под
`app_object_owner` (владелец таблицы), ACL у индексов нет, поэтому последующий `reconcile-access` ей не
противоречит.

## 7. Прогнанные гейты

```bash
node --test deploy/postgres/privileges/{migration-order,migrate-local-parse,relation-access,migrate-local}.test.mjs
#   exit 0 — 107/107
pnpm --dir apps/webapp lint       # exit 0 (check-migration-privileges: OK, 55 файлов; check-drizzle-migration-order: OK;
                                  #         2 прежних warning в AppointmentPaymentSection.tsx, ошибок нет)
pnpm --dir apps/webapp typecheck  # exit 0
```

Постпроверка после ВСЕХ моих проб на DEV (вне транзакции):

```
AFTER_rollback_probe_rows=0   AFTER_rollback_live_rows=0   AFTER_rollback_old_key=true
AFTER_rollback_not_null=false AFTER_rollback_grant=false   AFTER_rollback_fixture_members=0
```

DEV в исходном состоянии: ни строк, ни фикстурных членств, ни кандидатного гранта, ни кандидатной схемы.

## Вопросы ведущему (НЕ скоуп, §«аудит — гейт, а не источник работы»)

1. **Удаление не оставляет следа.** `DELETE … WHERE organization_id IS NULL` не печатает, сколько строк унёс.
   На DEV и TEST это ноль строк (измерено), на проде — неизвестно и мной не измеримо. Одна строка
   `RAISE NOTICE` с `ROW_COUNT` сделала бы потерю видимой в логе выкатки. Пункта плана под это нет.
2. **Асимметрия чтения и записи** в `pgBroadcastDrafts.ts` (см. §4): дописывать ли
   `AND organization_id = app.current_org_id()` в `loadDraft` ради самодостаточности запроса.
3. **Тест-дубль** `inMemoryBroadcastDrafts.ts` больше не моделирует реальный ключ (см. §3).

## НЕ СДЕЛАНО

- **Прод не измерял** — запрещено и физически другой сервер. Сколько черновиков там удалит бэкфилл, я не знаю;
  вывод «на DEV/TEST удалять нечего» сделан замером обеих баз (`rows=0`), на прод не переносится.
- **Живого клика по кнопке в приложении не делал** — кандидатный `GRANT INSERT (organization_id)` на DEV не
  применён (`--execute` запрещён брифом), поэтому реальный клик упёрся бы в отсутствие права, а не в
  проверяемое поведение. Прод-форма запроса воспроизведена в SQL под ролью `app_staff` и принятым
  port-контекстом — это ближайшее, что доступно без `--execute`. По §24.7 `land-ready` живой проверкой пока
  не подтверждён.
- **Полный CI не гонял** — гонял затронутое: четыре гейт-файла миграций/доступа, webapp lint и typecheck.
- **Снимок A→B не пересобирал** — это делается после `--execute` на DEV, которого бриф не разрешает (§3).
