# ROADMAP — этапы, статусы, зависимости

Статусы: `pending` · `in_progress` · `blocked` · `done` · `deferred`. Обязательные результаты каждого этапа — в [`STAGE_CHECKLISTS.md`](STAGE_CHECKLISTS.md).

**Git-ветка:** `initiative/own-booking-engine` — все коммиты инициативы только здесь ([`MASTER_PLAN.md`](MASTER_PLAN.md) §Git-ветка).

## Таблица этапов

Декомпозированные планы для исполнителя (Composer) — в `.cursor/plans/own_booking_stage*.plan.md`.

| # | Этап | Статус | Зависит от | Можно параллелить с | План |
|---|------|--------|-----------|---------------------|------|
| 0 | Инфраструктура инициативы (docs) | `done` | — | — | — |
| 1 | Каноническая модель данных | `done` | 0 | — (фундамент) | [`stage1`](../../.cursor/plans/archive/own_booking_stage1_canonical_model.plan.md) |
| 2 | Базовая запись пациента | `done` | 1 | — | [`stage2`](../../.cursor/plans/archive/own_booking_stage2_patient_booking.plan.md) |
| 3 | Публичный виджет / страница записи | `done` | 2 | 4 (после общего ядра записи) | [`stage3`](../../.cursor/plans/archive/own_booking_stage3_public_widget.plan.md) |
| 4 | Переносы и отмены | `done` | 2 | 3 | [`stage4`](../../.cursor/plans/archive/own_booking_stage4_reschedule_cancel.plan.md) |
| 5 | Предоплата и базовые оплаты | `pending` | 1, 2 | 6 (модель), но активация после 5 | [`stage5`](../../.cursor/plans/own_booking_stage5_prepayment_payments.plan.md) |
| 6 | Абонементы | `pending` | 1, 2, 5 | 7 (модель продуктов) | [`stage6`](../../.cursor/plans/own_booking_stage6_memberships.plan.md) |
| 7 | Продукты, акции, подписки, курсы | `pending` | 5, 6 | — | [`stage7`](../../.cursor/plans/own_booking_stage7_products_courses.plan.md) |
| 8 | Календарь | `pending` | 1, 2, 4 | 5–7 (отображение статусов/оплат добавляется по мере готовности) | [`stage8`](../../.cursor/plans/own_booking_stage8_calendar.plan.md) |
| 9 | Карточка клиента и полная история | `pending` | 1–8 (события) | — (потребитель таймлайна) | [`stage9`](../../.cursor/plans/own_booking_stage9_client_card_history.plan.md) |

## Правила порядка

- **Этап 1 — фундамент**: пока не закрыт его DoD (модель + статусы + события + multi-tenant + совместимость), этапы 2–9 не стартуют по своим контрактам.
- **Не смешивать фазы** (`.cursor/rules/clean-architecture-module-isolation.mdc`, §1b): один логический батч = один этап; этап N+1 не начинается до gate этапа N по затронутым контрактам. Допустимая подготовка модели данных «вперёд» (например, таблицы продуктов на этапе 6 под этап 7) разрешена, но активация фич — по порядку.
- **Сквозные C1–C10** (см. `MASTER_PLAN.md` §4) проверяются внутри каждого применимого этапа, а не выносятся в отдельный «финальный» этап.
- **Rubitime-мост (C8)** сопровождает этапы 1–4 и 8 (всё, что меняет запись/расписание), пока мост включён настройкой.
- **UI-паритет (C9)**: ни один этап не закрывается без соответствующих поверхностей из [`UI_SURFACES_CHECKLIST.md`](UI_SURFACES_CHECKLIST.md).

## Gate каждого этапа (общий)

Этап считается `done`, только когда:
1. Все пункты чек-листа этапа в `STAGE_CHECKLISTS.md` выполнены или явно `cancelled` с причиной в `SCOPE_DECISIONS.md`.
2. Применимые сквозные C1–C10 закрыты.
3. UI-поверхности этапа присутствуют и работают во всех затронутых кабинетах.
4. Целевые тесты + `lint`/`typecheck` по затронутым пакетам зелёные; для крупного этапа — финальный `pnpm run ci`.
5. Обновлены `LOG.md` и связанная доменная документация (README модуля, `api.md`, `DB_STRUCTURE.md`, `RUBITIME_BOOKING_PIPELINE.md` при изменении моста).
