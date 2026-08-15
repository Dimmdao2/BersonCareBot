# Cutover systemic closure — independent recovery audit — 2026-08-15

## Verdict

**FAIL. Do not land and do not start the owner-gated fresh-PROD-dump → TEST reset.**

Audited product commits:

- `97b58edaca379e1bb6e21ae3c219413e960dda11`
- `0ef7d28b1658f4807b6c49e82dc432b547aba027`

The audited worktree was exactly at `0ef7d28b1658f4807b6c49e82dc432b547aba027`. The first independent run
completed its evidence and fault injections, restored every temporary mutation, and then hit the runner limit
before writing this report. This recovery pass read that raw transcript and run record and independently repeated
only the five finding aggregates against the same immutable dump and checkout. No product code, database, env,
service, deploy target, or provider was changed or invoked.

Authority: the 2026-08-15 owner invariants in the audit brief, with
`HARD_MIGRATION_PROTOCOL.md` as the execution/no-manual-surgery oracle. In particular:

1. every active canonical client must get exactly one canonical enrollment and specialist link;
2. every surviving tenant/specialist-owned row, including operational and derived statistics, must be attributed
   to the canonical clinic/specialist when semantically required;
3. patient authorship remains patient authorship, while merged identity references must close on canonical users;
4. only true system/reference baselines may remain global.

## Evidence identity and aggregate baseline

Exact commands:

```bash
git rev-parse HEAD
git merge-base --is-ancestor 97b58edaca379e1bb6e21ae3c219413e960dda11 HEAD && echo product_commit_1_in_head=yes
git merge-base --is-ancestor 0ef7d28b1658f4807b6c49e82dc432b547aba027 HEAD && echo product_commit_2_in_head=yes
stat -Lc 'dump_owner_mode=%U:%G:%a dump_size=%s dump_mtime=%y' /tmp/bcb-prod-fresh.dump
sudo -n -u postgres sha256sum /tmp/bcb-prod-fresh.dump
```

Result:

```text
0ef7d28b1658f4807b6c49e82dc432b547aba027
product_commit_1_in_head=yes
product_commit_2_in_head=yes
dump_owner_mode=postgres:postgres:600 dump_size=59402534 dump_mtime=2026-08-15 02:05:22.133336545 +0300
2c6bef2636adede0236ce1a93877463268743f15aa4a209a49f446aed5fa83ef  /tmp/bcb-prod-fresh.dump
```

Exact aggregate command:

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

These are evidence for this dump, not migration constants.

## Findings

### F1 — CRITICAL — owner consolidation silently deletes specialist availability

Reachable scenario: the public full-reset path invokes `consolidate-owner-identity.sql` before the A→B
transition (`deploy/host/deploy-test-saas.sh:3636`, transition at `:3677-3682`). The script claims the duplicate
specialist has no references and deletes it (`apps/webapp/scripts/consolidate-owner-identity.sql:110-112`). In the
fresh dump, the specialist has seven `be_specialist_service_availability` rows. The source FK is `ON DELETE
CASCADE`, so the delete succeeds and removes them; four are active and none of those four scopes has a matching
active row for the canonical specialist. The same delete also sets 133 appointment specialist references to NULL;
the following update repairs 128 live appointments, while five deleted historical appointments remain NULL.

Impact: deterministic, silent loss of seven scheduling configuration rows, including four active specialist/service
availability scopes. After reset, patients and staff can lose bookable service availability even though the
transaction and later appointment gate can remain green.

Violated owner requirement: all operational data belongs to the canonical clinic/specialist and no surviving
specialist-owned data may be dropped or retain a wrong/empty required specialist attribution.

Exact command (identifiers are derived from the reviewed script and never printed):

```bash
duplicate_specialist_id="$(sed -n "s/^DELETE FROM be_specialists WHERE id = '\([^']*\)';$/\1/p" apps/webapp/scripts/consolidate-owner-identity.sql)"
canonical_specialist_id="$(sed -n "s/^SET specialist_id = '\([^']*\)',/\1/p" apps/webapp/scripts/consolidate-owner-identity.sql)"
sudo -n -u postgres pg_restore --data-only --no-owner --no-privileges -f - /tmp/bcb-prod-fresh.dump | awk -F '\t' -v duplicate="$duplicate_specialist_id" -v canonical="$canonical_specialist_id" '
/^COPY public.be_appointments / { table="appointments"; next }
/^COPY public.be_specialist_service_availability / { table="availability"; next }
table != "" && $0 == "\\." { table=""; next }
table == "appointments" && $5 == duplicate { appointments++; if ($21 == "\\N") live_appointments++; else deleted_appointments++ }
table == "availability" { key=$4 FS $5 FS $6 FS $7; if ($3 == canonical && $10 == "t") canonical_active[key]=1; if ($3 == duplicate) { availability++; if ($10 == "t") { active_availability++; duplicate_active[key]++ } else inactive_availability++ } }
END { for (key in duplicate_active) { active_keys++; if (key in canonical_active) overlap += duplicate_active[key]; else missing += duplicate_active[key] } printf "duplicate_specialist_appointments total=%d live=%d deleted=%d\n", appointments, live_appointments, deleted_appointments; printf "duplicate_specialist_availability total=%d active=%d inactive=%d\n", availability, active_availability, inactive_availability; printf "duplicate_active_availability keys=%d canonical_overlap_rows=%d canonical_missing_rows=%d\n", active_keys, overlap, missing }
'
```

Result:

```text
duplicate_specialist_appointments total=133 live=128 deleted=5
duplicate_specialist_availability total=7 active=4 inactive=3
duplicate_active_availability keys=4 canonical_overlap_rows=0 canonical_missing_rows=4
```

