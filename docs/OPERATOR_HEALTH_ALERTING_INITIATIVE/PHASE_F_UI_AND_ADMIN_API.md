# PHASE F — UI и admin API

Канон: [`MASTER_PLAN.md`](MASTER_PLAN.md) §3.3–3.4, §5 фаза F, §7 DoD, `patient-ui-shared-primitives.mdc` для любых patient-facing касаний (здесь только admin settings).

## 1. Цель этапа

Админ в режиме администратора на **«Здоровье системы»** видит:

1. **Исходящую** доступность по интеграциям (последний результат probe + время).
2. **Входящий** статус вебхука по Rubitime / Telegram / MAX (last-status из фазы C).
3. **Открытые операторские инциденты** (список + краткий текст + ссылка на audit при auto_merge).

Данные через **admin-only API** (`requireAdminModeSession`).

## 2. Зависимости

- **A** (инциденты), **B** (последние probe результаты — можно хранить в отдельной таблице `operator_health_probe_runs` или в последней строке на интеграцию), **C** (last webhook).

## 3. In scope / out of scope

### In scope

- `GET /api/admin/system-health` **расширить** JSON **или** новый `GET /api/admin/operator-health` — один контракт, версионируемый (`schemaVersion`).
- `SystemHealthSection.tsx`: новый блок «Интеграции» (accordion по образцу существующих `HealthAccordionItem`).
- Опционально: бейдж в header settings при открытых инцидентах — только если не раздувает scope; иначе defer.

### Out of scope

- Пациентский UI.
- Редактирование инцидентов вручную из UI (можно defer в backlog).

## 4. Разрешённые области правок

| Разрешено | Пути |
|-----------|------|
| API | `apps/webapp/src/app/api/admin/**/route.ts` — тонкие handlers |
| Сервис | `apps/webapp/src/modules/**` через порты, чтение инцидентов через repo |
| UI | `apps/webapp/src/app/app/settings/SystemHealthSection.tsx`, при необходимости маленький подкомпонент в той же папке |
| Тесты | `*.test.ts` / `*.test.tsx` рядом |

**Запрещено:** бизнес-логика в `route.ts`; прямые импорты `@/infra/db` из `modules/*`.

## 5. Декомпозиция шагов

### Шаг F.1 — Контракт API

**Действия:**

1. Zod-схема ответа: `integrations: { rubitime: { outbound, inbound }, … }`, `openIncidents: [...]`.
2. Лимит списка инцидентов (пагинация опционально).

**Checklist:**

- [ ] `route.test.ts` на 403 без admin mode.

**Критерий закрытия:** стабильный JSON для фронта.

---

### Шаг F.2 — Сервис агрегации

**Действия:**

1. `buildAppDeps` собирает порт чтения инцидентов + last webhook + last probe run.
2. Кэш не обязателен на MVP.

**Checklist:**

- [ ] `pnpm typecheck` для webapp.

**Критерий закрытия:** один вызов из GET handler.

---

### Шаг F.3 — UI секция

**Действия:**

1. Использовать существующие `HealthAccordionItem`, `DetailRow`, типографику как в текущей секции здоровья.
2. Явные подписи: «Исходящий (API)» / «Входящий (вебхук)».

**Checklist:**

- [ ] Соответствие doctor/admin settings layout (см. `settings.md`).

**Критерий закрытия:** визуально согласовано с остальной вкладкой.

---

### Шаг F.4 — Тесты UI

**Действия:**

1. RTL-тест на рендер с мок-fetch payload.

**Checklist:**

- [ ] `SystemHealthSection.test.tsx` расширен или новый тест файл.

**Критерий закрытия:** зелёный тест.

## 6. Definition of Done (фаза F)

- Админ видит три слоя информации (outbound / inbound / incidents) без смешивания в одну «красную лампочку».
- API защищён `requireAdminModeSession`.
- Документация `apps/webapp/src/app/api/api.md` или аналог обновлена строкой про новый контракт.

## 7. Ссылки

- [`MASTER_PLAN.md`](MASTER_PLAN.md)
- [`PHASE_G_TESTS_AND_DOCS.md`](PHASE_G_TESTS_AND_DOCS.md)
