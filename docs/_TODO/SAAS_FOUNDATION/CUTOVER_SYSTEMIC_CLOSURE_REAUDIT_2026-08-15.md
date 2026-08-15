# TaskDB #996 cutover systemic closure — independent critical re-audit (2026-08-15)

## Verdict: FAIL

Audited fixer HEAD: `301a56158465b5c8e080e9a34a1fd0882763b89b`.

The current SQL is coherent by fresh-dump aggregate inspection and by direct review of its one-shot ownership,
collision and preservation semantics. The acceptance gate is not coherent with that SQL: each saved F1–F5 failure
class, and the all-client membership reconstruction itself, can be reintroduced in the product SQL while
`scripts/prod-to-target-cutover-contract.test.mjs` remains green. The required repeatable/fault-sensitive proof is
therefore absent. This is a reachable cutover violation, not a style finding: the accepted check permits zero
reconstructed membership, specialist-reference loss, attributable reminder history left unowned, merged aliases,
lost draft content, and tenantless operational/statistical rows.

No DEV, TEST or PROD database was mutated. The dump was used only through read-only `pg_restore`, `stat`,
`sha256sum` and aggregate inspection. No reset, deploy, restart or provider call was made. Every temporary source
mutation used for fault injection was restored before this artifact was created.

## Authority and evidence identity

Oracle used exactly as supplied in the audit brief: all active canonical clients have exactly one enrollment/link
to Dmitry Berson's clinic/specialist; all user/operational data and statistics belong to that clinic/specialist;
authorship is preserved; system catalogs remain global.

Read before judging: relevant `AGENTS.md` sections including §10/§10a/§24, `README.md`, `docs/README.md`, relevant
`.cursor` rules, server/deploy canon, `SAAS_PROD_DEPLOY_PROCESS.md`, `HARD_MIGRATION_PROTOCOL.md`, the prior FAIL
artifact in full, fixer diff `8d878563..301a5615` in full, generated target artifacts, migrations 0431–0433,
runtime writers and focused tests/gates. The one-shot collision behavior was judged by inspection; repeatable SQL
and data gates were judged by fault injection, per the brief.

Exact identity commands:

```bash
git rev-parse HEAD
git merge-base --is-ancestor 97b58edaca379e1bb6e21ae3c219413e960dda11 HEAD && echo original_product_1=yes
git merge-base --is-ancestor 0ef7d28b1658f4807b6c49e82dc432b547aba027 HEAD && echo original_product_2=yes
sudo -n -u postgres stat -Lc 'dump_owner_mode=%U:%G:%a dump_size=%s dump_mtime=%y' /tmp/bcb-prod-fresh.dump
sudo -n -u postgres sha256sum /tmp/bcb-prod-fresh.dump
```

Result:

```text
301a56158465b5c8e080e9a34a1fd0882763b89b
original_product_1=yes
original_product_2=yes
dump_owner_mode=postgres:postgres:600 dump_size=59402534 dump_mtime=2026-08-15 02:05:22.133336545 +0300
2c6bef2636adede0236ce1a93877463268743f15aa4a209a49f446aed5fa83ef  /tmp/bcb-prod-fresh.dump
```

`pg_restore --list` identifies a PostgreSQL 16.14 custom archive created at 2026-08-14 23:05:14 MSK with 1,556
TOC entries.

## Finding

### F1 — CRITICAL — the saved kill-set and membership SQL are not protected by an executable, fault-sensitive gate

Reachable scenario: the only F1–F5 contract file builds unrelated JavaScript toy arrays and then checks that marker
phrases still occur in SQL source. It does not execute the product transition, its post-gates, or an equivalent
extracted SQL/data model. A transformation and the gate intended to catch its failure can therefore drift together
while the check stays green. The public full-reset preflight runs only `check:prod-to-target-cutover`; it does not
run this systemic-closure check. The first owner consolidation is a separate pre-transition mutation, so F1 loss
can be committed before the A→B baseline is built if its own gate drifts.

Independent fault injection was performed one class at a time against the actual product SQL:

