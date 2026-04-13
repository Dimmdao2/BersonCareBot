# Webapp-first phone bind + чтение канона в оркестраторе

Мастер-план инициативы: **канон пациента в `public`** (`platform_users`, `user_channel_bindings`), **integrator** в схеме `integrator`, **одна PostgreSQL**; привязка телефона из мессенджера — **TX-first** без HTTP на hot path; **чтение** признака «телефон привязан» для сценариев — из **`public`**, чтобы совпадать с webapp.

## Исходные материалы

- План Cursor (полный текст, продуктовая модель, риски):  
  `~/.cursor/plans/webapp-first_phone_bind_5069b809.plan.md` (в репозитории копировать путь из IDE).
- Связанные доки репозитория:  
  `docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md` · `apps/webapp/INTEGRATOR_CONTRACT.md` · `apps/webapp/src/modules/auth/auth.md` · `docs/AUTH_RESTRUCTURE/INTEGRATOR_TELEGRAM_START_SCRIPTS.md`.

## Цели инициативы

1. **Запись:** одна транзакция — binding-first в `public` + согласованная запись в `integrator` (`user.phone.link`); без fanout `contact.linked` на этом пути; честные machine-reason и UX.
2. **Чтение:** `getLinkDataByIdentity` / контекст оркестратора берёт **нормализованный телефон** (и при необходимости согласованные сигналы) из **`public`**, а не только из `integrator.contacts` с `label = resource`.
3. **Legacy:** `emit`/202 с разбором `body.ok` для оставшихся M2M; идемпотентность `contact.linked` до выключения продюсера.
4. **Наблюдаемость и приёмка:** структурные логи, тесты, обновление контракта в доках — по этапным чек-листам.

## Этапы (файлы)

| Этап | Файл | Кратко |
|------|------|--------|
| 1 | [`STAGE_01_BIND_TX_AND_GRANTS.md`](STAGE_01_BIND_TX_AND_GRANTS.md) | TX bind, права на `public`, снятие HTTP/fanout с phone path |
| 2 | [`STAGE_02_READ_LINK_DATA_FROM_PUBLIC.md`](STAGE_02_READ_LINK_DATA_FROM_PUBLIC.md) | `getLinkDataByIdentity` → `platform_users` / bindings; карта полей |
| 3 | [`STAGE_03_LEGACY_EMIT_AND_CONTACT_LINKED.md`](STAGE_03_LEGACY_EMIT_AND_CONTACT_LINKED.md) | `webappEventsClient`, outbox/worker, контракт `contact.linked` |
| 4 | [`STAGE_04_UX_REASONS_AND_SCRIPTS.md`](STAGE_04_UX_REASONS_AND_SCRIPTS.md) | Таксономия ошибок, `phoneLinkUserMessages`, сценарии |
| 5 | [`STAGE_05_OBSERVABILITY_TESTS_DOCS.md`](STAGE_05_OBSERVABILITY_TESTS_DOCS.md) | Логи, метрики, тесты, INTEGRATOR_CONTRACT / auth |
| 6 | [`STAGE_06_OPTIONAL_HTTP_BIND_ROUTE.md`](STAGE_06_OPTIONAL_HTTP_BIND_ROUTE.md) | Signed POST только для внешнего вызывающего (опционально) |
| — | [`AGENT_AND_AUDIT_LOG.md`](AGENT_AND_AUDIT_LOG.md) | Журнал работ агента и записи аудитов |

Порядок внедрения: **1 → 2** параллельно с хвостами **3** там, где ещё есть M2M; **4–5** идут вместе с каждым крупным merge; **6** — по необходимости.

## Соответствие todo из Cursor-плана (`webapp-first_phone_bind_5069b809`)

Отдельного файла «будущие todo» нет: хвосты закрываются по **чек-листам внизу** соответствующих `STAGE_*.md`. В IDE план может ещё показывать `pending` — это дубль до ручного закрытия там.

| Todo id (план Cursor) | Где в репозитории |
|------------------------|-------------------|
| `read-canon-from-public` | [`STAGE_02_READ_LINK_DATA_FROM_PUBLIC.md`](STAGE_02_READ_LINK_DATA_FROM_PUBLIC.md) |
| `retire-worker-phone-path` (хвост M2M / воркер не-phone) | [`STAGE_03_LEGACY_EMIT_AND_CONTACT_LINKED.md`](STAGE_03_LEGACY_EMIT_AND_CONTACT_LINKED.md) |
| `emit-202-parse` (регресс оставшихся emit) | [`STAGE_03_…`](STAGE_03_LEGACY_EMIT_AND_CONTACT_LINKED.md) |
| `contact-linked-contract` | [`STAGE_03_…`](STAGE_03_LEGACY_EMIT_AND_CONTACT_LINKED.md) |
| `scripts-ux`, доработки копирайта/веток | [`STAGE_04_UX_REASONS_AND_SCRIPTS.md`](STAGE_04_UX_REASONS_AND_SCRIPTS.md) |
| `error-taxonomy` (добавить reason/тесты) | [`STAGE_04_…`](STAGE_04_UX_REASONS_AND_SCRIPTS.md) |
| `admin-audit-logs` | [`STAGE_05_OBSERVABILITY_TESTS_DOCS.md`](STAGE_05_OBSERVABILITY_TESTS_DOCS.md) |
| `product-copy-contract`, `docs-contract` | [`STAGE_05_…`](STAGE_05_OBSERVABILITY_TESTS_DOCS.md) |
| `webapp-bind-route` | [`STAGE_06_OPTIONAL_HTTP_BIND_ROUTE.md`](STAGE_06_OPTIONAL_HTTP_BIND_ROUTE.md) |
| `single-db-bind-tx`, `integrator-bind-writeport`, `grants-search-path`, `no-binding-policy`, `mini-app-refresh` | в основном [`STAGE_01_…`](STAGE_01_BIND_TX_AND_GRANTS.md) (+ UX в STAGE_04 для текстов) |

## Журнал и аудиты

Все даты, решения, результаты аудита и ссылки на PR — в [`AGENT_AND_AUDIT_LOG.md`](AGENT_AND_AUDIT_LOG.md).

## Общий регресс перед пушем

- `pnpm install --frozen-lockfile && pnpm run ci` (как в правилах репозитория).
