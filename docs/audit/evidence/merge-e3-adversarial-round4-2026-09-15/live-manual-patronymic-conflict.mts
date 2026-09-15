import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const requireFromWebapp = createRequire(
  '/home/dev/dev-projects/bcb-wt-fio-dialog/apps/webapp/package.json',
);
const pg = requireFromWebapp('pg') as typeof import('pg');
const { mergePlatformUsersInTransaction } = await import(
  '/home/dev/dev-projects/bcb-wt-fio-dialog/packages/platform-merge/src/pgPlatformUserMerge.ts'
);

const marker = 'E3A4_MANUAL_20260915';
const client = new pg.Client({
  host: process.env.AUDIT_PGHOST,
  database: 'bcb_webapp_dev',
  user: 'postgres',
});
await client.connect();

const query = async (text: string, values: unknown[] = []) =>
  (await client.query(text, values)).rows as Record<string, unknown>[];

await client.query('BEGIN');
let observedError = '';
try {
  const target = (
    await query(
      `INSERT INTO platform_users (display_name, role, first_name, last_name, patronymic)
       VALUES ($1, 'client', 'Иван', 'Иванов', 'Петрович') RETURNING id`,
      [`${marker} Иванов Иван Петрович`],
    )
  )[0]!.id as string;
  const duplicate = (
    await query(
      `INSERT INTO platform_users (display_name, role, first_name, last_name, patronymic)
       VALUES ($1, 'client', 'Иван', 'Иванов', 'Сергеевич') RETURNING id`,
      [`${marker} Иванов Иван Сергеевич`],
    )
  )[0]!.id as string;

  try {
    await mergePlatformUsersInTransaction(client, target, duplicate, 'manual', {
      resolution: {
        targetId: target,
        duplicateId: duplicate,
        fields: {
          phone_normalized: 'target',
          display_name: 'target',
          first_name: 'target',
          last_name: 'target',
          email: 'target',
        },
        // Keep the probe on the FIO branch: `both` currently dies earlier in unrelated channel SQL.
        bindings: { telegram: 'target', max: 'target', vk: 'target' },
        oauth: {},
        channelPreferences: 'merge',
      },
    });
    const stored = (
      await query(
        `SELECT display_name, first_name, last_name, patronymic
         FROM platform_users WHERE id = $1`,
        [target],
      )
    )[0]!;
    console.log(`MERGE_COMPLETED_WITHOUT_PATRONYMIC_CHOICE ${JSON.stringify(stored)}`);
  } catch (error) {
    observedError = `${(error as { code?: string }).code ?? 'no-code'} ${(error as Error).message}`;
    console.log(`MERGE_FAILED_BEFORE_HUMAN_PATRONYMIC_CHOICE ${observedError}`);
  }
} finally {
  await client.query('ROLLBACK');
}

assert.match(observedError, /42846 cannot cast type record to uuid\[\]/);

const residue = (
  await query(
    `SELECT count(*)::int AS rows
     FROM platform_users WHERE display_name LIKE $1`,
    [`%${marker}%`],
  )
)[0]!;
console.log(`RESIDUE ${JSON.stringify(residue)}`);
assert.deepEqual(residue, { rows: 0 });

await client.end();
