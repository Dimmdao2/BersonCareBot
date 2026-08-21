# D15b/6 — canonical contacts physical cutover candidate

Дата code-candidate: 21.08.2026. Authority: `WORK_ORDER.md` D15b/6 —
`user_contacts` остаётся и становится единственным источником phone/email. Candidate не применялся к
именованной DEV, TEST или PROD; live login/bind/delivery ниже остаётся обязательным lead-gate после land.

## Итог кода

- Все production readers/writers webapp, integrator и `packages/platform-merge` переведены с legacy contact
  columns на `public.user_contacts`. История `user_phone_history` и provider facts
  `user_channel_bindings`/OAuth больше не восстанавливают канон в обратную сторону.
- Единственный low-level mutation root — существующий
  `packages/platform-merge/src/userContactsMirrorWrite.ts::mutateCanonicalUserContacts`; новый facade/helper
  не добавлен. Demote старого primary, conflict validation, upsert и promote выполняются одним атомарным
  data-modifying CTE. Cross-user conflict возвращает доменный конфликт без снятия текущего primary; concurrent
  `23505` откатывает весь statement и маппится по `uq_user_contacts_phone|email`.
- Timestamp-forward `20260821T040000_cut_over_canonical_contacts.sql` сначала fail-closed сверяет старые
  phone/email/trust timestamps, затем переводит все активные function roots, проверяет catalog dependencies и
  legacy function bodies, и только после этого удаляет пять contact columns из `platform_users`. В migration нет
  GRANT/REVOKE/ROLE/OWNER/RLS policy; privilege surface изменена только в declaration и пересобранных artifacts.
- D15b/7 не затронут.

## Reader/writer census

Первым был выполнен lexical `code-search` по auth/session/registration/merge/bind/OAuth/delivery/admin/booking/
purge; затем точные production-source запросы. Числа ниже принадлежат указанным рядом командам.

```bash
rg -n --glob '*.ts' --glob '!*.test.ts' --glob '!*.spec.ts' \
  'platformUsers\.(phoneNormalized|patientPhoneTrustAt|email|emailNormalized|emailVerifiedAt)|platform_users\.(phone_normalized|patient_phone_trust_at|email|email_normalized|email_verified_at)' \
  apps/webapp/src apps/integrator/src packages/platform-merge/src | wc -l
# 0

rg -n --glob '*.ts' --glob '!*.test.ts' --glob '!*.spec.ts' \
  'mutateCanonicalUserContacts\(' \
  apps/webapp/src apps/integrator/src packages/platform-merge/src \
  | rg -v 'export async function mutateCanonicalUserContacts' | wc -l
# 6 production callers

rg -l --glob '*.ts' --glob '!*.test.ts' --glob '!*.spec.ts' \
  '(INSERT INTO|UPDATE|DELETE FROM) public\.user_contacts' \
  apps/webapp/src apps/integrator/src packages/platform-merge/src | wc -l
# 1 production DML file: packages/platform-merge/src/userContactsMirrorWrite.ts

rg -n --glob '*.ts' --glob '!*.test.ts' --glob '!*.spec.ts' \
  'syncUserContactsMirror|syncUserContactsPhoneMirror|clearDuplicate(User)?ContactsMirror' \
  apps/webapp/src apps/integrator/src packages/platform-merge/src | wc -l
# 0

git diff --name-only --diff-filter=ACMRT d4a5f70cd -- \
  'apps/webapp/**/*.ts' 'apps/webapp/**/*.tsx' 'apps/integrator/**/*.ts' \
  'packages/platform-merge/**/*.ts' \
  | rg -v '\.(unit\.)?test\.tsx?$|\.spec\.tsx?$' | wc -l
# 57 changed production TypeScript files
```

Отдельный alias-census:

```bash
rg -n --glob '*.ts' --glob '!*.test.ts' --glob '!*.spec.ts' \
  '\bpu\.(phone_normalized|patient_phone_trust_at|email|email_normalized|email_verified_at)\b' \
  apps/webapp/src apps/integrator/src packages/platform-merge/src | wc -l
# 17
```

Все 17 исключений просмотрены: пять — typed in-memory merge oracle
`autoMergeScalarEffective.ts`; двенадцать — aliases `pu`/`dup` derived subqueries в
`pgPlatformUserMerge.ts`, где `phone_normalized` уже проецируется из `user_contacts`. Физических legacy readers
среди них нет. Шесть mutation callsites — facade webapp, два projection writes, messenger bind и два merge
шага; прямой DML остаётся только внутри общего root.

## Выполненные проверки