| Mutant | Actual reachable behavior introduced | Test result |
|---|---|---|
| Membership | disabled both insert-if-missing paths and all missing-endpoint post-gates | exit 0, 10/10 |
| F1 | made the dynamic specialist rewrite a no-op and disabled its pre-delete convergence gate | exit 0, 10/10 |
| F2 | made the reminder-history attribution update a no-op and disabled both identity mismatch gates | exit 0, 10/10 |
| F3 | made reviewed live-reference canonicalization a no-op and disabled both merged-alias gates | exit 0, 10/10 |
| F4 | stored `draftTextCurrent = NULL` and removed the content-mismatch condition | exit 0, 10/10 |
| F5 | excluded both operational/statistical relations from org injection and disabled both data/final attribution gates | exit 0, 10/10 |

Exact command after each independently applied mutant:

```bash
node --test scripts/prod-to-target-cutover-contract.test.mjs
```

Each of the six executions ended:

```text
tests 10
pass 10
fail 0
exit 0
```

The F1 mutant recreates the prior destructive sequence: duplicate references remain, duplicate specialist deletion
then cascades/NULLs them, and the later A→B baseline observes only the already-damaged source. The F2–F5 mutants
likewise retain the same exception marker text and toy-model assertions, so all named subtests pass without
examining the broken SQL behavior. The membership mutant permits the fresh target to retain no reconstructed
endpoints while all four membership-labelled toy/source tests pass.

Impact: the check which claims closure of the owner's all-client and F1–F5 invariants cannot reject any of those
classes in the executable implementation. A green result is therefore not acceptance evidence for the one
destructive rehearsal.

Violated requirement: the brief explicitly requires tests for repeatable SQL/data gates and fault injection; the
owner oracle requires exact membership and preservation/attribution, not the continued presence of error-message
strings. This also violates the repository's behavior-test rule in `AGENTS.md` §10a.

Restoration proof, run after all six experiments:

```bash
git diff --check && \
git diff --exit-code -- \
  apps/webapp/scripts/consolidate-owner-identity.sql \
  deploy/postgres/prod-to-target-cutover-data.sql \
  deploy/postgres/prod-to-target-cutover-finish.sql
```

Result: exit 0 and no output.

## Fresh-dump closure inspection at the audited HEAD

The following are closed by current-code inspection and dump aggregates. They do not override the finding because
the required regression gate does not prove them.

### Active canonical clients and exact target intent

Exact dump command:

```bash
sudo -n -u postgres pg_restore --data-only --no-owner --no-privileges -f - /tmp/bcb-prod-fresh.dump | awk -F '\t' '
/^COPY public.platform_users / { in_data=1; next }
in_data && $0 == "\\." { in_data=0 }
in_data { total++; if ($4 == "client") { clients++; if ($17 == "\\N") { canonical++; if ($16 == "f") active_canonical++; else archived_canonical++ } else merged++ } }
END { printf "platform_users total=%d\nclient rows=%d\ncanonical client rows=%d\nactive canonical client rows=%d\nmerged client rows=%d\narchived canonical client rows=%d\n", total, clients, canonical, active_canonical, merged, archived_canonical }
'
```

Result:

```text
platform_users total=294
client rows=290
canonical client rows=245
active canonical client rows=245
merged client rows=45
archived canonical client rows=0
```

The manifest predicate is exactly `role='client'`, `merged_into_id IS NULL`, `is_archived IS FALSE`. Both target
inserts consume that manifest. The final SQL checks, per manifest row, total active count = 1 and canonical count =
1 for enrollment and link, then rejects extra/wrong active endpoints. Thus the current SQL intends exactly 245
canonical enrollments and 245 canonical specialist links, with no membership for 45 aliases. This has not been
executed on a restored dump in this audit and its committed test accepts the zero-reconstruction mutant.

### Saved F1–F5 kill-set

