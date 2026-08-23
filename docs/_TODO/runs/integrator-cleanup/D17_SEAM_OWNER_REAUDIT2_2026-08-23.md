# D17 — повторный независимый аудит правки «права владельцев швов», круг 2

Объект: ветка `wt/d17-seam-owner-20260823`, исправление `ed8aaa1c1` поверх аудита круга 1 `ac1a68fa4`.
Оракул: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D17 — «узкая роль интегратора не мешает
доставке». Отчёты исполнителя и круга 1 — входные данные, доказательством не считались.
Все замеры сделаны в этом клоне на именованной `bcb_webapp_dev` транзакциями `BEGIN … ROLLBACK`.
`--execute`, TEST, PROD, push не выполнялись. Рабочее дерево после аудита чистое.

## Вердикт

**PASS, FOR LAND.**

Все три блокера круга 1 сняты, и сняты поведением, а не текстом декларации. Перепись перестала схлопывать
корни — на живом каталоге это немедленно вскрыло разрыв, который старая свёртка прятала. Блокирующих `0`.

## Что проверено и чем доказано

| Блокер круга 1 | Итог | Доказательство |
|---|---|---|
| Б1. Лишний грант на `user_channel_preferences` | ✅ снят | табличного `SELECT` нет ни в декларации, ни в обоих артефактах, ни в живом каталоге |
| Б2. Грант на `user_contacts` шире необходимого | ✅ сужен до двух колонок | свой трёхсостоянийный прогон на DEV |
| Б3. Инъекция DB-proof не различала табличный и колоночный грант | ✅ различает | отзыв ровно двух колонок краснеет; при табличном гранте тот же отзыв — не краснеет |
| Б4. Перепись схлопывала корни через `min(access_status)` | ✅ считает по корням | 1389 строк уровня корня; на DEV печатает 2 разрыва, один из них старой свёрткой был невидим |

## 1. Собственный rollback-only прогон: три состояния

Состояние роли перед прогоном обнулялось (`REVOKE ALL PRIVILEGES ON TABLE … FROM
app_seam_delivery_scope_owner` по обеим таблицам), затем накладывалась **ровно** декларация кандидата —
чтобы отставание живого каталога от артефакта не подмешалось в результат.

```
S1_full_candidate                :: {"ok": true, "muted": false, "bindings": {"telegram": "999999999999008"}, …
S2_minus_confirmed_at_is_primary :: 42501
S3_restored                      :: {"ok": true, "muted": false, "bindings": {"telegram": "999999999999008"}, …
```

Корень — `app.read_integrator_delivery_target_snapshot(uuid,text,text,text,uuid,bigint,text,timestamptz)`,
вызов из-под `app_tenant_service` с принятым port-контекстом. Разрыв ровно в двух колонках: без них корень
не исполняется, с ними исполняется, табличный грант не нужен ни в каком состоянии.

## 2. Наименьшая привилегия — замерена, а не выведена

В состоянии полного кандидата, из-под самой роли `app_seam_delivery_scope_owner`:

```
table_select_user_contacts                  :: false
table_select_user_channel_preferences       :: false
relacl_entries_for_owner                    :: <none>          -- ни одной табличной записи ACL
read_user_contacts.source_origin            :: 42501
read_user_contacts.id                       :: 42501
read_user_contacts.created_at               :: 42501
read_user_contacts.updated_at               :: 42501
read_user_contacts.confirmed_at_ALLOWED     :: READABLE
read_ucp.id / user_id / created_at / updated_at :: 42501 (каждая)
read_ucp.channel_code_ALLOWED               :: READABLE
```

То есть 16 definer-корней этого владельца снова видят в таблице контактов ровно пять колонок и в таблице
предпочтений ровно пять — цена ошибки круга 1 (чтение всех колонок обеих таблиц) возвращена к нулю.

Живой каталог DEV до правки, для сверки направления: `user_channel_preferences` уже нёс те самые пять
колонок и не нёс табличного `SELECT` — Б1 подтверждён независимо, грант там действительно был не нужен.
`user_contacts` нёс три колонки (`contact_kind, platform_user_id, value_normalized`).

Артефакты: `grep -c 'GRANT SELECT ON TABLE .* TO "app_seam_delivery_scope_owner";'` → **0** в
`privileges.bcb_webapp_dev.sql` и **0** в `privileges.bersoncarebot_test.sql`; на обеих таблицах — по одной
колоночной строке в каждом файле, списки совпадают с декларацией.

## 3. DB-proof краснеет на том, на чём должен

Новая инъекция — `REVOKE SELECT (confirmed_at, is_primary)`, табличного отзыва в тесте больше нет.
Что различает эту инъекцию, замерено обоими краями:

```
# табличный грант (форма круга 1) + новая инъекция
with_table_grant.has_table_select                          = true
with_table_grant.source_origin_readable                    = true
table_grant_then_column_revoke.confirmed_at_still_readable  = true   → тест бы ПОКРАСНЕЛ
# колоночный грант (кандидат) + старая инъекция
column_only.before_table_revoke = confirmed_at,contact_kind,is_primary,platform_user_id,value_normalized
column_only.after_table_revoke  = <none>                              → почему старая инъекция ничего не доказывала
```

