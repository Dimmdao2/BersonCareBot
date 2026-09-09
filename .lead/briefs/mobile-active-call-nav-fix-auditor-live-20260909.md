# Auditor-live brief — #915 active-call navigation fix

## Тест или взгляд

Это one-time живая поведенческая проверка пользовательскими кликами плюс взгляд на итоговый diff; постоянный тест
для изменчивой геометрии интерфейса не пишется.

Источник оракула — `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M4-01/M4-04/M4-05/M4-06 и M7-03:
browser/PWA сохраняет тот же звонок при внутренних переходах; global navigation доступна; вне страницы звонка
появляется return indicator; только явное завершение очищает звонок; второй звонок не стартует; desktop не меняется.

## Authority and classification

Проверить exact candidate `6cbcc8cbb6c471d52aee669c9024cd62ca089301`, исправляющий finding
`.lead/runs/mobile-browser-jitsi-closure-20260909/90-final-audit-report.md`. Перед каждым действием выполнять
heading-map gate `AGENTS.md`. Полностью прочитать §1a, §9, §10, §10a, §10b, §15–§17, §24, mobile plan и candidate
diff. Это one-time live behavior audit: новых постоянных тестов не писать и production-код не менять.

## Exact live checks

- На изолированном порту и реальном authenticated doctor flow с synthetic media открыть Jitsi iframe и обычным
  пользовательским кликом перейти через видимую global navigation в другой раздел. Клик обязан реально сработать,
  а тот же iframe/render session — сохраниться в compact состоянии.
- Return indicator возвращает на exact call URL; обычные start-call controls не позволяют начать второй звонок.
- Jitsi explicit end control остаётся доступен, его нажатие очищает indicator и даёт ровно один terminal outcome.
- На mobile viewport call surface не перекрывает header/bottom navigation; на desktop нового floating UI/layout
  regression нет. Проверить обе зоны чтением diff; live обязательно doctor, patient — если штатный OTP вход доступен
  без чтения секрета/кода из хранилища.
- Не засчитывать прямые coordinator callbacks, `Page.navigate`, synthetic terminal event либо pointer-event
  манипуляцию вместо пользовательского клика.

## Result

Разрешён только `.lead/runs/mobile-active-call-nav-fix-audit-20260909/90-final-audit-report.md`. Указать exact SHA,
viewport, команды/порт, каждый binary verdict и observable evidence. Finding только для достижимого нарушения
owner requirement; style не finding. Остановить только свои процессы и очистить временные профили.

Stage только audit-artifact, не `git add -A`; commit, не push. Дождаться foreground-команд. Если blocked — назвать
точный недостижимый пользовательский шаг, не подменять его внутренним вызовом.
