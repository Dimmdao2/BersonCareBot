# D17 — права владельцев швов, исправление круга 2

Источник оракула: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D17 — «узкая роль
интегратора не мешает доставке». Блокеры: `D17_SEAM_OWNER_AUDIT_2026-08-23.md`.

## Итог

Закрыты все четыре блокера аудита.

1. `app_seam_delivery_scope_owner` снова получает на `user_channel_preferences` только пять объявленных
   колонок; табличный грант удалён полностью.
2. На `user_contacts` добавлены только `confirmed_at` и `is_primary` к прежним трём колонкам; табличного
   гранта нет.
3. Rollback-only DB-proof отзывает именно две добавленные колонки. Полный кандидатный набор даёт JSON с
   `"ok"`, прежний набор даёт `42501`, возврат двух колонок снова даёт JSON с `"ok"`.
4. Перепись больше не сворачивает разные корни через `min(access_status)`: её единица —
   `function_identity × relation × operation`, а каждый найденный разрыв печатается с именем корня.

Пункт 5 аудитора (колоночный экстрактор тела против declaration) самим аудитом помечен как owner-question
вне scope этой ветки и не реализован.

## Generated-права

Команды генерации:

```bash
node deploy/postgres/privileges/generate-cli.mjs --all
node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only
```

Обе целевые БД теперь получают такие строки:

```sql
GRANT SELECT ("channel_code", "is_enabled_for_messages", "is_enabled_for_notifications", "is_preferred_for_auth", "platform_user_id") ON TABLE "public"."user_channel_preferences" TO "app_seam_delivery_scope_owner";
GRANT SELECT ("confirmed_at", "contact_kind", "is_primary", "platform_user_id", "value_normalized") ON TABLE "public"."user_contacts" TO "app_seam_delivery_scope_owner";
```

`source_origin`, `id`, `created_at`, `updated_at` владельцу этого шва не открыты.

## Перепись по корням

Команда:

```bash
node deploy/postgres/privileges/seam-owner-access-census.mjs --db bcb_webapp_dev
```

Результат на живом DEV-каталоге без reconcile/`--execute`:

```text
owners=43
requirements=1389
missing_or_partial=2
```

Обе строки теперь видны поимённо:

- `app_seam_delivery_scope_owner` →
  `app.read_integrator_delivery_target_snapshot(uuid,text,text,text,uuid,bigint,text,timestamp with time zone)`
  → `public.user_contacts` / `SELECT`: живой каталог ещё несёт прежние три колонки; кандидат доказывается
  rollback-only тестом ниже.
- `app_seam_identity_lookup_owner` → `app.pre_session_get_default_auth_otp_channel(uuid)` →
  `public.user_channel_bindings` / `SELECT`: declaration/generated уже несут `created_at`, живой DEV не догнан
  reconcile; продуктовой правки круг 2 не требует, как установил аудит.

## Проверки

```bash
node deploy/postgres/privileges/generate-cli.mjs --all --check
```

Результат: privileges и allowlist для `bcb_webapp_dev` и `bersoncarebot_test` совпали побайтно.

```bash
node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only --check
```

Результат: оба port-context artifact совпали побайтно.

```bash
node --test deploy/postgres/privileges/relation-access.test.mjs deploy/postgres/privileges/function-census.test.mjs
```

Результат: `57/57` pass.

```bash
RUN_D17_SEAM_OWNER_DB=1 node --test deploy/postgres/privileges/seam-owner-delivery-target.devDbProof.test.mjs
```

Результат: `1/1` pass; внутри одного `BEGIN … ROLLBACK` наблюдалось `ok → 42501 → ok` при отзыве и возврате
только `confirmed_at, is_primary`.

Самотест регрессии: из `declaration.ts` временно удалены `confirmed_at, is_primary`, затем выполнены

```bash
node deploy/postgres/privileges/generate-cli.mjs --all
RUN_D17_SEAM_OWNER_DB=1 node --test deploy/postgres/privileges/seam-owner-delivery-target.devDbProof.test.mjs
```

Результат: `0/1`, baseline стал `42501`; после возврата двух колонок и регенерации команда снова дала `1/1`.

```bash
pnpm typecheck
pnpm lint
```

Результат: typecheck exit 0; lint exit 0, две существующие warning в
`apps/webapp/src/app/app/doctor/calendar/AppointmentPaymentSection.tsx`, ошибок нет.

`--execute`, TEST, PROD и push не выполнялись. Миграции не менялись.
