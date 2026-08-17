# Все пропущенные DEV-миграции — независимая приёмка

**Вердикт: FAIL.** Аудитировался `ee6f582fb860266ed366678a0cf446f4a5389506`; фактический `feat` в момент
проверки — `8eb12e75d9a35611d305097463d5d4fd22ceeab2`. DEV использовался только для read-only
identity/hash/function-definition inspection. DEV/TEST/PROD, старые migrations, ledger и продуктовый код не
изменялись; одноразовая БД не создавалась.

## MUST FIX

### F1 — `0323` затирает уже применённую D21 scheduler-функцию

Достижимый сценарий:

1. На текущем DEV уже действует `0322`: `app.list_scheduler_reminder_organization_ids()` отбирает активные
   `public.reminder_rules` по `platform_user_id`, поэтому правило пациента без bot/integrator identity остаётся в
   scheduler path (`0322_unified_reminder_occurrence_local.sql:186-220`). Read-only inspection ниже подтвердил
   `scheduler_has_platform_identity=true` и `scheduler_has_integrator_only_filter=false`.
2. Journal ставит `0323` после `0322`. `0323` выполняет `CREATE OR REPLACE` той же функции, но возвращает условие
   `rule.integrator_user_id IS NOT NULL` (`0323_reminder_rules_scheduler_canonical_forward_local.sql:217-264`).
3. После обычного migrate организация, у которой есть только platform/web-push reminder rule, исчезает из списка
   scheduler organization IDs; её напоминание не планируется.

Это нарушает kill-set 2: forward переписывает уже применённый объект более старым телом. SQL действительно равен
`0312`, но это не эквивалентно итоговому journal-состоянию после уже применённой `0322`.

### F2 — `0326` затирает уже применённую `0320` live-policy progression

Достижимый сценарий:

1. На текущем DEV обе двери — `app.resolve_organization_mechanic_access(uuid,text)` и
   `app.resolve_organization_cabinet_access(uuid)` — содержат `policy_history`, установленную применённой `0320`.
   Она сохраняет уже начавшиеся grace/read-only интервалы при последующей правке тарифной политики
   (`0320_tariff_policy_live_progression_local.sql:124-225` и аналогичный cabinet-блок).
2. Journal ставит `0326` после `0320`. `0326` byte-equivalent исполняемому телу `0305` и повторно делает
   `CREATE OR REPLACE` обеих дверей, но без `policy_history` (`0326_tariff_snapshot_access_doors_forward_local.sql:234-287`,
   `408-440`).
3. Клиника, уже находящаяся в read-only, после сокращения оператором `graceDays/readOnlyDays` пересчитывается только
   по новым коротким значениям и немедленно попадает в terminal state вместо сохранения начатой ступени.

Это нарушает kill-set 2 и 6: frozen paid-period ветви `0305` сохранены, но уже принятое live/future-only поведение
`0320` стирается. Существующий `check-access-ladder-transitions.mjs` читает `0320` напрямую, поэтому может оставаться
зелёным, не проверяя фактическое последнее `CREATE OR REPLACE` из `0326`.

## Kill-set

1. **PASS** — полный SHA256 census пересчитал все journal-файлы: `journal_files=326`,
   `journal_sha256_unique=326`, manifest SHA256
   `228499b8a356bd694b4a7073b7571ba91eb4e8b1846a0b7df42dc146043b2ca5`; сравнение с Drizzle hash дало
   `mismatches=0`. Read-only DEV ledger дал ровно шесть buried current-hash gaps:
   `0291`, `0298`, `0304`, `0305`, `0312`, `0318`; отдельно пять pending hashes `0323`–`0327`.
   Команды: «DEV hash census» и «SHA256 = Drizzle» ниже.
2. **FAIL** — исполняемый SQL `0323/0324/0326/0327` равен названным исходникам, а `0325` отличается только
   разрешённым `ALTER TABLE IF EXISTS`; однако `0323` и `0326` переписывают уже применённые более поздние функции
   (`F1`, `F2`). Команда: «Forward equivalence» ниже.
