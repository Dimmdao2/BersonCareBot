#!/usr/bin/env node
/**
 * Renders the one allowed PostgreSQL HBA boundary for the two application
 * ports.  This is deliberately independent of the grants declaration: host
 * installation must be possible while the four LOGIN roles do not exist yet.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const beginFor = (database) => `# BEGIN BCB MANAGED MTLS HBA ${database}`;
const endFor = (database) => `# END BCB MANAGED MTLS HBA ${database}`;
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

function declaration(args, prefix = '') {
  const key = (name) => `${prefix}${name}`;
  const database = requiredName(args, key('database'));
  const staff = requiredName(args, key('staff-login'));
  const patient = requiredName(args, key('patient-login'));
  const globalAdmin = requiredName(args, key('global-admin-login'));
  const integrator = requiredName(args, key('integrator-login'));
  if (new Set([staff, patient, globalAdmin, integrator]).size !== 4) {
    fail('the four application logins must be distinct');
  }
  return { database, staff, patient, globalAdmin, integrator };
}

function declarations(args) {
  const primary = declaration(args);
  const secondaryKeys = [
    'secondary-database',
    'secondary-staff-login',
    'secondary-patient-login',
    'secondary-global-admin-login',
    'secondary-integrator-login',
  ];
  const present = secondaryKeys.filter((key) => args[key] != null && args[key] !== '');
  if (present.length !== 0 && present.length !== secondaryKeys.length) {
    fail('secondary target requires its database and all four application logins');
  }
  if (present.length === 0) return [primary];
  const secondary = declaration(args, 'secondary-');
  if (secondary.database === primary.database) fail('primary and secondary databases must be distinct');
  return [primary, secondary];
}

function renderTarget(target) {
  const allLogins = [target.staff, target.patient, target.globalAdmin, target.integrator];
  const loginField = allLogins.join(',');
  const lines = [
    beginFor(target.database),
    '# Generated from the exact two-port declaration. No identity-map or fallback allow rule is permitted.',
    `hostnossl ${target.database} ${loginField} 0.0.0.0/0 reject`,
    `hostnossl ${target.database} ${loginField} ::0/0 reject`,
    `local ${target.database} ${loginField} reject`,
  ];
  for (const login of allLogins) {
    lines.push(`hostssl ${target.database} ${login} 0.0.0.0/0 scram-sha-256 clientcert=verify-full clientname=CN`);
    lines.push(`hostssl ${target.database} ${login} ::0/0 scram-sha-256 clientcert=verify-full clientname=CN`);
  }
  lines.push(`hostnossl all ${loginField} 0.0.0.0/0 reject`);
  lines.push(`hostnossl all ${loginField} ::0/0 reject`);
  lines.push(`hostssl all ${loginField} 0.0.0.0/0 reject`);
  lines.push(`hostssl all ${loginField} ::0/0 reject`);
  lines.push(`local all ${loginField} reject`);
  lines.push(endFor(target.database));
  return `${lines.join('\n')}\n`;
}

export function renderHba(args) {
  return declarations(args).map(renderTarget).join('');
}

function stripManagedBlock(text, database) {
  const begin = beginFor(database);
  const end = endFor(database);
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
  const targets = declarations(args);
  const names = new Set(targets.flatMap((target) => [target.staff, target.patient, target.globalAdmin, target.integrator]));
  let remainder = text;
  for (const target of targets) {
    const begin = beginFor(target.database);
    const end = endFor(target.database);
    const expected = renderTarget(target).trim();
    const start = text.indexOf(begin);
    const finish = text.indexOf(end);
    if (start < 0 || finish < start) fail(`managed HBA block for ${target.database} must be present and complete`);
    const actual = text.slice(start, finish + end.length).trim();
    if (actual !== expected) fail(`managed HBA block for ${target.database} differs from the exact rendered declaration`);
    if (/^(?!#).*\bmap=/m.test(actual)) fail('pg_ident map is forbidden for this boundary');
    remainder = stripManagedBlock(remainder, target.database);
  }
  for (const { line, lineNumber } of nonCommentRules(remainder)) {
    const fields = line.split(/\s+/);
    const connectionType = fields[0] ?? '';
    const userField = fields[2] ?? '';
    if (connectionType === 'hostssl' && isSpecialHbaField(userField)) {
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
  return true;
}

function usage() {
  return `Usage:\n  node deploy/postgres/port-context/render-host-mtls-hba.mjs render --database DB --staff-login ROLE --patient-login ROLE --global-admin-login ROLE --integrator-login ROLE [--output FILE]\n  node deploy/postgres/port-context/render-host-mtls-hba.mjs merge --input FILE --output FILE --database DB --staff-login ROLE --patient-login ROLE --global-admin-login ROLE --integrator-login ROLE\n  node deploy/postgres/port-context/render-host-mtls-hba.mjs validate --input FILE --database DB --staff-login ROLE --patient-login ROLE --global-admin-login ROLE --integrator-login ROLE`;
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
    const targets = declarations(args);
    const existing = targets.reduce((text, target) => stripManagedBlock(text, target.database), source);
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
