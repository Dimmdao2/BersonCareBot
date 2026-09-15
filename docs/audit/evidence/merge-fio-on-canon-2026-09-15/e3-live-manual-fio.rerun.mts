/**
 * Живой прогон четвёртой двери §18а — ручного слияния — против DEV-базы `bcb_webapp_dev`.
 *
 * Предмет: что записано в `platform_users` и в зеркале `user_identity` ПОСЛЕ решения человека.
 * Каждый сценарий: BEGIN → настоящие INSERT → mergePlatformUsersInTransaction(..., 'manual') →
 * чтение обоих зеркал → ROLLBACK. Никаких временных баз, миграций и второго Next-сервера.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const repoRoot = '/home/dev/dev-projects/bcb-wt-conflict-screens';
const requireFromWebapp = createRequire(`${repoRoot}/apps/webapp/package.json`);
const pg = requireFromWebapp('pg') as typeof import('pg');

const sourceRoot = `${repoRoot}/packages/platform-merge/src`;
const { mergePlatformUsersInTransaction } = await import(`${sourceRoot}/pgPlatformUserMerge.ts`);
type Winner = 'target' | 'duplicate';

const marker = 'E3FIX_MANUAL_20260915';
const client = new pg.Client({
  host: process.env.LIVE_PGHOST,
  database: 'bcb_webapp_dev',
  user: 'postgres',
});
await client.connect();

type NameParts = {
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  patronymic: string | null;
};

type AccountInput = {
  display: string;
  first?: string | null;
  last?: string | null;
  patronymic?: string | null;
};

async function query(text: string, values: unknown[] = []): Promise<Record<string, unknown>[]> {
  return (await client.query(text, values)).rows;
}

async function createAccount(input: AccountInput): Promise<string> {
  const rows = await query(
    `INSERT INTO platform_users (display_name, role, first_name, last_name, patronymic)
     VALUES ($1, 'client', $2, $3, $4) RETURNING id`,
    [input.display, input.first ?? null, input.last ?? null, input.patronymic ?? null],
  );
  const id = rows[0]!.id as string;
  await query(
    `INSERT INTO user_identity (platform_user_id, first_name, last_name, patronymic, display_name)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, input.first ?? null, input.last ?? null, input.patronymic ?? null, input.display],
  );
  return id;
}

async function storedName(id: string): Promise<{ platform: NameParts; identity: NameParts }> {
  const convert = (row: Record<string, unknown>): NameParts => ({
    displayName: row.display_name as string,
    firstName: row.first_name as string | null,
    lastName: row.last_name as string | null,
    patronymic: row.patronymic as string | null,
  });
  const platform = (
    await query(
      `SELECT display_name, first_name, last_name, patronymic FROM platform_users WHERE id = $1`,
      [id],
    )
  )[0]!;
  const identity = (
    await query(
      `SELECT display_name, first_name, last_name, patronymic
       FROM user_identity WHERE platform_user_id = $1`,
      [id],
    )
  )[0]!;
  return { platform: convert(platform), identity: convert(identity) };
}

/** `both` по каналам специально: так прогон проходит и через тот SQL, что падал с 42846. */
async function manualMerge(params: {
  target: AccountInput;
  duplicate: AccountInput;
  fioWinner: Winner;
}): Promise<{ platform: NameParts; identity: NameParts }> {
  const targetId = await createAccount(params.target);
  const duplicateId = await createAccount(params.duplicate);
  await mergePlatformUsersInTransaction(client, targetId, duplicateId, 'manual', {
    resolution: {
      targetId,
      duplicateId,
      fields: {
        phone_normalized: 'target',
        display_name: params.fioWinner,
        first_name: params.fioWinner,
        last_name: params.fioWinner,
        patronymic: params.fioWinner,
        email: 'target',
      },
      bindings: { telegram: 'both', max: 'both', vk: 'both' },
      oauth: {},
      channelPreferences: 'merge',
    },
  });
  return storedName(targetId);
}

async function scenario(name: string, run: () => Promise<void>): Promise<void> {
  await client.query('BEGIN');
  try {
    await run();
    console.log(`PASS ${name}`);
  } finally {
    await client.query('ROLLBACK');
  }
}

await scenario('M1 conflicting patronymics take the card the person chose', async () => {
  const stored = await manualMerge({
    target: {
      display: `${marker} Иванов Иван Петрович`,
      first: 'Иван',
      last: 'Иванов',
      patronymic: 'Петрович',
    },
    duplicate: {
      display: `${marker} Иванов Иван Сергеевич`,
      first: 'Иван',
      last: 'Иванов',
      patronymic: 'Сергеевич',
    },
    fioWinner: 'duplicate',
  });
  const expected: NameParts = {
    displayName: `${marker} Иванов Иван Сергеевич`,
    firstName: 'Иван',
    lastName: 'Иванов',
    patronymic: 'Сергеевич',
  };
  assert.deepEqual(stored.platform, expected);
  assert.deepEqual(stored.identity, expected);
});

await scenario('M2 the mirrored choice writes the other patronymic', async () => {
  const stored = await manualMerge({
    target: {
      display: `${marker} Иванов Иван Петрович`,
      first: 'Иван',
      last: 'Иванов',
      patronymic: 'Петрович',
    },
    duplicate: {
      display: `${marker} Иванов Иван Сергеевич`,
      first: 'Иван',
      last: 'Иванов',
      patronymic: 'Сергеевич',
    },
    fioWinner: 'target',
  });
  assert.equal(stored.platform.patronymic, 'Петрович');
  assert.equal(stored.identity.patronymic, 'Петрович');
});

await scenario('M3 the only patronymic survives a card choice that has none', async () => {
  const stored = await manualMerge({
    target: { display: `${marker} Иванов Иван`, first: 'Иван', last: 'Иванов' },
    duplicate: {
      display: `${marker} Иванов И.`,
      first: 'Иван',
      last: 'Иванов',
      patronymic: 'Петрович',
    },
    fioWinner: 'target',
  });
  assert.deepEqual(stored.platform, {
    displayName: `${marker} Иванов Иван`,
    firstName: 'Иван',
    lastName: 'Иванов',
    patronymic: 'Петрович',
  });
  assert.equal(stored.identity.patronymic, 'Петрович');
});

const residue = await query(
  `SELECT
     (SELECT count(*)::int FROM platform_users WHERE display_name LIKE $1) AS platform_users,
     (SELECT count(*)::int FROM user_identity WHERE display_name LIKE $1) AS user_identity`,
  [`%${marker}%`],
);
console.log(`RESIDUE ${JSON.stringify(residue[0])}`);
assert.deepEqual(residue[0], { platform_users: 0, user_identity: 0 });

await client.end();