3. **PASS** — runner после `migrate()` читает весь ledger и требует direct current hash либо применённый более поздний
   exact-marker forward. Baseline self-test зелёный. Пять независимых fault injections — ignore uncovered hash,
   accept unapplied forward, accept backward marker, accept duplicate marker, ignore unknown marker — дали exit 1 с
   соответствующим self-test assertion. Виртуальное добавление только применённых hash `0323`–`0327` даёт
   `direct=320 reconciled=6 missing=0`; без них census оставляет пять pending и шесть buried. Команды: «DEV hash
   census», `node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs --self-test` и таблица fault injections ниже.
4. **PASS** — `0323` не содержит `DELETE`/`DROP TABLE` для occurrence/delivery history или legacy rules table;
   FK переводится на `public.reminder_rules(integrator_rule_id) ON DELETE RESTRICT`
   (`0323...sql:117-123`). Read-only DEV inspection также подтвердил
   `legacy_rules_table_retained=true`. Отдельный scheduler overwrite вынесен в `F1`.
5. **PASS** — `0325` удаляет четыре старые product-catalog таблицы и ровно пять legacy projections
   (`booking_branch_services`, `booking_specialists`, `booking_services`, `booking_branches`, `branches`), плюс их
   старые FK; других `be_*` drop нет (`0325...sql:7-33`). `IF EXISTS` делает повтор безопасным и не меняет итог.
6. **FAIL** — registration часть сохраняет `ENABLE/FORCE RLS`, revoke staff и platform policy
   (`0324...sql:19-33`), frozen paid-period ветви `0305` byte-equivalent; но `0326` стирает более поздние live-policy
   двери `0320` (`F2`).
7. **PASS** — `0327` сначала отзывает `SELECT` и legacy policy на `system_settings`, затем создаёт единственную
   fixed-key `SECURITY DEFINER` функцию без caller-controlled key и выдаёт только `EXECUTE`
   (`0327...sql:7-53`). Исполняемый SQL равен принятой `0318`.
8. **PASS** — относительно фактического `feat` `8eb12e75d9a35611d305097463d5d4fd22ceeab2` journal prefix
   совпал целиком: `feat_entries=321 audit_entries=326 prefix_equal=true`. Добавлены только idx `321…325` с
   strictly increasing `when=1793539230027…1793539230031`; board строки `0323`–`0327` совпадают с tags.
   Команда: «Actual feat append-only» ниже. PROD не открывался и не изменялся.

## Выполненные проверки

Targeted gates:

```text
node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs --self-test
→ run-webapp-drizzle-migrate diagnostic self-test: OK

bash apps/webapp/scripts/check-drizzle-journal-sync.sh
→ check-drizzle-journal-sync: OK

bash apps/webapp/scripts/check-legacy-migrations-frozen.sh
→ exit 0

node docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md --static-only
→ smoke-phase3-specialist-signup-provisioning: static guards OK

git diff --check
→ exit 0
```

`node docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md` намеренно не запускался: он создаёт private
PostgreSQL cluster, что прямо запрещено audit brief; кроме того, он извлекает тело из `0320`, а не проверяет итог после
`0326`.

Дополнительно был запущен более широкий, не targeted gate:

```text
pnpm run check:saas-db-regression
→ FAIL: Missing batch assignments: integrator.user_reminder_rules

(cd /home/dev/dev-projects/BersonCareBot && \
  node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-4-batches.mjs)
→ тот же FAIL на фактическом feat
```

Это pre-existing failure фактического `feat`, поэтому он не приписан данной ветке и не является третьим finding.

### DEV identity preflight

```bash
(cd /home/dev/dev-projects/BersonCareBot && bash deploy/host/migrate-dev.sh --preflight)
```

Результат: `migrate-dev preflight: PASS (exact local DEV; no changes made)`.

### DEV hash census

Точная команда, давшая все приведённые ledger/hash количества:

