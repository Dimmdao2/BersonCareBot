# AUDIT — Фаза 0 (enforcement)

**Дата:** 2026-04-18.  
**Scope:** ESLint `no-restricted-imports`, `.cursor/rules/clean-architecture-module-isolation.mdc`, `LEGACY_CLEANUP_BACKLOG.md` vs `EXECUTION_RULES.md`.  
**Проверка кода:** `pnpm --dir apps/webapp exec eslint .` (и сопоставление allowlist с `git`/`rg`).

---

## 1) ESLint: корректность и «ловит новый код»

### Verdict: **PASS (с оговорками по покрытию путей)**

| Критерий | Результат |
|----------|-----------|
| Lint на текущем дереве | **PASS** (exit 0, `max-warnings` не нарушен). |
| `modules/*` — запрет импорта | Паттерны: `@/infra/db/*`, `@/infra/db/client`, `@/infra/repos/*`; тесты `*.test.ts(x)` исключены из правила. |
| `app/api/**/route.ts` — тот же запрет | Настроено отдельным блоком в `apps/webapp/eslint.config.mjs`. |
| Регрессия «простой `@/infra` в route» | `rg '@/infra/' apps/webapp/src --glob '**/route.ts'` → **пусто**. |
| Новый файл в `modules/**` с `@/infra/repos/...` | Ожидается **error**, пока файл не добавлен в allowlist override. Динамический `import("@/infra/repos/...")` также попадает под `no-restricted-imports` (строковый модуль в том же виде). |

### Оговорки (coverage gap)

1. **Не весь `@/infra/*` запрещён.** В production `modules/**` уже есть импорты из `@/infra/logging/*`, `@/infra/s3/client`, `@/infra/integrator-push/*`, `@/infra/integrations/*` и т.д.; ESLint их **не** помечает, потому что правило целится только в `db` и `repos`. Это **совпадает с буквальным текстом** `EXECUTION_RULES.md` §2 (`@/infra/db/client` и `@/infra/repos/*`), но **не** совпадает с более широким примером в Cursor rule (`@/infra/s3/client`).
2. **Отчётность в секции A бэклога** описывает в основном `getPool`/DB/repos; часть строк таблицы — только type-import из repos. Заголовок секции частично устарел по формулировке (содержание таблицы шире).

---

## 2) Cursor rule vs ключевые запреты `EXECUTION_RULES.md`

Источник: `EXECUTION_RULES.md` — блок «Абсолютные запреты» (1–8), плюс правила Drizzle, модульной архитектуры и route handlers.

### Verdict: **PARTIAL PASS**

| Тема из `EXECUTION_RULES.md` | Отражено в `clean-architecture-module-isolation.mdc` |
|------------------------------|------------------------------------------------------|
| Raw SQL / только Drizzle для новых сущностей; schema/migrate | Да (§5 / Drizzle block). |
| Не тянуть `@/infra/db/client` и `@/infra/repos/*` из modules (порты + DI) | Да (§1, §3, §6; примечание: текст cursor шире по примеру S3). |
| Тонкие `route.ts`, без бизнес-логики и прямых infra-вызовов | Да (§4). |
| Структура `service` / `ports` / `types`, инжекция | Да (§2–§3, §6–§7). |
| Не менять существующие LFK-таблицы | **Нет** |
| Не делать отдельный «движок курсов» | **Нет** |
| Не делать FK на `item_ref_id` | **Нет** |
| Не смешивать фазы / отдельные коммиты | **Нет** (покрывается другим rule: `test-execution-policy`, не этим файлом). |
| Не менять GitHub CI workflow без решения | **Нет** |
| Интеграционные ключи в DB (`000-critical-integration-config-in-db.mdc`) | Указано в `EXECUTION_RULES` как источник; в `clean-architecture-*` **не дублируется** (ожидаемо отдельным rule). |

**Итог:** правило хорошо покрывает **архитектурный каркас** и Drizzle/route-handlers; **продуктовые абсолюты** инициативы (LFK, курс как ссылка на шаблон, полиморфный `item_ref_id`, фазы) в этом `.mdc` **не закреплены** — сейчас они живут только в `EXECUTION_RULES.md` + другие cursor rules.

---

## 3) `LEGACY_CLEANUP_BACKLOG.md` — полнота allowlist

### Verdict: **PASS для ESLint-домена; расхождение с запросом «23 + 48»**

| Вопрос | Факт |
|--------|------|
| Сколько файлов в ESLint allowlist для `modules/*`? | **29** путей в `apps/webapp/eslint.config.mjs` — **взаимно однозначно** с таблицей A в `LEGACY_CLEANUP_BACKLOG.md` (строки 1–29). |
| Запрос аудита «23 файла modules» | С **текущим репозиторием не согласуется** — актуальная цифра **29**. |
| «48 route.ts» | Сейчас под `apps/webapp/src/app/api/**/route.ts` **144** файла — это **не** те же «48». Число **48** в документе означает **исторический** объём маршрутов с нарушением boundary до нормализации (`tracked-in-track-b`), как отсылка к архиву. Текущее состояние: **нулевые** прямые `@/infra/*` в любом `**/route.ts`. |
| Полный перечень 48 путей в репозитории | В архивном документе **нет** встроенного списка из 48 файлов. **Актуально:** все эти маршруты уже приведены к boundary (track B завершён); восстанавливать формальный список из git **не требуется** — опциональный план «git archaeology» для приложения списка **устарел**. |

