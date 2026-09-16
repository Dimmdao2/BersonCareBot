# Т12 — миграция 0050 доехала до DEV: закрытие F1

Продолжение `docs/REPORTS/PATIENT_COUNT_REMOVAL_AUDIT_2026-08-19.md` (F1, БЛОКЕР). Единственная задача этого
хода — закрыть F1 и ничего кроме него: миссия — `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`
(строка вердикта `wt/drop-patient-count-20260819`) + сам аудит-отчёт.

## Что изменилось со времени аудита

Аудит F1 писал про водяной знак `when` — это была верная диагностика ТОГДА, но между аудитом (коммит
`15a952461`) и этим ходом ветка приняла merge `feat/doctor-ui-rebuild` (коммит `5f0475483`), который
принёс `982fd2b10` — новый порядок миграций: **порядок = имя файла, «применено» = строка леджера с этим
именем (колонка `tag`), а не водяной знак** (`deploy/postgres/privileges/migration-order.mjs`). Оба
прогонщика (`migrate-local.mjs`, `run-webapp-drizzle-migrate.mjs`) уже читают только этот модуль — второго
механизма я не изобретал, работал внутри него, как и просил бриф.

Под новым механизмом `when` из `meta/_journal.json` не задаёт ни порядок, ни «применено» — он используется
**один раз** при бутстрапе леджера, чтобы проставить `tag` строкам, у которых он ещё `NULL` (легаси-строки
до появления колонки `tag`), по карте `when → tag` из журнала. Именно тут и была настоящая, актуальная форма
F1: у файла `0050_a_clinic_is_billed_for_seats_not_for_people.sql` в журнале стоял `when=1800000052000` —
слот, который на DEV уже занимала ЧУЖАЯ, ранее применённая миграция (леджер id=564, hash
`786853cc2679fd81…`, файл нашей миграции имеет hash `aaf78837…` — не совпадает). Бутстрап леджера
(`renderLedgerBootstrapSql`) при каждом прогоне сопоставлял `created_at=1800000052000` этой чужой строки с
нашим `tag` по журналу и **проставил ей чужое имя** — леджер стал ЛОЖНО утверждать, что наша миграция
применена, хотя реально применился чужой SQL. Проверено прямым чтением леджера ДО правки:

```
$ sudo -u postgres psql -d bcb_webapp_dev -c "select id, hash, created_at, tag from drizzle.__drizzle_migrations
    where tag like '0050%' or created_at between 1800000051000 and 1800000053000 order by created_at;"
 id  |  hash (сокр.)  |  created_at   |  tag
-----+----------------+---------------+-----------------------------------------------
 593 | 38625073…      | 1800000051000 | 0047_the_opening_door_did_not_learn_the_new_alarm_words
 564 | 786853cc…      | 1800000052000 | 0050_a_clinic_is_billed_for_seats_not_for_people   ← чужой hash, наше имя
 587 | ba4a6912…      | 1800000053000 | (пусто)
 600 | 7f78a9b9…      | 1800000071000 | 0050_a_seat_invoice_is_not_cancelled_it_is_reissued ← ветка wt/invoice-reissue, своё имя, коллизии с нами нет
```

Данные на DEV это подтверждают: `select quotas ? 'patient_count', count(*) from saas_tariffs group by 1` →
`f|7, t|1` — тариф-разработчик с `patient_count` в `quotas` всё ещё был на месте, ровно как в аудите.

Второе следствие того же дефекта: `meta/_journal.json` для новых пост-механизменных миграций — не
обязателен (тест `migration-order.test.mjs`: «a folder without the historical journal still bootstraps»),
но если запись всё же есть, а её `when` попадает на уже занятый чужой слот, бутстрап каждый раз тихо портит
леджер заново. Запись у `0050` была синтетической (сгенерирована при создании файла в этой ветке), а не
исторической — миграция никогда не применялась под старым механизмом, значит эта запись вообще не должна
была указывать на реальный занятый слот.

## Фикс

1. **Переименован файл** (пока не применён нигде под новым именем — переименование разрешено, AGENTS.md §1):
   `0050_a_clinic_is_billed_for_seats_not_for_people.sql` →
   `0054_a_clinic_is_billed_for_seats_not_for_people.sql`. Номер `0054` выбран проверкой всех живых
   worktree на 19.08 (`0050` занят трижды — этой веткой, `wt/invoice-reissue-20260819`,
   `wt/media-worker-root-20260819`; `0051-0053` заняты `wt/public-booking-write-20260819`) —
   `0054` свободен везде. Внутренний комментарий `TEMPORARY LOCAL MIGRATION NUMBER` обновлён на `0054` и
   дополнен ссылкой на этот отчёт (сам комментарий не несёт механической нагрузки — в репозитории уже есть
   файлы с чужим номером в этом комментарии, например `0032`/`0035`/`0045`/`0046`, это просто заметка).
