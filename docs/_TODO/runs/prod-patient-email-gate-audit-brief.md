# Новый PROD — аудит patient email gate до выбора клиники

Ты независимый `auditor-live`. Единственный канон — `AGENTS.md`; прочитай карту заголовков, §5, §10a, §10b,
§15, §17 и §24. Точный candidate — commit ветки `wt/prod-patient-gate-fix`. Authority — наблюдаемая ошибка нового
PROD digest `936881974`: patient layout вызывает `app.patient_email_gate_state(boolean)` до выбора организации,
а account-level patient без enrollment должен увидеть существующий recovery/no-organization screen, не падение.

## Тест или взгляд

- Повторяемое поведение port-context можно проверить существующим non-UI unit test и при необходимости одним
  независимым behavior oracle. UI/DOM/copy/static-source tests запрещены.
- Порядок layout, scope функции, отсутствие расширения relation/tenant wall и точность identity-only allowlist
  проверяй взглядом по коду и по уже снятым PROD catalog/log evidence; PROD не трогай.

Проверь, что разрешён ровно named root `app.patient_email_gate_state(boolean)`, он использует собственную identity
и не позволяет произвольный tenant/root без organizationId; существующие organization resolver и VAPID root не
сломаны. Оцени добавленный тест по §10a: независимый observable result — построенный patient context без
organizationId для exact named root, а не проверка текста Set. Выполни focused suite, webapp typecheck, scoped lint
и `git diff --check`. Production-код не исправляй; можно оставить только оправданный acceptance test и отчёт
`docs/_TODO/runs/prod-patient-email-gate-audit.md`, затем закоммитить явными путями. Full CI, push, deploy и
миграции не запускать.