### F2 — HIGH — 2,008 reminder-history rows keep a NULL canonical patient key

Reachable scenario: the generic copier copies exact common columns only
(`deploy/postgres/prod-to-target-cutover-data.sql:41-61,93-111`) and injects only a newly added
`organization_id`. Target `public.reminder_occurrence_history.platform_user_id` is new
(`deploy/postgres/generated/prod-to-target/schema-pre.sql:30821-30839`), but this relation has no explicit
platform-user transform. The historical migration that would backfill the column
(`apps/webapp/db/drizzle-migrations/0322_unified_reminder_occurrence_local.sql:167-178`) is not run by the single
A→B path. The only reminder scope gate checks `integrator.user_reminder_occurrences`
(`prod-to-target-cutover-data.sql:665-668`), not `public.reminder_occurrence_history`.

Target patient RLS reads this table with
`platform_user_id = app.current_patient_user_id()` (`deploy/postgres/privileges/declaration.ts:4381`). Thus NULL
is not a benign historical value.

Impact: all 2,008 copied history rows are invisible through the patient branch; 1,760 are mechanically attributable
to active canonical clients through the existing integrator-user projection. Patient reminder history/actions and
patient-filtered reminder statistics become incomplete after reset.

Violated owner requirement: derived operational history must belong to the canonical clinic/client graph; no
surviving semantically required patient reference may remain empty.

Exact command:

```bash
sudo -n -u postgres pg_restore --data-only --no-owner --no-privileges -f - /tmp/bcb-prod-fresh.dump | awk -F '\t' '
/^COPY public.platform_users / { table="users"; next }
/^COPY public.reminder_occurrence_history / { table="history"; next }
table != "" && $0 == "\\." { table=""; next }
table == "users" && $7 != "\\N" { if ($4 == "client" && $17 == "\\N" && $16 == "f") state[$7]="active_canonical_client"; else if ($4 == "client" && $17 != "\\N") state[$7]="merged_client"; else if ($4 == "client") state[$7]="other_client"; else state[$7]="nonclient" }
table == "history" { rows[$4]++ }
END { for (id in rows) { total += rows[id]; cls=(id in state ? state[id] : "unmapped"); count[cls] += rows[id] } printf "reminder_occurrence_history total=%d target_platform_user_id_null_after_common_copy=%d active_canonical_client=%d merged_client=%d other_client=%d nonclient=%d unmapped=%d\n", total, total, count["active_canonical_client"], count["merged_client"], count["other_client"], count["nonclient"], count["unmapped"] }
'
```

Result:

```text
reminder_occurrence_history total=2008 target_platform_user_id_null_after_common_copy=2008 active_canonical_client=1760 merged_client=0 other_client=0 nonclient=0 unmapped=248
```

### F3 — HIGH — surviving business references still point to merged client aliases

Reachable scenario: 45 merged client rows remain in the source. The owner-consolidation script handles four fixed
owner tombstones (`apps/webapp/scripts/consolidate-owner-identity.sql:145-175`), not the dynamic client merge graph;
the A→B common copier preserves matching UUID/text columns verbatim. No cutover transform canonicalizes the three
unambiguous live classes below.

Impact:

- one support conversation and its message are not returned for the canonical patient because patient reads and
  ownership checks use the canonical `platform_user_id` exactly
  (`apps/webapp/src/infra/repos/pgSupportCommunication.ts:554-560,919-925`);
- nine channel preference rows are ignored by canonical-account lookup
  (`apps/webapp/src/infra/repos/pgChannelPreferences.ts:47-57`), so message/notification/auth channel behavior can
  revert to defaults;
- six first-playback KPI rows remain assigned to a tombstone rather than the canonical viewer, splitting unique
  playback attribution (`apps/webapp/src/app-layer/media/adminPlaybackHealthMetrics.ts:109-116`).

Violated owner requirement: merged aliases must not receive membership and every surviving identity reference must
close on the canonical user; preserving patient authorship does not permit a live ownership/subject reference to
remain on a merged tombstone.

Exact command:

```bash
audit_tmp="$(mktemp -d /tmp/bcb-cutover-merged.XXXXXX)"
sudo -n -u postgres pg_restore --data-only --no-owner --no-privileges -f - /tmp/bcb-prod-fresh.dump | awk -F '\t' '/^COPY public.platform_users / { in_users=1; next } in_users && $0 == "\\." { exit } in_users && $4 == "client" && $17 != "\\N" { print $1 }' > "$audit_tmp/aliases.txt"
sudo -n -u postgres pg_restore --data-only --no-owner --no-privileges -f - /tmp/bcb-prod-fresh.dump | awk -F '\t' -v aliases="$audit_tmp/aliases.txt" '
BEGIN { while ((getline value < aliases) > 0) alias[value]=1; close(aliases) }
/^COPY public.support_conversation_messages / { table="messages"; next }
/^COPY public.support_conversations / { table="conversations"; next }
/^COPY public.support_questions / { table="questions"; next }
/^COPY public.user_channel_preferences / { table="preferences"; next }
/^COPY public.media_playback_user_video_first_resolve / { table="first_resolve"; next }
table != "" && $0 == "\\." { table=""; next }
table == "messages" { conversation_messages[$3]++ }
table == "questions" { conversation_questions[$3]++ }
table == "conversations" && ($3 in alias) { alias_conversation[$1]=1; conversations++ }
table == "preferences" && (($2 in alias) || ($9 in alias)) { preferences++; preference_user[$9]=1; preference_channel[$3]=1 }
table == "first_resolve" && ($1 in alias) { first_resolve++; playback_user[$1]=1; playback_media[$2]=1 }
END { for (id in alias_conversation) { messages += conversation_messages[id]; questions += conversation_questions[id] } for (id in preference_user) preference_users++; for (id in preference_channel) preference_channels++; for (id in playback_user) playback_users++; for (id in playback_media) playback_media_count++; printf "merged_alias_support conversations=%d messages=%d questions=%d\n", conversations, messages, questions; printf "merged_alias_channel_preferences rows=%d distinct_users=%d distinct_channels=%d\n", preferences, preference_users, preference_channels; printf "merged_alias_first_resolve rows=%d distinct_users=%d distinct_media=%d\n", first_resolve, playback_users, playback_media_count }
'
rm -rf -- "$audit_tmp"
```

