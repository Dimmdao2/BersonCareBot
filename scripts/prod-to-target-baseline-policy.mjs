import { createHash } from 'node:crypto';

const REVIEWED_TARGET_TARIFFS = new Map([
  ['d1156dc6-e71e-4225-ad94-93c9d423c9e1', {
    price: 0, currency: 'RUB', seats: 1000, period: 'year',
    mechanicsSha256: 'f59472c37a6835c63a94d423479e389bce1f5d3eb9b65b7b2e29c7a275b15caf',
  }],
  ['e07db366-f471-40a5-bc9b-499908636acd', {
    price: 80000, currency: 'RUB', seats: 1, period: 'month',
    mechanicsSha256: '5a16494eb9edfa28328952787e511aaf33b8126e6e3ece91743b2ac909bbb567',
  }],
  ['59fbb0c9-371d-4fcc-8602-78e174c81062', {
    price: 280000, currency: 'RUB', seats: 3, period: 'month',
    mechanicsSha256: '8f9193f38d13f864a1115fb0603dfb99e6a354fa394e942b74fc9a0e4f7c9d50',
  }],
  ['2512c9fd-128d-484d-a83c-3593ae56fe8a', {
    price: 150000, currency: 'RUB', seats: 1, period: 'month',
    mechanicsSha256: '219acd42a1e70ccf18e711fa9cc46dc8031924d69e7687eaa70f387ddf2dd1f2',
  }],
]);

export const REVIEWED_TARGET_TARIFF_IDS = new Set(REVIEWED_TARGET_TARIFFS.keys());

export const ENVIRONMENT_OWNED_TARIFF_IDS = new Set([
  'f0000000-0000-4000-8000-000000000001',
  '4110365f-cb50-4d43-8084-3e3d12a29daa',
  'bc71b639-5409-41b5-b7ab-46a710cf3c35',
  'b57e10a4-e1ea-4d90-be0a-4a4a9df947b4',
]);

function fail(message) {
  throw new Error(`prod-to-target baseline policy: ${message}`);
}

function decodeSqlLiteral(token) {
  if (!token.startsWith("'") || !token.endsWith("'")) return null;
  return token.slice(1, -1).replaceAll("''", "'");
}

function splitValues(statement) {
  const start = statement.indexOf(' VALUES (');
  if (start < 0 || !statement.endsWith(');')) fail('unrecognized saas_tariffs INSERT');
  const body = statement.slice(start + ' VALUES ('.length, -2);
  const values = [];
  let token = '';
  let quoted = false;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === "'") {
      token += character;
      if (quoted && body[index + 1] === "'") {
        token += body[index + 1];
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      values.push(token.trim());
      token = '';
    } else {
      token += character;
    }
  }
  values.push(token.trim());
  if (quoted || values.length !== 18) fail('unrecognized saas_tariffs VALUES shape');
  return values;
}

function tariffStatements(sql) {
  const starts = [...sql.matchAll(/^INSERT INTO public\.saas_tariffs /gmu)].map((match) => match.index);
  return starts.map((start) => {
    const end = sql.indexOf(';\n', start);
    if (end < 0) fail('unterminated saas_tariffs INSERT');
    const statement = sql.slice(start, end + 1);
    const values = splitValues(statement);
    const id = decodeSqlLiteral(values[0]);
    if (!id) fail('tariff id is not a SQL string literal');
    return { start, end: end + 2, statement, values, id };
  });
}

function assertReviewedTariff(row) {
  const name = decodeSqlLiteral(row.values[1]);
  const price = Number(row.values[3]);
  const currency = decodeSqlLiteral(row.values[4]);
  const mechanicsRaw = decodeSqlLiteral(row.values[5]);
  const includedSeats = Number(row.values[9]);
  const billingPeriod = decodeSqlLiteral(row.values[10]);
  let mechanics = null;
  try {
    mechanics = mechanicsRaw === null ? null : JSON.parse(mechanicsRaw);
  } catch {
    fail(`tariff ${row.id} has invalid mechanics JSON`);
  }
  if (
    !name?.trim()
    || !Number.isInteger(price)
    || price < 0
    || !currency?.match(/^[A-Z]{3}$/u)
    || mechanics === null
    || typeof mechanics !== 'object'
    || Array.isArray(mechanics)
    || Object.keys(mechanics).length === 0
    || row.values[6] !== 'true'
    || !Number.isInteger(includedSeats)
    || includedSeats < 1
    || !billingPeriod?.trim()
  ) {
    fail(`tariff ${row.id} is active without complete product/billing/access fields`);
  }
  const reviewed = REVIEWED_TARGET_TARIFFS.get(row.id);
  const mechanicsSha256 = createHash('sha256').update(mechanicsRaw).digest('hex');
  if (
    reviewed === undefined
    || price !== reviewed.price
    || currency !== reviewed.currency
    || includedSeats !== reviewed.seats
    || billingPeriod !== reviewed.period
    || mechanicsSha256 !== reviewed.mechanicsSha256
  ) {
    fail(`tariff ${row.id} differs from its reviewed price/mechanics contract`);
  }
}

export function filterAndValidateTargetTariffCatalog(sql) {
  const rows = tariffStatements(sql);
  const seen = new Set();
  let rendered = '';
  let cursor = 0;
  for (const row of rows) {
    rendered += sql.slice(cursor, row.start);
    cursor = row.end;
    if (ENVIRONMENT_OWNED_TARIFF_IDS.has(row.id)) continue;
    if (!REVIEWED_TARGET_TARIFF_IDS.has(row.id)) fail(`unreviewed tariff id ${row.id}`);
    if (seen.has(row.id)) fail(`duplicate reviewed tariff id ${row.id}`);
    assertReviewedTariff(row);
    seen.add(row.id);
    rendered += row.statement + '\n';
  }
  rendered += sql.slice(cursor);
  for (const id of REVIEWED_TARGET_TARIFF_IDS) {
    if (!seen.has(id)) fail(`reviewed tariff is missing: ${id}`);
  }
  if (seen.size !== REVIEWED_TARGET_TARIFF_IDS.size) fail('target tariff catalog is not exact');
  return rendered;
}

export function removeRetiredRuntimeSettings(sql) {
  return sql
    .split('\n')
    .filter((line) => !line.includes("VALUES ('integrator_linked_phone_source',"))
    .join('\n')
    .replace(/'integrator_linked_phone_source',\s*/gu, '');
}
