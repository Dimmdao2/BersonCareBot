#!/usr/bin/env tsx
// HISTORICAL ONE-SHOT TOOL — Rubitime выведено 2026-07-27.
// Kept for reproducible integrator-schema migration audits; it is not a live runtime workflow.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const HELP = `Usage:
  pnpm --dir apps/webapp exec tsx scripts/integrator-schema-cleanup/03_reconcile.ts --repo-root ../..

This is a source-level drop-safety checker. It does not access the database.`;

type Candidate = {
  table: string;
  decision: 'blocked' | 'candidate';
  patterns: string[];
  owner: string;
};

const CANDIDATES: Candidate[] = [
  {
    table: 'integrator.user_reminder_rules',
    decision: 'blocked',
    owner: 'reminder bot dispatch',
    patterns: ['user_reminder_rules', 'userReminderRules'],
  },
  {
    table: 'integrator.rubitime_records',
    decision: 'blocked',
    owner: 'Rubitime live adapter',
    patterns: ['rubitime_records', 'rubitimeRecords'],
  },
  {
    table: 'integrator.contacts',
    decision: 'blocked',
    owner: 'linked-phone fallback',
    patterns: [
      'integrator.contacts',
      'FROM contacts',
      'contacts c',
      'linked_phone_legacy_fallback',
    ],
  },
  {
    table: 'integrator.conversations',
    decision: 'blocked',
    owner: 'integrator support transport',
    patterns: ['conversations', 'conversation_messages', 'message_drafts'],
  },
];

const SCAN_ROOTS = [
  'apps/webapp/src',
  'apps/webapp/scripts',
  'apps/integrator/src',
  'apps/media-worker/src',
  'packages',
];

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
  if (pattern.trim() === '') return 0;
  return src.split(pattern).length - 1;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(HELP);
    return;
  }
  const repoRoot = resolve(process.cwd(), argValue('repo-root') ?? '.');
  const files = SCAN_ROOTS.flatMap((root) => listFiles(join(repoRoot, root)));
  const results = CANDIDATES.map((candidate) => {
    const refs: Array<{ file: string; hits: number }> = [];
    for (const abs of files) {
      const rel = relative(repoRoot, abs).replace(/\\/g, '/');
      if (rel.includes('scripts/integrator-schema-cleanup/')) continue;
      const src = readFileSync(abs, 'utf8');
      const hits = candidate.patterns.reduce((sum, pattern) => sum + countPattern(src, pattern), 0);
      if (hits > 0) refs.push({ file: rel, hits });
    }
    return {
      table: candidate.table,
      owner: candidate.owner,
      decision: candidate.decision,
      referenceFileCount: refs.length,
      topReferences: refs.slice(0, 20),
    };
  });

  const blockedWithRefs = results.filter(
    (r) => r.decision === 'blocked' && r.referenceFileCount > 0,
  );
  console.log(JSON.stringify({ mode: 'source-reconcile', repoRoot, results }, null, 2));
  if (blockedWithRefs.length > 0) {
    process.exitCode = 0;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
