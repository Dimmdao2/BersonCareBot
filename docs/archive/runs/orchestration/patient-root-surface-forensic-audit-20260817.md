# Patient root relation-surface forensic audit — 2026-08-17

## Verdict

**FAIL** on `fadba67d7a9afed2b415239af21ede0b396f8d90`.

The 47 `SECURITY DEFINER` current-patient roots installed by migrations `0016` and `0017` have **29 exact
under-declared function × relation × operation requirements in 17 functions**:

- 14 entire relation surfaces are absent from five functions (all 14 are required `SELECT` reads);
- 15 operations are absent from already declared relation surfaces in 15 functions.

This is not 29 necessarily missing role ACLs. All roots share owner `app_seam_patient_self_actions_owner`, and
grants are aggregated by owner. Sibling-root declarations accidentally mask 20 of the 29 per-function defects.
The aggregated owner role still lacks **nine** required relation × operation grants, listed below; those are direct
runtime blockers after the generated ACL is applied. The other 20 are still declaration defects: the named-root
provenance is false and the current verifier cannot prove the body it claims to prove.

## Authority and method

Read before the audit: `AGENTS.md` migration rules, §5 DB boundary, §10 audit/test policy and §24 orchestration;
`README.md`; `docs/README.md`; `deploy/postgres/privileges/README.md`; the actual declarations, generator, tests and
both migration bodies. No database, DEV, TEST, PROD, env, deploy or push action was performed.

Blind kill-set, fixed before inspecting existing tests:

1. an entire body relation is absent from `relationSurfaces`;
2. direct `SELECT`, `INSERT`, `UPDATE` or `DELETE` is absent;
3. `UPDATE`/`DELETE` predicate or `RETURNING` lacks its required `SELECT`;
4. `ON CONFLICT DO UPDATE` lacks `UPDATE` and/or conflict-row `SELECT`;
5. targeted `ON CONFLICT (...) / ON CONSTRAINT ... DO NOTHING` lacks conflict-row `SELECT`, while targetless
   `ON CONFLICT DO NOTHING` must not create that false positive;
6. every `RETURNING`, including `RETURNING *`, requires `SELECT` on returned columns;
7. comma-separated `FROM` relations, joins, mutation source relations and repeated statements are all counted;
8. declaration-only relation/operation entries are reported separately as overbreadth, not mixed into missing ACLs;
9. multi-operation surfaces without `operationColumns` are inspected as a precision signal, not automatically
   labelled a defect.

Executable machine-readable artifact and reproduction command:

```bash
node runs/orchestration/patient-root-surface-forensic-audit-20260817.mjs
```

It emits the complete JSON matrix (`underDeclaration`, `ownerRoleAggregate`, `operationColumnInspection`, and all
47 per-function `audit` rows) and exits `1` while an under-declaration remains. It extracted exactly 47 functions,
found no dynamic SQL, and resolved every qualified relation mention: `unresolvedMentions = 0`. The diagnostic is a
one-shot audit artifact, not a new CI source-text gate.

The repository generator's body verifier at `generate.mjs:1420-1453` is not bidirectional: it iterates only
declared surfaces, so a wholly absent relation cannot be observed. It also looks for named declared columns after
`RETURNING`, so `RETURNING *` escapes, and one copied union surface is never rejected for granting operations that
the particular function does not perform.

## Complete under-declaration list

### Entire relation surface absent — 14 `SELECT` requirements

| Function | Missing relation(s) |
|---|---|
| `record_current_patient_content_rating_feedback` (`0016:302`) | `public.patient_home_blocks`, `public.patient_home_block_items` |
| `record_current_patient_playback_client_event` (`0016:382`) | `public.content_pages`, `public.program_item_discussion_messages`, `public.treatment_program_instance_stage_items`, `public.treatment_program_instance_stages`, `public.treatment_program_instances` |
| `record_current_patient_playback_first_resolve` (`0016:459`) | the same five visibility relations as playback client event |
| `create_current_patient_reminder_rule` (`0017:8`) | `public.org_enrollments` |
| `ensure_current_patient_support_conversation` (`0017:203`) | `public.org_enrollments` |

### Relation declared, operation absent — 15 requirements

