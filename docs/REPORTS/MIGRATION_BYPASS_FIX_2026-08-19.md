# Четыре обхода правила порядка миграций — закрыты

Ветка `wt/migration-bypass-20260819`, поверх `982fd2b10` (`feat/doctor-ui-rebuild`). Вход — вердикт
FAIL в [`MIGRATION_ORDER_AUDIT_2026-08-19.md`](MIGRATION_ORDER_AUDIT_2026-08-19.md) и строка
`wt/migration-order-20260819` в `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`.

Правило само по себе аудит признал закрытым. Здесь закрыты ровно перечисленные там способы обойти его
из самого репозитория. Ни одного пункта сверх списка не заводилось.

**Проверено на живой DEV-базе `bcb_webapp_dev` с откатом и побайтной сверкой; ПРОД не трогался ни в
каком виде.** Локальный `bersoncarebot_test` — только чтение (78 проб, все `t`). Живой
`test.bersoncare.ru` не трогался.

---

## Что теперь стоит вместо дыр

Одно новое правило, третье в том же модуле `deploy/postgres/privileges/migration-order.mjs`:

> **Каждая миграция обязана оставить проверяемый след.** Либо объект в каталоге, который она создала и
> следующие не снесли, либо явную пробу `-- BCB-MIGRATION-VERIFY: SELECT …` в шапке файла. Миграция без
> того и другого не принимается ни гейтом, ни прогонщиками.

Это и есть ответ на «не сужая до функций»: проба — обычный `SELECT`, возвращающий boolean, поэтому
чистый backfill доказывает себя внесённой строкой, уборка — отсутствием остатка, правка ограничения —
телом ограничения. Раньше «применено» проверялось только у тех 42 миграций из 50, чей объект умеет
назвать классификатор.

---

## 1. `db:migrate:drizzle` и `db:seed-drizzle-meta`

**Чем закрыт.** Оба скрипта в `apps/webapp/package.json` заменены на
`scripts/refuse-retired-migration-shortcut.mjs`: печатает, ПОЧЕМУ команда снята и какой маршрут её
заменяет (`migrate-dev.sh --execute`, `deploy-test.sh <branch>`, `pnpm run migrate`), выходит с 1.
`apps/webapp/scripts/seed-drizzle-migrations-meta.mjs` удалён — он писал строки «применено» вообще без
выполнения SQL, то есть был подделкой леджера, оформленной командой.

Снятого package.json-скрипта мало: `drizzle-kit migrate` звался и напрямую (`pnpm exec drizzle-kit
migrate`, так он и стоит в `docs/archive/.../AUDIT_STAGE_A.md`). Поэтому дверь закрыта там, куда
приходит ЛЮБОЙ вызов drizzle-kit — в `apps/webapp/drizzle.config.ts`: подкоманды `migrate` и `push`
отказывают на загрузке конфига. `generate`, `introspect` и `check` работают как работали (проверено:
`drizzle-kit check` → `Everything's fine`).

**Кто ещё их звал.** Ни CI, ни deploy, ни один `.sh`/`.mjs` — проверено `grep` по всему репозиторию.
Ссылки нашлись только в документации: живые `AGENTS.md` §«New entities use Drizzle ORM» и
`docs/RULES/TREATMENT_PROGRAM_EXECUTION_RULES.md` переведены на санкционированный маршрут тем же
коммитом; `docs/archive/**` — исторические записи, не трогались.

**Тест.** Живой прогон: `pnpm --dir apps/webapp run db:seed-drizzle-meta` → отказ + `ELIFECYCLE
Command failed with exit code 1`; `pnpm exec drizzle-kit migrate` → отказ из конфига.

## 2. Ручная строка леджера у миграции без «видимого» объекта

**Чем закрыт.** Правилом «каждая миграция оставляет след» (выше). Восьми миграциям, которые аудит
назвал невидимыми, дописаны пробы `-- BCB-MIGRATION-VERIFY:` — по одной, в шапку файла:

| миграция | чем доказывает, что выполнялась |
|---|---|
| `0000_b0_baseline` | `public.webapp_schema_migrations` больше нет |
| `0002_…slot_snapshot_settings` | функция `app.read_current_patient_booking_slot_snapshot(uuid,uuid,text,text)` есть |
| `0010_…staff_notification_profiles` | функция `app.read_current_patient_staff_notification_profiles(uuid,text)` есть |
| `0014_…rating_capabilities` | функция `app.record_current_patient_practice_completion(uuid,text,integer)` есть |
| `0028_port_context_rows_die_…` | закрытых контекстов в `app_ext.accepted_port_contexts` не осталось |
| `0034_a_new_clinic_needs_a_reference_catalog_…` | строка `reference_catalog_baselines` версии 2 внесена |
| `0036_the_content_argument_cannot_survive_…` | `jsonb`-варианта `app.enqueue_outbound_message` нет, `text`-вариант есть |
| `0044_a_link_to_a_video_host_…` | ограничение `lfk_exercise_media_media_type_check` содержит `hosted_video` |