2. **Обновлена запись в `meta/_journal.json`**: `tag` → `0054_a_clinic_is_billed_for_seats_not_for_people`,
   `when` → `1800000090000` — с запасом выше максимума `created_at`, который на момент фикса реально
   держали ОБЕ базы (DEV `1800000071000`, TEST `1800000051000`; см. «Почему это безопасно»). Запись не
   удалена (репозиторий держит по записи на файл), но новый `when` не совпадает ни с одной существующей
   строкой леджера ни на одном стенде — значит бутстрап не тронет ни одну чужую строку.
3. **`docs/OWNER_DECISIONS.md`** (канонический оракул, живая ссылка, не историческая запись) — имя файла
   миграции в тексте Т12 поправлено на `0054_…` с пометкой о переименовании и ссылкой сюда. Отчёты
   `PATIENT_COUNT_REMOVAL_AUDIT_2026-08-19.md` и `PATIENT_COUNT_LIMIT_REMOVAL_2026-08-19.md` **не
   правились** — это исторические записи о том, что было верно на момент их написания.

## Почему это безопасно

- Старая (испорченная) строка леджера id=564 на DEV остаётся с чужим `tag`
  `0050_a_clinic_is_billed_for_seats_not_for_people` навсегда — `bootstrapLedger` трогает только строки с
  `tag IS NULL`, уже проставленный (пусть и ошибочно) тег не переписывает. После переименования эта строка
  становится «чужой» (`findForeignLedgerRows`) — учитывается счётчиком `foreign-ledger-rows`, не ошибка.
  Она не отвечает больше ни за какой файл в каталоге — ни наш новый `0054`, ни чей-либо ещё.
- Новый `tag` `0054_a_clinic_is_billed_for_seats_not_for_people` не встречается ни в одной строке леджера
  ни на DEV, ни на TEST (проверено `SELECT` ниже) — значит `selectPendingMigrations` увидит её как
  обычную pending-работу, что и требовалось.
- TEST (`bersoncarebot_test`) — на этом же хосте, тот же локальный PostgreSQL:
  ```
  $ sudo -u postgres psql -d bersoncarebot_test -c "select max(created_at) from drizzle.__drizzle_migrations;"
  1800000051000
  $ sudo -u postgres psql -d bersoncarebot_test -c "select * from drizzle.__drizzle_migrations
      where tag like '0050%' or tag like '0054%' or created_at between 1800000051000 and 1800000091000;"
  (0 строк с 0050/0054; единственная строка в диапазоне — 0047 на 1800000051000, наша не пересекается)
  ```
  Новый `when=1800000090000` выше максимума TEST и ни с чем не совпадает — тот же класс дефекта там не
  повторится, когда TEST будет обновлён обычным деплоем.

## Прогон через санкционированный DEV wrapper (`deploy/host/migrate-dev.sh`)

**До фикса**, `--preflight` (rollback-only) молчал про `0050` вовсе:
```
Drizzle owner-ordered migration already current for "bcb_webapp_dev": pending=0 total=51 verified-objects=70 foreign-ledger-rows=6
```

**После переименования**, `--preflight` увидел ровно 1 pending и реально прогнал все три шага миграции
внутри отдельной ROLLBACK-транзакции (UPDATE/DELETE/CREATE FUNCTION видны в выводе):
```
$ bash deploy/host/migrate-dev.sh --preflight
...
UPDATE 1
...
DELETE 1
...
CREATE FUNCTION
...
ROLLBACK
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": pending=1 total=51 reapplied=0 foreign-ledger-rows=7
migrate-dev preflight: PASS (post-cutover DEV; rollback-only webapp DDL validation complete)
```

**`--execute`** — реальный прогон, коммит (сама Drizzle-часть цепочки; см. «НЕ СДЕЛАНО» про хвост
`reconcile-access`):
```
$ bash deploy/host/migrate-dev.sh --execute
...
Drizzle owner-ordered migration already current for "bcb_webapp_dev": pending=0 total=51 verified-objects=70 foreign-ledger-rows=7
```
(второй прогон уже внутри того же вызова, отчёт «pending=0» получен ДО последующего шага reconcile.)

**Данные ДО и ПОСЛЕ, прямым чтением каталога** (не заявление, факт):
```
ДО:
 has_patient_count | count      overrides mechanic='patient_count'
--------------------+------      --------------------------------
 f                  | 7                       1
 t                  | 1

ПОСЛЕ:
 has_patient_count | count      overrides mechanic='patient_count'
--------------------+------      --------------------------------
 f                  | 8                       0
```

**Леджер после `--execute`:**
```
$ sudo -u postgres psql -d bcb_webapp_dev -c "select id, hash, created_at, tag from drizzle.__drizzle_migrations where tag like '0054%';"
 id  | hash (сокр.) | created_at    | tag
-----+--------------+---------------+---------------------------------------------------
 603 | d6b739a9…    | 1800000072000 | 0054_a_clinic_is_billed_for_seats_not_for_people
```