```bash
DEV_AUDIT_DATABASE_URL="$(node /home/dev/dev-projects/BersonCareBot/deploy/host/parse-dev-database-url.mjs /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev)"
AUDIT_MIGRATIONS_DIR="$PWD/apps/webapp/db/drizzle-migrations"
env DATABASE_URL="$DEV_AUDIT_DATABASE_URL" AUDIT_MIGRATIONS_DIR="$AUDIT_MIGRATIONS_DIR" node --input-type=module <<'NODE'
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/home/dev/dev-projects/BersonCareBot/apps/webapp/package.json');
const pg = require('pg');
const root = process.env.AUDIT_MIGRATIONS_DIR;
const journal = JSON.parse(readFileSync(join(root, 'meta/_journal.json'), 'utf8')).entries;
const manifest = journal.map((entry) => ({
  ...entry,
  hash: createHash('sha256').update(readFileSync(join(root, entry.tag + '.sql'))).digest('hex'),
}));
const manifestDigest = createHash('sha256')
  .update(manifest.map(({tag, hash}) => tag + ' ' + hash).join('\n') + '\n').digest('hex');
const pool = new pg.Pool({connectionString: process.env.DATABASE_URL, max: 1});
try {
  const identity = await pool.query('SELECT current_database() AS db, current_user AS role');
  const ledgerResult = await pool.query(
    'SELECT hash, created_at::text AS created_at FROM drizzle.__drizzle_migrations ORDER BY id',
  );
  const ledgerHashes = new Set(ledgerResult.rows.map((row) => String(row.hash)));
  const maxCreatedAt = ledgerResult.rows.reduce(
    (max, row) => BigInt(row.created_at) > max ? BigInt(row.created_at) : max, 0n,
  );
  const missing = manifest.filter((entry) => !ledgerHashes.has(entry.hash));
  const buried = missing.filter((entry) => BigInt(entry.when) <= maxCreatedAt);
  const pending = missing.filter((entry) => BigInt(entry.when) > maxCreatedAt);
  const currentHashes = new Set(manifest.map((entry) => entry.hash));
  const historicalOnly = [...ledgerHashes].filter((hash) => !currentHashes.has(hash));
  const marker = /^-- RECONCILES-MIGRATION-HASH: ([0-9]{4}_[a-z0-9_]+)$/gm;
  const byTag = new Map(manifest.map((entry) => [entry.tag, entry]));
  const forwardBySource = new Map();
  for (const forward of manifest) {
    const sql = readFileSync(join(root, forward.tag + '.sql'), 'utf8');
    for (const match of sql.matchAll(marker)) {
      const source = byTag.get(match[1]);
      if (!source || source.when >= forward.when || forwardBySource.has(source.tag)) {
        throw new Error('invalid reconciliation marker for ' + match[1]);
      }
      forwardBySource.set(source.tag, forward);
    }
  }
  const virtualLedger = new Set(ledgerHashes);
  for (const tag of [
    '0323_reminder_rules_scheduler_canonical_forward_local',
    '0324_saas_registration_tariff_policy_walls_forward_local',
    '0325_drop_booking_catalog_and_legacy_projections_forward_local',
    '0326_tariff_snapshot_access_doors_forward_local',
    '0327_saas_billing_provider_capability_forward_local',
  ]) virtualLedger.add(byTag.get(tag).hash);
  let virtualDirect = 0;
  let virtualReconciled = 0;
  const virtualMissing = [];
  for (const entry of manifest) {
    if (virtualLedger.has(entry.hash)) virtualDirect += 1;
    else if (forwardBySource.has(entry.tag) && virtualLedger.has(forwardBySource.get(entry.tag).hash)) {
      virtualReconciled += 1;
    } else virtualMissing.push(entry.tag);
  }
  console.log('identity=' + identity.rows[0].role + '@' + identity.rows[0].db);
  console.log('journal_files=' + manifest.length);
  console.log('journal_sha256_unique=' + new Set(manifest.map((entry) => entry.hash)).size);
  console.log('journal_manifest_sha256=' + manifestDigest);
  console.log('ledger_rows=' + ledgerResult.rows.length);
  console.log('ledger_unique_hashes=' + ledgerHashes.size);
  console.log('ledger_max_created_at=' + maxCreatedAt);
  console.log('direct_current_hashes=' + (manifest.length - missing.length));
  console.log('historical_only_ledger_hashes=' + historicalOnly.length);
  console.log('buried_current_hash_gaps=' + buried.length + ' [' + buried.map((entry) => entry.tag).join(',') + ']');
  console.log('pending_current_hashes=' + pending.length + ' [' + pending.map((entry) => entry.tag).join(',') + ']');
  console.log('virtual_after_0323_0327=direct:' + virtualDirect + ' reconciled:' + virtualReconciled + ' missing:' + virtualMissing.length + ' [' + virtualMissing.join(',') + ']');
} finally { await pool.end(); }
NODE
```

Результат:

