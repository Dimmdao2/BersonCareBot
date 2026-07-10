# 🅣 _TODO — заготовки инициатив (staging)

Папка-**стейджинг**: здесь инициативы **готовятся**, но оркестратор их **НЕ забирает**
(в отличие от `docs/_INBOX/`). Они не засоряют активные `docs/*_INITIATIVE/` и не попадают
в реестр `docs/INITIATIVES.md` как QUEUED/ACTIVE, пока владелец не подтвердит.

## Поток
1. Готовим инициативу здесь (полная папка: `REQUIREMENTS.md` + `MASTER_PLAN.md` + `log.md`).
2. Владелец говорит «готово» → **копируем папку инициативы ЦЕЛИКОМ в `docs/_INBOX/`**.
3. В `docs/_INBOX/` оркестратор **забирает автоматически** (канон: `docs/_INBOX/README.md`,
   `docs/AGENT_AUTORUN_SCHEME.md` §3, реестр `docs/INITIATIVES.md`).

⚠️ Пока инициатива здесь — НЕ вносить её в `INITIATIVES.md` и НЕ класть в `_INBOX/`.

## Содержимое + ПОСЛЕДОВАТЕЛЬНОСТЬ
| # | Инициатива | Когда | Зависимость |
|---|-----------|-------|-------------|
| 1 | `DB_ACCESS_CHOKEPOINT_INITIATIVE/` — единый перехватываемый ствол доступа к БД (консолидация сырого SQL) | **ЗАВЕРШЕНО для R0** | нет |
| 2 | `SAAS_FOUNDATION/` — мультитенантность (shared-DB + Postgres RLS) | **Phase 0/R1 завершена; текущий next = T0/R2 audit/cutover checklist** | использует готовый chokepoint из #1 |

#1 — поведение-сохраняющий рефактор, который делает БД-доступ перехватываемым. Phase 0/R1
`SAAS_FOUNDATION` завершена; дальнейшая работа начинается с
`SAAS_FOUNDATION/T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md` и не включает production enforcement без
отдельного approval владельца.