Result:

```text
merged_alias_support conversations=1 messages=1 questions=0
merged_alias_channel_preferences rows=9 distinct_users=9 distinct_channels=2
merged_alias_first_resolve rows=6 distinct_users=1 distinct_media=6
```

### F4 — HIGH — 19 active message drafts are declared dead and dropped

Reachable scenario: `integrator.message_drafts` is source-only and the transition registry marks the whole relation
`intentionally_retire` with reason `dead draft storage`
(`deploy/postgres/prod-to-target-cutover-data.sql:124-135`). The target schema has no corresponding relation or
transform. The dump contains 19 rows, all in the only actionable state `pending_confirmation`; the newest was
updated less than one day before the dump.

Impact: reset deterministically discards 19 in-progress user/operator message drafts and their unsent content. The
source-only registry gate remains green because it checks that a label exists, not that the label is true.

Violated owner requirement: all user and operational data, including messages, belongs to the clinic and must
survive with correct attribution unless an explicit owner retirement decision says otherwise. Exact owner search
found no `message_drafts`, `pending_confirmation`, or `retired dialogue` decision in the seven owner files,
`HARD_MIGRATION_PROTOCOL.md`, the current closure report, or `CURRENT_AUTHORITY_MAP.md`.

Exact commands:

```bash
sudo -n -u postgres pg_restore --data-only --no-owner --no-privileges -f - /tmp/bcb-prod-fresh.dump | awk -F '\t' '
/^COPY integrator.message_drafts / { in_data=1; next }
in_data && $0 == "\\." { in_data=0; next }
in_data { rows++; state[$7]++; if (min == "" || $9 < min) min=$9; if (max == "" || $9 > max) max=$9 }
END { printf "message_drafts rows=%d updated_min=%s updated_max=%s", rows, min, max; for (value in state) printf " state_%s=%d", value, state[value]; printf "\n" }
'
printf 'target_message_drafts_relation_count='; (rg '^CREATE TABLE integrator\.message_drafts' deploy/postgres/generated/prod-to-target/schema-pre.sql || true) | wc -l
printf 'disposition='; sed -n "s/.*('integrator.message_drafts', '\([^']*\)', '\([^']*\)').*/\1|\2/p" deploy/postgres/prod-to-target-cutover-data.sql
owner_files="$(rg --files docs | rg '(^|/)(OWNER_DECISIONS|OWNER_RULINGS|OWNER_PRODUCT_RULES)' | tr '\n' ' ')"
printf 'owner_files_searched=%s\n' "$(printf '%s\n' $owner_files | wc -l)"
printf 'owner_specific_message_draft_matches='; rg -n -i "message_drafts|pending_confirmation|retired dialogue" $owner_files docs/_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md docs/_TODO/SAAS_FOUNDATION/CUTOVER_SYSTEMIC_CLOSURE_2026-08-15.md docs/CURRENT_AUTHORITY_MAP.md | wc -l
```

Result:

```text
message_drafts rows=19 updated_min=2026-04-10 20:24:22.660775+00 updated_max=2026-08-14 20:50:42.545462+00 state_pending_confirmation=19
target_message_drafts_relation_count=0
disposition=intentionally_retire|dead draft storage
owner_files_searched=7
owner_specific_message_draft_matches=0
```

The semantic search run first was:

```bash
node /home/dev/brain/tools/code-search.mjs "integrator message drafts pending confirmation cutover retire" --repo bcb -k 12
```

It returned migrations/schema history, not an owner retirement decision.

### F5 — HIGH — 8,663 surviving operational/statistics rows have no tenant attribution shape

Reachable scenario: both relations exist in source and target, so the common copier preserves them. Neither source
nor target has `organization_id` or another tenant discriminator:

- `integrator.delivery_attempt_logs` — target declaration at
  `deploy/postgres/generated/prod-to-target/schema-pre.sql:27318-27334`;
- `public.media_playback_stats_hourly` — target declaration at
  `deploy/postgres/generated/prod-to-target/schema-pre.sql:29567-29575`.

The privilege declaration explicitly classifies both as `org: false`
(`deploy/postgres/privileges/declaration.ts:858-863,1164-1168`). The media aggregate is a live fallback for admin
playback totals (`apps/webapp/src/app-layer/media/adminPlaybackHealthMetrics.ts:53-62,89-105`); delivery attempts
are the live operational audit of all five outbound channels.

Impact: 8,082 delivery-attempt rows and 581 playback aggregate rows survive but cannot be attributed to the
canonical clinic. The reset therefore violates the current single-clinic owner invariant immediately; once another
clinic exists, these same shapes also make per-clinic operational analysis and aggregate isolation impossible.

Violated owner requirement: all mailings/events/operational data and all derived statistics in this PROD belong to
the canonical clinic; only genuine platform/reference baselines may remain global.

Exact command:

