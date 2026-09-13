#!/usr/bin/env node
/**
 * Compile the offline "address → country" directory used by the login journal (#1112, stage Л-6б).
 *
 * WHY AN OFFLINE DIRECTORY. Calling an external geolocation service on every login would hand the
 * addresses of our people to a third party and put someone else's latency on our login path. The
 * owner asked for country only ("нам не нужен город, нам нужна как минимум страна"), and country is
 * exactly the level a small directory answers well.
 *
 * WHY A GENERATED TS MODULE AND NOT A DATA FILE. The lookup runs inside ~20 login routes. A file on
 * disk would have to be kept alive through Next standalone file tracing route by route — twenty
 * places to forget. A module is carried by the bundler wherever it is imported, with nothing to
 * configure and nothing to forget.
 *
 * SOURCE: DB-IP IP-to-Country Lite, https://db-ip.com/db/download/ip-to-country-lite
 * LICENSE: Creative Commons Attribution 4.0 International (CC BY 4.0). The attribution required by
 * that license is carried in the generated module header and shown to people on the screens that
 * display the country.
 *
 * Refresh (the directory is republished monthly; addresses get reassigned between countries):
 *   node apps/webapp/scripts/login-country/build-country-index.mjs
 *   node apps/webapp/scripts/login-country/build-country-index.mjs --month 2026-10
 */
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createGunzip, gzipSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webappRoot = resolve(__dirname, '../..');
const outputPath = resolve(webappRoot, 'src/infra/loginCountryData.ts');

function requestedMonth() {
  const flag = process.argv.indexOf('--month');
  if (flag !== -1 && process.argv[flag + 1]) return process.argv[flag + 1];
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function downloadDataset(month, cachePath) {
  const url = `https://download.db-ip.com/free/dbip-country-lite-${month}.csv.gz`;
  const existing = await readFile(cachePath).catch(() => null);
  if (existing) {
    console.log(`[login-country] cached: ${cachePath}`);
    return url;
  }
  console.log(`[login-country] downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`dataset download failed: HTTP ${res.status} for ${url}`);
  await mkdir(dirname(cachePath), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(cachePath));
  return url;
}

/** IPv6 is compared by its top 64 bits: country is never assigned finer than that in this dataset. */
function ipv6Top64(text) {
  const halves = text.split('::');
  let groups;
  if (halves.length === 2) {
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves[1] ? halves[1].split(':') : [];
    groups = [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
  } else {
    groups = text.split(':');
  }
  const hex = groups.map((group) => group.padStart(4, '0')).join('');
  return BigInt(`0x${hex.slice(0, 16)}`);
}

function ipv4ToNumber(text) {
  const octets = text.split('.').map(Number);
  return BigInt(((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]);
}

/** Varint over ascending deltas: neighbouring range starts are close, so most deltas are 1–3 bytes. */
function encodeDeltas(starts) {
  const bytes = [];
  let previous = 0n;
  for (const start of starts) {
    let delta = start - previous;
    previous = start;
    while (delta >= 128n) {
      bytes.push(Number(delta & 127n) | 128);
      delta >>= 7n;
    }
    bytes.push(Number(delta));
  }
  return Buffer.from(bytes);
}

async function main() {
  const month = requestedMonth();
  const cachePath = resolve(
    webappRoot,
    `../../.tmp/login-country/dbip-country-lite-${month}.csv.gz`,
  );
  const sourceUrl = await downloadDataset(month, cachePath);

  const countries = ['ZZ'];
  const countryIndex = new Map([['ZZ', 0]]);
  const indexOf = (code) => {
    const known = countryIndex.get(code);
    if (known !== undefined) return known;
    const next = countries.length;
    countries.push(code);
    countryIndex.set(code, next);
    return next;
  };

  const v4 = [];
  const v6 = [];
  const reader = createInterface({
    input: createReadStream(cachePath).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const line of reader) {
    if (!line) continue;
    const [start, , code] = line.split(',');
    if (!start || !code || !/^[A-Z]{2}$/.test(code)) continue;
    if (start.includes(':')) v6.push([ipv6Top64(start), indexOf(code)]);
    else v4.push([ipv4ToNumber(start), indexOf(code)]);
  }
  if (v4.length === 0 || v6.length === 0) throw new Error('dataset produced no ranges');
  if (countries.length > 256) throw new Error('country list no longer fits one byte per range');

  // Truncating IPv6 to /64 can make neighbouring rows share a start; the first one wins, matching
  // the binary search below, which answers with the last range at or before the address.
  const v6unique = [];
  let previousStart = -1n;
  for (const entry of v6) {
    if (entry[0] === previousStart) continue;
    previousStart = entry[0];
    v6unique.push(entry);
  }

  const payload = gzipSync(
    Buffer.concat([
      encodeDeltas(v4.map(([start]) => start)),
      Buffer.from(v4.map(([, code]) => code)),
      encodeDeltas(v6unique.map(([start]) => start)),
      Buffer.from(v6unique.map(([, code]) => code)),
    ]),
    { level: 9 },
  );

  const module = `/**
 * СГЕНЕРИРОВАННЫЙ ФАЙЛ. Руками не правится.
 * Пересобрать: node apps/webapp/scripts/login-country/build-country-index.mjs
 *
 * Справочник «адрес → страна» для журнала входов (#1112). Внутри — сжатый индекс диапазонов
 * адресов: сначала IPv4, затем IPv6 (по старшим 64 битам). Разбор — в \`loginCountry.ts\`.
 *
 * Источник данных: DB-IP IP-to-Country Lite (https://db-ip.com/db/download/ip-to-country-lite),
 * выпуск ${month}, лицензия Creative Commons Attribution 4.0 International (CC BY 4.0).
 * Лицензия требует указывать источник там, где данные показываются людям, — это сделано на экранах
 * входов и устройств.
 */
export const LOGIN_COUNTRY_DATASET_MONTH = '${month}';
export const LOGIN_COUNTRY_DATASET_SOURCE = '${sourceUrl}';
export const LOGIN_COUNTRY_V4_RANGE_COUNT = ${v4.length};
export const LOGIN_COUNTRY_V6_RANGE_COUNT = ${v6unique.length};
export const LOGIN_COUNTRY_CODES = ${JSON.stringify(countries)} as const;
export const LOGIN_COUNTRY_INDEX_GZIP_BASE64 =
  '${payload.toString('base64')}';
`;

  await writeFile(outputPath, module, 'utf8');
  console.log(
    `[login-country] ${outputPath}: ${v4.length} IPv4 + ${v6unique.length} IPv6 ranges, ` +
      `${countries.length} countries, ${(payload.length / 1024).toFixed(0)} KiB compressed`,
  );
  if (process.argv.includes('--clean')) await rm(cachePath, { force: true });
}

await main();
