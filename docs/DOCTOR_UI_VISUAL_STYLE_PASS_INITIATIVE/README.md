# Doctor UI Visual Style Pass

Внедрение визуального гайда кабинета врача (`docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md` §A–§C): единый визуальный язык, закрытая шкала текста/контролов/плотности, общий стиль компонентов по эталону экрана упражнений.

**Боль:** «то слишком мелко, то слишком крупно» + разрозненный вид при уже единых компонентах.  
**Решение:** слой визуального стиля поверх существующей архитектуры (токены, шкала, состояния), без правок бизнес-логики/API/БД/маршрутов.

## Каноны

- Дизайн: [`DOCTOR_APP_UI_STYLE_GUIDE.md`](../ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md) §A–§C.
- План: [`.cursor/plans/doctor_ui_visual_style_pass.plan.md`](../../.cursor/plans/doctor_ui_visual_style_pass.plan.md).
- Правило агентов: [`.cursor/rules/doctor-ui-shared-primitives.mdc`](../../.cursor/rules/doctor-ui-shared-primitives.mdc).
- Density (не откатывать): [`APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_UI_DENSITY_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_UI_DENSITY_PLAN.md).

## Файлы инициативы

- [`LOG.md`](LOG.md) — журнал исполнения по фазам.
- [`AUDIT.md`](AUDIT.md) — baseline-таблица отклонений и их статус.

## Scope

In: `apps/webapp/src/app/app/doctor/**`, `apps/webapp/src/shared/ui/doctor/**`, `apps/webapp/src/app/styles/doctor.css`, doctor-видимые `app/app/settings/**` (визуальный слой), doc-файлы инициативы и гайд.  
Out: patient UI, `tailwind-engine.css` base tokens, бизнес-логика/API/БД/миграции, маршруты, CI workflow, новые зависимости.
