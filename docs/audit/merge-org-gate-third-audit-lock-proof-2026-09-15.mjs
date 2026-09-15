/**
 * Does `FOR UPDATE OF pu` still lock BOTH platform_users rows, or did locking quietly disappear so
 * the statement would stop failing? Third audit of Э1 (77894c3a7).
 *
 * Method: conn1 opens a transaction and calls the REAL merge on two non-client rows. The lock SELECT
 * is the first statement the function runs; the very next guard (`role = 'client'`) throws, so the
 * transaction has executed the lock statement and nothing else, and stays open. conn2 then probes
 * each row with `FOR UPDATE NOWAIT`: a locked row raises 55P03, a free row returns immediately.
 * Both connections ROLLBACK. Read-only against bcb_webapp_dev.
 */
import pg from '/home/dev/dev-projects/bcb-wt-merge-org-gate/apps/webapp/node_modules/pg/lib/index.js';
import { mergePlatformUsersInTransaction } from '/home/dev/dev-projects/bcb-wt-merge-org-gate/packages/platform-merge/dist/pgPlatformUserMerge.js';

if (typeof process.setuid === 'function' && process.getuid() === 0) {
  process.setgid('postgres');
  process.setuid('postgres');
}
const conn = () => new pg.Client({ host: '/var/run/postgresql', port: 5432, database: 'bcb_webapp_dev', user: 'postgres' });

const A = 'b0021a38-fb86-45e9-9aec-d85014e932d4'; // doctor  -> merge target arg
const B = 'd3de749b-e769-45e9-9806-3d66a84f10b1'; // admin   -> merge duplicate arg

async function main() {
  const c1 = conn(); const c2 = conn();
  await c1.connect(); await c2.connect();
  const control = (await c1.query(`SELECT id::text id FROM platform_users WHERE role='client' AND id NOT IN ($1,$2) LIMIT 1`, [A, B])).rows[0].id;

  await c1.query('BEGIN');
  let thrown = null;
  try {
    await mergePlatformUsersInTransaction(c1, A, B, 'phone_bind');
  } catch (e) { thrown = `${e?.name}: ${e?.message}`; }
  console.log(`conn1 stopped at: ${thrown}`);
  console.log(`conn1 wrote nothing: xact_write_check = ${(await c1.query(`SELECT pg_current_xact_id_if_assigned() IS NOT NULL AS wrote`)).rows[0].wrote}`);

  const probe = async (id, label) => {
    await c2.query('BEGIN');
    let r;
    try {
      await c2.query(`SELECT id FROM platform_users WHERE id = $1::uuid FOR UPDATE NOWAIT`, [id]);
      r = 'ACQUIRED (row is NOT locked)';
    } catch (e) { r = `BLOCKED ${e.code} — ${e.message}`; }
    await c2.query('ROLLBACK');
    console.log(`  ${label.padEnd(34)} ${r}`);
  };
  console.log('conn2 probes platform_users with FOR UPDATE NOWAIT:');
  await probe(A, 'merge target row');
  await probe(B, 'merge duplicate row');
  await probe(control, 'unrelated control row');

  // the LEFT JOIN side: `OF pu` deliberately narrows locking to platform_users only
  const contact = (await c1.query(
    `SELECT id::text id FROM user_contacts WHERE platform_user_id IN ($1::uuid,$2::uuid) LIMIT 1`, [A, B],
  )).rows[0];
  if (contact) {
    await c2.query('BEGIN');
    let r;
    try {
      await c2.query(`SELECT id FROM user_contacts WHERE id = $1::uuid FOR UPDATE NOWAIT`, [contact.id]);
      r = 'ACQUIRED (user_contacts row is NOT locked — expected with `OF pu`)';
    } catch (e) { r = `BLOCKED ${e.code} — ${e.message}`; }
    await c2.query('ROLLBACK');
    console.log(`  ${'joined user_contacts row'.padEnd(34)} ${r}`);
  } else {
    console.log('  joined user_contacts row           (no contact row on these users)');
  }

  await c1.query('ROLLBACK');
  await c1.end(); await c2.end();
}
await main();