Проба читается ТОЛЬКО из ведущего блока комментариев файла — всё, что ниже, может быть телом
`CREATE FUNCTION`, и миграция не должна уметь объявить себе доказательство из собственного строкового
литерала. Проба обязана быть одним `SELECT` без `;` и без комментария (иначе она разорвала бы
объемлющий statement); это проверяется при чтении.

Отказ стоит и в гейте (`check-drizzle-migration-order.sh` → `--check-migration-proofs`), и в ОБОИХ
прогонщиках перед выходом в базу: гейт бережёт репозиторий, прогонщик — базу перед собой.

**Тесты.** `migration-order.test.mjs`: проба читается только из шапки и не из тела функции; не-`SELECT`
и проба с `;`/`--` отвергаются; миграция без объекта и без пробы числится недоказанной; миграция, чей
объект переопределила следующая, тоже недоказанная (это и есть механика тех восьми).
`migrate-local.test.mjs`: дописанная строка леджера для backfill-миграции останавливает реальный
скрипт и называет её; файл без объекта и без пробы отказывается до похода в psql.

**Живой DEV (повтор T2b из аудита, который раньше проходил молча).** В отдельной копии папки миграций
(файлы репозитория не трогались) создан `0060_audit_probe_invisible.sql` — чистый backfill, никаких
объектов, — и в леджер вписана строка:

```
$ psql -c "INSERT INTO drizzle.__drizzle_migrations (hash, created_at, tag)
           VALUES (repeat('b',64), 1800000099000, '0060_audit_probe_invisible');"
INSERT 0 1
$ node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev --drizzle-folder /tmp/… --sudo-postgres
bcb_webapp_dev records 1 migration(s) as applied that the database does not answer for, …
  absent: verified state of 0060_audit_probe_invisible: SELECT EXISTS (SELECT 1 FROM public.reference_catalog_baselines WHERE version = 999)
EXIT=1
```

В аудите тот же сценарий печатал `already current … pending=0`, `EXIT=0`. Строка удалена, леджер сверен
(57 строк / 51 с tag — как до инъекции).

## 3. Дописанная строка в «замороженный» журнал

**Чем закрыт.** Заморозка сделана заморозкой: рядом с `meta/_journal.json` лежит
`meta/_journal.frozen` с дайджестом карты (sha256 по парам `when`⇥`tag`). `readLegacyJournalEntries` —
единственная точка, где карту читают оба прогонщика, — отказывает и при расхождении, и при отсутствии
пина. Отдельная карта без пина не «доверяется по умолчанию»: её тоже отказывают, иначе пин удалялся бы
так же легко, как правился журнал.

Если сведение веток правда обязано расширить карту (переходный конфликт из находки C аудита — пять
невлитых веток) — пин двигается ТЕМ ЖЕ коммитом, где его видит ревьюер. Это записано в `AGENTS.md`.

**Тесты.** `migration-order.test.mjs`: карта читается только при совпадении с пином; одна дописанная
запись отвергается; карта без пина отвергается; папка без карты пина не требует.
`migrate-local.test.mjs`: обе ситуации останавливают реальный скрипт до psql.

**Живой DEV.**
```
$ (+1 строка в meta/_journal.json копии папки) → node …/migrate-local.mjs --db bcb_webapp_dev …
the historical migration map … is not the frozen one: it digests to ebbf0720…, meta/_journal.frozen pins 13f6f507…   EXIT=1
$ (пин удалён)                                  → … has no freeze pin next to it …                                    EXIT=1
```

## 4. Находка A: `--reapply` в одиночку разоружал definer-функцию

**Чем закрыт.** `--reapply` восстанавливает объект по ФАЙЛУ миграции, а definer-функция — это ещё и шов
аттестации в теле и `EXECUTE` для вызывающей роли, и то и другое приезжает декларацией привилегий.
Поэтому `migrate-local.mjs` теперь отказывает `--reapply` без маркера `BCB_MIGRATION_ENTRYPOINT`, а
маркер выставляют только те два входа, которые гонят reconcile последним шагом. Им же добавлен разбор
`--reapply <tag>` (`deploy/host/migrate-dev.sh`, `deploy/host/deploy-test.sh`) с проверкой имени тега.
`migrate-dev.sh --preflight --reapply` отказывает отдельно: восстановление — не валидация.

