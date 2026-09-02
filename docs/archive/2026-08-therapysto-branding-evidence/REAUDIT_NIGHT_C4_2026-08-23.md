# Повторный аудит C4, круг 2

Дата: 2026-08-23

Проверяемые коммиты: `904b03f7e`, `c16ec75a1` (`wt/night-c4-20260823`)

Ветка аудита: `wt/reaudit-c4-20260823`

## Вердикт

**PASS — FOR LAND.**

Блокирующих находок нет. Неблокирующих находок нет. Собственная инъекция в третью ветку поймана:
**убито `1`, непойманного `0`**. Продуктовый код после инъекции восстановлен.

## Oracle и способ проверки

Oracle — `IMPLEMENTATION_PLAN.md`, пункт `C4`: existing SMTP расширяется только sender display data,
добавляются один org-scoped transactional template setting и один mail-profile resolver/renderer. Дополнительные
границы: `TPB-13` не меняет mass mailing, `TPB-16` запрещает параллельный resolver, §1.2e и §1.5 оставляют SMS
отдельной capability вне branding.

Сначала независимо выписан blind kill-set: staff-письмо с patient-именем; patient-письмо со staff-именем;
потеря branded pair/fail-closed; неизвестная или двойная роль с утечкой чужой идентичности; обход единственного
resolver; попадание SMS в mail profile/DB/renderer либо изменение его payload/text. Только после этого прочитаны
заявление фиксера и тесты.

## Полная карта веток доставки

Production-входы получены командой:

```bash
rg -n "startEmailChallenge\\(|startPublicEmailOtpChallenge\\(|startPublicEmailOtpRegistration\\(|sendEmailCode\\(|mailProfile:" \
  apps/webapp/src --glob '*.ts' --glob '!**/*.test.ts' --glob '!**/*.spec.ts'
```

Прямые нижние вызовы перепроверены командой:

```bash
rg -n "sendEmailCodeViaIntegrator\\(|sendEmailAuthCode\\(|sendEmailCode\\(" \
  apps/webapp/src --glob '*.ts' --glob '!**/*.test.ts' --glob '!**/*.spec.ts'
```

| Ветка | Откуда берётся роль/profile | Итоговое имя |
| --- | --- | --- |
| `/api/auth/email-otp/start` | public patient start, literal `client` | `Therapygo` |
| `/api/auth/email-otp/register` | public patient registration, literal `client` | `Therapygo` |
| `/api/auth/email-password/register`, новая регистрация | literal `client` | `Therapygo` |
| `/api/auth/email-password/register`, pending/resend | literal `client` | `Therapygo` |
| `/api/auth/email-password/setup-access` | literal `client` | `Therapygo` |
| `/api/auth/email-password/forgot`, найден credential | роль реально найденного `platform_users` recipient | `client → Therapygo`; `doctor/admin → Therapysto` |
| `/api/auth/email-password/forgot`, `needs_email_setup` | literal `client` | `Therapygo` |
| `/api/auth/email-password/forgot`, recipient не найден | отправки нет, наружу нейтральный ответ | имени нет |
| `/api/auth/email/start` | роль пользователя из session identity | `client → Therapygo`; `doctor/admin → Therapysto` |
| `/api/auth/specialist-signup/start`, новая и resend | literal `doctor` | `Therapysto` |
| `/api/clinic/invites/accept/start` | literal `doctor` | `Therapysto` |
| `/api/doctor/patients/[userId]/email-change` | literal `client` | `Therapygo` |
| `pgEmailSetupAccessPort` | literal `client` | `Therapygo` |
| `patient-invites/service`, email proof | literal `client` | `Therapygo` |
| phone-auth, email fallback | literal `client` | `Therapygo` |
| phone-auth, Telegram/MAX `/send-otp` | literal `client`, общий mail renderer | `Therapygo` в тексте кода |
| phone-auth, SMS `/send-sms` | отдельная ранняя SMS-ветка без mail profile/renderer | прежний текст `Ваш код BersonCare: …` |

Обе email-цепочки сходятся в один integrator adapter: синхронная через `sendEmailAuthCode` и queued через
`pgEmailAuth.startEmailChallenge`. `/send-email` и Telegram/MAX `/send-otp` вызывают тот же renderer. Branded
profile намеренно не имеет production caller на C4: подключение clinic surface относится к следующим этапам;
сам fail-closed на отсутствии owner copy сохранён в integrator unit-test.

## Роль получателя и отсутствие утечки идентичности

`UserRole` допускает только `client | doctor | admin`. В `platform_users` роль `NOT NULL` и ограничена тем же
CHECK; session boundary дополнительно прогоняет значение через `parseUserRole`/Zod. Поэтому достижимый production
вход не может передать неизвестную роль resolver-у.

В `forgot` роль читается по `userId` фактического reset-recipient. Если recipient отсутствует, письмо не
отправляется; invalid DB-role отклоняется на parse boundary до выбора profile и отправки. Сам
`platformMailProfileForRecipientRole` технически использует staff как non-client fallback, но произвольное
runtime-значение к нему не приходит ни из одного найденного production caller.

