# AUDIT GLOBAL — AUTH_RESTRUCTURE (Stages 1-8)

Дата аудита: 2026-04-04  
Дата закрытия GLOBAL FIX: 2026-04-04

## verdict

**PASS**

## audit coverage

Проверены:

- `docs/AUTH_RESTRUCTURE/MASTER_PLAN.md`
- `docs/AUTH_RESTRUCTURE/STAGE_*.md` (1-8)
- `docs/AUTH_RESTRUCTURE/AUDIT_STAGE_*.md` (1-8)
- `docs/AUTH_RESTRUCTURE/AGENT_EXECUTION_LOG.md`
- Синхронизация с кодом: `AuthFlowV2`, `otpChannelUi`, `checkPhoneMethods`, `auth.md`, `integratorSmsAdapter`, `system-settings/types`.

## findings by severity

### Critical

Нет.

### Major

Нет.

### Minor

Нет (закрыто GLOBAL FIX: тесты оркестрации callback + runbook `email_ambiguous` в `auth.md`).

### Informational

1. **Часть веток email в UI сохранена как технический контракт, но публично недостижима.**
   В `AuthFlowV2` есть generic-ветки описания email-канала, однако публичный порядок каналов (`OTP_PUBLIC_OTHER_CHANNELS_ORDER`) и `isOtpChannelAvailablePublic` исключают email в публичном входе.
2. **Max onboarding — inline `request_contact` (не reply-клавиатура).**
   В `max.start.onboarding` пользователь получает кнопку шаринга контакта в inline-сообщении (как в остальных Max-ветках и M2M); вложение контакта — дополнительный путь. См. `max/user/scripts.json`, `deliveryAdapter`.

## gate closure status (Stages 1-8)

1. **Stage gates:** закрыты по `AUDIT_STAGE_1.md` ... `AUDIT_STAGE_8.md` с verdict `PASS`; открытых `REWORK_REQUIRED` по stage-аудитам нет.
2. **Product constraints:**
   - **PIN hidden in public flow** — соблюдено (`AuthFlowV2` без шагов `pin/set_pin`).
   - **OAuth в публичном UI** — на момент GLOBAL FIX кнопок OAuth в `AuthFlowV2` не было; **по состоянию на 2026-04-13** в UI входа показываются Яндекс, Google, Telegram, Max и при необходимости только-Apple (см. `apps/webapp/src/modules/auth/auth.md`, `docs/REPORTS/LOGIN_WEBAPP_UX_SYNC_2026-04-13.md`).
   - **Email profile-only (не публичный first-screen method)** — соблюдено (`isOtpChannelAvailablePublic` запрещает email в публичном входе).
3. **Документация vs код:** синхронизированы в канонических источниках (`apps/webapp/src/modules/auth/auth.md`, `docs/AUTH_RESTRUCTURE/auth.md`, обновленный `MASTER_PLAN.md`).
4. **CI evidence:** зафиксирована в `AGENT_EXECUTION_LOG.md` (GLOBAL FIX: `pnpm run ci` exit 0).
5. **Открытые critical/major без плана:** не обнаружены.

## global residual risks

1. **Ambiguous email merge в OAuth fallback.**
   При нескольких `platform_users` с одним verified email fallback корректно останавливается с `email_ambiguous`; операторская процедура зафиксирована в `apps/webapp/src/modules/auth/auth.md`.
2. **Operational cost visibility по SMS зависит от корреляции логов.**
   `phone_otp_delivery` фиксирует попытки на стороне webapp adapter, но финальная тарификация остаётся во внешнем провайдере/интеграторе.
3. **Legacy/docs drift риск вне initiative scope.**
   Архивные документы могут содержать устаревшие формулировки; они не влияют на gate текущей инициативы, но могут вводить в заблуждение при неселективном чтении.

## MANDATORY FIX INSTRUCTIONS

**Статус: закрыто (GLOBAL FIX 2026-04-04).**

Исходно **critical / major** в итоговом аудите отсутствовали; обязательных правок коду не требовалось.

Закрытые пункты из блока «устойчивость после релиза» (были рекомендациями, не gate):

1. **Runbook `email_ambiguous`** — добавлен абзац в `apps/webapp/src/modules/auth/auth.md` (раздел OAuth).
2. **Покрытие оркестрации callback** — в `apps/webapp/src/app/api/auth/oauth/callback/route.test.ts` добавлены тесты со `vi.spyOn(resolveUserIdForYandexOAuth)`: ветка `email_ambiguous` и happy-path с `userId` от resolver → `findByUserId` → `setSessionFromUser`.

---

## Post-fix verdict

**PASS**