```bash
sudo -n -u postgres pg_restore --data-only --no-owner --no-privileges -f - /tmp/bcb-prod-fresh.dump | awk -F '\t' '
/^COPY integrator.delivery_attempt_logs / { table="delivery"; next }
/^COPY public.media_playback_stats_hourly / { table="media_stats"; next }
table != "" && $0 == "\\." { table=""; next }
table == "delivery" { delivery++; intent[$2]++; channel[$5]++ }
table == "media_stats" { media++ }
END { printf "integrator.delivery_attempt_logs rows=%d message_send=%d\n", delivery, intent["message.send"]; printf "public.media_playback_stats_hourly rows=%d\n", media; for (value in channel) printf "delivery_channel=%s rows=%d\n", value, channel[value] }
' | sort
rg -n '^CREATE TABLE (integrator\.delivery_attempt_logs|public\.media_playback_stats_hourly)' deploy/postgres/generated/prod-to-target/schema-pre.sql
```

Result:

```text
delivery_channel=email rows=69
delivery_channel=max rows=639
delivery_channel=smsc rows=485
delivery_channel=telegram rows=3933
delivery_channel=web_push rows=2956
integrator.delivery_attempt_logs rows=8082 message_send=8082
public.media_playback_stats_hourly rows=581
27318:CREATE TABLE integrator.delivery_attempt_logs (
29567:CREATE TABLE public.media_playback_stats_hourly (
```

## PII-free relation/column ownership-reference census

Method: parse every source and target `CREATE TABLE`, retain semantic ownership/reference column names ending in
`_id`, `_by`, or `_ref` (plus exact `author|owner|actor`), then classify by actual transition path. It found 206
columns across 143 source relations and 347 columns across 191 target relations.

Summary:

| Transition class | Relations | Columns | Audit meaning |
|---|---:|---:|---|
| `preserve_exact_common_column` | 121 | 180 | copied verbatim; preservation is not canonicalization |
| `generic_organization_injection` | 96 | 96 | source lacks org column; common copier injects canonical org |
| `explicit_transform` | 4 | 5 | relation excluded from common copy and populated explicitly |
| `system_global_exemption` | 4 | 4 | reviewed platform/global shape; NULL org is intentional |
| `target_only_relation` | 36 | 61 | relation absent from source; populated only by target baseline/runtime/explicit reconstruction |
| `uncovered_gap` | 1 | 1 | `reminder_occurrence_history.platform_user_id` — F2 |

The counts sum to all 347 target reference columns. Historical author/actor columns remain in the preserve class;
the audit does not demand rewriting patient authorship to the specialist.

Exact command that produced the summary and grouped census below:

```bash
sudo -n -u postgres pg_restore --schema-only --no-owner --no-privileges -f - /tmp/bcb-prod-fresh.dump | node --input-type=module -e '
import { readFileSync } from "node:fs";
const source=readFileSync(0,"utf8"), target=readFileSync("deploy/postgres/generated/prod-to-target/schema-pre.sql","utf8");
const concept=/(?:organization|tenant|specialist|doctor|owner|actor|author|user|patient|client|assigned|created|updated|uploaded|changed|archived)/u, shape=/(?:_id|_by|_ref)$/u, exact=new Set(["author","owner","actor","created_by","updated_by","assigned_by","uploaded_by","changed_by"]);
function parse(sql){const relations=new Set(),refs=[];const re=/CREATE TABLE(?: ONLY)? ([^\s(]+) \(\n([\s\S]*?)\n\);/gu;for(const m of sql.matchAll(re)){const r=m[1].replaceAll("\"","");relations.add(r);for(const raw of m[2].split("\n")){const line=raw.trim();if(/^(?:CONSTRAINT|PRIMARY|UNIQUE|CHECK|EXCLUDE|FOREIGN)\b/u.test(line))continue;const c=line.match(/^"?([a-zA-Z0-9_]+)"?\s+/u)?.[1];if(c&&concept.test(c)&&(shape.test(c)||exact.has(c)))refs.push([r,c])}}return{relations,refs}}
const s=parse(source),t=parse(target),sk=new Set(s.refs.map(([r,c])=>`${r}|${c}`)),globals=new Set(["public.admin_audit_log","public.operator_health_failure_archive","public.operator_incidents","public.system_settings","public.system_settings_audit"]),explicitOrg=new Set(["integrator.user_reminder_delivery_logs","integrator.user_reminder_occurrences","public.reference_categories","public.reference_items"]),out=new Map();
for(const [r,c] of t.refs){let cls;if(sk.has(`${r}|${c}`))cls="preserve_exact_common_column";else if(!s.relations.has(r))cls="target_only_relation";else if(c==="organization_id"&&globals.has(r))cls="system_global_exemption";else if(c==="organization_id"&&explicitOrg.has(r))cls="explicit_transform";else if(r==="integrator.user_reminder_occurrences"&&c==="platform_user_id")cls="explicit_transform";else if(r==="public.reminder_occurrence_history"&&c==="platform_user_id")cls="uncovered_gap";else if(c==="organization_id")cls="generic_organization_injection";else cls="unclassified_gap";if(!out.has(cls))out.set(cls,new Map());const byRel=out.get(cls);if(!byRel.has(r))byRel.set(r,[]);byRel.get(r).push(c)}
console.log(`source_reference_columns=${s.refs.length} source_relations=${new Set(s.refs.map(([r])=>r)).size}`);console.log(`target_reference_columns=${t.refs.length} target_relations=${new Set(t.refs.map(([r])=>r)).size}`);
for(const cls of [...out.keys()].sort()){let cols=0;for(const value of out.get(cls).values())cols+=value.length;console.log(`### ${cls} (${out.get(cls).size} relations / ${cols} columns)`);for(const [r,cs] of [...out.get(cls)].sort(([a],[b])=>a.localeCompare(b)))console.log(`${r}(${cs.sort().join(",")})`)}
'
```

Exact grouped census:

```text
[explicit_transform]
integrator.user_reminder_delivery_logs(organization_id)
integrator.user_reminder_occurrences(organization_id,platform_user_id)
public.reference_categories(organization_id)
public.reference_items(organization_id)

