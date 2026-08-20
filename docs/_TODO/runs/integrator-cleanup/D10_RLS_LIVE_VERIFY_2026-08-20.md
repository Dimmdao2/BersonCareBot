# D10 — live verification of replay-principal RLS (2026-08-20)

Candidate: `183b2b44b` (`fix(integrator): reject cross-tenant direct retries (#987)`).

Authority: `WORK_ORDER.md` D10, `AGENTS.md` §5.1.4, handoff
`8f4fdefbe` / `D10_REPLAY_PRINCIPAL_RLS_AUDIT_2026-08-20.md`.

## Итог

**OVERALL: FAIL.** Новые worker RLS-предикаты сами по себе верны, но с точными
ACL кандидата штатные `executeDirectPublicWriteRetry`-операции на обеих целевых
таблицах падают с `42501 permission denied for table` до проверки RLS.

| Пункт | Вердикт | Результат |
| --- | --- | --- |
| 1. Штатный worker-путь | **FAIL** | Оба точных `INSERT ... ON CONFLICT` получают `42501` с ACL кандидата. |
| 2. DB/RLS backstop | **PASS** | После добавления только диагностического `GRANT SELECT` внутри откатываемой транзакции matching/processing пишет, cross-org и non-processing получают RLS `42501`. |
| 3. `app_staff` | **PASS** | Штатные own-org INSERT в обе таблицы успешны, видны как `1/1`. |
| 4. pre-existing `evidence` | **PASS** | Та же несовместимая строка уже есть в `566a7935f3`; номер строки до D10 был 5793, после вставок D10 стал 6023. |
| 5. generator check | **PASS** | Все четыре generated artifact совпадают побайтно, exit 0. |

## Среда и способ прогона

Использована только именованная DEV-БД `bcb_webapp_dev` через канонический
admin socket. DEV ещё не содержал D10-таблицу/политики, поэтому в начале каждой
проверочной транзакции выполнялись обе D10-миграции и точные generated grants /
policies кандидата; каждая транзакция завершалась `ROLLBACK`.

Команда финального живого прогона (без пайпа):

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -f .d10-rls-live-verify.sql
```

Результат команды: `EXIT_CODE=0`. Ожидаемые отрицательные statements ловились
через savepoint с печатью `:SQLSTATE`; ненулевой код отдельного statement не был
скрыт как положительный результат.

Транзакционный setup:

```sql
BEGIN;
INSERT INTO app_control.relation_wall_registry
  (schema_name, table_name, data_class, wall, expected_owner)
VALUES ('integrator', 'direct_public_write_retries', 'S', 'platform-role', 'app_object_owner')
ON CONFLICT (schema_name, table_name) DO UPDATE
SET data_class = EXCLUDED.data_class,
    wall = EXCLUDED.wall,
    expected_owner = EXCLUDED.expected_owner;

SET LOCAL ROLE app_object_owner;
\ir apps/webapp/db/drizzle-migrations/20260820T100444_direct_public_write_retries.sql
\ir apps/webapp/db/drizzle-migrations/20260820T122628_direct_public_write_retry_org_invariant.sql
RESET ROLE;
```

После миграций в той же транзакции применялись D10-фрагменты из
`deploy/postgres/generated/privileges.bcb_webapp_dev.sql`: ownership/RLS таблицы
retry, точные grants кандидата и `rev10_context_gate_*`,
`rev10_delivery_replay_staff_*`, `rev10_delivery_replay_worker_*` для двух
public-таблиц. Проверяемые worker policies были:

```sql
CREATE POLICY rev10_delivery_replay_worker_86
ON public.content_access_grants_webapp
AS PERMISSIVE FOR ALL TO app_operational_delivery_worker
USING (EXISTS (
  SELECT 1 FROM integrator.direct_public_write_retries AS claimed_retry
  WHERE claimed_retry.status = 'processing'
    AND claimed_retry.operation = 'content_access_grant_upsert'
    AND claimed_retry.organization_id = content_access_grants_webapp.organization_id
    AND claimed_retry.payload ->> 'organizationId' = content_access_grants_webapp.organization_id::text
    AND claimed_retry.payload ->> 'integratorGrantId' = content_access_grants_webapp.integrator_grant_id
))
WITH CHECK (EXISTS (
  SELECT 1 FROM integrator.direct_public_write_retries AS claimed_retry
  WHERE claimed_retry.status = 'processing'
    AND claimed_retry.operation = 'content_access_grant_upsert'
    AND claimed_retry.organization_id = content_access_grants_webapp.organization_id
    AND claimed_retry.payload ->> 'organizationId' = content_access_grants_webapp.organization_id::text
    AND claimed_retry.payload ->> 'integratorGrantId' = content_access_grants_webapp.integrator_grant_id
));