F1 — schema-only inspection found exactly eight single-column FK classes referencing `be_specialists`; composite
FKs abort. The four possible uniqueness collision classes are merged explicitly before the catalog-driven rewrite.
On this dump all collision overlaps are zero. Exact aggregate command for the two populated duplicate classes:

```bash
duplicate_specialist_id="$(sed -n "s/^DELETE FROM be_specialists WHERE id = '\([^']*\)';$/\1/p" apps/webapp/scripts/consolidate-owner-identity.sql)"
canonical_specialist_id="$(sed -n "s/^SET specialist_id = '\([^']*\)',/\1/p" apps/webapp/scripts/consolidate-owner-identity.sql)"
sudo -n -u postgres pg_restore --data-only --no-owner --no-privileges -f - /tmp/bcb-prod-fresh.dump | awk -F '\t' -v duplicate="$duplicate_specialist_id" -v canonical="$canonical_specialist_id" '
/^COPY public.be_appointments / { table="appointments"; next }
/^COPY public.be_specialist_service_availability / { table="availability"; next }
table != "" && $0 == "\\." { table=""; next }
table == "appointments" { if ($5 == duplicate) duplicate_appointments++; if ($5 == canonical) canonical_appointments++ }
table == "availability" { key=$4 FS $5 FS $6 FS $7; if ($3 == duplicate) { duplicate_availability++; duplicate_key[key]++ } if ($3 == canonical) { canonical_availability++; canonical_key[key]++ } }
END { for (key in duplicate_key) if (key in canonical_key) overlap += duplicate_key[key]; printf "appointments duplicate_refs=%d canonical_refs=%d\n", duplicate_appointments, canonical_appointments; printf "service_availability duplicate_refs=%d canonical_refs=%d collision_overlaps=%d\n", duplicate_availability, canonical_availability, overlap }
'
```

```text
appointments duplicate_refs=133 canonical_refs=218
service_availability duplicate_refs=7 canonical_refs=5 collision_overlaps=0
```

The other six FK tables have zero duplicate references in the dump. The current pre-delete gate checks per-class
source total, collision reduction, duplicate zero and expected canonical count; deletion occurs after that gate.

F2 — exact terminal-identity aggregate:

```bash
sudo -n -u postgres pg_restore --data-only --no-owner --no-privileges -f - /tmp/bcb-prod-fresh.dump | awk -F '\t' '
/^COPY public.platform_users / { table="users"; next }
/^COPY public.reminder_occurrence_history / { table="history"; next }
table != "" && $0 == "\\." { table=""; next }
table == "users" { exists[$1]=1; if ($7 != "\\N") { if ($7 in by_integrator) duplicate_integrator_user_keys++; by_integrator[$7]=$1 } if ($17 != "\\N") merged[$1]=$17 }
table == "history" { total++; history_user[total]=$4 }
END { for (i=1;i<=total;i++) { integrator=history_user[i]; if (!(integrator in by_integrator)) { unmapped++; continue } source=by_integrator[integrator]; platform=source; delete seen; bad=0; while (platform in merged) { if (seen[platform]++) { cycles_or_dangling++; bad=1; break } platform=merged[platform] } if (!bad && !(platform in exists)) { cycles_or_dangling++; bad=1 } if (!bad) { attributable++; if (source != platform) via_alias++ } } printf "reminder_history_total=%d attributable_terminal_user=%d attributable_via_alias=%d honestly_unmapped=%d duplicate_integrator_user_keys=%d cycles_or_dangling=%d\n", total, attributable, via_alias, unmapped, duplicate_integrator_user_keys, cycles_or_dangling }
'
```

```text
reminder_history_total=2008 attributable_terminal_user=1760 attributable_via_alias=0 honestly_unmapped=248 duplicate_integrator_user_keys=0 cycles_or_dangling=0
```

Current SQL assigns all 1,760 attributable rows to the canonical platform user and leaves only the 248 source
identities with no platform user as honest NULLs; data and finish gates compare row identity, count and null split.

F3 — dump aggregate over the 45 merged client aliases:

```text
merged_client_aliases=45 affected_support=1 affected_preferences=9 affected_first_resolve=6 affected_total=16
preferences source_rows=132 canonical_keys=123 collision_keys=9 rows_collapsed=9
first_resolve source_rows=609 canonical_pairs=605 collision_pairs=4 rows_collapsed=4
```

Exact command:

```bash
sudo -n -u postgres pg_restore --data-only --no-owner --no-privileges -f - /tmp/bcb-prod-fresh.dump | awk -F '\t' '
/^COPY public.platform_users / { table="users"; next }
/^COPY public.support_conversations / { table="support"; next }
/^COPY public.user_channel_preferences / { table="preferences"; next }
/^COPY public.media_playback_user_video_first_resolve / { table="resolve"; next }
table != "" && $0 == "\\." { table=""; next }
table == "users" { exists[$1]=1; if ($4=="client" && $17!="\\N") client_alias[$1]=1; if ($17!="\\N") merged[$1]=$17 }
table == "support" { support_n++; support_user[support_n]=$3 }
table == "preferences" { pref_n++; pref_id[pref_n]=$1; pref_user[pref_n]=$9; pref_channel[pref_n]=$3; pref_created[pref_n]=$6; pref_updated[pref_n]=$7 }
table == "resolve" { resolve_n++; resolve_user[resolve_n]=$1; resolve_media[resolve_n]=$2; resolve_at[resolve_n]=$3 }
END {
  for (i=1;i<=support_n;i++) if (support_user[i] in client_alias) affected_support++;
  for (i=1;i<=pref_n;i++) { source=pref_user[i]; platform=source; while (platform in merged) platform=merged[platform]; key=platform SUBSEP pref_channel[i]; pref_count[key]++; if (source in client_alias) affected_pref++ }
  for (key in pref_count) { pref_keys++; if (pref_count[key]>1) { pref_collision_keys++; pref_collapsed+=pref_count[key]-1 } }
  for (i=1;i<=resolve_n;i++) { source=resolve_user[i]; platform=source; while (platform in merged) platform=merged[platform]; key=platform SUBSEP resolve_media[i]; resolve_count[key]++; if (source in client_alias) affected_resolve++ }
  for (key in resolve_count) { resolve_keys++; if (resolve_count[key]>1) { resolve_collision_pairs++; resolve_collapsed+=resolve_count[key]-1 } }
  printf "merged_client_aliases=%d affected_support=%d affected_preferences=%d affected_first_resolve=%d affected_total=%d\n", length(client_alias), affected_support, affected_pref, affected_resolve, affected_support+affected_pref+affected_resolve;
  printf "preferences source_rows=%d canonical_keys=%d collision_keys=%d rows_collapsed=%d\n", pref_n,pref_keys,pref_collision_keys,pref_collapsed;
  printf "first_resolve source_rows=%d canonical_pairs=%d collision_pairs=%d rows_collapsed=%d\n", resolve_n,resolve_keys,resolve_collision_pairs,resolve_collapsed;
}
'
```

The current SQL uses latest
`updated_at, created_at, id` for each canonical preference/channel key and `min(first_resolved_at)` for each
canonical user/media pair, then dynamically canonicalizes the remaining reviewed live subject columns
`platform_user_id|patient_user_id|user_id|owner_user_id|doctor_user_id`. Author/actor/provenance columns are
deliberately excluded and copied unchanged.

F4 — exact identity/holder aggregate:

