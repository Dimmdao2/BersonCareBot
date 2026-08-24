import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { STAFF_SURFACE } from '@/config/productSurfaces';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;

export function generateTotpSecret(): string {
  const bytes = randomBytes(20);
  let bits = '';
  for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    out += BASE32[Number.parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  }
  return out;
}

function decodeBase32(value: string): Buffer {
  let bits = '';
  for (const char of value.replace(/=+$/u, '').toUpperCase()) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('invalid_totp_secret');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function codeForCounter(secret: string, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** TOTP_DIGITS;
  return String(binary).padStart(TOTP_DIGITS, '0');
}

export function verifyTotpCode(secret: string, code: string, nowMs = Date.now()): boolean {
  if (!/^\d{6}$/u.test(code)) return false;
  const counter = Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
  return [-1, 0, 1].some((delta) => {
    const expected = Buffer.from(codeForCounter(secret, counter + delta));
    const actual = Buffer.from(code);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  });
}

export function buildTotpUri(input: { secret: string; email: string }): string {
  const issuer = STAFF_SURFACE.name;
  const label = `${issuer}:${input.email}`;
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${input.secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
}

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(8).toString('hex').toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
  });
}