[generic_organization_injection]
public.broadcast_audit(organization_id)
public.broadcast_audit_recipients(organization_id)
public.broadcast_drafts(organization_id)
public.clinical_anamnesis_illness(organization_id)
public.clinical_anamnesis_lifestyle(organization_id)
public.clinical_anamnesis_trauma(organization_id)
public.clinical_complaint(organization_id)
public.clinical_complaint_update(organization_id)
public.clinical_diagnosis(organization_id)
public.clinical_diagnosis_catalog(organization_id)
public.clinical_diagnosis_status_history(organization_id)
public.clinical_diagnosis_update(organization_id)
public.clinical_test_regions(organization_id)
public.clinical_visit(organization_id)
public.comments(organization_id)
public.content_access_grants_webapp(organization_id)
public.content_pages(organization_id)
public.content_section_slug_history(organization_id)
public.content_sections(organization_id)
public.courses(organization_id)
public.doctor_notes(organization_id)
public.doctor_patient_support(organization_id)
public.lfk_complex_exercises(organization_id)
public.lfk_complex_template_exercises(organization_id)
public.lfk_complex_templates(organization_id)
public.lfk_complexes(organization_id)
public.lfk_exercise_media(organization_id)
public.lfk_exercise_regions(organization_id)
public.lfk_exercises(organization_id)
public.lfk_sessions(organization_id)
public.material_ratings(organization_id)
public.media_files(organization_id)
public.media_folders(organization_id)
public.media_hls_proxy_error_events(organization_id)
public.media_playback_client_events(organization_id)
public.media_playback_resolution_events(organization_id)
public.media_playback_user_video_first_resolve(organization_id)
public.media_transcode_jobs(organization_id)
public.media_upload_sessions(organization_id)
public.message_log(organization_id)
public.motivational_quotes(organization_id)
public.notification_delivery_attempts(organization_id)
public.online_intake_answers(organization_id)
public.online_intake_attachments(organization_id)
public.online_intake_requests(organization_id)
public.online_intake_status_history(organization_id)
public.outgoing_delivery_queue(organization_id)
public.patient_bookings(organization_id)
public.patient_comorbidity(organization_id)
public.patient_content_rating_feedback(organization_id)
public.patient_daily_warmup_presentations(organization_id)
public.patient_daily_warmup_video_views(organization_id)
public.patient_diary_day_snapshots(organization_id)
public.patient_files(organization_id)
public.patient_home_block_items(organization_id)
public.patient_home_blocks(organization_id)
public.patient_lfk_assignments(organization_id)
public.patient_payment(organization_id)
public.patient_practice_completions(organization_id)
public.platform_user_contacts(organization_id)
public.product_analytics_events_recent(organization_id)
public.product_analytics_hourly(organization_id)
public.product_analytics_user_hourly(organization_id)
public.product_push_notifications(organization_id)
public.program_action_log(organization_id)
public.program_item_discussion_messages(organization_id)
public.program_item_discussion_reads(organization_id)
public.recommendation_regions(organization_id)
public.recommendations(organization_id)
public.reminder_delivery_events(organization_id)
public.reminder_journal(organization_id)
public.reminder_occurrence_history(organization_id)
public.reminder_rules(organization_id)
public.specialist_tasks(organization_id)
public.support_conversation_messages(organization_id)
public.support_conversations(organization_id)
public.support_delivery_events(organization_id)
public.support_question_messages(organization_id)
public.support_questions(organization_id)
public.symptom_entries(organization_id)
public.symptom_trackings(organization_id)
public.test_attempts(organization_id)
public.test_results(organization_id)
public.test_set_items(organization_id)
public.test_sets(organization_id)
public.tests(organization_id)
public.treatment_program_events(organization_id)
public.treatment_program_instance_stage_groups(organization_id)
public.treatment_program_instance_stage_items(organization_id)
public.treatment_program_instance_stages(organization_id)
public.treatment_program_instances(organization_id)
public.treatment_program_template_stage_groups(organization_id)
public.treatment_program_template_stage_items(organization_id)
public.treatment_program_template_stages(organization_id)
public.treatment_program_templates(organization_id)
public.user_phone_history(organization_id)