```bash
sudo -n -u postgres pg_restore --data-only --no-owner --no-privileges -f - /tmp/bcb-prod-fresh.dump | awk -F '\t' '
/^COPY integrator.identities / { table="identities"; next }
/^COPY integrator.message_drafts / { table="drafts"; next }
/^COPY public.platform_users / { table="users"; next }
/^COPY public.support_conversations / { table="conversations"; next }
table != "" && $0 == "\\." { table=""; next }
table == "identities" { identity_user[$1]=$2 }
table == "users" { if ($7 != "\\N") user_platform[$7]=$1; if ($17 != "\\N") merged[$1]=$17 }
table == "conversations" { conversation[$4 SUBSEP $5]=1 }
table == "drafts" { drafts++; state[$7]++; draft_identity[$1]=$2; draft_source[$1]=$3 }
END { for (draft in draft_identity) { identity=draft_identity[draft]; if (!(identity in identity_user)) { missing_identity++; continue } user=identity_user[identity]; if (!(user in user_platform)) { missing_platform_user++; continue } platform=user_platform[user]; delete seen; cycle=0; while (platform in merged) { if (seen[platform]++) { cycles++; cycle=1; break } platform=merged[platform] } if (!cycle) { mapped++; if ((user SUBSEP draft_source[draft]) in conversation) existing_conversation++; else holder_required++ } } printf "drafts_total=%d pending_confirmation=%d mapped_to_terminal_canonical=%d missing_identity=%d missing_platform_user=%d cycles=%d existing_conversation=%d deterministic_holder_required=%d\n", drafts, state["pending_confirmation"], mapped, missing_identity, missing_platform_user, cycles, existing_conversation, holder_required }
'
```

```text
drafts_total=19 pending_confirmation=19 mapped_to_terminal_canonical=19 missing_identity=0 missing_platform_user=0 cycles=0 existing_conversation=1 deterministic_holder_required=18
```

Current SQL preserves all source fields in `support_conversations.pending_message_drafts`, uses the existing
conversation for one draft and deterministic holder conversations for 18, and compares source/target count and
every stored field before the source schema is dropped.

F5 — exact aggregate:

```bash
sudo -n -u postgres pg_restore --data-only --no-owner --no-privileges -f - /tmp/bcb-prod-fresh.dump | awk -F '\t' '
/^COPY integrator.delivery_attempt_logs / { table="delivery"; next }
/^COPY public.media_playback_stats_hourly / { table="media_stats"; next }
table != "" && $0 == "\\." { table=""; next }
table == "delivery" { delivery++; intent[$2]++; channel[$5]++ }
table == "media_stats" { media++ }
END { printf "integrator.delivery_attempt_logs rows=%d message_send=%d\n", delivery, intent["message.send"]; printf "public.media_playback_stats_hourly rows=%d\n", media; for (value in channel) printf "delivery_channel=%s rows=%d\n", value, channel[value] }
' | sort
```

```text
delivery_channel=email rows=69
delivery_channel=max rows=639
delivery_channel=smsc rows=485
delivery_channel=telegram rows=3933
delivery_channel=web_push rows=2956
integrator.delivery_attempt_logs rows=8082 message_send=8082
public.media_playback_stats_hourly rows=581
```

The common copier injects the canonical organization into both newly tenant-shaped relations; data and final SQL
check attribution and exact row counts. Total historical rows attributed by F5 are 8,663.

## PII-free ownership/reference census

Exact successful census command (the parser prints only grouped PII-free counts):

