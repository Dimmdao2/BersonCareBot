# Карта кода — аудит (фаза 0)

Использовать при [PHASE_00](PHASE_00_AUDIT_AND_AGREEMENT.md). Отметки `[x]` — по факту просмотра в репозитории.

## Rubitime и приёмы

| Область | Где смотреть | Вопрос для аудита |
|---------|--------------|-------------------|
| События created/updated | `apps/integrator` — Rubitime handlers, `recordM2mRoute` | Создаётся ли `platform_user`? |
| `appointment_records` | integrator + webapp projection | Когда заполняется `platform_user_id`? |
| Email autobind | `pgUserProjection.applyRubitimeEmailAutobind`, `INTEGRATOR_CONTRACT` Flow | Только contact или verified? |
| Поиск по телефону | `ensureClientFromAppointmentProjection`, trusted phone | Порядок phone → email |
| Поиск по email | projection / merge preview | Конфликты при совпадении |
| UI «В Rubitime» | doctor appointments | Имя не затирается? |

## Email и пароль (webapp)

| Область | Где смотреть | Вопрос для аудита |
|---------|--------------|-------------------|
| OTP / challenge | `modules/auth/emailAuth.ts` | `sendEmailCodeViaIntegrator` |
| Регистрация | `api/auth/email-password/register` | `duplicate_email`, `tryResendRegistrationChallenge` |
| Forgot / reset | `api/auth/email-password/forgot`, `reset` | Silent success, условия отправки |
| Email в сессии | `api/auth/email/start`, `confirm` | Профиль пациента |
| Пароль | `infra/repos/pgUserPasswordCredentials.ts` | `findVerifiedUserIdWithPassword` |
| UI | `shared/ui/auth/AuthFlowV2.tsx` | forgot / register copy |
| Письмо | integrator `sendEmailRoute.ts`, webapp `integratorEmailAdapter.ts` | SMTP `smtp_outbound` |

## Врач / admin

| Область | Где смотреть | Вопрос для аудита |
|---------|--------------|-------------------|
| PATCH email | `pgUserProjection.patchAdminClientProfile` | `email_verified_at` при смене |
| UI | `AdminClientProfileEditPanel.tsx` | Показ verified |

## Merge

| Область | Где смотреть |
|---------|--------------|
| Manual merge | `PLATFORM_USER_MERGE.md`, `runManualPlatformUserMerge` |
| Integrator merge | `mergeIntegratorUsers.ts` |
| Rubitime + bot same phone | сценарии в MAIN PLAN §7 |

## Выход аудита (заполнить в LOG)

- [x] Где Rubitime **не** привязывает `platform_user_id` — см. [`AUDIT_REPORT.md`](AUDIT_REPORT.md) §2
- [x] Текущий find/create by phone/email — `ensureAppointmentClientTx` (phone → integrator_id); email только `applyRubitimeEmailAutobind` by phone
- [x] Список файлов на изменение по фазам 1–5 — AUDIT §9
- [x] Миграция `user_email_setup_tokens` — **нужна** (фаза 3)
