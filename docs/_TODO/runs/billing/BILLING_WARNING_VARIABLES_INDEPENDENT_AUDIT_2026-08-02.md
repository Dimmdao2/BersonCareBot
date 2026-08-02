# Переменные суммы и даты в тарифном предупреждении — независимый аудит

Продуктовый коммит: `efd0a09eb`. Интеграция с актуальным `feat`: `ee90c48e`.

Вердикт: **FAIL — одна обязательная правка.**

## Проверенный путь человека

- предупреждение использует только счёт `tariff_period`, начало периода которого точно совпадает с
  `warning.periodEndsAt`;
- счёт `void` не используется;
- при отсутствии подходящего счёта обе переменные остаются плейсхолдерами, цена live-тарифа не подставляется;
- выборка репозитория ограничена переданным `organizationId`;
- текущая лестница доступа и механика `patient_home_today` после интеграции сохранены.

Целевые проверки:

```text
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run src/modules/org-entitlements/accessNotifications.test.ts src/app/app/accessLifecycleSurfaces.ui.test.tsx"
Test Files 2 passed (2)
Tests 25 passed (25)

pnpm --dir packages/operator-db-schema run build && pnpm --dir packages/platform-merge run build && /home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp typecheck"
exit 0

git diff --check
exit 0
```

## MUST FIX 1 — кабинет читает счета без обязательного billing-принципала

Достижимый сценарий: врач открывает кабинет на TEST с `FORCE RLS`. `DoctorSectionLayout` вызывает
`getOrganizationBillingOverview()` напрямую под обычным принципалом сотрудника
(`apps/webapp/src/app/app/doctor/layout.tsx:91-104`). Таблицы SaaS-биллинга читаются только под отдельным
принципалом администратора биллинга клиники; канонический экран биллинга поэтому оборачивает тот же вызов в
`runWithDbClinicBillingPrincipal` и выполняет его последовательно
(`apps/webapp/src/app/app/settings/page.tsx:349-362`).

Прямой запрос будет отклонён RLS, а существующий `.catch(() => null)` скроет ошибку. В результате человек увидит
`{{сумма}}` и `{{дата_начала_периода_автооплаты}}`, хотя подходящий счёт существует. Основное требование этапа на
реальном TEST-контуре не выполняется.

Требуемая граница фикса: читать overview этой же организации через канонический
`runWithDbClinicBillingPrincipal`, используя уже проверенные `organizationId` и `session.user.userId`; не менять
выбор счёта, тексты, лестницу и остальные механики. Из-за подмены роли соединения billing-read нельзя помещать в
параллельный блок с обычными entitlement-запросами — следовать последовательному образцу экрана биллинга.
Повторный blind audit не нужен: достаточно целевых тестов, typecheck и живой проверки под TEST/FORCE RLS.
