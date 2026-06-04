# Patient / Doctor UI Split Initiative

Механическое разделение CSS и UI-компонентов на независимые product zones: **patient** (`/app/patient/**`, `/app`, `/book/**`) и **doctor** (`/app/doctor/**`, `/app/settings/**`).

## Цель

- Независимые CSS: `tailwind-engine.css`, `patient.css`, `doctor.css`, `landing.css`
- Независимые деревья: `shared/ui/patient/**` vs `shared/ui/doctor/**`
- ESLint isolation между зонами
- **Без** визуального редизайна doctor на этом этапе

## Канон

| Документ | Назначение |
|----------|------------|
| План [`.cursor/plans/archive/patient_doctor_ui_split_9a04ff8e.plan.md`](../../../.cursor/plans/archive/patient_doctor_ui_split_9a04ff8e.plan.md) | Фазы 0–4, gates, DoD (закрыт 2026-06-04) |
| [`LOG.md`](LOG.md) | Журнал исполнения и smoke checklist |
| [`docs/ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md`](../../ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md) | Patient UI (не менять визуал) |
| [`docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md`](../../ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md) | Doctor UI (post-split baseline) |

## Scope

**In:** CSS split, `shared/ui` reorg, `PatientAppShell` / `DoctorAppShell`, ESLint, fork `components/ui` → zone primitives.

**Out:** doctor redesign, PWA Berson Admin, subdomain, API/DB, удаление `components/ui/` (остаётся источником копий).

## Фазы

| Фаза | Содержание |
|------|------------|
| 0 | Baseline smoke + vitest |
| 1 | Split `globals.css` → 4 CSS files + layouts |
| 2 | Patient UI split + gate |
| 3 | Doctor/settings UI split |
| 4 | Docs, cursor rule, `pnpm run ci` |

## Статус

**Initiative closed (2026-06-04).** See [`LOG.md`](LOG.md).
