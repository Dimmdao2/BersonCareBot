# Независимый адверсарный аудит: удаление безтеговой сироты леджера DEV (2026-08-20)

Предмет: коммит `ec02c4e3d` — новый ключ обёртки `deploy/postgres/privileges/migrate-local.mjs`
`--drop-foreign-hash`, снимающий чужую строку леджера `drizzle.__drizzle_migrations` с `tag IS NULL`,
и его живое применение на DEV (`bcb_webapp_dev`) к строке `id=598, tag IS NULL,
hash=c13927102c549a4d9bfa74f6c600471d1583ee55534217905071fb110acf5124`.

Аудитор: Opus 4.8, независимый. Работу делал другой агент (codex gpt-5.6-terra); его отчёт
`docs/REPORTS/LEDGER_ORPHAN_NULL_TAG_2026-08-20.md` рассматривался как заявка, не доказательство.
Проверял чтением дерева, git-сверками, инъекцией в реализацию с откатом и read-only-прогонами против
`bcb_webapp_dev`. Полный `pnpm run ci` не запускался (запрещён брифом). ПРОД не трогался.

## Таблица доказательств

| Утверждение | Команда | Вывод | Вердикт |
| --- | --- | --- | --- |
| **(1) Удаление НЕ обошло обёртку.** Коммит не несёт ручного `DELETE`/`UPDATE` по леджеру мимо `migrate-local.mjs`. | `git show --name-only --format="" ec02c4e3d` ; `git show ec02c4e3d \| grep -nE "^\+" \| grep -iE "DELETE FROM\|UPDATE .*drizzle_migrations"` | Тронуты ровно 3 файла: `migrate-local.mjs`, `migrate-local.test.mjs`, отчёт. Ни SQL-файла, ни shell-скрипта. Единственные добавленные `DELETE` — (а) внутри обёртки, (б) в тесте, ассертящем именно её. Сырого DML мимо обёртки нет. | PASS |
| **(1b) Сам DELETE узко адресован** (id + `tag IS NULL` + полный 64-симв. хеш), а не «удалить всё безтеговое». | чтение `migrate-local.mjs:305` | `DELETE FROM drizzle.__drizzle_migrations WHERE id = ${row.id} AND tag IS NULL AND hash = ${sqlLiteral(hash)};` — тройное пиннингование конкретной строки. | PASS |
| **(2a) Предохранитель «файл ещё держит этот хеш» реален** (переименование ОТКАЗЫВАЕТ, а не удаляется) — доказано инъекцией. | `if (claimant)` → `if (false && claimant)` в ветке `--drop-foreign-hash`, затем `node --test deploy/postgres/privileges/migrate-local.test.mjs` | `EXIT=1`; `not ok 22 - drop-foreign-hash refuses a tagless row whose hash a file in this folder still claims` (regex `this is a rename, not a dead row` не совпал). Инъекция откатана. | PASS |
| **(2b) DELETE-пиннинг реален** (нельзя расширить операцию за пределы осмотренной строки) — доказано инъекцией. | DELETE ужат до `WHERE hash = …` (снят `id`+`tag IS NULL`), затем `node --test …migrate-local.test.mjs` | `EXIT=1`; `not ok 21 - drop-foreign-hash deletes one tagless foreign row by its observed hash` (regex точного узкого DELETE не совпал). Инъекция откатана. | PASS |
| **(2c) Несуществующая цель и цель вне `--drizzle-folder` ОТКАЗЫВАЮТ** — покрыто зелёными тестами, чья небессодержательность доказана инъекциями (2a/2b). | `node --test migrate-local.test.mjs migration-order.test.mjs migrate-local-parse.test.mjs` (отдельная строка кода выхода) | `EXIT=0`; 55 pass / 0 fail. Тесты `…refuses a hash that names no tagless foreign row` и `…refused without --drizzle-folder` зелёные. | PASS |
| **(3) Строка была действительно ЧУЖОЙ** — её удаление не «забыло» применённую миграцию. | `git log --all --oneline -S'<full hash>'` ; SHA-256 каждого из 58 файлов папки против хеша | В истории хеш появляется только в `ec02c4e3d` и `230a2494f` (снимок леджера A→B, чьё сообщение прямо называет «одна известная инертная сирота»). Ни один файл миграции не даёт этот хеш (скан 58 → 0 совпадений). Хеш 64-символьный (формат настоящей drizzle-строки), но контенту ни одного файла не принадлежит → не применённая миграция и не переименование. | PASS |
| **(3b) Ничего не забыто по факту схемы** (если бы это была реальная миграция — не хватало бы объекта). | preflight (ниже): `verified-objects=90`, `pending=0` | Все объекты применённых миграций на месте, pending=0. Удаление сироты выровняло леджер (58) с числом файлов (58). | PASS |
| **(4a) Живое состояние DEV зелёное.** | `cd /home/dev/dev-projects/BersonCareBot && bash deploy/host/migrate-dev.sh --preflight > log 2>&1; echo PREFLIGHT_EXIT=$?` (код — отдельной строкой) | `PREFLIGHT_EXIT=0`; `pending=0 total=58 verified-objects=90 foreign-ledger-rows=0`; `migrate-dev preflight: PASS`. | PASS |
| **(4b) Исчезла ровно id=598, прочие строки целы.** | `sudo -n -u postgres psql -X … bcb_webapp_dev -tAc "…count(*)…; …count(*) where tag is null…; …max(id) where id=598…"` (READ ONLY) | Всего строк `58` (было 59); безтеговых `0`; `id=598` отсутствует (`-1`). Убыло ровно 1, ровно нужная. | PASS |
| **(6) Границы целы: рантайм-роли не расширены.** | `git show ec02c4e3d \| grep -inE "create role\|alter role\|grant\|revoke\|bypassrls\|createrole"` по добавленным строкам | Совпадений 0. Ни `CREATE ROLE`/`GRANT`/`REVOKE`/`BYPASSRLS`/`ALTER ROLE`. | PASS |
| **(6b) TEST/PROD/история не тронуты.** | `git show --name-only` + чтение отчёта/дерева | Изменения DEV-скоупа: обёртка параметризована `--db`, вызов был `--db bcb_webapp_dev`. В диффе нет упоминания `bersoncarebot_test`, ПРОД, ни новых миграционных файлов (папка осталась 58) — семейство A0/A1/greenfield и историческая цепочка не восстанавливались. `bersoncarebot_test` (где работает другой агент) я не трогал. | PASS |
| **(5b) Дерево чисто после инъекций.** | `git checkout … && git status --short` | Пусто; повторный `node --test migrate-local.test.mjs` → 29/29 зелёные. Обе инъекции откатаны, наведённых изменений нет. | PASS |