```bash
node --input-type=module <<'NODE'
import { execFileSync } from 'node:child_process'; import { readFileSync } from 'node:fs';
const source=execFileSync('sudo',['-n','-u','postgres','pg_restore','--schema-only','--no-owner','--no-privileges','-f','-','/tmp/bcb-prod-fresh.dump'],{encoding:'utf8',maxBuffer:20_000_000});
const target=readFileSync('deploy/postgres/generated/prod-to-target/schema-pre.sql','utf8');
const concept=/(?:organization|tenant|specialist|doctor|owner|actor|author|user|patient|client|assigned|created|updated|uploaded|changed|archived)/u,shape=/(?:_id|_by|_ref)$/u,exact=new Set(['author','owner','actor','created_by','updated_by','assigned_by','uploaded_by','changed_by']);
function parse(sql){const relations=new Set(),refs=[];const re=/CREATE TABLE(?: ONLY)? ([^\s(]+) \(\n([\s\S]*?)\n\);/gu;for(const m of sql.matchAll(re)){const r=m[1].replaceAll('"','');relations.add(r);for(const raw of m[2].split('\n')){const line=raw.trim();if(/^(?:CONSTRAINT|PRIMARY|UNIQUE|CHECK|EXCLUDE|FOREIGN)\b/u.test(line))continue;const c=line.match(/^"?([a-zA-Z0-9_]+)"?\s+/u)?.[1];if(c&&concept.test(c)&&(shape.test(c)||exact.has(c)))refs.push([r,c])}}return{relations,refs}}
const s=parse(source),t=parse(target),sk=new Set(s.refs.map(([r,c])=>r+'|'+c));
const globals=new Set(['public.admin_audit_log','public.operator_health_failure_archive','public.operator_incidents','public.system_settings','public.system_settings_audit']),explicitOrg=new Set(['integrator.user_reminder_delivery_logs','integrator.user_reminder_occurrences','public.reference_categories','public.reference_items']),explicitIdentity=new Set(['public.reminder_occurrence_history|platform_user_id','integrator.user_reminder_occurrences|platform_user_id']),collision=new Set(['public.user_channel_preferences|platform_user_id','public.user_channel_preferences|user_id','public.media_playback_user_video_first_resolve|user_id']),subjects=new Set(['platform_user_id','patient_user_id','user_id','owner_user_id','doctor_user_id']);const counts=new Map();
for(const [r,c] of t.refs){let cls;if(!s.relations.has(r))cls='target_only_relation';else if(explicitIdentity.has(r+'|'+c))cls='explicit_identity_transform';else if(collision.has(r+'|'+c))cls='collision_identity_transform';else if(sk.has(r+'|'+c)&&subjects.has(c))cls='dynamic_live_identity_transform';else if(sk.has(r+'|'+c))cls='preserve_exact_common_column';else if(c==='organization_id'&&globals.has(r))cls='system_global_exemption';else if(c==='organization_id'&&explicitOrg.has(r))cls='explicit_organization_transform';else if(c==='organization_id')cls='generic_organization_injection';else cls='unclassified_gap';const x=counts.get(cls)??{r:new Set(),c:0};x.r.add(r);x.c++;counts.set(cls,x)}
console.log('source_reference_columns='+s.refs.length+' source_reference_relations='+new Set(s.refs.map(([r])=>r)).size);console.log('target_reference_columns='+t.refs.length+' target_reference_relations='+new Set(t.refs.map(([r])=>r)).size);let total=0;for(const [cls,x]of[...counts].sort(([a],[b])=>a.localeCompare(b))){total+=x.c;console.log(cls+' relations='+x.r.size+' columns='+x.c)}console.log('classified_columns='+total);
NODE
```

It parsed every source and generated-target `CREATE TABLE`, selected semantic ownership/reference columns ending
in `_id|_by|_ref` plus exact author/owner/actor forms, and classified every target column by the actual transition
path. Result:

```text
source_reference_columns=206 source_reference_relations=143
target_reference_columns=349 target_reference_relations=193
collision_identity_transform relations=2 columns=3
dynamic_live_identity_transform relations=67 columns=72
explicit_identity_transform relations=2 columns=2
explicit_organization_transform relations=4 columns=4
generic_organization_injection relations=98 columns=98
preserve_exact_common_column relations=81 columns=105
system_global_exemption relations=4 columns=4
target_only_relation relations=36 columns=61
classified_columns=349
```

There is no unclassified target ownership/reference column. The dynamic/collision/explicit identity classes close
the semantically live patient/user subjects. The 105 exact-common columns include historical authors, actors,
creators, uploaders and other provenance that must remain the original person. The four intentional global-org
exemptions are `admin_audit_log`, `operator_health_failure_archive`, `system_settings`, and
`system_settings_audit`; `operator_incidents` is target-only, not a copied source exemption. System catalogs and
target-only platform control tables remain global by construction.

Source-only registry command/results:

