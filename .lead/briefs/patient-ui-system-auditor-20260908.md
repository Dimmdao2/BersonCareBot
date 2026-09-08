# Auditor-live brief: patient UI consolidation and conversation parity

## Тест или взгляд

Сначала классифицировать каждый пункт по `AGENTS.md` §24.4. Визуальную геометрию, токены, отсутствие
cross-zone импортов и итоговое состояние модалок проверять взглядом по diff/коду и, где практично, одним live
проходом. Повторяемое поведение чата/комментариев проверять существующими или недостающими поведенческими тестами
по §10a/§10b. Запрещены тесты на текст исходника, className, число тегов/таблиц, форматирование и детали реализации.

## Authority

Владелец поручил систематизировать существующий кабинет пациента без редизайна: одинаковые по назначению и весу
кнопки, поля, карточки и модалки должны идти через общие patient primitives/tokens; захардкоженные повторяемые
цвета, радиусы и размеры должны стать управляемыми из одного места. Отдельно поручено перенести на пациента
отработанное у врача поведение/верстку чата и комментариев: форма пузырей, нижний composer/send, появление новых
сообщений без замены/перерисовки неизменившихся строк. Цвета и шрифты остаются пациентскими. Patient и doctor UI
деревья физически изолированы.

Кандидат: ветка `wt/patient-ui-system-audit-20260907`, текущий committed SHA на момент запуска. База сравнения —
`feat/doctor-ui-rebuild`. Читать полностью релевантные `AGENTS.md` §10a, §10b, §15, §16, §17, §24,
`docs/ARCHITECTURE/PATIENT_APP_UI_STYLE_GUIDE.md`, `docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md` и
`docs/_TODO/runs/patient-ui-system-audit-20260907/PATIENT_UI_SYSTEM_AUDIT.md`. Перед поиском по коду использовать
`code-search`.

## Required audit

1. Составить kill-set по owner requirement до чтения существующих тестов.
2. Проверить, что patient primitives/tokens действительно являются одной точкой изменения для уже сведённых
   контролов, карточек, confirm/modal chrome и chat geometry; не требовать объединения уникальных элементов.
3. Проверить все изменённые patient modal/dialog/fullscreen-media paths против поведения DoctorModal: уровни,
   header/body/footer, mobile drawer/fullscreen behavior, focus/close/scroll. Patient visual identity не считать
   дефектом.
4. Проверить patient messages и program-item discussion: новые сообщения добавляются без замены identity
   неизменившихся объектов, пагинация комментариев не теряет старые строки, отправка и polling не дублируют
   сообщения, composer ведёт себя как doctor composer, doctor/clinic label остаётся plain text.
5. Лично прогнать минимальные relevant tests/lint. Typecheck failure из stale `.next/dev/types` не объявлять
   продуктовым finding без воспроизведения на чисто сгенерированных типах. Полный CI не запускать.
6. Findings допустимы только для реально достижимого нарушения authority/repo rule с impact и evidence. Style,
   альтернативная архитектура и speculative hardening — не findings.

## Writes and finish

Продуктовый код не исправлять. Разрешено добавить только недостающие поведенческие acceptance tests и audit report
`docs/_TODO/runs/patient-ui-system-audit-20260907/PATIENT_UI_SYSTEM_ACCEPTANCE_20260908.md`. Временные fault
injection правки production-кода откатить. Закоммитить разрешённые audit artifacts явными путями, не пушить.
Финал: PASS либо конкретный список MUST FIX; назвать commit/commands/results и оставить worktree чистым. Не
заканчивать ход, ожидая фоновую команду.
