/**
 * Offline "address → country" lookup for the login journal (#1112, stage Л-6б).
 *
 * The owner asked for country and explicitly not city: «нам не нужен город, нам нужна как минимум
 * страна». Country is enough for the only question this answers — "was that me?" — and a city-level
 * directory is both much larger and more precise about a person than this feature has any business
 * being.
 *
 * The directory is a generated module (see `loginCountryData.ts` and its build script), decoded once
 * on first use. Nothing is fetched at runtime: an external service would hand our people's addresses
 * to a third party and hang someone else's latency on our login.
 */
import { gunzipSync } from 'node:zlib';
import {
  LOGIN_COUNTRY_CODES,
  LOGIN_COUNTRY_INDEX_GZIP_BASE64,
  LOGIN_COUNTRY_V4_RANGE_COUNT,
  LOGIN_COUNTRY_V6_RANGE_COUNT,
} from '@/infra/loginCountryData';

type CountryIndex = {
  v4Starts: Uint32Array;
  v4Codes: Uint8Array;
  v6Starts: BigUint64Array;
  v6Codes: Uint8Array;
};

let index: CountryIndex | null = null;

/** Reads `count` ascending varint deltas starting at `offset`; returns the absolute values. */
function readDeltas(
  bytes: Buffer,
  offset: number,
  count: number,
): { values: bigint[]; next: number } {
  const values: bigint[] = new Array<bigint>(count);
  let cursor = offset;
  let running = 0n;
  for (let i = 0; i < count; i += 1) {
    let delta = 0n;
    let shift = 0n;
    for (;;) {
      const byte = bytes[cursor];
      cursor += 1;
      delta |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7n;
    }
    running += delta;
    values[i] = running;
  }
  return { values, next: cursor };
}

function loadIndex(): CountryIndex {
  if (index) return index;
  const bytes = gunzipSync(Buffer.from(LOGIN_COUNTRY_INDEX_GZIP_BASE64, 'base64'));

  const v4 = readDeltas(bytes, 0, LOGIN_COUNTRY_V4_RANGE_COUNT);
  const v4Starts = new Uint32Array(LOGIN_COUNTRY_V4_RANGE_COUNT);
  for (let i = 0; i < LOGIN_COUNTRY_V4_RANGE_COUNT; i += 1) v4Starts[i] = Number(v4.values[i]);
  const v4Codes = new Uint8Array(bytes.subarray(v4.next, v4.next + LOGIN_COUNTRY_V4_RANGE_COUNT));

  const v6 = readDeltas(
    bytes,
    v4.next + LOGIN_COUNTRY_V4_RANGE_COUNT,
    LOGIN_COUNTRY_V6_RANGE_COUNT,
  );
  const v6Starts = BigUint64Array.from(v6.values);
  const v6Codes = new Uint8Array(bytes.subarray(v6.next, v6.next + LOGIN_COUNTRY_V6_RANGE_COUNT));

  index = { v4Starts, v4Codes, v6Starts, v6Codes };
  return index;
}

/** Index of the last range starting at or before `value`, or -1 when the address precedes them all. */
function findRange(starts: Uint32Array | BigUint64Array, value: number | bigint): number {
  let low = 0;
  let high = starts.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (starts[middle] <= (value as never)) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

function parseIpv4(address: string): number | null {
  const octets = address.split('.');
  if (octets.length !== 4) return null;
  let value = 0;
  for (const octet of octets) {
    if (!/^\d{1,3}$/.test(octet)) return null;
    const part = Number(octet);
    if (part > 255) return null;
    value = value * 256 + part;
  }
  return value;
}

function parseIpv6Top64(address: string): bigint | null {
  const plain = address.split('%')[0];
  if (!/^[0-9a-fA-F:.]+$/.test(plain)) return null;
  const halves = plain.split('::');
  if (halves.length > 2) return null;
  const expand = (part: string): string[] => (part ? part.split(':') : []);
  let groups: string[];
  if (halves.length === 2) {
    const left = expand(halves[0]);
    const right = expand(halves[1]);
    const missing = 8 - left.length - right.length;
    if (missing < 0) return null;
    groups = [...left, ...Array<string>(missing).fill('0'), ...right];
  } else {
    groups = expand(halves[0]);
  }
  // An IPv4-mapped tail (`::ffff:1.2.3.4`) is not an IPv6 address of its own: it is handled by the
  // caller below, which retries such an address through the IPv4 table.
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-fA-F]{1,4}$/.test(group))) return null;
  const hex = groups
    .slice(0, 4)
    .map((group) => group.padStart(4, '0'))
    .join('');
  return BigInt(`0x${hex}`);
}

/**
 * Returns a two-letter country code, or null when the address is unknown to the directory.
 * `ZZ` in the dataset means "not assigned to a country" and is reported as unknown, not as a country.
 */
export function lookupLoginCountry(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return null;

  const mappedIpv4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed)?.[1];
  const target = mappedIpv4 ?? trimmed;

  const loaded = loadIndex();
  let position: number;
  let codes: Uint8Array;
  if (target.includes(':')) {
    const value = parseIpv6Top64(target);
    if (value == null) return null;
    position = findRange(loaded.v6Starts, value);
    codes = loaded.v6Codes;
  } else {
    const value = parseIpv4(target);
    if (value == null) return null;
    position = findRange(loaded.v4Starts, value);
    codes = loaded.v4Codes;
  }
  if (position < 0) return null;
  const code = LOGIN_COUNTRY_CODES[codes[position]];
  return !code || code === 'ZZ' ? null : code;
}