```text
identity=bcb_webapp_dev_user@bcb_webapp_dev
journal_files=326
journal_sha256_unique=326
journal_manifest_sha256=228499b8a356bd694b4a7073b7571ba91eb4e8b1846a0b7df42dc146043b2ca5
ledger_rows=328
ledger_unique_hashes=328
ledger_max_created_at=1793539230026
direct_current_hashes=315
historical_only_ledger_hashes=13
buried_current_hash_gaps=6 [0291_saas_registration_tariff_policy_walls_local,0298_drop_booking_product_catalog_local,0304_retire_legacy_booking_projections_local,0305_tariff_snapshot_access_doors_local,0312_reminder_rules_scheduler_canonical_local,0318_saas_billing_provider_capability_local]
pending_current_hashes=5 [0323_reminder_rules_scheduler_canonical_forward_local,0324_saas_registration_tariff_policy_walls_forward_local,0325_drop_booking_catalog_and_legacy_projections_forward_local,0326_tariff_snapshot_access_doors_forward_local,0327_saas_billing_provider_capability_forward_local]
virtual_after_0323_0327=direct:320 reconciled:6 missing:0 []
```

### SHA256 = Drizzle

```bash
AUDIT_MIGRATIONS_DIR="$PWD/apps/webapp/db/drizzle-migrations" node --input-type=module <<'NODE'
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/home/dev/dev-projects/BersonCareBot/apps/webapp/package.json');
const { readMigrationFiles } = require('drizzle-orm/migrator');
const root = process.env.AUDIT_MIGRATIONS_DIR;
const journal = JSON.parse(readFileSync(join(root, 'meta/_journal.json'), 'utf8')).entries;
const drizzle = new Map(readMigrationFiles({migrationsFolder: root})
  .map((migration) => [migration.folderMillis, migration.hash]));
const mismatches = journal.filter((entry) =>
  createHash('sha256').update(readFileSync(join(root, entry.tag + '.sql'))).digest('hex') !== drizzle.get(entry.when));
console.log('sha256_vs_drizzle_checked=' + journal.length + ' mismatches=' + mismatches.length +
  ' [' + mismatches.map((entry) => entry.tag).join(',') + ']');
NODE
```

Результат: `sha256_vs_drizzle_checked=326 mismatches=0 []`.

### Forward equivalence

```bash
node --input-type=module <<'NODE'
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const root = 'apps/webapp/db/drizzle-migrations';
const read = (tag) => readFileSync(`${root}/${tag}.sql`, 'utf8');
const executable = (sql) => sql.replace(/^\s*--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ').trim();
const hash = (value) => createHash('sha256').update(value).digest('hex');
for (const [source, forward] of [
  ['0312_reminder_rules_scheduler_canonical_local', '0323_reminder_rules_scheduler_canonical_forward_local'],
  ['0291_saas_registration_tariff_policy_walls_local', '0324_saas_registration_tariff_policy_walls_forward_local'],
  ['0305_tariff_snapshot_access_doors_local', '0326_tariff_snapshot_access_doors_forward_local'],
  ['0318_saas_billing_provider_capability_local', '0327_saas_billing_provider_capability_forward_local'],
]) {
  const sourceExec = executable(read(source));
  const forwardExec = executable(read(forward));
  console.log(`${source}->${forward} executable_equal=${sourceExec === forwardExec} ` +
    `source_sha256=${hash(sourceExec)} forward_sha256=${hash(forwardExec)}`);
}
const cleanupSource = executable(read('0298_drop_booking_product_catalog_local') + '\n' +
  read('0304_retire_legacy_booking_projections_local'));
const cleanupForward = executable(read('0325_drop_booking_catalog_and_legacy_projections_forward_local'));
const idempotencyCanonical = (sql) => sql.replace(/ALTER TABLE IF EXISTS/g, 'ALTER TABLE');
console.log(`0298+0304->0325 executable_equal=${cleanupSource === cleanupForward} ` +
  `final_behavior_equal_after_if_exists=${idempotencyCanonical(cleanupSource) === idempotencyCanonical(cleanupForward)} ` +
  `source_sha256=${hash(cleanupSource)} forward_sha256=${hash(cleanupForward)}`);
NODE
```

Результат: четыре single-source пары `executable_equal=true`; cleanup
`executable_equal=false final_behavior_equal_after_if_exists=true`.

### Read-only current DEV function state

