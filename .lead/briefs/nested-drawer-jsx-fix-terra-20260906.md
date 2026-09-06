# Worker brief: JSX-вложенный doctor drawer

Ты worker в ветке `wt/clinical-encounter-page-20260906`.

До действий прочитай `AGENTS.md`: карту заголовков, §10a, §10b, §16, §17 и §24; затем точные
`MODAL-01..05` в `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` и итог run
`encounter-time-modal-closing-opus-20260906`.

Источник оракула: `docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md` — «На втором, третьем и последующих слоях тап по видимой затемнённой полосе над модалкой закрывает и».

Исправь только доказанный оставшийся разрыв общего doctor drawer. Sibling-стек после `8cc2809c2` уже PASS и не
должен регрессировать, но JSX-вложенный `DoctorModal` (пример: этап ЛФК → упражнение) не получает outside-press по
видимой верхней полосе.

Полные требования:

- `MODAL-01`: визуальный blur/dim создаёт только первый слой.
- `MODAL-02`: вложенный слой выезжает снизу; нижний слой сохраняется.
- `MODAL-03`: общий footer не менять.
- `MODAL-04`: на втором, третьем и последующих слоях тап по видимой верхней полосе закрывает и уводит вниз только
  верхний слой без remount нижнего.
- `MODAL-05`: это одинаково работает для sibling-state и JSX-nested стеков; тап не должен быть no-op или
  проваливаться нижнему слою.

Сначала проверь существующие `DoctorModal`, `DoctorModalLayerContext` и Base UI drawer. Параметризуй или исправь
общую primitive. Не создавай LFK-обёртку, второй modal API либо feature-local обход.

Разрешённый product scope:

- `apps/webapp/src/shared/ui/doctor/primitives/drawer.tsx`
- `apps/webapp/src/shared/ui/doctor/DoctorModal.tsx`
- `apps/webapp/src/shared/ui/doctor/DoctorModalLayerContext.tsx`
- при необходимости один новый или существующий behavior-test рядом в `shared/ui/doctor`

`patient` primitive и feature callsites не менять. Тест проверяет DOM-событие, закрытие только верхнего слоя и
сохранение нижнего, не строки исходника и не CSS-классы.

Не запускай full CI, не занимай общий dev-порт, не трогай DB/TEST/PROD, не land и не push. Запусти targeted test,
webapp typecheck, scoped ESLint и `git diff --check`. Закоммить только разрешённые пути явным `git add`. В финале
дай SHA, точные проверки и честно перечисли незакрытое. Не заканчивай ход в ожидании фоновой команды.