CREATE POLICY rev10_delivery_replay_worker_172
ON public.reminder_delivery_events
AS PERMISSIVE FOR ALL TO app_operational_delivery_worker
USING (EXISTS (
  SELECT 1 FROM integrator.direct_public_write_retries AS claimed_retry
  WHERE claimed_retry.status = 'processing'
    AND claimed_retry.operation = 'reminder_delivery_log_append'
    AND claimed_retry.organization_id = reminder_delivery_events.organization_id
    AND claimed_retry.payload ->> 'organizationId' = reminder_delivery_events.organization_id::text
    AND claimed_retry.payload ->> 'integratorDeliveryLogId' = reminder_delivery_events.integrator_delivery_log_id
))
WITH CHECK (EXISTS (
  SELECT 1 FROM integrator.direct_public_write_retries AS claimed_retry
  WHERE claimed_retry.status = 'processing'
    AND claimed_retry.operation = 'reminder_delivery_log_append'
    AND claimed_retry.organization_id = reminder_delivery_events.organization_id
    AND claimed_retry.payload ->> 'organizationId' = reminder_delivery_events.organization_id::text
    AND claimed_retry.payload ->> 'integratorDeliveryLogId' = reminder_delivery_events.integrator_delivery_log_id
));
```

Контексты создавались штатным `app.begin_port_context`: session user
`bcb_dev_integrator` стал `app_operational_delivery_worker`, а
`bcb_dev_webapp_staff` — `app_staff` с
`current_org_id() = a0000000-0000-4000-8000-000000000001`.

## 1. Штатный worker-путь — FAIL

Matching retry fixtures:

```sql
INSERT INTO integrator.direct_public_write_retries
  (operation, organization_id, idempotency_key, payload, status)
VALUES
  ('content_access_grant_upsert', 'a0000000-0000-4000-8000-000000000001',
   'd10-live-content-ok',
   '{"organizationId":"a0000000-0000-4000-8000-000000000001","integratorGrantId":"d10-live-content-ok"}',
   'processing'),
  ('reminder_delivery_log_append', 'a0000000-0000-4000-8000-000000000001',
   'd10-live-delivery-ok',
   '{"organizationId":"a0000000-0000-4000-8000-000000000001","integratorDeliveryLogId":"d10-live-delivery-ok"}',
   'processing');
```

Точный shape content-write из `executeDirectPublicWriteRetry`:

```sql
INSERT INTO public.content_access_grants_webapp (
  organization_id, integrator_grant_id, platform_user_id, integrator_user_id,
  content_id, purpose, token_hash, expires_at, revoked_at, meta_json, created_at
) VALUES (
  'a0000000-0000-4000-8000-000000000001', 'd10-live-content-ok', NULL, 900001,
  'd10-live-content', 'audit', NULL, now() + interval '1 hour', NULL, '{}'::jsonb, now()
) ON CONFLICT (integrator_grant_id) DO UPDATE SET
  organization_id = EXCLUDED.organization_id,
  platform_user_id = COALESCE(EXCLUDED.platform_user_id,
    content_access_grants_webapp.platform_user_id),
  integrator_user_id = EXCLUDED.integrator_user_id,
  content_id = EXCLUDED.content_id,
  purpose = EXCLUDED.purpose,
  token_hash = EXCLUDED.token_hash,
  expires_at = EXCLUDED.expires_at,
  revoked_at = EXCLUDED.revoked_at,
  meta_json = EXCLUDED.meta_json;