[preserve_exact_common_column]
public.admin_audit_log(actor_id)
public.be_appointment_cancellations(actor_id,organization_id)
public.be_appointment_history_events(actor_id,organization_id)
public.be_appointment_no_shows(actor_id,organization_id)
public.be_appointment_reschedules(actor_id,organization_id)
public.be_appointment_staff_comments(author_id,organization_id,platform_user_id)
public.be_appointments(organization_id,platform_user_id,specialist_id)
public.be_availability_rules(organization_id,specialist_id)
public.be_booking_form_fields(organization_id)
public.be_booking_form_submissions(organization_id)
public.be_branches(organization_id)
public.be_cancellation_policies(organization_id)
public.be_clinic_services(organization_id)
public.be_external_entity_mappings(organization_id)
public.be_package_history_events(organization_id,patient_package_id)
public.be_package_usages(created_by_platform_user_id,organization_id,patient_package_id,patient_package_item_id)
public.be_patient_booking_profiles(organization_id,platform_user_id,updated_by)
public.be_patient_package_items(patient_package_id)
public.be_patient_packages(assigned_by_platform_user_id,organization_id,platform_user_id)
public.be_patient_timeline_events(organization_id,platform_user_id)
public.be_payment_history_events(organization_id,platform_user_id)
public.be_payment_intents(organization_id,platform_user_id)
public.be_payment_provider_events(organization_id)
public.be_payments(organization_id,platform_user_id)
public.be_prepayment_policies(organization_id)
public.be_refunds(organization_id)
public.be_reschedule_policies(organization_id)
public.be_rooms(organization_id)
public.be_schedule_blocks(created_by_actor_id,organization_id,specialist_id)
public.be_schedule_templates(organization_id)
public.be_service_location_availability(organization_id)
public.be_specialist_locations(organization_id,specialist_id)
public.be_specialist_rooms(organization_id,specialist_id)
public.be_specialist_service_availability(organization_id,specialist_id)
public.be_specialists(organization_id)
public.be_subscription_packages(organization_id)
public.be_working_days(organization_id,specialist_id)
public.be_working_hours(organization_id,specialist_id)
public.broadcast_audit(actor_id)
public.broadcast_audit_recipients(platform_user_id)
public.broadcast_drafts(doctor_user_id)
public.channel_link_secrets(user_id)
public.clinical_anamnesis_illness(created_by,patient_user_id)
public.clinical_anamnesis_lifestyle(created_by,patient_user_id)
public.clinical_anamnesis_trauma(created_by,patient_user_id)
public.clinical_complaint(patient_user_id)
public.clinical_diagnosis(patient_user_id)
public.clinical_diagnosis_catalog(created_by)
public.clinical_diagnosis_status_history(changed_by)
public.clinical_visit(created_by,patient_user_id)
public.comments(author_id)
public.content_access_grants_webapp(integrator_user_id,platform_user_id)
public.content_section_slug_history(changed_by_user_id)
public.doctor_notes(author_id,user_id)
public.doctor_patient_support(patient_user_id,updated_by)
public.email_challenges(user_id)
public.email_send_cooldowns(user_id)
public.lfk_complex_templates(created_by)
public.lfk_complexes(platform_user_id,user_id)
public.lfk_exercises(created_by)
public.lfk_sessions(user_id)
public.login_tokens(user_id)
public.material_ratings(user_id)
public.media_files(uploaded_by)
public.media_folders(created_by,patient_user_id)
public.media_hls_proxy_error_events(user_id)
public.media_playback_client_events(user_id)
public.media_playback_resolution_events(user_id)
public.media_playback_user_video_first_resolve(user_id)
public.media_upload_sessions(owner_user_id)
public.message_log(platform_user_id,user_id)
public.motivational_quotes(author)
public.notification_delivery_attempts(integrator_user_id,user_id)
public.online_intake_requests(user_id)
public.online_intake_status_history(changed_by)
public.operator_health_failure_archive(archived_by_user_id,doctor_user_id)
public.patient_bookings(platform_user_id,provenance_created_by,provenance_updated_by)
public.patient_comorbidity(created_by,patient_user_id)
public.patient_content_rating_feedback(user_id)
public.patient_daily_warmup_presentations(user_id)
public.patient_daily_warmup_video_views(user_id)
public.patient_diary_day_snapshots(platform_user_id)
public.patient_files(patient_user_id,uploaded_by_user_id)
public.patient_lfk_assignments(assigned_by,patient_user_id)
public.patient_merge_candidates(anchor_user_id,candidate_user_id,organization_id)
public.patient_payment(created_by,patient_user_id)
public.patient_practice_completions(user_id)
public.phone_messenger_bind_secrets(user_id)
public.platform_user_contacts(platform_user_id)
public.platform_users(integrator_user_id)
public.product_analytics_events_recent(client_session_id,user_id)
public.product_analytics_user_hourly(user_id)
public.product_push_notifications(user_id)
public.program_action_log(patient_user_id)
public.program_item_discussion_messages(patient_user_id)
public.program_item_discussion_reads(patient_user_id)
public.recommendations(created_by)
public.reference_categories(owner_id,tenant_id)
public.reminder_delivery_events(integrator_user_id)
public.reminder_occurrence_history(integrator_user_id)
public.reminder_rules(integrator_user_id,platform_user_id)
public.specialist_tasks(owner_user_id,patient_user_id)
public.support_conversations(integrator_user_id,platform_user_id)
public.symptom_entries(patient_practice_completion_id,platform_user_id,user_id)
public.symptom_trackings(platform_user_id,user_id)
public.system_settings(updated_by)
public.system_settings_audit(changed_by)
public.test_attempts(patient_user_id)
public.test_sets(created_by)
public.tests(created_by)
public.treatment_program_events(actor_id)
public.treatment_program_instances(assigned_by,patient_user_id)
public.treatment_program_templates(created_by)
public.user_channel_bindings(user_id)
public.user_channel_preferences(platform_user_id,user_id)
public.user_notification_topic_channels(user_id)
public.user_notification_topics(user_id)
public.user_oauth_bindings(provider_user_id,user_id)
public.user_password_credentials(user_id)
public.user_phone_history(platform_user_id)
public.user_web_push_subscriptions(user_id)

[system_global_exemption]
public.admin_audit_log(organization_id)
public.operator_health_failure_archive(organization_id)
public.system_settings(organization_id)
public.system_settings_audit(organization_id)