| Function | Missing operation | PostgreSQL requirement |
|---|---|---|
| `record_current_patient_practice_completion` (`0016:6`) | `patient_practice_completions:SELECT` | `INSERT ... RETURNING` |
| `upsert_current_patient_material_rating` (`0016:68`) | `material_ratings:SELECT` | `ON CONFLICT DO UPDATE` conflict/update row |
| `update_current_patient_practice_completion_feeling` (`0016:163`) | `patient_practice_completions:SELECT` | `UPDATE ... WHERE` |
| `save_current_patient_daily_warmup_presentation` (`0016:193`) | `patient_daily_warmup_presentations:SELECT` | `ON CONFLICT DO UPDATE` |
| `record_current_patient_content_rating_feedback` (`0016:302`) | `patient_content_rating_feedback:SELECT` | `INSERT ... RETURNING` |
| `record_current_patient_playback_first_resolve` (`0016:459`) | `media_playback_user_video_first_resolve:SELECT` | targeted `ON CONFLICT (user_id, media_id) DO NOTHING` |
| `set_current_patient_notification_topic` (`0016:620`) | `user_notification_topics:SELECT` | `ON CONFLICT DO UPDATE` |
| `set_current_patient_notification_topic_channel` (`0016:670`) | `user_notification_topic_channels:SELECT` | `ON CONFLICT DO UPDATE` |
| `create_current_patient_reminder_rule` (`0017:8`) | `platform_users:SELECT` | direct `SELECT ... FROM` |
| `delete_current_patient_reminder_rule` (`0017:95`) | `reminder_occurrence_history:DELETE` | direct delete target |
| `record_current_patient_reminder_journal_action` (`0017:119`) | `reminder_journal:SELECT` | `INSERT ... RETURNING` |
| `set_current_patient_reminder_muted_until` (`0017:188`) | `platform_users:SELECT` | `UPDATE ... WHERE` |
| `append_current_patient_program_event` (`0017:1019`) | `treatment_program_events:SELECT` | `INSERT ... RETURNING *` |
| `append_current_patient_program_discussion` (`0017:1082`) | `program_item_discussion_messages:SELECT` | `INSERT ... RETURNING *` |
| `mark_current_patient_program_discussion_read` (`0017:1125`) | `program_item_discussion_reads:SELECT` | `ON CONFLICT DO UPDATE` |

No missing direct `INSERT` or `UPDATE` operation remains after this enumeration; the one missing direct mutation is
`reminder_occurrence_history:DELETE`. The remaining 14 missing operations are reads imposed by explicit reads,
predicates, `ON CONFLICT`, or `RETURNING`.

## Owner-role aggregate impact

The 47 bodies require 87 unique relation × operation pairs over 39 relations. Their own declarations contain 77
of those pairs; considering all 54 declared roots owned by `app_seam_patient_self_actions_owner` supplies one more
needed pair (`material_ratings:SELECT`). These **nine** pairs remain absent from the full owner-role declaration and
therefore from generated grants:

1. `public.media_playback_user_video_first_resolve:SELECT`
2. `public.patient_content_rating_feedback:SELECT`
3. `public.program_item_discussion_messages:SELECT`
4. `public.program_item_discussion_reads:SELECT`
5. `public.reminder_journal:SELECT`
6. `public.reminder_occurrence_history:DELETE`
7. `public.treatment_program_events:SELECT`
8. `public.user_notification_topic_channels:SELECT`
9. `public.user_notification_topics:SELECT`

Thus the owner-role union does not make the base safe: nine operations can still fail with privilege denial. The
masked pairs are not harmless metadata noise either; widening or splitting seam owners later would reveal them,
and today's verifier attributes sibling grants to the wrong root.

## Overbreadth and operation-specific columns

This is kept separate from missing functionality:

- 37/47 functions declare operations not performed by that function;
- 32/47 declare whole relations not touched by that function;
- exact total: 127 over-declared function × relation pairs and 333 over-declared function × relation × operation
  triples;
- at owner-role operation-pair union, `selectedDeclarationBeyondSelectedBodies` is empty: the copies do **not** add
  a new relation × operation to this shared role beyond what some other one of the 47 bodies needs;
- they still destroy per-root exactness and make review/verifier results misleading.

The cause is the five copied core arrays, especially `PATIENT_REMINDER_CORE_SURFACES` and
`PATIENT_PROGRAM_CORE_SURFACES`: every root receives the union surface of the whole feature group. For example,
`mark_all_current_patient_reminder_history_seen()` touches only `reminder_occurrence_history` but declares four
relations; a program item-view update declares all ten program-core relations.

Column precision is also structurally inadequate: the 47 roots contain 268 declared surface rows, 148 rows carry
multiple operations, and only one row has `operationColumns`; 147 multi-operation rows therefore give every
operation the full union `columns` list unless a worker narrows them. This count is a review queue, not an assertion
that all 147 are independently exploitable. Confirmed examples include `reminder_rules`, where `UPDATE` inherits
the large create/read union, and the shared program surfaces, where unrelated mutation columns are copied to every
root. The worker should replace shared union arrays with exact per-function surfaces and add per-operation subsets
where a relation legitimately has multiple operations.

The JSON output is the complete exact overbreadth inventory: each of the 37 affected functions contains explicit
`overdeclaredRelations` and `overdeclaredOperations` arrays, so no 333-row prose transcription is needed and no
identity is hidden behind a count.

## Required correction/gate

Product correction belongs to a separate worker. Acceptance is binary on the same command:

- all 47 bodies still parse and every body relation is classified;
- `absentRelationPairs = 0`, `missingOperationTriples = 0`, `unresolvedMentions = 0`;
- per-function copied union surfaces are replaced by exact surfaces rather than merely adding the nine owner-role
  grants;
- operation-specific columns are narrowed where operations touch different column sets;
- the canonical generator verifier becomes bidirectional and covers `RETURNING *`, otherwise the same class can
  recur undetected.
