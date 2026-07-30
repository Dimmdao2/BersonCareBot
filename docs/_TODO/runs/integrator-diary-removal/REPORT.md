## ИТОГ

Полностью удалён in-bot diary/LFK-контур интегратора. Коммит: `249878ef9` (`#987`), без push/merge.

- Удалены `writeDiaryLfkDirect.ts` и его тест, четыре writer-функции и четыре write-action.
- Удалены executor-ветки симптомов/ЛФК, callback parsing, diary-list API, контракты и `webappDiaryUrl`.
- Удалены 15 Telegram- и 17 MAX-сценариев, ключ `diary` обоих меню, 19 Telegram- и 20 MAX-шаблонов.
- D2-гранты на `symptom_*`/`lfk_*` заменены на `REVOKE`.
- Webapp diary/LFK не затронут.
- Lifecycle-door сохранён.
- Общие resolver’ы перенесены в [resolveDirectPublicActor.ts](/home/dev/dev-projects/bcb-wt-[redacted-token].ts) и переведены на Drizzle. Support/reminder writer’ы изменены только для нового импорта.

Проверка удаления:

- четыре writer-функции: 0 совпадений;
- четыре write-action: 0;
- diary/LFK actions, callbacks, `nav.webapp.diary`, `webappDiaryUrl`, list-read методы: 0;
- diary-сценарии Telegram/MAX: `0 / 0`;
- ключи обоих меню: только `["main"]`.

Теперь ни Telegram, ни MAX не имеют входа в дневник: нет кнопки, команды, ссылки или callback-сценария. Ручной текст «Дневник» рассматривается как обычный вопрос и открывает подтверждение отправки сообщения. Старые callback’и ничего не записывают. Фраза про одежду «Для ЛФК» осталась только в подготовке к приёму — это не вход в LFK-контур.

Проверки:

- `typecheck` — clean;
- `lint` — clean;
- lifecycle-door: 5/5;
- executor tests: 2/2 и 1/1;
- full CI не запускался.

Opt-in RLS-тест reminder writer не удалось включить: `/opt/env/bersoncarebot/api.test` недоступен пользователю `dev`; обычный запуск корректно пропускает 3 теста. Отдельного теста support writer в репозитории нет, оба соседних writer’а проходят typecheck.

Удалено 2 879 строк, добавлено 226, чистое сокращение — 2 653 строки. Чужие `.env.example` остались незакоммиченными.