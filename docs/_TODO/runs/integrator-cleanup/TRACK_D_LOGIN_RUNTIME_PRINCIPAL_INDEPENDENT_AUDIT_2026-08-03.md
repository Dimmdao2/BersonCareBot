# Track D login runtime principal — independent audit

Verdict: **PASS к land** для кандидата `4054417ea` поверх `051b42e98`.

Проверенный достижимый путь: locked TEST `POST /api/auth/email-otp/start` → подписанный M2M
`POST /api/bersoncare/send-email` → `isAuthChannelEnabled('email')` →
`app.read_integrator_auth_channel_setting(text)`.

- Bootstrap-классификация создаётся только при полном отсутствии principal и использует уже
  зарегистрированный locked-source `integrator-server-runtime-config`; существующий request/worker principal
  не заменяется, после async-вызова временный principal не протекает наружу.
- Выбор настройки закрыт двумя слоями: TypeScript `Record<AuthChannel, fixed key>` и allowlist из четырёх
  ключей внутри `SECURITY DEFINER` функции. Произвольного чтения `public.system_settings` этот путь не даёт.
- Проверка подписи M2M выполняется до policy-read. Missing/malformed/denied DB read остаётся fail-closed `false`
  и останавливает provider I/O ответом `403 auth_channel_disabled`.
- Продуктовая ветка, БД и deploy не изменялись.

Evidence:

- `pnpm --dir apps/integrator exec vitest --run src/infra/db/authChannelPolicy.test.ts src/infra/db/withClient.test.ts src/integrations/bersoncare/sendEmailRoute.route.test.ts` → 3 files, 15 tests PASS.
- `pnpm --dir apps/integrator run typecheck` → PASS.
- `pnpm exec eslint apps/integrator/src/infra/db/authChannelPolicy.ts apps/integrator/src/infra/db/authChannelPolicy.test.ts` → PASS.
- Одноразовый `pnpm --dir apps/integrator exec tsx -e <existing-principal probe>` → `existing-principal-preserved: PASS`; probe подтвердил сохранение organization principal внутри policy-read и отсутствие утечки после выхода.

