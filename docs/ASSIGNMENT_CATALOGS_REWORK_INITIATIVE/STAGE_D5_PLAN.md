# STAGE D5 PLAN — `recommendations.domain` -> `recommendations.kind` (Q4)

## 1. Цель

Если объём изменения приемлем, выполнить переименование `domain` -> `kind` в БД, API и коде для повышения ясности модели.

## 2. Gate (обязательный перед EXEC)

Перед реализацией сделать короткий spike и зафиксировать в `LOG.md`:

- количество затронутых файлов;
- количество публичных контрактов (`api.md`, query params, forms);
- риски обратной совместимости.

**Go:** если изменение укладывается в локальный модуль `recommendations` + целевые страницы/роуты и не требует широкого cross-module refactor.  
**No-go:** если затрагивает unrelated домены/большой интерфейсный контракт — defer с отчётом в D6.

## 3. Scope (при Go)

- Миграция `ALTER TABLE recommendations RENAME COLUMN domain TO kind`.
- Обновление Drizzle схемы и репозиториев.
- Обновление модульных типов/парсеров.
- API query/body (`domain` -> `kind`) с transition-совместимостью (legacy alias) по решению.
- UI forms/filters/SSR parser.

## 4. Пошаговая реализация

1. Spike + gate decision (обязательно).
2. Миграция + schema updates.
3. Repo/module/API updates.
4. UI + SSR parser updates.
5. docs (`api.md`, план/лог), тесты.

## 5. Усиленный execution checklist

1. [ ] `rg "domainForList|listDomain|recommendationDomain|parseRecommendationDomain|\\.domain"` — baseline собран.
2. [ ] Gate decision (Go/No-go) записан в `LOG.md`.
3. [ ] При Go: миграция выполнена и схема синхронизирована.
4. [ ] API сохраняет контролируемую обратную совместимость (если выбрано).
5. [ ] UI и SSR фильтры работают на `kind`.
6. [ ] Тесты модуля/SSR/API обновлены.
7. [ ] `api.md` отражает новый контракт.
8. [ ] `eslint`.
9. [ ] `vitest`.
10. [ ] `tsc --noEmit`.
11. [ ] `LOG.md` обновлён.

## 6. Stage DoD

- Если Go: колонка/код/API/UI синхронно используют `kind`.
- Если No-go: defer формально закрыт отчётом со spike-evidence и переносом в backlog.