[target_only_relation]
app.principal_context(integrator_user_id,patient_user_id)
app_ext.accepted_port_contexts(actor_ref,integrator_user_id,organization_id)
app_ext.variant_a_identity_refs(physical_user_id)
public.app_runtime_settings(organization_id,updated_by)
public.app_runtime_settings_audit(organization_id,updated_by)
public.be_organization_members(organization_id,platform_user_id,specialist_id)
public.clinic_dedicated_bot_bindings(organization_id)
public.clinic_public_directory_entries(organization_id)
public.email_otp_locks(user_id)
public.manual_patient_commands(organization_id,platform_user_id)
public.org_brand_revisions(archived_by_platform_user_id,created_by_platform_user_id,organization_id,published_by_platform_user_id)
public.org_enrollments(organization_id,platform_user_id)
public.organization_member_invites(accepted_by_platform_user_id,created_by_platform_user_id,organization_id)
public.organization_slug_claims(created_by_platform_user_id,organization_id)
public.organization_slug_rename_events(actor_platform_user_id,organization_id)
public.password_login_identifier_protection(leased_user_id)
public.patient_invites(accepted_by_platform_user_id,created_by_platform_user_id,organization_id,patient_user_id,revoked_by_platform_user_id)
public.patient_specialist_links(organization_id,patient_user_id,specialist_id)
public.reference_catalog_snapshot_receipts(organization_id)
public.saas_billing_accounts(organization_id)
public.saas_billing_invoices(organization_id)
public.saas_billing_provider_events(organization_id)
public.saas_billing_refunds(organization_id)
public.saas_billing_subscriptions(organization_id)
public.saas_org_entitlement_overrides(organization_id)
public.saas_organization_trials(created_by,organization_id)
public.saas_paid_period_policy(updated_by)
public.saas_registration_tariff_policy(updated_by)
public.saas_trial_policy(updated_by)
public.specialist_signup_intents(provisioned_organization_id,provisioned_specialist_id,user_id)
public.staff_security_profiles(user_id)
public.user_contacts(platform_user_id)
public.user_identity(platform_user_id)
public.user_passkey_accounts(user_id)
public.user_passkey_challenges(user_id)
public.user_passkey_credentials(user_id)

