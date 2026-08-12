#!/usr/bin/env node
/**
 * Renders the one allowed PostgreSQL HBA boundary for the two application
 * ports.  This is deliberately independent of the grants declaration: host
 * installation must be possible while the three LOGIN roles do not exist yet.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const begin = '# BEGIN BCB MANAGED MTLS HBA';
const end = '# END BCB MANAGED MTLS HBA';
const namePattern = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const hbaSpecialIdentifiers = new Set(['all', 'sameuser', 'samerole', 'replication']);

function fail(message) {
  throw new Error(`host mTLS HBA: ${message}`);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) fail(`unexpected argument ${argument}`);
    const key = argument.slice(2);
    if (key === 'help') return { help: true };
    const value = argv[index + 1];
    if (value == null || value.startsWith('--')) fail(`missing value for --${key}`);
    result[key] = value;
    index += 1;
  }
  return result;
}

function requiredName(args, key) {
  const value = args[key];
  if (!value || !namePattern.test(value)) fail(`--${key} must be one PostgreSQL identifier`);
  if (hbaSpecialIdentifiers.has(value.toLowerCase())) {
    fail(`--${key} must not be a PostgreSQL HBA special identifier`);
  }
  return value;
}

function declaration(args) {
  const database = requiredName(args, 'database');
  const staff = requiredName(args, 'staff-login');
  const patient = requiredName(args, 'patient-login');
  const integrator = requiredName(args, 'integrator-login');
  if (new Set([staff, patient, integrator]).size !== 3) fail('the three application logins must be distinct');
  const primary = { database, staff, patient, integrator };
  const secondaryKeys = ['secondary-database', 'secondary-staff-login', 'secondary-patient-login', 'secondary-integrator-login'];
  const secondaryValues = secondaryKeys.map((key) => args[key]);
  if (secondaryValues.every((value) => value == null)) return { targets: [primary] };
  if (secondaryValues.some((value) => value == null)) {
    fail('shared mode requires secondary database and all three secondary login names');
  }
  const secondary = {
    database: requiredName(args, 'secondary-database'),
    staff: requiredName(args, 'secondary-staff-login'),
    patient: requiredName(args, 'secondary-patient-login'),
    integrator: requiredName(args, 'secondary-integrator-login'),
  };
  if (primary.database === secondary.database) fail('the two application databases must be distinct');
  const allLogins = [primary.staff, primary.patient, primary.integrator, secondary.staff, secondary.patient, secondary.integrator];
  if (new Set(allLogins).size !== allLogins.length) fail('the six application logins must be globally distinct');
  return { targets: [primary, secondary] };
}

export function renderHba(args) {
  const { targets } = declaration(args);
  const allLogins = targets.flatMap(({ staff, patient, integrator }) => [staff, patient, integrator]);
  const loginField = allLogins.join(',');
  const lines = [
    begin,
    '# Generated from the exact two-port declaration. No identity-map or fallback allow rule is permitted.',
  ];
  for (const target of targets) {
    lines.push(`hostnossl ${target.database} ${loginField} 0.0.0.0/0 reject`);
    lines.push(`hostnossl ${target.database} ${loginField} ::0/0 reject`);
    lines.push(`local ${target.database} ${loginField} reject`);
    const foreignLogins = targets
      .filter(({ database }) => database !== target.database)
      .flatMap(({ staff, patient, integrator }) => [staff, patient, integrator]);
    for (const login of foreignLogins) {
      lines.push(`hostssl ${target.database} ${login} 0.0.0.0/0 reject`);
      lines.push(`hostssl ${target.database} ${login} ::0/0 reject`);
    }
    for (const login of [target.staff, target.patient, target.integrator]) {
      lines.push(`hostssl ${target.database} ${login} 0.0.0.0/0 scram-sha-256 clientcert=verify-full clientname=CN`);
      lines.push(`hostssl ${target.database} ${login} ::0/0 scram-sha-256 clientcert=verify-full clientname=CN`);
    }
  }
  lines.push(`hostnossl all ${loginField} 0.0.0.0/0 reject`);
  lines.push(`hostnossl all ${loginField} ::0/0 reject`);
  lines.push(`hostssl all ${loginField} 0.0.0.0/0 reject`);
  lines.push(`hostssl all ${loginField} ::0/0 reject`);
  lines.push(`local all ${loginField} reject`);
  lines.push(end);
  return `${lines.join('\n')}\n`;
}

function stripManagedBlock(text) {
  const lines = text.split(/\r?\n/);
  const result = [];
  let inside = false;
  let beginCount = 0;
  let endCount = 0;
  for (const line of lines) {
    if (line === begin) {
      beginCount += 1;
      if (inside || beginCount > 1) fail('duplicate or nested managed HBA block');
      inside = true;
      continue;
    }
    if (line === end) {
      endCount += 1;
      if (!inside) fail('managed HBA end marker without begin marker');
      inside = false;
      continue;
    }
    if (!inside) result.push(line);
  }
  if (inside) fail('unterminated managed HBA block');
  if (beginCount !== endCount) fail('malformed managed HBA markers');
  return result.join('\n').replace(/^\n+|\n+$/g, '');
}

function nonCommentRules(text) {
  return text.split(/\r?\n/).map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter(({ line }) => line && !line.startsWith('#'));
}

function isSpecialHbaField(value) {
  return value.split(',').some((item) => {
    const normalized = item.toLowerCase();
    return hbaSpecialIdentifiers.has(normalized)
      || item.startsWith('+')
      || /[*?]/.test(item);
  });
}

export function validateManagedHba(text, args) {
  const expected = renderHba(args).trim();
  const start = text.indexOf(begin);
  const finish = text.indexOf(end);
  if (start !== 0 || finish < start) fail('managed HBA block must be first and complete');
  const actual = text.slice(start, finish + end.length).trim();
  if (actual !== expected) fail('managed HBA block differs from the exact rendered declaration');

  const { targets } = declaration(args);
  const names = new Set(targets.flatMap(({ staff, patient, integrator }) => [staff, patient, integrator]));
  const remainder = stripManagedBlock(text);
  for (const { line, lineNumber } of nonCommentRules(remainder)) {
    const fields = line.split(/\s+/);
    const connectionType = fields[0] ?? '';
    const databaseField = fields[1] ?? '';
    const userField = fields[2] ?? '';
    if (connectionType === 'hostssl' && (isSpecialHbaField(databaseField) || isSpecialHbaField(userField))) {
      fail(`hostssl special database/login form is forbidden outside the managed block (line ${lineNumber})`);
    }
    // A generic legacy rule may remain below the protected first-match rows
    // during staged cutover.  It cannot match these logins first; an explicit
    // duplicate can, so reject the latter rather than falsely rejecting the
    // documented broad-loopback rule that must stay below this block.
    if (userField.split(',').some((name) => names.has(name))) {
      fail(`application login is reachable outside the managed first-match block (line ${lineNumber})`);
    }
  }
  if (/^(?!#).*\bmap=/m.test(actual)) fail('pg_ident map is forbidden for this boundary');
  return true;
}

function usage() {
  return `Usage:\n  node deploy/postgres/port-context/render-host-mtls-hba.mjs render --database DB --staff-login ROLE --patient-login ROLE --integrator-login ROLE [--secondary-database DB --secondary-staff-login ROLE --secondary-patient-login ROLE --secondary-integrator-login ROLE] [--output FILE]\n  node deploy/postgres/port-context/render-host-mtls-hba.mjs merge --input FILE --output FILE --database DB --staff-login ROLE --patient-login ROLE --integrator-login ROLE [--secondary-database DB --secondary-staff-login ROLE --secondary-patient-login ROLE --secondary-integrator-login ROLE]\n  node deploy/postgres/port-context/render-host-mtls-hba.mjs validate --input FILE --database DB --staff-login ROLE --patient-login ROLE --integrator-login ROLE [--secondary-database DB --secondary-staff-login ROLE --secondary-patient-login ROLE --secondary-integrator-login ROLE]`;
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (args.help || !command) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (command === 'render') {
    const rendered = renderHba(args);
    if (args.output) writeFileSync(args.output, rendered, { mode: 0o600 });
    else process.stdout.write(rendered);
    return;
  }
  if (command === 'merge') {
    if (!args.input || !args.output) fail('merge requires --input and --output');
    const source = readFileSync(args.input, 'utf8');
    const existing = stripManagedBlock(source);
    const merged = `${renderHba(args)}${existing ? `\n${existing}\n` : ''}`;
    validateManagedHba(merged, args);
    writeFileSync(args.output, merged, { mode: 0o600 });
    return;
  }
  if (command === 'validate') {
    if (!args.input) fail('validate requires --input');
    validateManagedHba(readFileSync(args.input, 'utf8'), args);
    return;
  }
  fail(`unknown command ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
