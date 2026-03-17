/**
 * Команды по пользователю с номером телефона (prod/dev база).
 *
 * 1) Удалить номер телефона у пользователя с номером 79189000782:
 *    pnpm exec tsx scripts/user-phone-admin.ts remove-phone 79189000782
 *
 * 2) Полностью удалить пользователя с этим номером (users + identities + contacts каскадно):
 *    pnpm exec tsx scripts/user-phone-admin.ts delete-user 79189000782
 *
 * Требуется DATABASE_URL в .env (или ENV_FILE).
 */
import '../src/config/loadEnv.js';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL не задан. Укажите в .env или ENV_FILE.');
  process.exit(1);
}

const db = new Pool({ connectionString });

function normalizeForMatch(phone: string): string[] {
  const digits = phone.replace(/\D/g, '');
  const withPlus = digits.startsWith('7') ? `+${digits}` : `+7${digits}`;
  const noPlus = digits.startsWith('7') ? digits : `7${digits}`;
  return [withPlus, noPlus];
}

async function removePhone(phone: string): Promise<void> {
  const variants = normalizeForMatch(phone);
  const res = await db.query<{ user_id: string; value_normalized: string }>(
    `SELECT user_id::text AS user_id, value_normalized
     FROM contacts
     WHERE type = 'phone' AND value_normalized = ANY($1::text[])`,
    [variants],
  );
  if (res.rows.length === 0) {
    console.log('Пользователь с таким номером не найден в contacts.');
    return;
  }
  const deleted = await db.query(
    `DELETE FROM contacts WHERE type = 'phone' AND value_normalized = ANY($1::text[])`,
    [variants],
  );
  console.log(`Удалён номер у пользователя(ей): ${res.rows.map((r) => r.user_id).join(', ')}. Удалено контактов: ${deleted.rowCount ?? 0}.`);
}

async function deleteUser(phone: string): Promise<void> {
  const variants = normalizeForMatch(phone);
  const res = await db.query<{ user_id: string }>(
    `SELECT user_id::text AS user_id FROM contacts WHERE type = 'phone' AND value_normalized = ANY($1::text[])`,
    [variants],
  );
  if (res.rows.length === 0) {
    console.log('Пользователь с таким номером не найден в contacts.');
    return;
  }
  const userIds = [...new Set(res.rows.map((r) => r.user_id))];
  await db.query('DELETE FROM users WHERE id = ANY($1::bigint[])', [userIds]);
  console.log(`Удалён пользователь(и) с id: ${userIds.join(', ')} (и связанные identities, contacts по каскаду).`);
}

async function main() {
  const [, , cmd, phoneArg] = process.argv;
  const phone = (phoneArg ?? '79189000782').trim();
  if (!phone) {
    console.error('Укажите номер: remove-phone 79189000782 | delete-user 79189000782');
    process.exit(1);
  }

  try {
    if (cmd === 'remove-phone') {
      await removePhone(phone);
    } else if (cmd === 'delete-user') {
      await deleteUser(phone);
    } else {
      console.error('Команда должна быть: remove-phone | delete-user');
      process.exit(1);
    }
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
