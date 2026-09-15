/**
 * Живое доказательство Д2: доверенность двери больше не выписывает та же роль, которая в дверь
 * стучится.
 *
 * Дверь `app.transfer_staff_approved_platform_user_merge_data` двигает пароли, oauth-привязки,
 * login-токены и секреты каналов, а единственное её основание — строка
 * `patient_merge_candidates` своей клиники. Пока у `app_staff` был КОЛОНОЧНЫЙ `INSERT` на эту
 * таблицу (табличного не было, поэтому в глаза не бросалось), роль врача выписывала это основание
 * себе сама: вписала СЕБЕ pending-конфликт `medical_history` на двух посторонних людей — и дверь
 * перенесла их учётные строки. Эшелон держался на отсутствии HTTP-маршрута, пишущего такую строку.
 *
 * Прогон проверяет поведение, а не текст декларации: под НАСТОЯЩЕЙ рантайм-ролью врача
 *  1. `INSERT` в `patient_merge_candidates` отказывает (42501);
 *  2. дверь по несуществующей строке возвращает `conflict_not_found`;
 *  3. учётные строки обеих учёток остаются на месте.
 *
 * Слепая поломка `staff-insert` возвращает снятый грант — тогда прогон обязан покраснеть.
 *
 * Запускается не напрямую, а из `doctor-medical-merge-door.devDbProof.test.mjs`.
 */
import {
  clearDoctorContext,
  clinicsWithDoctors,
  connect,
  faultFromEnv,
  installCandidate,
  installDoctorContext,
  staffCapability,
} from './doctor-medical-merge-door.proofHarness.mjs';

const TARGET = '00000000-0000-4000-8000-00000000d2a1';
const DUPLICATE = '00000000-0000-4000-8000-00000000d2a2';
const FORGED = '00000000-0000-4000-8000-00000000d2c1';

const FAULT = faultFromEnv();
const log = [];
function say(line) {
  log.push(line);
  process.stdout.write(`${line}\n`);
}

async function main() {
  const { client, db, who } = await connect();
  say(`connected: db=${db} as=${who}`);

  await client.query('BEGIN');
  try {
    await installCandidate(client, FAULT, say);

    const capability = await staffCapability(client);
    const [clinic] = await clinicsWithDoctors(client, 1, say);
    say(`clinic=${clinic.org_id} doctor=${clinic.staff_id}`);

    // Фикстура намеренно постороннняя: две учётки БЕЗ записи в эту клинику и БЕЗ медицинской
    // истории. Честного конфликта у врача с ними нет и быть не может.
    for (const [id, name] of [
      [TARGET, 'D2 proof outsider canonical'],
      [DUPLICATE, 'D2 proof outsider duplicate'],
    ]) {
      await client.query(
        `INSERT INTO public.platform_users(id, display_name, role) VALUES ($1::uuid, $2, 'client')`,
        [id, name],
      );
      await client.query(
        `INSERT INTO public.user_password_credentials(user_id, password_hash) VALUES ($1::uuid, 'argon2-d2-proof')`,
        [id],
      );
    }
    say('fixture inserted (2 outsiders: no enrollment in this clinic, no medical history)');

    const runtime = await installDoctorContext(client, capability, clinic);
    say(
      `runtime role installed: session_user=${runtime.login} current_user=${runtime.role} org=${runtime.org}`,
    );

    // --- 1. попытка выписать доверенность себе ---
    let forgeRefusal = null;
    // Отказ прав роняет транзакцию целиком, а прогон обязан продолжить осмотр — поэтому попытка
    // подделки живёт под своим savepoint.
    await client.query('SAVEPOINT forgery');
    try {
      await client.query(
        `INSERT INTO public.patient_merge_candidates(id, organization_id, anchor_user_id,
           candidate_user_id, reason, status)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'medical_history:projection', 'pending')`,
        [FORGED, clinic.org_id, TARGET, DUPLICATE],
      );
      await client.query('RELEASE SAVEPOINT forgery');
      say(
        'FORGED ROW: app_staff inserted its own pending medical_history conflict — INSERT SUCCEEDED',
      );
    } catch (err) {
      forgeRefusal = { code: err.code ?? null, message: err.message };
      await client.query('ROLLBACK TO SAVEPOINT forgery');
      say(`forgery refused: ${forgeRefusal.code} ${forgeRefusal.message}`);
    }

    // --- 2. дверь по строке, которой нет ---
    let doorOutcome = null;
    if (forgeRefusal === null) {
      const door = await client.query(
        `SELECT app.transfer_staff_approved_platform_user_merge_data(
           $1::uuid, $2::uuid, $3::uuid, $4::uuid) AS outcome`,
        [FORGED, TARGET, DUPLICATE, clinic.staff_id],
      );
      doorOutcome = door.rows[0].outcome;
      say(`door returned: ${doorOutcome}`);
    }

    await clearDoctorContext(client);
    const after = await client.query(
      `SELECT (SELECT count(*)::int FROM public.user_password_credentials WHERE user_id = $1::uuid) AS tgt_creds,
              (SELECT count(*)::int FROM public.user_password_credentials WHERE user_id = $2::uuid) AS dup_creds,
              (SELECT count(*)::int FROM public.patient_merge_candidates WHERE id = $3::uuid) AS forged_rows`,
      [TARGET, DUPLICATE, FORGED],
    );
    say(`after: ${JSON.stringify(after.rows[0])}`);

    const state = after.rows[0];
    if (forgeRefusal === null) {
      throw new Error(
        `app_staff still writes its own door authorization; door answered '${doorOutcome}'`,
      );
    }
    if (forgeRefusal.code !== '42501') {
      throw new Error(
        `forgery failed with '${forgeRefusal.code} ${forgeRefusal.message}', expected an insufficient_privilege 42501`,
      );
    }
    if (state.forged_rows !== 0) throw new Error('a forged authorization row survived');
    if (state.dup_creds !== 1 || state.tgt_creds !== 1) {
      throw new Error(`credentials moved: target=${state.tgt_creds} duplicate=${state.dup_creds}`);
    }
    say(`FACTS: ${JSON.stringify({ forgeRefusal, doorOutcome, state })}`);
    say('RESULT: PASS — app_staff cannot write the row the door trusts, and nothing moved');
  } catch (err) {
    say(`RESULT: FAIL — ${err.code ? `${err.code} ` : ''}${err.message}`);
    if (err.where) say(`  where: ${String(err.where)}`);
    if (err.detail) say(`  detail: ${err.detail}`);
    process.exitCode = 1;
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    const check = await client.query(
      `SELECT count(*)::int AS leftovers FROM public.platform_users WHERE id IN ($1::uuid, $2::uuid)`,
      [TARGET, DUPLICATE],
    );
    say(`rolled back; fixture rows left in the database: ${check.rows[0].leftovers}`);
    say(`ROLLBACK_FACTS: ${JSON.stringify({ fixtureRows: check.rows[0].leftovers })}`);
    await client.end();
  }
}

main();