```

Результат: `ERROR: permission denied for table content_access_grants_webapp`,
`SQLSTATE=42501`.

Точный shape delivery-write:

```sql
INSERT INTO public.reminder_delivery_events (
  organization_id, integrator_delivery_log_id, integrator_occurrence_id,
  integrator_rule_id, integrator_user_id, channel, status, error_code,
  payload_json, created_at
) VALUES (
  'a0000000-0000-4000-8000-000000000001', 'd10-live-delivery-ok',
  'd10-occurrence-ok', 'd10-rule-ok', 900001, 'telegram', 'success', NULL,
  '{}'::jsonb, now()
) ON CONFLICT (integrator_delivery_log_id) DO NOTHING;
```

Результат: `ERROR: permission denied for table reminder_delivery_events`,
`SQLSTATE=42501`.

### Finding / handoff

Достижимый сценарий: worker забирает валидный retry со статусом `processing`,
затем выполняет штатный `INSERT ... ON CONFLICT`. Декларация даёт content-таблице
только `SELECT(platform_user_id)` и не даёт delivery-таблице `SELECT`; этих прав
недостаточно для соответствующих `ON CONFLICT` statements. Обе операции падают
до RLS. Последствие: legitimate direct retry не записывает grant/delivery event и
не может завершить штатное восстановление транспорта. Нарушено обязательное
поведение пункта 1 и operational durability D10. Исправление не вносилось.

## 2. Cross-org / non-processing RLS backstop — PASS

Чтобы отделить RLS от найденной ACL-поломки, в новой откатываемой транзакции
добавлены только диагностические права:

```sql
GRANT SELECT ON TABLE public.content_access_grants_webapp
  TO app_operational_delivery_worker;
GRANT SELECT ON TABLE public.reminder_delivery_events
  TO app_operational_delivery_worker;
```

После этого те же matching/processing statements дали `INSERT 0 1` и
`INSERT 0 1`. Затем напрямую SQL, минуя app-код:

```sql
-- retry.organization_id = org A, payload.organizationId = org D,
-- status = dead; записываем строку org D с совпадающим integratorGrantId
INSERT INTO public.content_access_grants_webapp (
  organization_id, integrator_grant_id, platform_user_id, integrator_user_id,
  content_id, purpose, token_hash, expires_at, revoked_at, meta_json, created_at
) VALUES (
  'd0000000-0000-4000-8000-000000000004', 'd10-rls-content-cross-org', NULL,
  901002, 'd10-rls-content-cross-org', 'audit', NULL, now() + interval '1 hour',
  NULL, '{}'::jsonb, now()
) ON CONFLICT (integrator_grant_id) DO UPDATE SET
  organization_id = EXCLUDED.organization_id,
  platform_user_id = COALESCE(EXCLUDED.platform_user_id,
    content_access_grants_webapp.platform_user_id),
  integrator_user_id = EXCLUDED.integrator_user_id,
  content_id = EXCLUDED.content_id,
  purpose = EXCLUDED.purpose,
  token_hash = EXCLUDED.token_hash,
  expires_at = EXCLUDED.expires_at,
  revoked_at = EXCLUDED.revoked_at,
  meta_json = EXCLUDED.meta_json;

-- matching org/id, but retry.status = pending
INSERT INTO public.reminder_delivery_events (
  organization_id, integrator_delivery_log_id, integrator_occurrence_id,
  integrator_rule_id, integrator_user_id, channel, status, error_code,
  payload_json, created_at
) VALUES (
  'a0000000-0000-4000-8000-000000000001', 'd10-rls-delivery-pending',
  'd10-rls-occurrence-pending', 'd10-rls-rule-pending', 901003, 'telegram',
  'success', NULL, '{}'::jsonb, now()
) ON CONFLICT (integrator_delivery_log_id) DO NOTHING;
```

Результаты:

- cross-org content: `new row violates row-level security policy`, `SQLSTATE=42501`;
- pending delivery: `new row violates row-level security policy`, `SQLSTATE=42501`.

Это доказывает именно новый RLS backstop: положительные statements доходят до
записи, отрицательные отличаются сообщением RLS и блокируются самой БД.

## 3. `app_staff` — PASS

Под `app_staff`, org A, выполнены обычные own-org INSERT без worker retry:

```sql
INSERT INTO public.content_access_grants_webapp (
  organization_id, integrator_grant_id, platform_user_id, integrator_user_id,
  content_id, purpose, token_hash, expires_at, revoked_at, meta_json, created_at
) VALUES (
  'a0000000-0000-4000-8000-000000000001', 'd10-live-staff-content', NULL, 900011,
  'd10-live-staff-content', 'audit', NULL, now() + interval '1 hour', NULL,
  '{}'::jsonb, now()
);

