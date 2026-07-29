#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();

const artifactPath = 'docs/_TODO/SAAS_FOUNDATION/scope-derivation/p0-12-polymorphic-references.tsv';

const expected = new Map([
  [
    'public.comments',
    [
      'exercise',
      'lfk_complex',
      'test',
      'test_set',
      'recommendation',
      'lesson',
      'stage_item_instance',
      'stage_instance',
      'program_instance',
    ],
  ],
  [
    'public.patient_home_block_items',
    ['content_page', 'content_section', 'course', 'static_action'],
  ],
  [
    'public.treatment_program_template_stage_items',
    ['exercise', 'recommendation', 'lesson', 'clinical_test'],
  ],
  [
    'public.treatment_program_instance_stage_items',
    ['exercise', 'recommendation', 'lesson', 'clinical_test'],
  ],
  ['public.material_ratings', ['content_page', 'lfk_exercise', 'lfk_complex']],
  ['public.treatment_program_events', ['stage', 'stage_item', 'program']],
  ['public.admin_audit_log', ['non_polymorphic_text_pointer']],
]);

function read(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function parseTsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split('\t');
  return lines.map((line, index) => {
    const cols = line.split('\t');
    if (cols.length !== headers.length) {
      throw new Error(
        `${artifactPath}:${index + 2} expected ${headers.length} columns, got ${cols.length}`,
      );
    }
    return Object.fromEntries(headers.map((h, i) => [h, cols[i]]));
  });
}

function assertSetEqual(label, actual, expectedValues) {
  const missing = expectedValues.filter((value) => !actual.includes(value));
  const extra = actual.filter((value) => !expectedValues.includes(value));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `${label} mismatch: missing=[${missing.join(',')}], extra=[${extra.join(',')}]`,
    );
  }
}

function runChecks(overrides = {}) {
  const rows = parseTsv(overrides.artifact ?? read(artifactPath));

  for (const row of rows) {
    if (row.status !== 'resolved') throw new Error(`unresolved row: ${row.table} ${row.value}`);
    if (!row.resolver_path || row.resolver_path === 'unknown') {
      throw new Error(`missing resolver path: ${row.table} ${row.value}`);
    }
    if (row.target_tier === 'SCOPED' && !row.resolver_path.includes('organization_id')) {
      throw new Error(`SCOPED target lacks organization resolver: ${row.table} ${row.value}`);
    }
  }

  for (const [table, values] of expected) {
    const actual = rows.filter((row) => row.table === table).map((row) => row.value);
    assertSetEqual(table, actual, values);
  }

  const extraTables = [...new Set(rows.map((row) => row.table))].filter(
    (table) => !expected.has(table),
  );
  if (extraTables.length > 0) {
    throw new Error(`unexpected artifact tables: ${extraTables.join(', ')}`);
  }
}

if (process.argv.includes('--self-test')) {
  const artifact = read(artifactPath).replace(
    '\npublic.comments\ttarget_type\ttarget_id\texercise',
    '\npublic.comments\ttarget_type\ttarget_id\tunknown_exercise',
  );
  try {
    runChecks({ artifact });
  } catch {
    console.log('check-p0-12-polymorphic-references self-test: OK');
    process.exit(0);
  }
  throw new Error('self-test did not detect corrupted target coverage');
}

try {
  runChecks();
  console.log('check-p0-12-polymorphic-references: OK');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-p0-12-polymorphic-references: ${message}`);
  process.exit(1);
}
