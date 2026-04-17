# Admin: подсказки по ФИО и ручной merge — план и журнал выполнения

Документ относится к **Platform User Merge (v1, webapp)**: справочный отчёт по совпадениям ФИО, произвольный поиск второй записи и расширение панели ручного merge. Нормативное описание поведения API и UI: [`PLATFORM_USER_MERGE.md`](PLATFORM_USER_MERGE.md) (§ Manual merge — preview, Admin UI). Пошаговый журнал релиза (архив): [`../archive/2026-04-docs-cleanup/reports/USER_MERGE_EXECUTION_LOG.md`](../archive/2026-04-docs-cleanup/reports/USER_MERGE_EXECUTION_LOG.md) § 2026-04-11.

Исходный детальный план (цели, архитектура, DoD, чеклист доков) при необходимости см. в локальном артефакте Cursor: `~/.cursor/plans/admin_name-merge_hints_f8a2d2c1.plan.md` — ниже зафиксированы **факт выполнения** и **доработки после аудита**, перенесённые в репозиторий.

---

## 1. Журнал выполнения (факт)

**Дата:** 2026-04-11 (реализация + последующий hardening по ревью).

**Проверка:** `pnpm run ci` в корне репозитория — успешно после всех правок.

**Сделано по плану (сводка):**

| Блок | Результат |
|------|-----------|
| Infra | `apps/webapp/src/infra/platformUserNameMatchHints.ts` — `orderedGroups`, `swappedPairs`, `missingPhone`, лимиты; тест `platformUserNameMatchHints.test.ts` |
| API | `GET .../name-match-hints`, `GET .../merge-user-search`; guard, zod, `logger.info` / `logger.error` |
| UI отчёт | `/app/doctor/clients/name-match-hints`, `NameMatchHintsClient`, ссылка из `DoctorClientsPanel` (admin + admin mode) |
| UI merge | `AdminMergeAccountsPanel` — поиск, канон, чекбокс align; `resolveMergePreviewAlignment` в `adminMergeAccountsLogic.ts` + тесты |
| Доки | `ARCHITECTURE/PLATFORM_USER_MERGE.md`, `archive/2026-04-docs-cleanup/reports/USER_MERGE_EXECUTION_LOG.md`, `docs/README.md`, `ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md`, `archive/2026-04-initiatives/PLATFORM_USER_MERGE_V2/README.md` |

**Структурированные логи (фактические имена сообщений):**

- `action: "name_match_hints"`, сообщение `"[admin] name_match_hints"` — агрегаты + `durationMs`, без массивов ПДн.
- `action: "merge_user_search"`, сообщение `"[admin] merge_user_search"` — `qLength`, `resultCount`, `durationMs` (полный `q` в лог не пишется).

---

## 2. Доработки, которых не было в исходном тексте плана (post-audit)

Внесены после проверки реализации на гонки, UX и согласованность навигации:

1. **Гонки `merge-preview`:** перед новым запросом `AbortController.abort()`; оба `fetch` (включая align-refetch) с одним `signal`; счётчик запроса — устаревшие ответы не вызывают `setState`; `AbortError` не трактуется как сеть.
2. **Свёрнутая секция merge:** при `sectionOpen === false` preview не запрашивается; активный preview-fetch отменяется; состояние preview очищается.
3. **`merge-user-search`:** отдельное состояние ошибки (403 / HTTP / сеть) vs пустой успешный список; текст «Ничего не найдено» только при успехе и 0 результатов.
4. **`<select>` вторая запись:** если UUID выбран только из поиска и нет в overlap-списке — дополнительная `<option>` + строка с полным UUID под полем.
5. **Отчёт по ФИО:** перед новым «Запустить поиск» сброс предыдущих `orderedGroups` / `swappedPairs` / `disclaimer`; ссылки на клиента с **`scope=all&selected=`** (чтобы запись была в левом списке по умолчанию); «Назад» на `.../clients?scope=all`.
6. **После успешного `POST .../merge`:** сброс строки поиска второй записи, результатов поиска, ошибки поиска; `canonicalIsAnchor` и `alignToRecommendation` возвращаются к значениям по умолчанию.
7. **SQL:** нормализация пробелов через POSIX `[[:space:]]+` в `regexp_replace`; запросы ordered и swapped выполняются **последовательно** (проще тесты и предсказуемая нагрузка).
8. **Мелкий фикс сборки:** в `name-match-hints/page.tsx` явный импорт `Link` из `next/link` (eslint `react/jsx-no-undef`).

**Документация сверх исходного чеклиста плана:**

- В `PLATFORM_USER_MERGE.md` — подпункт **«Устойчивость UI и навигация (после hardening)»**.
- В `USER_MERGE_EXECUTION_LOG.md` — параграф **Hardening** (и отсылка к follow-up по индексам при росте БД).
- В `SCENARIOS_AND_CODE_MAP.md` — уточнена строка таблицы про admin merge (`scope=all`, отмена гонок preview).

**Что намеренно не делалось:** запись просмотра отчёта в `admin_audit_log`; отдельные индексы под name-hints (follow-up при росте данных).