Формулировка канона `AGENTS.md`, из-за которой «wrapper'ом, `--reapply <tag>`» читалось как
самостоятельная команда, переписана; сообщение самого мигратора теперь тоже называет entrypoint, а не
себя.

**Тесты.** `migrate-local.test.mjs`: голый `--reapply` отказывает, называет обе команды и не пускает
ничего в psql; штатный `--reapply` с маркером по-прежнему сносит устаревшую строку и гонит миграцию
заново.

**Живой прогон.**
```
$ node …/migrate-local.mjs … --reapply 0044_a_link_to_a_video_host_is_a_kind_of_media
--reapply rebuilds the object from the migration file alone, … without its attestation seam and without EXECUTE …
  DEV:  bash deploy/host/migrate-dev.sh --execute --reapply 0044_…
  TEST: bash deploy/host/deploy-test.sh <branch> --reapply 0044_…            EXIT=1
$ bash deploy/host/migrate-dev.sh --preflight --reapply 0044_…   FATAL: --reapply is a recovery, not a validation
$ bash deploy/host/migrate-dev.sh --execute  --reapply "; DROP TABLE x"   FATAL: --reapply tag is not a migration name
$ bash deploy/host/migrate-dev.sh --execute  --reapply 0099_not_a_file
  … integrator owner-ordered migrations current …
  --reapply names 0099_not_a_file, which is not a migration file in …/db/drizzle-migrations   EXIT=1
```
Последний прогон — сквозной: entrypoint донёс аргумент до wrapper'а, wrapper принял маркер и упёрся уже
в собственную проверку тега. Reconcile до отказа не доходил.

## 5. Находка D: второй прогонщик читал пробу позиционно

**Чем закрыт.** Разбор ответа пробы переехал в общий модуль — `interpretProofAnswers(proofs, answers)`:
сверка по индексу `at`, который несёт каждая строка, отказ при коротком, задвоенном и неизвестном
ответе. Оба прогонщика зовут одну и ту же функцию, так что разойтись им больше негде.

**Тесты.** `migration-order.test.mjs`: перемешанный ответ не превращает отсутствующий объект в
присутствующий; короткий/задвоенный/неизвестный — отказ. `migrate-local.test.mjs`: то же на реальном
скрипте через подменный `psql`, который отдаёт строки в обратном порядке и который роняет одну строку.
`run-webapp-drizzle-migrate.mjs --self-test` покрывает ту же ветку у второго прогонщика.

**Живой DEV — второй прогонщик тоже краснеет.** Ограничение, которым доказывает себя `0044`,
переименовано (`RENAME` сохраняет oid, тело и владельца — точный откат):
```
$ psql -c "ALTER TABLE public.lfk_exercise_media RENAME CONSTRAINT lfk_exercise_media_media_type_check TO _audit_probe_20260819;"
$ node deploy/postgres/privileges/migrate-local.mjs --db bcb_webapp_dev …
  absent: verified state of 0044_a_link_to_a_video_host_is_a_kind_of_media: …   EXIT=1
$ DATABASE_URL=postgresql:///bcb_webapp_dev … node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs
[migrate] migration_ledger_answers_for_absent_objects verified state of 0044_a_link_to_a_video_host_is_a_kind_of_media: …   EXIT=1
```
Это миграция, которую СТАРЫЙ гейт не видел вовсе (одна из восьми). Инъекция откачена, состояние
совпадает побайтно:

| | до | после |
|---|---|---|
| oid ограничения | 3235291 | 3235291 |
| md5(`pg_get_constraintdef`) | 18d610fb09391ebf32a00065e861c57c | 18d610fb09391ebf32a00065e861c57c |
| строк в леджере | 57 (51 с tag) | 57 (51 с tag) |
| прогон wrapper'а | `pending=0 total=50 verified-proofs=78 foreign-ledger-rows=7` | тот же |

---

## Находка B (охват гейта) — входит в те же строки, частично

Аудит разделил её на две половины, и они закрыты по-разному.

