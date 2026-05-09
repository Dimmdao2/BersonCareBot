# Patient shell: порог `md` для широкой колонки

Инициатива: выровнять расширение `#app-shell-patient`, ветки `PatientTopNav` и сетку главной «Сегодня» по одному брейкпоинту Tailwind **`md`** (768px), вместо прежнего расхождения (`md` у части контента и `lg` у оболочки).

После аудита расширение того же порога на **общий patient-слой**: `patientVisual.ts` (карточный chrome, rhythm внутренних страниц, inner-hero типографика) и десктопный хром карточек в `patientHomeCardStyles.ts`, чтобы на планшете (768–1023px) не оставалось «широкий shell + мобильные радиус/тень до lg».

План исполнения (канонический в репозитории): `.cursor/plans/patient_shell_md_breakpoint.plan.md`.

Журнал работ и проверок: [`LOG.md`](LOG.md).

Актуальное описание для разработчиков: [`docs/ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md`](../ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md) — §1a.
