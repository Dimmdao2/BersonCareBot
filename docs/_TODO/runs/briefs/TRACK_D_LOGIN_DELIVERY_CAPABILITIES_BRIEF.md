# Track D — TEST login-code delivery и закрытые runtime-setting capabilities

Роль: worker. Канон: `AGENTS.md` §1, §2–§6, §9–§10, §24; product authority —
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` D20/D25/D38 и
`docs/_TODO/runs/integrator-cleanup/D20_INTEGRATOR_MAP.md`.

Источник оракула: `D20_INTEGRATOR_MAP.md` — «дано: канал выключен → когда доставка кода входа → тогда код не
уходит» и «дано: настройка отсутствует → когда проверка → тогда канал считается выключенным (безопасный дефолт)»;
Р-D25 — интегратору остаётся доставка входа; owner auth policy — отключённый канал отклоняется server-side.

## Измеренный разрыв на TEST 03.08

Три реальные попытки `POST /api/bersoncare/send-email` в 01:53:55, 01:55:00 и 01:55:28 дошли до integrator,
`PRE_FORK_DEV_DELIVERY_PASSTHROUGH` сработал, но dispatch вернул `500 email_failed`. В journal у всех одна DB query
fingerprint `debf589a7ab2d4f6`: сначала без principal в auth-policy read, затем `42501` под
`dbPrincipalSource=delivery-handler` в platform availability read. SMTP credential и TLS отдельно проверены: SMTP
`transport.verify()` PASS; ошибка возникает до provider I/O. Тот же fingerprint каждые 5 секунд падает у
`worker:outgoing-delivery-tick` при чтении `outgoing_delivery_reclaim_config`, после чего код молча использует
default. Запись operator incident при provider failure также получает `42501`.

## Требуемый результат

1. Убрать прямое чтение `public.system_settings` из integrator auth-channel policy, platform integration
   availability и outgoing-delivery reclaim config. Все три пути читают канонические строки только через узкие
   SECURITY DEFINER capabilities/DB ports с фиксированным allowlist; общий table `SELECT` runtime-login/worker не
   получает.
2. Auth-channel setting отсутствует/нечитаем — канал выключен. Явный `false` отклоняет forged send до adapter;
   явный `true` разрешает только настроенный provider.
3. Platform integration availability сохраняет канонический persisted `false`; нечитаемый registry fail-closed,
   а не compiled default.
4. Delivery worker читает фактический `outgoing_delivery_reclaim_config` под
   `app_operational_delivery_worker`; capability не открывает ему SMTP/provider secrets или другие settings.
5. Exact provider-failure path может durable open/touch operator incident через узкую capability, не через ambient
   table DML. Не выдавать integrator login/worker широкий DML на `public.operator_incidents`.
6. Успешный email OTP проходит через существующий `dispatchPort`/email adapter и SMTP; не добавлять direct-send,
   второй router, fallback channel или обход platform/auth policy.

Использовать временный high migration number, не добавлять его в journal. Финальный номер/idx/when назначает root
только при land против актуального `feat` после соседних migration repairs и D30. Синхронизировать deploy overlays и
их exact ACL gates: integrator API login получает только нужные EXECUTE; operational worker — только reclaim (и
строго нужный incident capability, если общий incident port требует); PUBLIC/app_staff/app_patient/app_worker и
чужие operational roles — deny. Существующие provider-runtime/SMTP accessors переиспользовать или расширить только
если их semantic boundary остаётся честной; новый общий generic settings reader запрещён.

## Acceptance

- unit: auth missing/unreadable/false → disabled; true → enabled; platform false/unreadable respected;
- dispatch route: email OTP reaches adapter once when auth/platform true and configured, reaches zero adapters when
  either flag false;
- disposable PostgreSQL: exact runtime principals read only allowlisted values; direct table access and forbidden
  keys fail; worker sees non-default reclaim values; operator incident upsert works without table DML grant;
- targeted integrator tests, both relevant typecheck/lint, raw-SQL/import-boundary gates, deploy ACL self-tests,
  journal sync/freeze and `git diff --check` PASS;
- one independent audit against this kill-set before land;
- after land and coordinated TEST deploy: one owner TEST email gets code, HTTP 200, no fresh
  `debf589a7ab2d4f6`/`42501` for request or worker, explicit TEST read-only ACL proof. PROD forbidden.

Scope: integrator runtime-setting/incident DB ports and callers, their tests; one temporary migration; exact
integrator-runtime/C4 deploy overlays and tests; Track D evidence. Do not touch identity semantics, OTP generation,
recipient selection, D30 product code, tariff/CMS/billing, DEV data or PROD.
