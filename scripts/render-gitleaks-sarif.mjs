#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';

const reportPath = process.argv[2] ?? 'gitleaks.sarif';

function commandProperty(value) {
  return String(value)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A')
    .replaceAll(':', '%3A')
    .replaceAll(',', '%2C');
}

function markdownCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\r', ' ').replaceAll('\n', ' ');
}

function locationOf(result) {
  const physical = result?.locations?.[0]?.physicalLocation;
  return {
    file: physical?.artifactLocation?.uri ?? 'unknown',
    line: Number.isInteger(physical?.region?.startLine) ? physical.region.startLine : 1,
  };
}

function commitOf(result) {
  const value = result?.partialFingerprints?.commitSha ?? result?.properties?.commit ?? '';
  return typeof value === 'string' ? value.slice(0, 12) : '';
}

console.log('## Gitleaks secret scan');

if (!existsSync(reportPath)) {
  console.log('');
  console.log('The scan did not produce a SARIF report. Inspect the scan step log.');
  console.error(
    '::error title=Gitleaks report missing::The scan did not produce gitleaks.sarif; inspect the scan step log.',
  );
  process.exit(0);
}

let report;
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch (error) {
  console.log('');
  console.log('The SARIF report could not be parsed. Inspect the uploaded artifact.');
  console.error(
    `::error title=Gitleaks report unreadable::${commandProperty(error instanceof Error ? error.message : String(error))}`,
  );
  process.exit(0);
}

const findings = (report.runs ?? []).flatMap((run) => run.results ?? []);
console.log('');
console.log(`Findings: **${findings.length}**. Secret values are redacted.`);

if (findings.length === 0) process.exit(0);

console.log('');
console.log('| Rule | Location | Commit |');
console.log('| --- | --- | --- |');
for (const finding of findings) {
  const rule = finding.ruleId || 'unknown-rule';
  const { file, line } = locationOf(finding);
  const commit = commitOf(finding) || '—';
  console.log(
    `| ${markdownCell(rule)} | \`${markdownCell(file)}:${line}\` | \`${markdownCell(commit)}\` |`,
  );
  console.error(
    `::error file=${commandProperty(file)},line=${line},title=${commandProperty(`Gitleaks: ${rule}`)}::Potential secret detected (value redacted). Open the gitleaks-report artifact for the SARIF details.`,
  );
}