```bash
DEV_AUDIT_DATABASE_URL="$(node /home/dev/dev-projects/BersonCareBot/deploy/host/parse-dev-database-url.mjs /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev)"
env DATABASE_URL="$DEV_AUDIT_DATABASE_URL" node --input-type=module <<'NODE'
import { createRequire } from 'node:module';
const require = createRequire('/home/dev/dev-projects/BersonCareBot/apps/webapp/package.json');
const pg = require('pg');
const pool = new pg.Pool({connectionString: process.env.DATABASE_URL, max: 1});
try {
  const result = await pool.query(`
    SELECT
      pg_get_functiondef('app.list_scheduler_reminder_organization_ids()'::regprocedure)
        LIKE '%rule.platform_user_id IS NOT NULL%' AS scheduler_has_platform_identity,
      pg_get_functiondef('app.list_scheduler_reminder_organization_ids()'::regprocedure)
        LIKE '%rule.integrator_user_id IS NOT NULL%' AS scheduler_has_integrator_only_filter,
      pg_get_functiondef('app.resolve_organization_mechanic_access(uuid,text)'::regprocedure)
        LIKE '%policy_history AS%' AS mechanic_has_live_policy_history,
      pg_get_functiondef('app.resolve_organization_cabinet_access(uuid)'::regprocedure)
        LIKE '%policy_history AS%' AS cabinet_has_live_policy_history,
      to_regclass('integrator.user_reminder_rules') IS NOT NULL AS legacy_rules_table_retained
  `);
  console.log(JSON.stringify(result.rows[0]));
} finally { await pool.end(); }
NODE
```

Результат:

```json
{"scheduler_has_platform_identity":true,"scheduler_has_integrator_only_filter":false,"mechanic_has_live_policy_history":true,"cabinet_has_live_policy_history":true,"legacy_rules_table_retained":true}
```

### Actual feat append-only

```bash
node --input-type=module <<'NODE'
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const path = 'apps/webapp/db/drizzle-migrations/meta/_journal.json';
const featRoot = '/home/dev/dev-projects/BersonCareBot';
const featSha = execFileSync('git', ['-C', featRoot, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
const feat = JSON.parse(execFileSync('git', ['-C', featRoot, 'show', `HEAD:${path}`], {encoding:'utf8'})).entries;
const audit = JSON.parse(readFileSync(path, 'utf8')).entries;
console.log(`actual_feat_sha=${featSha} feat_entries=${feat.length} audit_entries=${audit.length} ` +
  `prefix_equal=${JSON.stringify(audit.slice(0, feat.length)) === JSON.stringify(feat)}`);
console.log('appended=' + audit.slice(feat.length)
  .map(({idx, when, tag}) => `${idx}:${when}:${tag}`).join(','));
NODE
rg -n '^\| `032[3-7]`' docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md
```

Результат: `actual_feat_sha=8eb12e75d9a35611d305097463d5d4fd22ceeab2 feat_entries=321
audit_entries=326 prefix_equal=true`; appended — только `0323`–`0327`, idx `321…325`, when
`1793539230027…1793539230031`; board содержит те же пять номеров и назначения.

### Runner fault injections

Каждая временная mutation применялась отдельно к
`apps/webapp/scripts/run-webapp-drizzle-migrate.mjs`, затем запускалась одна команда
`node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs --self-test`, после чего mutation откатывалась. Финальный
`git diff --exit-code -- apps/webapp/scripts/run-webapp-drizzle-migrate.mjs` — exit 0.

| Mutation | Результат self-test |
|---|---|
| `missing.push(entry.tag)` → no-op | exit 1: `did not distinguish reconciled and missing hashes` |
| убрать `ledgerHashes.has(forwardMigration.hash)` | exit 1: `accepted an unapplied forward reconciliation` |
| убрать `source.when >= forward.when` | exit 1: `accepted an invalid reconciliation marker` |
| отключить `forwardBySource.has(source.tag)` | exit 1: `accepted an invalid reconciliation marker` |
| unknown source считать ignorable | exit 1: `accepted an invalid reconciliation marker` |

## Итог

Hash coverage, markers, D5 FK/history retention, booking keep/drop set, registration RLS, billing fixed-key capability
и append-only journal доказаны. Land/migrate запрещены до одного bounded fixer-pass по `F1` и `F2`; повторный
blind audit-cycle по brief не нужен — лид проверяет точные исправления и тот же набор evidence.
