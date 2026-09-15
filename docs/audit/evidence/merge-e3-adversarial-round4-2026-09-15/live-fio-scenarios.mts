import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const requireFromWebapp = createRequire(
  '/home/dev/dev-projects/bcb-wt-fio-dialog/apps/webapp/package.json',
);
const pg = requireFromWebapp('pg') as typeof import('pg');

const sourceRoot = '/home/dev/dev-projects/bcb-wt-fio-dialog/packages/platform-merge/src';
const { mergePlatformUsersInTransaction } = await import(`${sourceRoot}/pgPlatformUserMerge.ts`);
const { createHumanMergeDecision, createHumanMergePrompt } = await import(
  `${sourceRoot}/humanMergeDecision.ts`
);

const marker = 'E3A4_20260915';
const client = new pg.Client({
  host: process.env.AUDIT_PGHOST,
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
  created?: string;
};

async function query(text: string, values: unknown[] = []): Promise<Record<string, unknown>[]> {
  return (await client.query(text, values)).rows;
}

async function createAccount(input: AccountInput): Promise<string> {
  const rows = await query(
    `INSERT INTO platform_users (display_name, role, first_name, last_name, patronymic, created_at)
     VALUES ($1, 'client', $2, $3, $4, COALESCE($5::timestamptz, now()))
     RETURNING id`,
    [
      input.display,
      input.first ?? null,
      input.last ?? null,
      input.patronymic ?? null,
      input.created ?? null,
    ],
  );
  const id = rows[0]!.id as string;
  await query(
    `INSERT INTO user_identity (platform_user_id, first_name, last_name, patronymic, display_name)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, input.first ?? null, input.last ?? null, input.patronymic ?? null, input.display],
  );
  return id;
}

async function summary(id: string) {
  const row = (
    await query(
      `SELECT id, display_name, first_name, last_name, patronymic, created_at
       FROM platform_users WHERE id = $1`,
      [id],
    )
  )[0]!;
  return {
    id: row.id as string,
    displayName: row.display_name as string,
    firstName: row.first_name as string | null,
    lastName: row.last_name as string | null,
    patronymic: row.patronymic as string | null,
    createdAt: row.created_at as Date,
  };
}

async function storedName(id: string): Promise<{ platform: NameParts; identity: NameParts }> {
  const platform = (
    await query(
      `SELECT display_name, first_name, last_name, patronymic
       FROM platform_users WHERE id = $1`,
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
  const convert = (row: Record<string, unknown>): NameParts => ({
    displayName: row.display_name as string,
    firstName: row.first_name as string | null,
    lastName: row.last_name as string | null,
    patronymic: row.patronymic as string | null,
  });
  return { platform: convert(platform), identity: convert(identity) };
}

async function merge(params: {
  target: AccountInput;
  duplicate: AccountInput;
  found: 'target' | 'duplicate';
  choices?: Record<string, { source: 'target' | 'duplicate' }>;
}) {
  const targetId = await createAccount(params.target);
  const duplicateId = await createAccount(params.duplicate);
  const prompt = createHumanMergePrompt(
    await summary(targetId),
    await summary(duplicateId),
    params.found === 'target' ? targetId : duplicateId,
  );
  await mergePlatformUsersInTransaction(client, targetId, duplicateId, 'phone_bind', {
    humanDecision: createHumanMergeDecision(prompt, params.choices ?? {}),
  });
  return { prompt, stored: await storedName(targetId) };
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

await scenario('1a surname and patronymic complement silently', async () => {
  const result = await merge({
    target: { display: `${marker} Иванов`, last: 'Иванов', created: '2026-01-01' },
    duplicate: { display: `${marker} Петрович`, patronymic: 'Петрович', created: '2025-01-01' },
    found: 'duplicate',
  });
  assert.deepEqual(result.prompt.conflicts, []);
  const expected = {
    displayName: 'Иванов Петрович',
    firstName: null,
    lastName: 'Иванов',
    patronymic: 'Петрович',
  };
  assert.deepEqual(result.stored.platform, expected);
  assert.deepEqual(result.stored.identity, expected);
});

await scenario('1b entirely empty side does not erase structured FIO', async () => {
  const result = await merge({
    target: {
      display: `${marker} Смирнова Мария Ильинична`,
      first: 'Мария',
      last: 'Смирнова',
      patronymic: 'Ильинична',
      created: '2026-01-01',
    },
    duplicate: { display: '', created: '2025-01-01' },
    found: 'duplicate',
  });
  assert.deepEqual(result.prompt.conflicts, []);
  const expected = {
    displayName: 'Смирнова Мария Ильинична',
    firstName: 'Мария',
    lastName: 'Смирнова',
    patronymic: 'Ильинична',
  };
  assert.deepEqual(result.stored.platform, expected);
  assert.deepEqual(result.stored.identity, expected);
});

await scenario('1c display choice preserves each separately confirmed part', async () => {
  const result = await merge({
    target: {
      display: `${marker} Иванов Иван Петрович`,
      first: 'Иван',
      last: 'Иванов',
      patronymic: 'Петрович',
      created: '2026-01-01',
    },
    duplicate: { display: `${marker} Ваня`, created: '2025-01-01' },
    found: 'duplicate',
    choices: {
      display_name: { source: 'duplicate' },
      first_name: { source: 'target' },
      last_name: { source: 'target' },
      patronymic: { source: 'target' },
    },
  });
  assert.deepEqual(result.prompt.conflicts, [
    'display_name',
    'last_name',
    'first_name',
    'patronymic',
  ]);
  const expected = {
    displayName: `${marker} Ваня`,
    firstName: 'Иван',
    lastName: 'Иванов',
    patronymic: 'Петрович',
  };
  assert.deepEqual(result.stored.platform, expected);
  assert.deepEqual(result.stored.identity, expected);
});

await scenario('2a empty recognized display falls back to the named side', async () => {
  const result = await merge({
    target: { display: `${marker} Орлова Ольга`, created: '2026-01-01' },
    duplicate: { display: '', created: '2025-01-01' },
    found: 'duplicate',
  });
  assert.deepEqual(result.prompt.conflicts, []);
  assert.equal(result.stored.platform.displayName, `${marker} Орлова Ольга`);
  assert.equal(result.stored.identity.displayName, `${marker} Орлова Ольга`);
});

await scenario('2b mirrored empty recognized display also falls back', async () => {
  const result = await merge({
    target: { display: '', created: '2026-01-01' },
    duplicate: { display: `${marker} Волков Олег`, created: '2025-01-01' },
    found: 'target',
  });
  assert.deepEqual(result.prompt.conflicts, []);
  assert.equal(result.stored.platform.displayName, `${marker} Волков Олег`);
  assert.equal(result.stored.identity.displayName, `${marker} Волков Олег`);
});

await scenario('2c both empty stay empty without borrowing any other identity', async () => {
  const result = await merge({
    target: { display: '', created: '2026-01-01' },
    duplicate: { display: '', created: '2025-01-01' },
    found: 'duplicate',
  });
  assert.deepEqual(result.prompt.conflicts, []);
  assert.deepEqual(result.stored.platform, {
    displayName: '',
    firstName: null,
    lastName: null,
    patronymic: null,
  });
  assert.deepEqual(result.stored.identity, result.stored.platform);
});

await scenario('2d conflicting display-only names write the chosen account name', async () => {
  const result = await merge({
    target: { display: `${marker} Петров Пётр`, created: '2026-01-01' },
    duplicate: { display: `${marker} Сидорова Анна`, created: '2025-01-01' },
    found: 'duplicate',
    choices: { display_name: { source: 'target' } },
  });
  assert.deepEqual(result.prompt.conflicts, ['display_name']);
  assert.equal(result.stored.platform.displayName, `${marker} Петров Пётр`);
  assert.equal(result.stored.identity.displayName, `${marker} Петров Пётр`);
});

await scenario('3a a real structured conflict refuses an unanswered merge', async () => {
  const targetId = await createAccount({
    display: `${marker} Иванов Иван`,
    first: 'Иван',
    last: 'Иванов',
  });
  const duplicateId = await createAccount({
    display: `${marker} Сидоров Иван Петрович`,
    first: 'Иван',
    last: 'Сидоров',
    patronymic: 'Петрович',
  });
  const prompt = createHumanMergePrompt(
    await summary(targetId),
    await summary(duplicateId),
    duplicateId,
  );
  assert.deepEqual(prompt.conflicts, ['last_name']);
  await assert.rejects(
    mergePlatformUsersInTransaction(client, targetId, duplicateId, 'phone_bind', {
      humanDecision: createHumanMergeDecision(prompt, {}),
    }),
    /human choice required for last_name/,
  );
});

await scenario('3b a missing field alone creates no question', async () => {
  const targetId = await createAccount({
    display: `${marker} Кузнецов`,
    last: 'Кузнецов',
  });
  const duplicateId = await createAccount({ display: `${marker} Кузнецов`, first: 'Алексей' });
  const prompt = createHumanMergePrompt(
    await summary(targetId),
    await summary(duplicateId),
    duplicateId,
  );
  assert.deepEqual(prompt.conflicts, []);
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
