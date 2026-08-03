#!/usr/bin/env node

import { buildRlsDescriptors } from './rls-descriptor-model.mjs';
import {
  renderFkPathDormantPolicyStatements,
  renderOrgColumnDormantPolicyStatements,
} from './rls-sql-renderer.mjs';

export const p084PolicyName = 'saas_org_dormant_p0_8_4';

export const expectedP084PublicFkPathTargets = Object.freeze([
  'public.be_package_items',
  'public.be_patient_package_items',
]);

export const expectedP084PublicDenormTargets = Object.freeze([
  'public.broadcast_audit_recipients',
  'public.clinical_complaint_update',
  'public.clinical_diagnosis_status_history',
  'public.clinical_diagnosis_update',
  'public.content_section_slug_history',
  'public.lfk_complex_exercises',
  'public.lfk_complex_template_exercises',
  'public.lfk_exercise_media',
  'public.media_transcode_jobs',
  'public.notification_delivery_attempts',
  'public.online_intake_answers',
  'public.online_intake_attachments',
  'public.online_intake_status_history',
  'public.patient_daily_warmup_video_views',
  'public.patient_home_block_items',
  'public.program_action_log',
  'public.program_item_discussion_messages',
  'public.program_item_discussion_reads',
  'public.reference_items',
  'public.reminder_delivery_events',
  'public.reminder_occurrence_history',
  'public.support_conversation_messages',
  'public.support_delivery_events',
  'public.support_question_messages',
  'public.symptom_entries',
  'public.test_results',
  'public.test_set_items',
  'public.treatment_program_events',
  'public.treatment_program_instance_stage_groups',
  'public.treatment_program_instance_stage_items',
  'public.treatment_program_instance_stages',
  'public.treatment_program_template_stage_groups',
  'public.treatment_program_template_stage_items',
  'public.treatment_program_template_stages',
]);

// B4-core-4 (docs/_TODO/SAAS_FOUNDATION/R2_ENFORCEMENT_PREP_PLAN.md, taskdb #660): public.comments
// is no longer blocked. P0.12.1 (docs/_TODO/SAAS_FOUNDATION/P0_12_RESIDUAL_REFS_CHECKLIST.md) is
// complete — its polymorphic organization_id resolver is documented, materialized (0154), and
// checked by check-p0-12-polymorphic-references.mjs for all 9 target_type values. rls-descriptor-
// model.mjs now attaches a `patientPolymorphic` predicate to it (see `patientPolymorphicOwnedTables`
// there), so it renders a real dormant policy here like every other P0.8.4 target. A polymorphic_
// resolver descriptor WITHOUT a resolved patientPolymorphic predicate would still be treated as
// blocked (the mechanism stays available for any future, not-yet-resolved polymorphic target) —
// expectedP084BlockedPolymorphicTargets is intentionally empty now, not removed, so a regression
// (a new unresolved polymorphic SCOPED table) fails loudly here instead of silently rendering `false`
// or being silently skipped.
export const expectedP084BlockedPolymorphicTargets = Object.freeze([]);

export const expectedP084PublicPolymorphicTargets = Object.freeze(['public.comments']);

const expectedTargetSet = new Set([
  ...expectedP084PublicFkPathTargets,
  ...expectedP084PublicDenormTargets,
  ...expectedP084PublicPolymorphicTargets,
]);

function setDiff(left, right) {
  return Array.from(left)
    .filter((value) => !right.has(value))
    .sort();
}

function sortedDescriptors(descriptors) {
  return descriptors.sort((left, right) => left.table.localeCompare(right.table));
}

export function getP084PublicPathDescriptors({ descriptors = buildRlsDescriptors() } = {}) {
  const publicScopedPathDescriptors = Array.from(descriptors.values()).filter(
    (descriptor) =>
      descriptor.tier === 'SCOPED' &&
      descriptor.table.startsWith('public.') &&
      ['fk_path', 'denorm_org_column', 'polymorphic_resolver'].includes(descriptor.scopingKind),
  );

  const targets = sortedDescriptors(
    publicScopedPathDescriptors.filter(
      (descriptor) =>
        ['fk_path', 'denorm_org_column'].includes(descriptor.scopingKind) ||
        (descriptor.scopingKind === 'polymorphic_resolver' &&
          Boolean(descriptor.patientPolymorphic)),
    ),
  );
  const blockedPolymorphic = sortedDescriptors(
    publicScopedPathDescriptors.filter(
      (descriptor) =>
        descriptor.scopingKind === 'polymorphic_resolver' && !descriptor.patientPolymorphic,
    ),
  );

  assertP084PublicPathTargets(targets, blockedPolymorphic);

  return targets;
}

export function getP084PublicDenormDescriptors(options) {
  return getP084PublicPathDescriptors(options).filter(
    (descriptor) => descriptor.scopingKind === 'denorm_org_column',
  );
}

export function getP084PublicFkPathDescriptors(options) {
  return getP084PublicPathDescriptors(options).filter(
    (descriptor) => descriptor.scopingKind === 'fk_path',
  );
}

