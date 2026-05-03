# STAGE D3 PLAN — типы рекомендаций в системный справочник БД (Q3)

## 1. Цель

Перенести источник значений «Тип» рекомендации из статического списка в БД-справочник с управляемыми кодами/подписями.

## 2. Scope

### In scope
- Категория справочника для recommendation types.
- Сид текущих кодов (старые + новые) без массовой нормализации history.
- Переключение формы/фильтров/API на справочник.

### Out of scope
- Принудительный merge legacy кодов в этой же итерации.
- `domain -> kind` rename (это D5).

## 3. Технические решения

- Справочник через `reference_items` (category `recommendation_type`/`recommendation_kind` — зафиксировать единый код).
- На D3 поле таблицы `recommendations.domain` пока сохраняется.
- Для неизвестных historical кодов: read tolerant, write strict.

## 4. Пошаговая реализация

1. Миграция: категория + сид текущих `RECOMMENDATION_DOMAIN_CODES`.
2. Вынести read/list источника типов в references-service.
3. Обновить форму рекомендаций и фильтры (SSR + client) на справочник.
4. Обновить API route query validation (`domain`) без хардкода массива в модуле.
5. Обновить тесты (SSR parser, форма, сервис).

## 5. Усиленный execution checklist

1. [x] `rg "RECOMMENDATION_DOMAIN_CODES|parseRecommendationDomain|listDomain|domainForList"` — фиксирован периметр.
2. [x] Категория/сид справочника добавлены миграцией.
3. [x] Форма и фильтры читают список из БД-справочника.
4. [x] SSR и REST сохраняют паритет по валидации query.
5. [x] Legacy unknown коды не падают на чтении.
6. [x] `api.md` обновлён (контракт фильтра и сериализации).
7. [x] `eslint`.
8. [x] `vitest`.
9. [x] `tsc --noEmit`.
10. [x] Запись в `LOG.md`.

## 6. Stage DoD

- Типы рекомендаций полностью управляются справочником БД.
- Логика фильтра/формы не зависит от жёсткого массива кодов в TS.