INSERT INTO public.reminder_delivery_events (
  organization_id, integrator_delivery_log_id, integrator_occurrence_id,
  integrator_rule_id, integrator_user_id, channel, status, error_code,
  payload_json, created_at
) VALUES (
  'a0000000-0000-4000-8000-000000000001', 'd10-live-staff-delivery',
  'd10-staff-occurrence', 'd10-staff-rule', 900011, 'telegram', 'success', NULL,
  '{}'::jsonb, now()
);
```

Результат: оба statements — `INSERT 0 1`; контрольный SELECT —
`staff_content_rows=1`, `staff_delivery_rows=1`; затем `ROLLBACK`.

## 4. Историческая строка `evidence` — PASS

Команда без пайпа:

```bash
git blame -L 6018,6028 566a7935f3 -- deploy/postgres/privileges/declaration.ts
```

Exit 0. Буквальная строка 6023 в историческом snapshot — закрывающая `],`,
потому что D10 позднее сдвинул файл. Проверка той же логической записи:

```bash
git blame -L 5788,5796 566a7935f3 -- deploy/postgres/privileges/declaration.ts
```

Exit 0, результат:

```text
566a7935f3 ... 5790) relationSurfaces: [{ relation: 'public.be_organizations',
566a7935f3 ... 5791)   columns: ['id', 'is_active', 'updated_at'],
566a7935f3 ... 5792)   operations: ['SELECT' as const, 'UPDATE' as const],
566a7935f3 ... 5793)   evidence: 'exact UPDATE in migration 0050' as const }],
```

В candidate checkout эта же запись находится на строке 6023. Следовательно,
несовместимая `evidence`-запись существовала в `566a7935f3` до D10; D10 её не
создал. Утверждение по происхождению поломки верно, буквальный исторический номер
строки — нет из-за последующего сдвига.

## 5. Generated artifacts — PASS

Команда без пайпа:

```bash
node deploy/postgres/privileges/generate-cli.mjs --check
```

Exit 0:

```text
ok bcb_webapp_dev/privileges: deploy/postgres/generated/privileges.bcb_webapp_dev.sql совпадает побайтно
ok bcb_webapp_dev/allowlist: deploy/postgres/generated/org-allowlist.bcb_webapp_dev.sql совпадает побайтно
ok bersoncarebot_test/privileges: deploy/postgres/generated/privileges.bersoncarebot_test.sql совпадает побайтно
ok bersoncarebot_test/allowlist: deploy/postgres/generated/org-allowlist.bersoncarebot_test.sql совпадает побайтно

--check: артефакты соответствуют декларации побайтно.
```

## Доказательство rollback

Команда без пайпа:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY; SELECT to_regclass('integrator.direct_public_write_retries') AS retry_table, (SELECT count(*) FROM pg_policies WHERE policyname LIKE 'rev10_delivery_replay_%') AS rev10_policy_count, (SELECT count(*) FROM app_control.relation_wall_registry WHERE schema_name = 'integrator' AND table_name = 'direct_public_write_retries') AS temporary_wall_rows; ROLLBACK;"
```

Exit 0: `retry_table=NULL`, `rev10_policy_count=0`, `temporary_wall_rows=0`, затем
`ROLLBACK`. Постоянных миграций, policies, registry rows или fixture rows не
оставлено.