export function getP084PublicPolymorphicDescriptors(options) {
  return getP084PublicPathDescriptors(options).filter(
    (descriptor) => descriptor.scopingKind === 'polymorphic_resolver',
  );
}

export function assertP084PublicPathTargets(targets, blockedPolymorphic) {
  const actualTables = targets.map((descriptor) => descriptor.table);
  const actualSet = new Set(actualTables);

  if (actualTables.length !== 37) {
    throw new Error(
      `Expected 37 P0.8.4 public FK/denorm/polymorphic path targets, got ${actualTables.length}`,
    );
  }

  if (actualSet.size !== actualTables.length) {
    throw new Error('P0.8.4 public FK/denorm/polymorphic path targets contain duplicates');
  }

  const expectedSet = expectedTargetSet;
  const missing = setDiff(expectedSet, actualSet);
  const extra = setDiff(actualSet, expectedSet);

  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `P0.8.4 target set mismatch. Missing: ${missing.join(', ') || '<none>'}. Extra: ${
        extra.join(', ') || '<none>'
      }`,
    );
  }

  const fkTargets = targets
    .filter((descriptor) => descriptor.scopingKind === 'fk_path')
    .map((descriptor) => descriptor.table);
  const denormTargets = targets
    .filter((descriptor) => descriptor.scopingKind === 'denorm_org_column')
    .map((descriptor) => descriptor.table);
  const polymorphicTargets = targets
    .filter((descriptor) => descriptor.scopingKind === 'polymorphic_resolver')
    .map((descriptor) => descriptor.table);

  if (fkTargets.length !== 2) {
    throw new Error(`Expected 2 P0.8.4 FK-path targets, got ${fkTargets.length}`);
  }

  if (denormTargets.length !== 34) {
    throw new Error(`Expected 34 P0.8.4 denorm-org targets, got ${denormTargets.length}`);
  }

  if (polymorphicTargets.length !== 1) {
    throw new Error(
      `Expected 1 P0.8.4 resolved polymorphic target, got ${polymorphicTargets.length}`,
    );
  }

  const blockedTables = blockedPolymorphic.map((descriptor) => descriptor.table);
  const blockedSet = new Set(blockedTables);
  const expectedBlockedSet = new Set(expectedP084BlockedPolymorphicTargets);

  if (
    !blockedTables.every((table) => expectedBlockedSet.has(table)) ||
    blockedSet.size !== expectedBlockedSet.size
  ) {
    throw new Error(
      `Unexpected P0.8.4 blocked polymorphic set. Missing: ${
        setDiff(expectedBlockedSet, blockedSet).join(', ') || '<none>'
      }. Extra: ${setDiff(blockedSet, expectedBlockedSet).join(', ') || '<none>'}`,
    );
  }

  for (const descriptor of blockedPolymorphic) {
    if (descriptor.requiresFollowupStage !== 'P0.12.1') {
      throw new Error(`Blocked polymorphic descriptor ${descriptor.table} must require P0.12.1`);
    }
  }

  for (const descriptor of targets.filter(
    (candidate) => candidate.scopingKind === 'polymorphic_resolver',
  )) {
    if (!descriptor.patientPolymorphic) {
      throw new Error(
        `Resolved polymorphic descriptor ${descriptor.table} must declare patientPolymorphic`,
      );
    }
  }
}

export function renderP084PolicyStatements({ descriptors = getP084PublicPathDescriptors() } = {}) {
  return descriptors.flatMap((descriptor) => {
    if (descriptor.scopingKind === 'fk_path') {
      return renderFkPathDormantPolicyStatements(descriptor, { policyName: p084PolicyName });
    }

    return renderOrgColumnDormantPolicyStatements(descriptor, {
      policyName: p084PolicyName,
      scopingKinds: ['denorm_org_column', 'polymorphic_resolver'],
    });
  });
}

function printCli(format) {
  const descriptors = getP084PublicPathDescriptors();

  if (format === '--json') {
    console.log(JSON.stringify(descriptors, null, 2));
    return;
  }

  if (format === '--sql') {
    console.log(renderP084PolicyStatements({ descriptors }).join('\n'));
    return;
  }

  if (format === '--denorm-targets') {
    console.log(
      getP084PublicDenormDescriptors()
        .map((descriptor) => descriptor.table)
        .join('\n'),
    );
    return;
  }

  if (format === '--fk-targets') {
    console.log(
      getP084PublicFkPathDescriptors()
        .map((descriptor) => descriptor.table)
        .join('\n'),
    );
    return;
  }

  if (format === '--polymorphic-targets') {
    console.log(
      getP084PublicPolymorphicDescriptors()
        .map((descriptor) => descriptor.table)
        .join('\n'),
    );
    return;
  }

  if (format === '--blocked-polymorphic') {
    console.log(expectedP084BlockedPolymorphicTargets.join('\n'));
    return;
  }

  if (format === '--targets' || format == null) {
    console.log(descriptors.map((descriptor) => descriptor.table).join('\n'));
    return;
  }

  throw new Error(
    `Unsupported format ${format}. Use --targets, --denorm-targets, --fk-targets, --polymorphic-targets, --blocked-polymorphic, --json, or --sql.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  printCli(process.argv[2]);
}