- **«Восемь миграций не дают гейту ни одного объекта»** — та же строка, что и обход №2, и закрыта
  вместе с ним: теперь их восемь проб, и ни одна новая миграция не может повторить эту форму (гейт
  отказывает миграции, которая не оставляет ни объекта, ни пробы). Замер после правки: 50 миграций
  дают **78** проверяемых пунктов вместо 70 — 70 объектов и 8 проб, ноль недоказанных.
- **«Гейт проверяет существование объекта по имени, а не его тело»** — НЕ закрыта и в эти строки не
  входит. Разошедшееся тело definer-функции (случай находки A) — это предмет декларации привилегий и её
  reconcile, а не леджера миграций: тело функции здесь штатно отличается от файла миграции ровно на шов
  аттестации, поэтому сверять тело с файлом было бы неверно по построению. Отдельной задачей не
  завожу — это вопрос владельцу/ведущему, а не находка, из которой сама собой следует работа.

## Находка C (переходный конфликт `when` у пяти невлитых веток) — не в этих строках

Аудит поднял её как вопрос ведущему и задачи не заводил; здесь она тоже не решается. Что изменилось:
раньше расширение карты проходило молча, теперь оно упирается в пин и требует явного движения пина тем
же коммитом. Порядок сведения пяти веток по-прежнему решает владелец/ведущий.

---

## Зелёные гейты

```
$ node --test deploy/postgres/privileges/{migration-order,migrate-local,migrate-local-parse}.test.mjs
# tests 44 · # pass 44 · # fail 0                       (было 26 на 982fd2b10; +18)
$ node --test deploy/postgres/privileges/function-census.test.mjs      # tests 19 · pass 19
$ pnpm --dir apps/webapp run lint                                      # eslint + 9 структурных гейтов: OK
$ pnpm --dir apps/webapp exec tsc --noEmit -p tsconfig.json            # EXIT=0
$ bash apps/webapp/scripts/check-drizzle-migration-order.sh            # OK (+ migration proof check: OK)
$ node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs --self-test  # OK
```

### Инъекции в собственный код: каждый тест краснеет там, где он обязан

Проверено ПОСЛЕ коммита правок, каждая инъекция откатана:

| что сломано | что покраснело |
|---|---|
| `interpretProofAnswers` читает ответ позиционно | 4 теста (перемешанный ответ, короткий ответ — в обоих файлах) |
| `readLegacyJournalEntries` не сверяет пин | 4 теста (дописанная запись, удалённый пин — в обоих файлах) |
| `readVerifyProbes` всегда возвращает пусто | 12 тестов |
| снят гейт `BCB_MIGRATION_ENTRYPOINT` | 1 тест (голый `--reapply`) |
| всё возвращено | 38 / 38 зелёные |

---

## НЕ СДЕЛАНО

1. **Настоящий TEST-хост.** Проверен локальный `bersoncarebot_test` на этом боксе — только чтение: все
   78 проб отвечают `t`. Живой `test.bersoncare.ru` (старый бокс 151.x) и `deploy-test.sh` на нём не
   запускались. Пассаж `--reapply` в `deploy-test.sh` разобран и синтаксически проверен (`bash -n`), но
   вживую на TEST не гонялся — гонять деплой TEST ради этого я не стал.
2. **ПРОД** — не трогался: ни чтения, ни подключения.
3. **`--reapply` до конца, с reconcile.** Сквозной прогон доказан до точки отказа wrapper'а (тег не
   существует); успешный `--reapply` реальной миграции с последующим reconcile на DEV не гонялся —
   это полный цикл выкатки DEV, и для доказательства маршрута он не нужен.
4. **Находка B, вторая половина** (гейт не сверяет ТЕЛО функции) — сознательно не закрыта, см. выше.
5. **Находка C** (порядок сведения пяти невлитых веток) — не решается здесь, ждёт владельца/ведущего.
6. **`pnpm test` webapp (vitest)** не гонялся: правки не касаются кода приложения — только миграционных
   прогонщиков, их гейтов и заголовков миграций. Гонялись `node --test` по затронутым модулям, полный
   `lint` и полный `tsc`.
7. **Проба `0028`** (`закрытых контекстов не осталось`) верна на обеих базах сегодня и следует из нового
   контракта port-context (строка умирает на COMMIT своей транзакции). Отдельного стресс-прогона, что
   она не даст ложный отказ под нагрузкой, не делалось.
8. **Обход через собственно `psql`** остаётся возможным для того, у кого есть суперпользователь: он
   может вписать строку и подделать состояние, которое проверяет проба. Закрыты те двери, что лежали
   в самом репозитории; дверь «суперпользователь делает руками всё что угодно» не закрывается кодом.