```bash
source_relations(){ sudo -n -u postgres pg_restore --list /tmp/bcb-prod-fresh.dump | awk '$4=="TABLE" && $5 ~ /^(public|integrator|drizzle)$/ {print $5 "." $6}' | sort -u; }
target_relations(){ awk '/^CREATE TABLE (public|integrator|drizzle)\./ {relation=$3; gsub(/"/,"",relation); print relation}' deploy/postgres/generated/prod-to-target/schema-pre.sql | sort -u; }
printf 'source_relations='; source_relations | wc -l
printf 'target_relations='; target_relations | wc -l
printf 'shared_relations='; comm -12 <(source_relations) <(target_relations) | wc -l
printf 'source_only_relations='; comm -23 <(source_relations) <(target_relations) | wc -l
```

```text
source_relations=221
target_relations=217
shared_relations=176
source_only_relations=45
registry_entries=45
disposition_transform=15
disposition_intentionally_retire=30
```

The last three registry figures were produced by:

```bash
node --input-type=module -e "import{readFileSync}from'node:fs';const s=readFileSync('deploy/postgres/prod-to-target-cutover-data.sql','utf8');const rows=[...s.matchAll(/^  \\('(?:public|integrator|drizzle)\\.[^']+', '(transform|intentionally_retire)', '[^']+'\\)[,;]$/gmu)];console.log('registry_entries='+rows.length);console.log('disposition_transform='+rows.filter(r=>r[1]==='transform').length);console.log('disposition_intentionally_retire='+rows.filter(r=>r[1]==='intentionally_retire').length)"
```

All 45 source-only relations have one exact reviewed disposition; `message_drafts` is now a transform.

## Legacy-access systemic closure

`code-search` was run first for the legacy contacts reader, stale login/URL/direct pool/API path, and swallowed SQL
failure classes. The repository index still returned the deleted old file from another checkout, so exact searches
were then run against this worktree's active roots.

Current active behavior is canonical: `doctorBroadcastIntentMenu.ts` calls
`getCanonicalPlatformUserDeliveryIdentity(DbPort, platformUserId)`; that repository uses the existing Drizzle
session and `public.platform_users`, has no direct pool, login, `DATABASE_URL`, HTTP detour or contacts fallback,
and does not swallow DB failure into `linkedPhone=false`. The focused test proves propagation to the existing
retry/error boundary: 1 file, 3/3 tests, exit 0.

Exact gates:

```bash
node scripts/check-legacy-access-census.mjs
node scripts/check-legacy-access-census.mjs --self-test
pnpm --dir apps/integrator exec vitest --run src/infra/runtime/worker/doctorBroadcastIntentMenu.test.ts
```

```text
legacy access census: PASS (7 active roots; 7 exact transition files)
legacy access census self-test: PASS
Test Files 1 passed (1); Tests 3 passed (3)
```

The only allowed transition files are exactly:

1. `apps/integrator/src/infra/db/migrations/core/20260707_0001_p0_4_i0_integrator_org_columns_predeclare.sql`
2. `apps/integrator/src/infra/db/migrations/core/20260708_0001_p0_4_i1_integrator_direct_user_org.sql`
3. `apps/integrator/src/infra/db/migrations/core/20260710_0001_r2_integrator_scoped_org_not_null.sql`
4. `apps/integrator/src/infra/db/migrations/core/20260808_0008_drop_legacy_contacts.sql`
5. `deploy/postgres/integrator-login-public-identity-grants.sql`
6. `deploy/postgres/prod-to-target-cutover-data.sql`
7. `deploy/postgres/prod-to-target-cutover-finish.sql`

The documented optional `POST /api/integrator/messenger-phone/bind` is a signed canonical-public write endpoint,
not a contacts reader or a runtime fallback path. No active legacy mirror/strategy setting remains.

## Generated target, runtime writes, journal and one-command order

- `pnpm run check:prod-to-target-cutover` passed with all four generated artifacts exact to the current DEV schema
  snapshot. This was read-only.
- `integrator.delivery_attempt_logs` and `public.media_playback_stats_hourly` both contain `organization_id`, FORCE
  and ENABLE RLS, organization indexes and fail-closed ordinary-runtime policies.
