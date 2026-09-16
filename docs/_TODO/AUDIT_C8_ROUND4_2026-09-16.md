# AUDIT C8 ROUND 4: почтовый гейт и покрытие

Verdict: **FAIL**

Oracle: `docs/_TODO/STAFF_DOORS_HARDCODED_2026-09-16.md`, С8 «Почтовый код обязан доставляться там, где поверхность сама его потребовала», включая различие `login_door` / `surface_requested`. Двери staff и platform_admin сверены отдельно; ветка platform-admin login одним подтверждённым email из scope исключена brief-ом.

## MUST FIX: 2

1. **Фактическая доставка при настроенной БД обходит новый гейт.**

   Классификация: **тест** (повторяемое поведение доставки).

   `apps/webapp/src/modules/auth/authDeliveryGate.ts:30-32` проверяет configured email только в `withAuthDeliveryChannelGate`, но `apps/webapp/src/modules/auth/emailAuth.ts:336-352` вызывает порт отправки лишь в ветке `!webappRuntimeDatabaseIsConfigured()`. В реальном пути `emailAuth.ts:365-377` вызывает `pgEmailAuth.ts:90-93`; DB root немедленно кладёт `auth_email_otp` в `outgoing_delivery_queue` (`apps/webapp/db/drizzle-migrations/20260823T043206_deliver_c4_mail_profile_tenant_binding.sql:125-156`). В этом payload нет ни назначения гейта, ни проверки configured channel.

   Достижимый сценарий: врач проходит пароль, клиника требует email-фактор, `apps/webapp/src/app/api/auth/email-password/login/route.ts:267-273` создаёт `staff_login_factor`; при настроенной БД он попадает в очередь, не проходя C8-гейт. Значит `surface_requested` не гарантирует «только настроенный канал», а изменения адаптера защищают только memory/fallback путь.

   Шестая мутация: в `authDeliveryGate.ts` ветка `surface_requested` была временно заменена на `true`. Она не дала ни одного красного теста: **7 files / 35 tests passed**. Мутация снята. Нужен тест на реальный DB/queue путь (и исправление в его общем choke point), который краснеет, если configured-channel check удалён.

2. **Два новых route-теста закрепляют внутренние аргументы вместо наблюдаемого результата C8.**

   Классификация: **тест**.

   - `apps/webapp/src/app/api/doctor/patients/[userId]/email-change/route.route.test.ts:75-80`
   - `apps/webapp/src/app/api/patient/email-change/confirm/route.route.test.ts:67-72`

   В обоих случаях `toHaveBeenCalledWith(..., 'patient_email_change', expect.anything())` повторяет внутренний вызов собственного auth-модуля. Независимый oracle C8 — маршрут не отвечает `503 auth_channel_disabled`, когда login door закрыта, а transactional email configured; это уже наблюдается статусом ответа. `startEmailChallenge` / `confirmLatestEmailChallengeCodeForUser` не являются внешним конечным side effect, поэтому точный внутренний DTO запрещён §10a. Убрать эти assertions либо заменить проверкой конечного публичного результата; отрицательные assertions «не вызвать при 503» допустимы и могут остаться.

## Проверено

- **Дверь (тест):** `email-otp/start` и `email-otp/confirm` продолжают проверять policy конкретного портала до создания/подтверждения code challenge. В `publicAuthPolicy.unit.test.ts` persisted staff/platform-admin значения игнорируются для обеих поверхностей. Целевой прогон ниже зелёный.
- **Покрытие назначения (тест):** `integratorEmailAdapter.deliveryPurpose.unit.test.ts` имеет исчерпывающий `Record<EmailChallengePurpose, ...>` и наблюдает внешний signed `fetch`, поэтому проверка mapping `login` против восьми surface-requested purpose не является тестом текста.
- **Маршрутные правки приглашения и смены почты (тест):** честные policy fakes различают login door (`false`) и transactional channel (`true`); возврат четырёх маршрутов к login policy краснеет. Новые положительные internal-argument assertions отмечены выше отдельно.
- **Объём (взгляд):** изменения C8 соответствуют `docs/_TODO/C8_EMAIL_DELIVERY_GATE_2026-09-16.md`: новый purpose гейта, его вызывающие места, четыре маршрута и их evidence. Добавленной вне С8 продуктовой области не найдено.

## Команды и результаты

Базовый targeted run:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project unit --project route src/infra/integrations/email/integratorEmailAdapter.deliveryPurpose.unit.test.ts src/modules/auth/authDeliveryGate.unit.test.ts src/app/api/auth/email-otp/start/route.route.test.ts src/app/api/auth/email-otp/confirm/route.route.test.ts src/app/api/clinic/invites/route.route.test.ts 'src/app/api/doctor/patients/[userId]/email-change/route.route.test.ts' src/app/api/patient/email-change/confirm/route.route.test.ts"
```

Result: **7 files passed, 35 tests passed**.

The identical command after the temporary sixth mutation also returned **7 files passed, 35 tests passed**. The production-code mutation was reverted before this report.
