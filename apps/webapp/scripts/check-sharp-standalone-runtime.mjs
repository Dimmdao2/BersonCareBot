#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const standaloneRoot = path.resolve(scriptDir, '../.next/standalone');
const standaloneSharp = path.join(standaloneRoot, 'node_modules/.pnpm/node_modules/sharp');
const require = createRequire(import.meta.url);
const sharp = require(standaloneSharp);

/**
 * No version equality here on purpose.
 *
 * What this script exists to prove is that the copy of sharp bundled into `.next/standalone`
 * actually decodes and re-encodes images at runtime — that the native binding resolved. A pinned
 * `assert.equal(sharp.versions.sharp, '0.35.3')` proves nothing about that and goes red on every
 * routine bump (the repo has since moved to 0.35.4 via the root `pnpm.overrides`), repairable only
 * by retyping the number. The encode/rotate/resize probe below fails for the real reason instead.
 */

const original = await sharp({
  create: {
    width: 32,
    height: 24,
    channels: 4,
    background: { r: 24, g: 96, b: 160, alpha: 0.75 },
  },
})
  .png()
  .toBuffer();
const preview = await sharp(original)
  .rotate()
  .resize(16, 16, { fit: 'inside' })
  .jpeg({ quality: 82 })
  .toBuffer();
const metadata = await sharp(preview).metadata();

assert.deepEqual(
  {
    format: metadata.format,
    width: metadata.width,
    height: metadata.height,
    channels: metadata.channels,
  },
  {
    format: 'jpeg',
    width: 16,
    height: 12,
    channels: 3,
  },
);

console.log(`sharp standalone runtime ${sharp.versions.sharp}: OK`);