Двойное присутствие человека в staff- и patient-доменных таблицах не создаёт неоднозначности: lookup не
соревнуется между двумя коллекциями, а использует одну каноническую строку `platform_users` с одной ролью.
`doctor/admin` получает `Therapysto`, `client` — `Therapygo`; membership/enrollment не переопределяет имя.

## SMS действительно откачен

Побайтовая проверка трёх SMS-контрактных файлов против состояния непосредственно до C4:

```bash
git diff --exit-code 7b1ef9ba6^ HEAD -- \
  apps/integrator/src/integrations/bersoncare/sendSmsRoute.ts \
  apps/integrator/src/integrations/bersoncare/deliveryIdempotency.route.test.ts \
  apps/webapp/src/infra/integrations/sms/integratorSmsDelivery.ts
# sms_contract_rc=0
```

Дополнительно просмотрены `integratorSmsAdapter.ts` и `routes.ts`. Оставшийся C4 diff относится только к email
fallback и Telegram/MAX: SMS возвращается раньше через `deliverSmsCodeViaIntegrator`, payload остаётся
`phone/code/idempotencyKey`, `/send-sms` не получает DB dependency, mail profile или renderer, текст остаётся
`Ваш код BersonCare: ${code}`.

## Один resolver / renderer (`TPB-16`)

```bash
resolver_defs=$(rg -n "^export function platformMailProfileForRecipientRole" apps/webapp/src \
  --glob '*.ts' --glob '!**/*.test.ts' | wc -l)
renderer_defs=$(rg -n "^export async function resolveAndRenderAuthCodeMailProfile" apps/integrator/src \
  --glob '*.ts' --glob '!**/*.test.ts' | wc -l)
direct_platform_calls=$(rg -n "platformMailProfile\\(" apps/webapp/src \
  --glob '*.ts' --glob '!**/*.test.ts' --glob '!**/*.spec.ts' | wc -l)
```

Результат: `platform_role_resolver_definitions=1`, `auth_mail_renderer_definitions=1`,
`direct_platformMailProfile_calls=0`. Два production callsite integrator-а используют одну и ту же definition,
второго renderer/store/getter не найдено.

Org-scoped template также один. После первичного `code-search` точный подсчёт
`rg -l "clinic_transactional_mail_template" apps/webapp/db/drizzle-migrations --glob '*.sql' | wc -l` дал
`migration_files_with_setting=1`. Единственный key входит в typed `IntegratorClinicDeliveryCredentialKey`,
читается с `organizationId` через один DB port и SQL-root ограничивает его `scope = 'admin'` и точным
`organization_id`; отсутствующее или невалидное owner copy останавливает branded delivery до SMTP.

## Собственная инъекция в третьей ветке

Выбрана `/api/clinic/invites/accept/start`: это не авторская `/api/auth/email/start` и не ветка
`specialist-signup` из круга 1. В существующий компактный route-test добавлен acceptance-case, который проверяет
реальный вызов `startEmailChallenge` и staff profile `Therapysto`.

Baseline:

```bash
pnpm --dir apps/webapp exec vitest --run src/app/api/clinic/invites/route.route.test.ts
# 1 file passed, 5 tests passed
```

Fault injection в production route: `platformMailProfileForRecipientRole('doctor')` временно заменён на
`platformMailProfileForRecipientRole('client')`. Та же команда дала `1 failed, 4 passed`: ожидался
`Therapysto`, получен `Therapygo`. Инъекция откачена; baseline снова входит в зелёный webapp packet.

Тест аудитора круга 1 не ослаблен:

```bash
git diff --exit-code f23876e7b HEAD -- apps/webapp/src/modules/auth/passwordAuth.route.test.ts
# round1_auditor_test_diff_rc=0
```

## Проверки

- `node scripts/check-migration-privileges.mjs` → `check-migration-privileges: OK (55 migration files)`.
- Webapp C4 packet: пять файлов дали `28 passed`; после сборки workspace prerequisite
  `@bersoncare/db-principal` оставшийся `pgEmailAuth.startChallenge.unit.test.ts` дал `2 passed`.
- Integrator C4 packet: три файла дали `9 passed`; после сборки workspace prerequisite
  `@bersoncare/operator-db-schema` оставшиеся два route-файла дали `11 passed`.
- `pnpm --dir apps/webapp typecheck` → exit `0` после сборки workspace prerequisites.
- `pnpm --dir apps/integrator typecheck` → exit `0`.
- `pnpm --dir apps/webapp exec eslint src/app/api/clinic/invites/route.route.test.ts` → exit `0`.

Полный CI не запускался: проверялся ограниченный C4 diff, scoped packets, оба typecheck и изменённый тест; после
них не осталось отдельного интеграционного риска, для которого §9 требовал бы полный прогон. DEV, TEST, PROD,
deploy, push и порт 5200 не тронуты.

## Итог

Обе блокирующие находки круга 1 закрыты без обхода oracle: password reset выбирает имя по фактической роли,
SMS возвращён к pre-C4 контракту. Независимая перепись production branches не нашла следующей пропущенной ветки;
новый acceptance-test ловит поломку отдельной staff-ветки. C4 можно приземлять.
