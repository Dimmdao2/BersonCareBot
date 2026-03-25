# MASTER PLAN — Исполнение FIX_PLAN_POLISH

> Дата: 2026-03-24  
> Создан: opus4.6  
> Source of truth для решений владельца: `docs/FULL_DEV_PLAN/USER_TODO_STAGE.md`
> Нумерация этапов: `Stage 14 = Settings/Admin`, `Stage 15 = PWA`
> Post-prod backlog: `docs/FULL_DEV_PLAN/POST_PROD_TODO.md`

---

## Порядок выполнения и зависимости

```
PACK A: Quick Fixes ─────────────────────── (нет зависимостей)
    │
PACK B: Settings/Admin (Stage 14) ──────── (фундамент для C, D, E)
    │
    ├── PACK C: Relay Outbound (STUB-02) ── (нужен для D)
    │       │
    │       └── PACK D: Reminders (Stage 12) ── (зависит от B + C)
    │
    └── PACK E: Integrations (Stage 13) ─── (зависит от B)
            │
PACK F: LFK (Stage 11) ─────────────────── (независимый, параллелен с D/E)
    │
PACK G: Final Stubs & E2E ──────────────── (после всех)
```

---

## Пакеты

| Пакет | Файл инструкций | Сложность | Рекомендация по агенту | Шагов | Миграции |
|-------|-----------------|-----------|----------------------|-------|----------|
| **A** | `EXEC_A_QUICK_FIXES.md` | Простой | Auto (пул) | 5 | — |
| **B** | `EXEC_B_SETTINGS_ADMIN!!.md` | Высокий | Auto (пул); при проблемах → API-модель | 6 | `031_system_settings.sql` |
| **C** | `EXEC_C_RELAY_OUTBOUND!.md` | Средний | Auto (пул) | 3 | — |
| **D** | `EXEC_D_REMINDERS!!.md` | Высокий | Auto (пул); шаги 12.3/12.5 → API-модель при проблемах | 5 | `032_reminder_seen_status.sql` |
| **E** | `EXEC_E_INTEGRATIONS!!.md` | Очень высокий | Auto первые 4 шага; шаги 13.5–13.6 → API-модель | 7 | — (integrator DB) |
| **F** | `EXEC_F_LFK!.md` | Средне-высокий | Auto (пул) | 7 | `033_lfk_exercises.sql`, `034_lfk_templates.sql` |
| **G** | `EXEC_G_FINAL_STUBS.md` | Простой | Auto (пул) | 2 | — |

---

## Ритм работы

### Формула пакета

1. Открыть **новый чат** Auto.
2. Вставить промпт из Runbook (секция 4) + указать файл пакета.
3. Auto выполняет 2–4 шага за раз.
4. При `pnpm run ci` FAIL → Auto чинит (до 3 попыток).
5. После пакета — **быстрая проверка** в том же чате (`gpt5.3`).
6. **Глубокий аудит** — новый чат с `gpt5.4` или `opus4.6` — после пакетов B+C и после E.

### Рекомендованные точки глубокого аудита

| После чего | Фокус аудита |
|-----------|-------------|
| PACK B + C | security: admin mode, relay HMAC, role guards |
| PACK E | integrations: контракты, подписи, idempotency, nock-покрытие |
| PACK F (опционально) | data: FK chain exercises → templates → assignments → diary |
| PACK G (финальный) | full regression: `pnpm run ci` + ручной smoke |

---

## Миграции: план нумерации

Текущая последняя: `030_news_and_motivation.sql`

| Номер | Пакет | Содержание |
|-------|-------|-----------|
| 031 | B | `system_settings` + seed |
| 032 | D | `reminder_seen_status` (seen_at / seen events) |
| 033 | F | `lfk_exercises` + `lfk_exercise_media` |
| 034 | F | `lfk_complex_templates` + `lfk_complex_template_exercises` + `patient_lfk_assignments` |

---

## Контрольный чеклист

См. `docs/FULL_DEV_PLAN/EXEC/QA_CHECKLIST.md`

---

## Статус пакетов

| Пакет | Статус |
|-------|--------|
| A | `todo` |
| B | `todo` |
| C | `todo` |
| D | `todo` |
| E | `todo` |
| F | `todo` |
| G | `todo` |
