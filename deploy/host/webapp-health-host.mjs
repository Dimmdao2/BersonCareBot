#!/usr/bin/env node

const rawOrigin = process.env.APP_BASE_URL ?? '';

try {
  const parsed = new URL(rawOrigin);
  const isHttpOrigin = parsed.protocol === 'http:' || parsed.protocol === 'https:';
  const isExactOrigin = rawOrigin === parsed.origin || rawOrigin === `${parsed.origin}/`;

  if (!isHttpOrigin || !isExactOrigin || parsed.username || parsed.password) {
    throw new Error('APP_BASE_URL must be an exact HTTP(S) origin without credentials');
  }

  process.stdout.write(parsed.host);
} catch {
  process.stderr.write('APP_BASE_URL is not a safe webapp health origin\n');
  process.exitCode = 1;
}
