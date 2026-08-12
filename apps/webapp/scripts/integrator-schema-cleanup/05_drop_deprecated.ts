#!/usr/bin/env tsx
// HISTORICAL ONE-SHOT TOOL — Rubitime выведено 2026-07-27.
// Kept for reproducible integrator-schema migration audits; it is not a live runtime workflow.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const HELP = `Usage:
  pnpm --dir apps/webapp exec tsx scripts/integrator-schema-cleanup/05_drop_deprecated.ts --repo-root ../..

This script is drop-safety tooling. It does not execute SQL.
Current ADRs block destructive drops for all major T0.4-pre domains.`;

type DropCandidate = {
  table: string;
  safe: boolean;
  reason: string;
  patterns: string[];
};

const DROP_CANDIDATES: DropCandidate[] = [
  {
    table: 'integrator.user_reminder_rules',
    safe: false,
    reason: 'scheduler reads bot-linked rules',
    patterns: ['user_reminder_rules', 'userReminderRules'],
  },
  {
    table: 'integrator.user_reminder_occurrences',
    safe: false,
    reason: 'scheduler/worker mutate bot dispatch occurrences',
    patterns: ['user_reminder_occurrences', 'userReminderOccurrences'],
  },
  {
    table: 'integrator.rubitime_records',
    safe: false,
    reason: 'Rubitime webhook/projection runtime still writes raw records',
    patterns: ['rubitime_records', 'rubitimeRecords'],
  },
  {
    table: 'integrator.contacts',
    safe: false,
    reason: 'linked-phone fallback still defaults to public_then_contacts',
    patterns: ['integrator.contacts', 'FROM contacts', 'linked_phone_legacy_fallback'],
  },
  {
    table: 'integrator.conversations',
    safe: false,
    reason: 'integrator transport writers still active',
    patterns: ['conversations', 'conversation_messages'],
  },
];

const SCAN_ROOTS = ['apps/webapp/src', 'apps/integrator/src', 'apps/webapp/scripts', 'packages'];

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1] ?? null;
  return null;
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === '.next' || name === 'dist') continue;
      out.push(...listFiles(path));
      continue;
    }
    if (/\.(ts|tsx|js|mjs|sql|md)$/.test(name)) out.push(path);
  }
  return out;
}

function countPattern(src: string, pattern: string): number {
  return src.split(pattern).length - 1;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(HELP);
    return;
  }
  const repoRoot = resolve(process.cwd(), argValue('repo-root') ?? '.');
  const files = SCAN_ROOTS.flatMap((root) => listFiles(join(repoRoot, root)));
  const results = DROP_CANDIDATES.map((candidate) => {
    let referenceFiles = 0;
    for (const abs of files) {
      const rel = relative(repoRoot, abs).replace(/\\/g, '/');
      if (rel.includes('scripts/integrator-schema-cleanup/')) continue;
      const src = readFileSync(abs, 'utf8');
      const hits = candidate.patterns.reduce((sum, pattern) => sum + countPattern(src, pattern), 0);
      if (hits > 0) referenceFiles += 1;
    }
    return {
      table: candidate.table,
      safe: candidate.safe && referenceFiles === 0,
      blockedReason: candidate.safe && referenceFiles === 0 ? null : candidate.reason,
      referenceFiles,
      sql: candidate.safe && referenceFiles === 0 ? `DROP TABLE ${candidate.table};` : null,
    };
  });
  console.log(JSON.stringify({ mode: 'drop-safety-dry-run', repoRoot, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