---

## Gate (фаза 0)

| Gate | Статус |
|------|--------|
| ESLint green на текущем коде | **OK** |
| Новые нарушения `@/infra/db/*` и `@/infra/repos/*` в modules ловятся | **OK** |
| Cursor rule покрывает **все** абсолюты `EXECUTION_RULES.md` | **Не OK** без доработки или явного признания «остальное — в других rules / ручной review» |
| Бэклог modules и 48-маршрутная история | **OK** для modules vs ESLint; по списку 48 путей — **defer (навсегда):** маршруты уже исправлены, приложение исторического списка не нужно |

---

## MANDATORY FIX INSTRUCTIONS

1. **Устранить расхождение Cursor vs ESLint по «всему infra»:**  
   - **Вариант A (узкий):** В `clean-architecture-module-isolation.mdc` уточнить, что ESLint на фазе 0 запрещает **только** `@/infra/db/*` и `@/infra/repos/*`; прочие `@/infra/*` — зона последующего жёсткого правила или отдельного аудита.  
   - **Вариант B (широкий):** Расширить `no-restricted-imports` (например `@/infra/*` с исключениями / отдельные группы для logging, push) и синхронно обновить бэклог — только после явного решения (может затронуть много файлов вне текущего allowlist).

2. **Закрепить продуктовые абсолюты инициативы в постоянном AI-контексте:** добавить в `clean-architecture-module-isolation.mdc` **короткий подпункт** (или отдельный `.mdc` с `alwaysApply` / `globs`), дословно отражающий пункты **4–6** из `EXECUTION_RULES.md` (LFK, движок курсов, FK на `item_ref_id`). Пока этого нет — агенты должны считать `EXECUTION_RULES.md` **обязательным дополнением** к `.mdc`.

3. **Числа и документы:** в любых чеклистах использовать **29** legacy-файлов modules для ESLint, не 23. Для «48» явно писать: **исторический** счётчик грязных маршрутов, не текущее число API routes.

4. **Полнота исторического allowlist 48 маршрутов — DEFER / план устарел:** маршруты с нарушением boundary **уже исправлены**; формально извлекать из git список «как было до фикса» **не требуется**. Опциональный артефакт из аудита считается **закрытым без действий** (см. секцию B `LEGACY_CLEANUP_BACKLOG.md`).

5. **Косметика бэклога:** переименовать заголовок секции A так, чтобы он отражал и **type-import из `@/infra/repos/*`**, не только `getPool` (или разнести подсекции «DB client / repos» vs «прочий infra»).

---

## Команды для повторной проверки

```bash
pnpm --dir apps/webapp exec eslint .
rg '@/infra/' apps/webapp/src --glob '**/route.ts'
rg 'from ["'\'']@/infra/(db|repos)/' apps/webapp/src/modules --glob '*.ts'
# Сверка числа записей в eslint allowlist с таблицей A LEGACY_CLEANUP_BACKLOG.md
```

После выполнения обязательных правок из раздела выше — повторить gate `eslint` и обновить `LOG.md` фиксацией re-audit.

---

## FIX verification — 2026-04-18

**Закрыто по MANDATORY FIX INSTRUCTIONS:**

| # | Инструкция | Действие |
|---|----------------|----------|
| 1 | ESLint vs «весь infra» | В `.cursor/rules/clean-architecture-module-isolation.mdc` зафиксирован **вариант A**: ESLint phase 0 запрещает только `@/infra/db/*` и `@/infra/repos/*`; прочие `@/infra/*` описаны как вне этого автоматического правила. |
| 2 | Продуктовые абсолюты в AI-контексте | В тот же `.mdc` добавлен подпункт **§1a** — пункты **4–6** из `EXECUTION_RULES.md` (LFK-таблицы, движок курсов, FK на `item_ref_id`). |
| 3 | Числа в чеклистах | Обновлены `PROMPTS_EXEC_AUDIT_FIX.md`, `README.md`; формулировки согласованы с **29** modules и историческим **48**. |
| 5 | Косметика бэклога | В `LEGACY_CLEANUP_BACKLOG.md` переименован заголовок секции **A** (DB/repos, в т.ч. type-import из repos). |

**Minor / optional:**

| # | Инструкция | Статус |
|---|----------------|--------|
| 4 | Приложение со списком 48 имён маршрутов из git | **DEFER (окончательно):** маршруты **уже исправлены**; опциональный план с восстановлением списка из истории git **устарел** — не делаем. Контроль регрессии: `rg` по `route.ts` пустой, ESLint на routes включён. |

**Повторный gate:** см. `LOG.md` (eslint + проверка правила на новом файле в `modules/*`).
