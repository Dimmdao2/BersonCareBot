#!/usr/bin/env node

/**
 * Adds the owner-mandated stage reminder to unfinished docs plans/checklists.
 *
 * The reminder routes agents to the single current canon instead of copying rules into plans.
 * Default mode is read-only; pass --apply to write changes.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const docsRoot = resolve(root, 'docs');
const args = process.argv.slice(2);
const apply = args.includes('--apply');

if (args.some((arg) => !['--apply', '--dry-run'].includes(arg))) {
  console.error('Usage: node tools/insert-plan-stage-reminders.mjs [--dry-run|--apply]');
  process.exit(2);
}

const reminder = [
  '> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** маршрут `AGENTS.md`, секции по scope и роли;',
  '> для оркестрации — §24, для commit/CI/push — §7–§10. Выбор запуска — §24.1; интерфейс порта:',
  '> `tools/orch-launch.sh --help`. Другие документы не являются отдельной редакцией правил.',
  '> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое',
  '> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать',
  '> только если готового нет — и написать в коммите, почему готовое не подошло.',
].join('\n');

// These are reference/design/log documents whose incidental checkboxes are not work-plan stages.
const rule3Excluded = new Map([
  [
    'docs/APP_RESTRUCTURE_INITIATIVE/done/DOCTOR_TODAY_DASHBOARD_PLAN.md',
    'historical completed-plan record, not an unfinished work plan',
  ],
  [
    'docs/ARCHITECTURE/DOCTOR_APP_UI_STYLE_GUIDE.md',
    'style guide; checkboxes are conformance notes',
  ],
  [
    'docs/ARCHITECTURE/INTEGRATOR_PLATFORM_USER_MIGRATION_EXECUTION_LOG.md',
    'execution log; checkboxes belong to log entries',
  ],
  [
    'docs/ARCHITECTURE/MAX_SETUP.md',
    'integration setup reference; checkboxes are operator instructions',
  ],
  [
    'docs/ARCHITECTURE/SCALING_AND_LAUNCH_CAPACITY.md',
    'architecture/capacity reference; checkboxes are launch-readiness evidence',
  ],
  ['docs/_TODO/BOOKING_MULTISLOT_DESIGN.md', 'design note, not an execution plan'],
  [
    'docs/_TODO/SAAS_FOUNDATION/ADMIN_BASELINE_AND_SUPPORT_CHAT_DESIGN.md',
    'design document, not an execution plan',
  ],
  [
    'docs/_TODO/SAAS_FOUNDATION/LANDING_AND_ENTRIES_DESIGN.md',
    'design document, not an execution plan',
  ],
  [
    'docs/_TODO/SAAS_FOUNDATION/PATIENT_INVITE_AND_MANUAL_CREATION_DESIGN.md',
    'design document, not an execution plan',
  ],
]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(fullPath)));
    else if (entry.isFile() && /\.mdx?$/i.test(entry.name)) files.push(fullPath);
  }
  return files;
}

function isArchived(path) {
  const normalized = path.split(sep).join('/');
  return (
    normalized.includes('/archive/') ||
    normalized.includes('/_ARCHIVE/') ||
    normalized.includes('FULL_DEV_PLAN_DONE')
  );
}

function headerDeclaresFinished(lines) {
  const header = lines
    .slice(0, 12)
    .filter((line) => /^#\s/.test(line))
    .join(' ');
  return /^#\s+(?:\[?(?:SUPERSEDED|ARCHIVED|DONE)\]?\b|.*\b(?:SUPERSEDED|ARCHIVED)\s*$)/i.test(
    header,
  );
}

function isInFence(lines, index) {
  let inFence = false;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (/^\s*(```|~~~)/.test(lines[cursor])) inFence = !inFence;
  }
  return inFence;
}

function hasReminderBelow(lines, index) {
  for (let cursor = index + 1; cursor < Math.min(lines.length, index + 10); cursor += 1) {
    if (/^#{1,6}\s/.test(lines[cursor])) return false;
    if (
      lines[cursor].includes('⛔ ПЕРЕД СТАРТОМ ЭТАПА') ||
      lines[cursor].includes('⛔ ПЕРЕД ЗАПУСКОМ')
    )
      return true;
  }
  return false;
}

function targetHeadings(lines) {
  const headings = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line, index }) => !isInFence(lines, index) && /^##\s+/.test(line));
  const numbered = headings.filter(({ line }) => /^##\s+\d+\.\s/.test(line));
  if (numbered.length > 0) return numbered;

  // With no numbered stages, only H2 sections containing an open checkbox are work groups.
  const groupedWork = headings.filter(({ index }) => {
    const nextHeading = headings.find(({ index: next }) => next > index)?.index ?? lines.length;
    return lines.slice(index + 1, nextHeading).some((line) => /^- \[ \]/.test(line));
  });
  if (groupedWork.length > 0) return groupedWork;

  // A single-stage checklist with no work-group H2 gets its reminder after the H1.
  const titleIndex = lines.findIndex(
    (line, index) => !isInFence(lines, index) && /^#\s+/.test(line),
  );
  return titleIndex === -1 ? [] : [{ line: lines[titleIndex], index: titleIndex }];
}

function insertReminders(source) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  const targets = targetHeadings(lines).filter(({ index }) => !hasReminderBelow(lines, index));
  for (const { index } of [...targets].sort((a, b) => b.index - a.index)) {
    lines.splice(index + 1, 0, '', reminder, '');
  }
  return { content: lines.join(newline), insertions: targets.length };
}

const results = [];
const excluded = [];
for (const file of await walk(docsRoot)) {
  const repoPath = relative(root, file).split(sep).join('/');
  const source = await readFile(file, 'utf8');
  if (!source.split(/\r?\n/).some((line) => /^- \[ \]/.test(line))) continue;
  if (isArchived(file)) {
    excluded.push([repoPath, 2, 'archived path']);
    continue;
  }
  if (rule3Excluded.has(repoPath)) {
    excluded.push([repoPath, 3, rule3Excluded.get(repoPath)]);
    continue;
  }
  const lines = source.split(/\r?\n/);
  if (headerDeclaresFinished(lines)) {
    excluded.push([repoPath, 4, 'file header declares the whole document finished']);
    continue;
  }
  const { content, insertions } = insertReminders(source);
  results.push([repoPath, insertions]);
  if (apply && insertions > 0) await writeFile(file, content, 'utf8');
}

for (const [file, count] of results) console.log(`${file}: ${count}`);
console.log(
  `Included: ${results.length}; insertions: ${results.reduce((sum, [, count]) => sum + count, 0)}.`,
);
for (const [file, rule, reason] of excluded)
  console.log(`EXCLUDED rule ${rule}: ${file} — ${reason}`);
