Исправлено и закоммичено: `c77987aba` (без push).

- Было: usage-проекция вызывала удалённую в `0275` CMS-функцию, из-за чего платформа теряла и счётчик занятых мест.
- Изменено: [pgOrgEntitlements.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:227) теперь запрашивает только действующую проекцию и сохраняет `clinic_team`; удалён устаревший `cmsPagesUsageSql.ts`.
- Защита: [pgOrgEntitlements.test.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].test.ts:14) проверяет возврат `clinic_team: 3` при отсутствующей CMS-функции.

Поиск того же паттерна: runtime-ссылок больше нет. Найдены только два исторических private-Postgres race-script’а для старых CMS/course trigger-функций; они извлекают и создают их во временном кластере, не вызывая объекты после `0275`, поэтому не менялись.

Проверки:

- `pnpm --filter webapp typecheck` — PASS
- `pnpm --filter webapp lint` — PASS
- Целевой Vitest, 1 файл / 1 тест — PASS

Ручная регрессия: временно вернул CMS SQL-вызов; целевой тест упал с `function app.cms_pages_snapshot_usage(uuid) does not exist`. Затем вызов восстановленно удалён.

Примечание: первая попытка передать путь через package-script выбрала 27 fast-файлов (115 passed, 3 skipped), не полный CI; затем выполнен точный запуск одного затронутого файла. Нерелевантные изменённые env-example файлы в дереве не трогал.