**Второй прогон `--preflight` после `--execute` — ничего не осталось pending** (требование брифа «второй
прогон должен доложить об отсутствии pending»):
```
$ bash deploy/host/migrate-dev.sh --preflight
Drizzle owner-ordered migration already current for "bcb_webapp_dev": pending=0 total=51 verified-objects=70 foreign-ledger-rows=7
migrate-dev preflight: PASS (post-cutover DEV; rollback-only webapp DDL validation complete)
```

**Функция `app.resolve_organization_mechanic_access` — новое тело реально стоит в каталоге:**
```
$ sudo -u postgres psql -d bcb_webapp_dev -c "select prosrc from pg_proc where proname='resolve_organization_mechanic_access';" | grep "ARRAY\['files'"
 WHEN p_mechanic = ANY (ARRAY['files', 'branches']) THEN true
```
(без `patient_count` в списке — ровно то, что миграция обещает шагом 3).

## Гейты

| Гейт | Команда | Результат |
|---|---|---|
| Порядок миграций (статический) | `bash apps/webapp/scripts/check-drizzle-migration-order.sh` | OK |
| Права в миграциях | `node scripts/check-migration-privileges.mjs` | OK (52 файла) |
| Юнит-тесты модуля порядка | `node --test deploy/postgres/privileges/migration-order.test.mjs` | 11/11 зелёные |
| Юнит-тесты DEV/TEST-wrapper | `node --test deploy/postgres/privileges/migrate-local.test.mjs` | 9/9 зелёные |
| DEV wrapper, rollback-only | `bash deploy/host/migrate-dev.sh --preflight` | pending=1→0 (до/после `--execute`) |
| DEV wrapper, реальный прогон | `bash deploy/host/migrate-dev.sh --execute` | Drizzle-цепочка закрыта (`pending=0`); см. «НЕ СДЕЛАНО» про хвост reconcile |

## НЕ СДЕЛАНО

1. **`--execute` не дошёл до конца из-за постороннего сбоя, не связанного с F1.** После того, как
   Drizzle-миграция (наш скоуп) применилась и закоммитилась, тот же вызов `migrate-dev.sh --execute`
   падает позже, на шаге `reconcile-access.mjs`, с `function census catalog mismatch` на функциях
   `app.assert_org_patient_count_quota_available`, `app.claim_media_transcode_job`,
   `app.enroll_current_patient_in_public_booking_clinic`, `app.resolve_public_booking_client_by_phone`,
   `app.revoke_public_booking_enrollment`, `app.read_media_transcode_job_media`,
   `app.record_media_transcode_job_outcome`, `app.release_carried_seat_debt` — все эти функции живут в
   каталоге DEV, но ни одна не создана файлами ЭТОЙ ветки (в её `db/drizzle-migrations` их нет вовсе;
   `grep` по всему репозиторию этой ветки тоже пуст). Это результат того, что DEV — общая база: другие
   параллельные worktree (media-worker-root, public-booking-write, seat-invoice и т.п.) уже накатили свои
   миграции на тот же DEV напрямую, а декларации привилегий под их функции в ЭТОЙ ветке не сгенерированы
   и генерироваться не должны — это не её код. Чинить это значило бы тянуть в скоуп F1 чужие ветки, чего
   бриф не просил (правило «аудит/бриф — не источник нового скоупа»); это должен разрешить лид на
   `feat`/интеграционном дереве, где все миграции сойдутся вместе, а не в изолированном worktree одной
   ветки. Оставляю как открытый факт, не мой fix.
2. **TEST (`bersoncarebot_test`) миграция реально НЕ прогнана** — только прочитан леджер (см. «Почему это
   безопасно»): коллизии нет, новый tag/when свободны. Полный `deploy-test.sh` — тяжёлая операция с общим
   риском (по канону репо она может окирпичить окружение при частичном деплое чужого кода) и сама миссия
   называет только DEV wrapper как «санкционированный» для прогона; аудит тоже явно отложил проверку TEST
   «перед сведением в feat» — это шаг лида на интеграционном дереве, не этой изолированной ветки.
3. **Полный `pnpm ci` не гонялся повторно** — предыдущий полный прогон (lint+typecheck+test:webapp) аудита
   от 19.08 уже зелёный и не затронут этим фиксом (правки — только миграционный файл, журнал, один
   абзац в `docs/OWNER_DECISIONS.md`; продуктовый код не менялся). Прогнаны только целевые гейты выше.
4. **F2/F3 из аудита** (устаревший комментарий про «специалисты, филиалы и пациенты»; мёртвый файл
   `stockQuotaCheck.ts`) — вне скоупа этого хода (миссия: «Close F1 and nothing else»), не трогал.
5. **Открытый вопрос владельцу из аудита** (клиника в рунге «только чтение» заводит клиентов) — тоже вне
   скоупа F1, не мой ход отвечать; аудит уже сформулировал вопрос.