[uncovered_gap]
public.reminder_occurrence_history(platform_user_id)
```

Complement for relations that carry operational/statistical data but have no ownership/reference column at all:

```text
integrator.delivery_attempt_logs — 8,082 rows — no tenant discriminator (F5)
public.media_playback_stats_hourly — 581 rows — no tenant discriminator (F5)
```

### Source-only disposition census

Exact relation counts:

```text
source_relations=221
target_relations=217
shared_relations=176
source_only_relations=45
target_only_relations=41
disposition_transform=14
disposition_intentionally_retire=31
```

Exact commands for those counts:

```bash
source_relations() { sudo -n -u postgres pg_restore --list /tmp/bcb-prod-fresh.dump | awk '$4=="TABLE" && $5 ~ /^(public|integrator|drizzle)$/ {print $5 "." $6}' | sort -u; }
target_relations() { awk '/^CREATE TABLE (public|integrator|drizzle)\./ { relation=$3; gsub(/"/, "", relation); print relation }' deploy/postgres/generated/prod-to-target/schema-pre.sql | sort -u; }
printf 'source_relations='; source_relations | wc -l
printf 'target_relations='; target_relations | wc -l
printf 'shared_relations='; comm -12 <(source_relations) <(target_relations) | wc -l
printf 'source_only_relations='; comm -23 <(source_relations) <(target_relations) | wc -l
printf 'target_only_relations='; comm -13 <(source_relations) <(target_relations) | wc -l
printf 'disposition_transform='; sed -n '124,169p' deploy/postgres/prod-to-target-cutover-data.sql | rg -c "'transform'"
printf 'disposition_intentionally_retire='; sed -n '124,169p' deploy/postgres/prod-to-target-cutover-data.sql | rg -c "'intentionally_retire'"
```

All 45 source-only relations have one registry entry, so unexplained/stale relation names fail closed. That closes
registry completeness, not correctness of each disposition; F4 is the demonstrated false disposition.

PII-free row census (`T` = transform, `R` = intentionally retire):

```text
T integrator.booking_calendar_map rows=233
T integrator.contacts rows=81
R integrator.content_access_grants rows=0
T integrator.conversation_messages rows=36
T integrator.conversations rows=21
T integrator.identities rows=140
R integrator.mailing_logs rows=0
R integrator.mailing_topics rows=0
R integrator.mailings rows=0
R integrator.message_drafts rows=19
T integrator.question_messages rows=20
R integrator.rubitime_api_throttle rows=1
R integrator.rubitime_booking_profiles rows=0
R integrator.rubitime_branches rows=0
R integrator.rubitime_cooperators rows=0
T integrator.rubitime_create_retry_jobs rows=123
R integrator.rubitime_events rows=453
R integrator.rubitime_records rows=91
R integrator.rubitime_services rows=0
R integrator.system_settings rows=57
T integrator.telegram_state rows=121
R integrator.telegram_users rows=2
T integrator.user_questions rows=16
R integrator.user_reminder_rules rows=29
R integrator.user_subscriptions rows=0
T integrator.users rows=140
T public.appointment_records rows=499
T public.be_appointment_events rows=445
R public.be_product_history_events rows=0
R public.be_product_pay_links rows=0
R public.be_product_purchases rows=0
R public.be_products rows=0
R public.booking_branch_services rows=5
R public.booking_branches rows=2
R public.booking_services rows=3
R public.booking_specialists rows=2
R public.branches rows=2
R public.clinical_test_measure_kinds rows=0
R public.mailing_logs_webapp rows=0
R public.mailing_topics_webapp rows=0
T public.schema_migrations rows=73
R public.user_email_setup_tokens rows=29
R public.user_pins rows=2
R public.user_subscriptions_webapp rows=0
T public.webapp_reminder_occurrences rows=2086
```

Exact row-count command (the `T`/`R` labels above are the matching entries from lines 124–169 of the registry):

```bash
audit_tmp="$(mktemp -d /tmp/bcb-cutover-relations.XXXXXX)"
comm -23 <(sudo -n -u postgres pg_restore --list /tmp/bcb-prod-fresh.dump | awk '$4=="TABLE" && $5 ~ /^(public|integrator|drizzle)$/ {print $5 "." $6}' | sort -u) <(awk '/^CREATE TABLE (public|integrator|drizzle)\./ { relation=$3; gsub(/"/, "", relation); print relation }' deploy/postgres/generated/prod-to-target/schema-pre.sql | sort -u) > "$audit_tmp/source-only.txt"
sudo -n -u postgres pg_restore --data-only --no-owner --no-privileges -f - /tmp/bcb-prod-fresh.dump | awk -F '\t' -v relations="$audit_tmp/source-only.txt" '
BEGIN { while ((getline value < relations) > 0) source_only[value]=1; close(relations) }
/^COPY / { split($0,header," "); relation=header[2]; in_data=(relation in source_only); next }
in_data && $0 == "\\." { in_data=0; next }
in_data { rows[relation]++ }
END { for (relation in source_only) print relation "|rows=" (rows[relation]+0) }
' | sort
rm -rf -- "$audit_tmp"
```

## Proven closed green classes

These classes are closed for the audited checkout, but they do not override the five findings:

- **All-client membership selection:** manifest predicate is exactly active canonical `role='client'`; the dump
  aggregate above is 245. The focused test includes an active canonical client with no domain facts and proves it
  still receives both endpoints. Merged/archived clients are excluded.
- **Membership endpoints:** prior independent fault injection made missing enrollment, duplicate enrollment, extra
  enrollment, wrong organization, missing specialist link, duplicate specialist link, extra specialist link, and
  wrong specialist all turn RED. The temporary test export was restored byte-for-byte.
- **Source-only registry mechanics:** 45/45 exact dispositions; a new or stale relation name fails.
- **Legacy contacts runtime closure:** no active reader/strategy remains. `check-legacy-access-census.mjs` scans seven
  active roots, excludes test/migration source from the active class, and permits exactly seven named transition
  files. Its self-test proves an unknown transition mention is rejected.
- **Doctor broadcast failure:** the focused worker test proves canonical public phone lookup and propagation of DB
  failure into the existing retry/error boundary.
- **Tariff target catalog:** generated target contains four reviewed tariff INSERTs, all four reviewed IDs and zero
  of four environment-owned IDs. Validation is exact-ID plus reviewed mechanics/price/shape, not a name regex.
- **Reset ordering:** executable wrapper test proves same-checkout `check:prod-to-target-cutover` precedes the shared
  reset and that preflight exit propagates without invoking it. Removing the preflight temporarily produced
  `exit=1` with two red tests; restoring the wrapper returned 3/3 green.
- **SMTP/static delivery claim:** validator rejects missing/invalid shape without printing the value, the wrapper
  says `DB/schema/runtime ready; external delivery unverified`, and the opt-in admin route returns `probeRef`.

Exact validation commands and recorded results from the completed independent run:

```bash
pnpm run check:cutover-systemic-closure
```

`PASS`, exit 0: 13/13 Node tests; legacy census `PASS (7 active roots; 7 exact transition files)`; census self-test
PASS; SMTP shape self-test PASS.

```bash
pnpm --dir apps/integrator exec vitest --run src/infra/runtime/worker/doctorBroadcastIntentMenu.test.ts
```

`PASS`, exit 0: 1 file, 3 tests, including DB-failure propagation.

```bash
bash -n deploy/host/deploy-test-full-reset.sh deploy/host/deploy-test-saas.sh && \
node --check scripts/prod-to-target-baseline-policy.mjs && \
node --check scripts/check-legacy-access-census.mjs && \
node --check deploy/host/deploy-test-full-reset.test.mjs && \
node --check deploy/host/validate-smtp-outbound-snapshot.mjs && \
git diff --check
```

`PASS`, exit 0.

```bash
pnpm run check:prod-to-target-cutover
```

`PASS`, exit 0: committed target snapshot matched the local DEV schema snapshot. This was read-only and does not
prove the destructive transition on TEST.

```bash
node --test deploy/host/deploy-test-full-reset.test.mjs
```

With the temporary preflight-removal mutant: expected `FAIL`, exit 1, two ordering/failure-propagation tests red.
After restoration: `PASS`, exit 0, 3/3 tests. `git diff --check` passed and the worktree was clean before this
artifact was created.

Static catalog recheck in recovery:

```text
target_tariff_insert_count=4
reviewed_tariff_ids_present=4
environment_tariff_ids_present=0
```

`pnpm run ci` was not run, per instruction.

## Live-only unknowns

- No real fresh-dump A→B transaction was executed, so final SQL gates, post-cutover row counts, target grants/RLS,
  patient organization resolution, doctor roster, and service health remain unproved on TEST.
- No DB reset, deploy, service stop/restart, env mutation, or provider call was performed.
- SMTP provider/mailbox receipt is unverified; Telegram, MAX, SMS, and Web Push delivery are also unverified.
- Dump figures apply only to SHA-256 `2c6bef2636adede0236ce1a93877463268743f15aa4a209a49f446aed5fa83ef`;
  a later fresh dump must be re-censused.
- The owner-reviewed FIO and legacy appointment input artifacts were not re-executed in this recovery pass; their
  live application remains part of the eventual authorized TEST rehearsal.

## Gate decision

The product commits may not land as the accepted cutover closure, and the one owner-gated fresh-dump TEST reset may
not start. F1–F5 are reachable on the exact audited checkout and dump; F1 and F4 are destructive data loss, F2 and
F3 create immediate canonical-user invisibility/misattribution, and F5 violates mandatory tenant ownership for
surviving operational/statistical data.