## Замечания (НЕ дефекты, вынесены как наблюдения, работой не становятся)

- Отчёт подсудимого точен по существу во всех проверенных пунктах; расхождений заявки с реальностью не
  найдено. Строка в его таблице «`foreign-ledger-rows=1`» относится к пред-удаляющему снимку внутри той
  же транзакции — это не остаточная сирота, а число ДО DELETE; пост-состояние `0` подтверждено отдельно.
- `--drop-foreign-hash` дублирует бóльшую часть гардов `--drop-foreign` (существование, чуждость,
  отсутствие файла-претендента), добавляя адресацию по полному хешу и пиннинг `id`/`tag IS NULL` в DELETE.
  Дублирование поверхности минимально и оправдано — это не расширение прав, а сужение операции.

## Вердикт: PASS

Все шесть пунктов порядка владельца подтверждены независимо, блокеров нет. Удаление выполнено
санкционированной обёрткой, узко адресовано и покрыто тестами, чья небессодержательность доказана двумя
fault-инъекциями (гард переименования и пиннинг DELETE — оба обязаны краснеть и краснеют). Строка была
подлинно чужой (ни один файл не даёт её хеш; в истории — только снимки леджера). Живой DEV зелёный
(`pending=0 total=58 verified-objects=90 foreign-ledger-rows=0`), исчезла ровно `id=598`, счётчик упал
59→58. Права не расширены, TEST/PROD/история не тронуты, дерево после аудита чисто.

Проверенные sha: предмет `ec02c4e3d`; происхождение хеша — снимок `230a2494f`.
