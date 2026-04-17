#!/usr/bin/env node
/**
 * drizzle-kit introspect occasionally emits invalid TS for empty-string SQL defaults:
 * `.default(')` instead of `.default('')`.
 * Run after every `drizzle-kit introspect` (wired into `pnpm db:introspect`).
 */
import fs from "node:fs";
import path from "node:path";

const schemaPath = path.join(process.cwd(), "db/schema/schema.ts");

if (!fs.existsSync(schemaPath)) {
  console.error(`[fix-drizzle-introspect-defaults] missing ${schemaPath}`);
  process.exit(1);
}

let s = fs.readFileSync(schemaPath, "utf8");
/** Broken pattern only; does not match valid `.default('foo')` or `.default('')`. */
const broken = /\.default\('\)/g;
const matches = s.match(broken);
if (!matches?.length) {
  console.log("[fix-drizzle-introspect-defaults] no broken `.default(')` patterns");
  process.exit(0);
}

const fixed = s.replace(broken, ".default('')");
fs.writeFileSync(schemaPath, fixed);

const stillBroken = fixed.match(broken);
if (stillBroken?.length) {
  console.error(
    "[fix-drizzle-introspect-defaults] replace failed; broken patterns remain",
  );
  process.exit(1);
}

console.log(
  `[fix-drizzle-introspect-defaults] replaced ${matches.length} broken empty-string default(s)`,
);