```text
pnpm --filter @bersoncare/platform-merge build &&
pnpm --dir apps/webapp exec vitest run --project unit src/infra/repos/userContactsSql.unit.test.ts --reporter verbose
  -> 1 file, 6 passed

pnpm --dir apps/webapp exec vitest run --project unit
  src/infra/repos/userContactsSql.unit.test.ts
  src/infra/repos/d15b5FioDualWriteGaps.unit.test.ts
  src/infra/repos/d15b6DoctorClientCreateRace.unit.test.ts
  src/infra/repos/d15b6PhoneMessengerBindMirror.unit.test.ts
  src/infra/repos/pgCanonicalPlatformUser.unit.test.ts
  src/modules/auth/oauthWebLoginResolve.unit.test.ts
  src/modules/auth/emailOtpPublic.unit.test.ts --reporter verbose
  -> 7 files, 33 passed

pnpm --dir apps/integrator exec vitest run
  src/infra/db/messengerPhonePublicBind0380.unit.test.ts
  src/infra/adapters/deliveryTargetsPort.test.ts --reporter verbose
  -> 2 files, 32 passed

/home/dev/brain/host-orch/run-tests.sh "pnpm run test:db-privileges"
  -> 183 tests; 154 passed, 29 skipped, 0 failed

pnpm --dir apps/integrator typecheck && pnpm --dir apps/webapp typecheck
  -> exit 0 for both strict typechecks

node deploy/postgres/privileges/generate-cli.mjs --check
  -> four generated privilege/allowlist artifacts byte-identical
node deploy/postgres/privileges/generate-cli.mjs --census
  -> bcb_webapp_dev: 217 ACTIVE relations / 3306 source files
  -> bersoncarebot_test: 217 ACTIVE relations / 3306 source files
node --test deploy/postgres/privileges/function-census.test.mjs
  -> 19 passed

bash apps/webapp/scripts/check-drizzle-migration-order.sh
node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs --self-test
node scripts/check-migration-privileges.mjs
node scripts/check-migration-privileges.mjs --self-test
node scripts/check-c4-migration-owned-function-bodies.mjs
node --test deploy/postgres/privileges/migration-order.test.mjs
  -> all exit 0; migration-order suite 22 passed
```

Старый `apps/webapp/scripts/check-drizzle-journal-sync.sh` из slice-описания уже отсутствует в текущем
репозитории. Его действующий timestamp-forward replacement — `check-drizzle-migration-order.sh` плюс migrator
self-test — запущен выше. Scoped ESLint изменённых integrator/declaration и webapp файлов также завершился с
exit 0. Full CI не запускался по прямому запрету brief.

## Обязательный post-land named-DEV gate

Выполнять только из уже landed canonical tree `/home/dev/dev-projects/BersonCareBot`, не из этого worktree.
Wrapper сам выполняет DDL preflight с rollback, apply, declaration reconcile и catalog audit:

```bash
cd /home/dev/dev-projects/BersonCareBot
bash deploy/host/migrate-dev.sh --preflight
bash deploy/host/migrate-dev.sh --execute
```

После execute — read-only catalog/parity proof без вывода телефонов/email:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -qAt <<'SQL'
BEGIN READ ONLY;
SELECT 1 / (EXISTS (
  SELECT 1 FROM drizzle.__drizzle_migrations
  WHERE tag = '20260821T040000_cut_over_canonical_contacts'
))::int;
SELECT 1 / ((SELECT count(*) FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'platform_users'
    AND column_name IN ('phone_normalized','email','email_normalized','email_verified_at','patient_phone_trust_at')) = 0)::int;
SELECT 1 / ((SELECT count(*) FROM (
  SELECT platform_user_id, contact_kind FROM public.user_contacts
  WHERE is_primary GROUP BY platform_user_id, contact_kind HAVING count(*) <> 1
) duplicate_primary) = 0)::int;
SELECT count(*) FILTER (WHERE contact_kind = 'phone' AND is_primary),
       count(*) FILTER (WHERE contact_kind = 'email' AND is_primary)
FROM public.user_contacts;
ROLLBACK;
SQL
```

Затем один реальный DEV journey по каноническому runbook
`docs/OPERATIONS/PHONE_MESSENGER_AUTH_RUNBOOK.md`: login в PWA через Telegram/Max → отправка контакта → бот
доставляет OTP → confirm создаёт сессию; затем `profile_bind` залогиненного пациента завершается без OTP.
Этот проход одновременно доказывает login resolution, provider bind и реальную delivery. Для выбранного номера
после journey выполнить fail-closed read-only ownership check (сам номер в вывод не попадает):

```bash
export D15B6_PHONE='+7XXXXXXXXXX'       # номер, реально использованный в DEV journey
export D15B6_CHANNEL='telegram'         # либо max
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -qAt -v phone="$D15B6_PHONE" -v channel="$D15B6_CHANNEL" <<'SQL'
BEGIN READ ONLY;
SELECT 1 / ((SELECT count(*) FROM public.user_contacts
  WHERE contact_kind = 'phone' AND value_normalized = :'phone' AND is_primary) = 1)::int;
SELECT 1 / ((SELECT count(*)
  FROM public.user_contacts AS contact
  JOIN public.user_channel_bindings AS binding ON binding.user_id = contact.platform_user_id
  WHERE contact.contact_kind = 'phone' AND contact.value_normalized = :'phone'
    AND contact.is_primary AND binding.channel_code = :'channel') = 1)::int;
ROLLBACK;
SQL
unset D15B6_PHONE D15B6_CHANNEL
```

В evidence lead должен записать фактический результат каждой команды и live journey. Пока этого нет, D15b/6
остаётся `[ ]`; candidate не заявляет named DEV/TEST/PROD completion.