- Generated privileges give the delivery seam owner only the required INSERT columns including
  `organization_id`; the media seam owner receives only the required SELECT/INSERT/UPDATE columns including
  `organization_id`. System-health gets playback aggregates without the org discriminator; ordinary runtime roles
  remain fail-closed.
- The generated exact function identities grant the delivery worker the UUID-bearing
  `record_operational_delivery_attempt_audit(...)` and `record_operator_delivery_attempt(...)`; the patient gets
  `increment_media_playback_resolution_stat(uuid,uuid,text,boolean)`. The media function derives current org and
  patient from attested context, verifies media belongs to that org, and upserts on
  `(organization_id,bucket_hour,delivery)`.
- `messageLogs.ts` supplies `organizationId` to the exact UUID-bearing named-root function. The outgoing worker's
  operator-aware path uses `record_operator_delivery_attempt`, which derives scope/provenance from the queue.
  Migration 0433 intentionally permits NULL only for genuinely global/pre-login future audit, matching the hard
  protocol; copied historical rows are not exempt and are all attributed by F5.
- The journal has 430 entries. Exact tail:

```text
426|0430_preauth_test_account_identifiers_local|1793539230173|migration_file=yes
427|0431_cutover_systemic_tenant_shapes_local|1793539230174|migration_file=yes
428|0432_delivery_attempt_tenant_capability_local|1793539230175|migration_file=yes
429|0433_delivery_attempt_global_audit_compat_local|1793539230176|migration_file=yes
```

- `deploy-test-full-reset.sh --confirm-full-reset` is the only destructive TEST entrypoint. It runs same-checkout
  `pnpm run check:prod-to-target-cutover` before invoking the shared engine. The engine orders restore → owner
  consolidation as first mutation → identity/FIO/legacy inputs → A→B transition → target port-context release.
  Wrapper test: 3/3, exit 0. No pre-reset operation was invoked in this audit.

Focused non-full-CI validation on the restored checkout:

```bash
pnpm run check:cutover-systemic-closure
pnpm --dir apps/integrator exec vitest --run src/infra/db/repos/messageLogs.deliveryAttemptAudit.test.ts
pnpm --dir apps/integrator exec vitest --run src/infra/runtime/worker/doctorBroadcastIntentMenu.test.ts
pnpm run check:prod-to-target-cutover
node --test deploy/host/deploy-test-full-reset.test.mjs
bash -n deploy/host/deploy-test-full-reset.sh deploy/host/deploy-test-saas.sh
node --check scripts/check-legacy-access-census.mjs
git diff --check
```

Unmutated results: systemic command exit 0 with 18/18 Node tests and all helper gates green; delivery-attempt test
1 file/7 tests; doctor broadcast 1 file/3 tests; generated snapshot PASS; wrapper 3/3; syntax/check/diff commands
exit 0. Full CI was not run, per instruction. These green results do not close F1 because the six semantic mutants
above also passed the relevant contract test.

## Live-only unknowns

- No real fresh-dump A→B transaction was authorized, so actual target row counts, final SQL gates, grants/RLS,
  runtime login authentication, service boot and product smoke remain unproved on TEST.
- No TEST/PROD reset, deploy, unit stop/restart, env mutation, provider request or external delivery occurred.
- Future global/pre-login delivery audit NULL behavior is reviewed in code only; no live DB function execution was
  performed.
- All dump numbers apply only to SHA-256
  `2c6bef2636adede0236ce1a93877463268743f15aa4a209a49f446aed5fa83ef`.

## Gate decision and task status

The fixer must not be accepted as the systemic closure while the actual cutover SQL and saved membership/F1–F5
kill-set can all be broken without turning the required repeatable gate red. The one-shot SQL semantics may remain;
the missing work is an executable behavior/data harness that fails on each demonstrated actual-SQL mutant.

Read-only task state command:

```bash
node /home/dev/brain/tools/taskdb.mjs list bcb | rg -n "(^|[^0-9])996([^0-9]|$)" -C 3
```

Observed status: TaskDB `#996` is `doing`. This audit does not mutate taskdb state.