Первая строка — существенная: верни кто-нибудь табличный грант, и отзыв двух колонок перестанет давать
`42501`, то есть тест станет красным. Гейт привязан именно к сужению, а не к «хоть какому-то праву».

Прогон: `RUN_D17_SEAM_OWNER_DB=1 node --test seam-owner-delivery-target.devDbProof.test.mjs` → `1/1 pass`.

Замечание без блокера: `assert.equal(generatedGrants.length, 2)` слабее прежнего `deepEqual` — форму строк
тест больше не фиксирует. Дыры это не открывает (форму ловит поведение, см. выше), но лексического стопора
на возврат табличного гранта в артефакт теперь нет.

## 4. Перепись считает по корням

`min(access_status)` убран, свёртка `rolled` заменена на построчные `requirements`. Прогон на DEV:

```
owners=43   requirements=1389   missing_or_partial=2

## root-level gaps
| app_seam_delivery_scope_owner  | app.read_integrator_delivery_target_snapshot(…) | public.user_contacts         | SELECT | missing |
| app_seam_identity_lookup_owner | app.pre_session_get_default_auth_otp_channel(uuid) | public.user_channel_bindings | SELECT | missing |
```

Что именно чинил Б4 — видно на второй строке. В группе `identity_lookup_owner | user_channel_bindings |
SELECT` **семь** корней, и только один из них читает `created_at`:

```
app.pre_session_get_default_auth_otp_channel(uuid)          cols=channel_code,created_at,user_id   ← missing
app.integrator_read_channel_binding_identity(text,text,text) cols=channel_code,display_handle,external_id,user_id
app.resolve_active_organization_for_channel_binding(text,text) …  (и ещё четыре — все direct-columns)
```

`min('direct-columns','missing')` = `direct-columns`, поэтому старая свёртка печатала группу как
удовлетворённую. Новая перепись выводит обе строки рядом прямо в сводке владельца:
`public.user_channel_bindings[direct-columns], public.user_channel_bindings[missing]`.

Арифметика пересчитана своим кодом по декларации, независимо от скрипта: 1389 строк уровня
«корень×отношение×операция», 631 после старой свёртки, **184** группы с различающимися наборами колонок —
ровно те, где свёртка могла прятать разрыв. Числа сходятся с тем, что печатает скрипт.

Оба оставшихся разрыва — отставание живого каталога DEV от артефакта, не дефект декларации: грант
`("channel_code", "created_at", "user_id")` на `user_channel_bindings` в артефакте есть
(`privileges.bcb_webapp_dev.sql:19557`), две колонки `user_contacts` — тоже. `--execute` брифом запрещён,
поэтому reconcile не гонялся; после него обе строки исчезнут.

Граница метода, названная кругом 1, в силе и этой правкой не закрывается: перепись сверяет **декларацию с
каталогом**, а класс, породивший D17, — расхождение **тела с декларацией**. Колоночного плеча у
лексического экстрактора по-прежнему нет. Это вопрос владельцу, а не работа этой ветки: строки в плане под
него нет.

## 5. Diff кандидата целиком

`git diff feat/doctor-ui-rebuild...HEAD` — 8 файлов, все D17; тип файлов не выходит за
`deploy/postgres/privileges` и `docs/_TODO/runs/integrator-cleanup`. Файлов соседней Therapysto-инициативы в
диапазоне нет — не читались и в вердикт не входят. Голова `feat/doctor-ui-rebuild` (`175310990` — та же в
исходном репозитории) является предком кандидата.

По декларации против интеграционной ветки чистая дельта — **две колонки**: `user_contacts` получает
`confirmed_at` и `is_primary`; у `user_channel_preferences` изменение чисто форматное, набор колонок тот же,
что был до круга 1.

## 6. Прогнанные проверки

| Проверка | Итог |
|---|---|
| `generate-cli.mjs --all --check` | exit 0, четыре артефакта побайтно |
| `generate-cli.mjs --all --port-context-only --check` | exit 0, два артефакта побайтно |
| `pnpm test:db-privileges` | 273 теста, `pass 162`, `fail 0`, `skip 111` (db-gated) |
| `RUN_D17_SEAM_OWNER_DB=1 node --test seam-owner-delivery-target.devDbProof.test.mjs` | `1/1 pass` |
| `seam-owner-access-census.mjs --db bcb_webapp_dev` | 43 владельца, 1389 требований, 2 разрыва с именами корней |

Full CI не гонялся: scope локальный (декларация прав + два артефакта + скрипт переписи + один DEV-тест),
repo-level риска нет, брифом не требовался.

## Что НЕ сделано

- `--execute` / reconcile на DEV — запрещён брифом; поэтому два разрыва переписи на живом каталоге остаются
  и после этого аудита. Оба закрываются штатным reconcile, продуктовой правки не требуют.
- TEST, PROD, push — не выполнялись.
- Продуктовых правок аудитор не вносил. Временных инъекций в репозиторий не делал: все инъекции жили внутри
  rollback-only транзакций на DEV. `git status` пуст.
- Колоночное плечо лексического экстрактора (гейт «тело ⊆ декларация» по колонкам) — вопрос владельцу из
  круга 1, в план не внесён, работой не становится.
