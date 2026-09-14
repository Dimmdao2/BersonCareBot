/**
 * Live adversarial re-audit proof for plan stage Э1 (org-scoped automatic-merge gate).
 *
 * Unlike the candidate's own proof, this script does NOT re-type the gate SQL. It imports the real
 * built `mergePlatformUsersInTransaction` and runs it against the named DEV database inside ONE
 * transaction that always ends in ROLLBACK. Oracle: AUTH_AND_IDENTITY_CANON.md §18.
 *
 * Run (needs the postgres peer socket, hence sudo + setuid):
 *   sudo -n $(which node) docs/audit/merge-org-gate-recheck-live-proof-2026-09-14.mjs
 */
import pg from '/home/dev/dev-projects/bcb-wt-merge-org-gate/apps/webapp/node_modules/pg/lib/index.js';
import {
  enrichPickMergeCandidatesWithBookingCounts,
  mergePlatformUsersInTransaction,
} from '/home/dev/dev-projects/bcb-wt-merge-org-gate/packages/platform-merge/dist/pgPlatformUserMerge.js';

if (typeof process.setuid === 'function' && process.getuid() === 0) {
  process.setgid('postgres');
  process.setuid('postgres');
}

const P = '9e100000-0000-4000-8000-';
const id = (suffix) => `${P}${suffix.padStart(12, '0')}`;
const ORG_A = id('a');
const ORG_B = id('b');
const AUTHOR = id('ff');

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));

function resolution(targetId, duplicateId) {
  return {
    targetId,
    duplicateId,
    fields: {
      phone_normalized: 'target',
      display_name: 'target',
      first_name: 'target',
      last_name: 'target',
      email: 'target',
    },
    bindings: { telegram: 'both', max: 'both', vk: 'both' },
    oauth: {},
    channelPreferences: 'merge',
  };
}

/** scenario = { name, pair: [targetSuffix, duplicateSuffix], expect: 'merge'|'block', reason, fixture, after } */
const SCENARIOS = [
  {
    name: '1_appointments_only_same_org_must_merge',
    canon: '§18 «Не блокеры ничего и никогда: история записей на приём»',
    pair: ['101', '102'],
    expect: 'merge',
    fixture: (t, d) => [
      [`INSERT INTO patient_bookings(id, platform_user_id, booking_type, category, slot_start, slot_end, status, contact_phone, contact_name, source, organization_id)
        VALUES (gen_random_uuid(), $1::uuid, 'online', 'general', now() - interval '3 day', now() - interval '3 day' + interval '30 min', 'completed', '+70000000101', 'target', 'imported', $3::uuid),
               (gen_random_uuid(), $2::uuid, 'online', 'general', now() - interval '2 day', now() - interval '2 day' + interval '30 min', 'completed', '+70000000102', 'dup', 'imported', $3::uuid)`, [t, d, ORG_A]],
      [`INSERT INTO be_appointments(id, platform_user_id, organization_id, start_at, end_at, duration_minutes, source, status)
        VALUES (gen_random_uuid(), $1::uuid, $3::uuid, now() - interval '5 day', now() - interval '5 day' + interval '30 min', 30, 'imported', 'completed'),
               (gen_random_uuid(), $2::uuid, $3::uuid, now() - interval '4 day', now() - interval '4 day' + interval '30 min', 30, 'imported', 'completed')`, [t, d, ORG_A]],
    ],
    after: async (q, t, d) => {
      const b = await q(`SELECT count(*)::int c FROM patient_bookings WHERE platform_user_id = $1`, [t]);
      const a = await q(`SELECT count(*)::int c FROM be_appointments WHERE platform_user_id = $1`, [t]);
      const [targetCandidate, duplicateCandidate] = await enrichPickMergeCandidatesWithBookingCounts(
        { query: q },
        { id: t, phone_normalized: null, created_at: new Date(0) },
        { id: d, phone_normalized: null, created_at: new Date(0) },
      );
      return {
        bookings_on_target: b.rows[0].c,
        appointments_on_target: a.rows[0].c,
        enriched_booking_counts: [
          targetCandidate.patientBookingCount,
          duplicateCandidate.patientBookingCount,
        ],
        want: '2 transfers and enriched booking counts [2, 0]',
      };
    },
  },
  {
    name: '2_notes_vs_visit_same_org_must_block',
    canon: '§18 «блокирует только… в ОДНОЙ организации медицинский профиль заполнен с обеих сторон»',
    pair: ['201', '202'],
    expect: 'block',
    fixture: (t, d) => [
      [`INSERT INTO doctor_notes(user_id, author_id, text, organization_id, note_date) VALUES ($1::uuid, $2::uuid, 'note', $3::uuid, CURRENT_DATE)`, [t, AUTHOR, ORG_A]],
      [`INSERT INTO clinical_visit(patient_user_id, visit_type, visited_at, created_by, organization_id) VALUES ($1::uuid, 'first', now(), $2::uuid, $3::uuid)`, [d, AUTHOR, ORG_A]],
    ],
  },
  {
    name: '3_program_vs_symptom_same_org_must_block',
    canon: '§18 «назначения… отслеживание симптомов»',
    pair: ['211', '212'],
    expect: 'block',
    fixture: (t, d) => [
      [`INSERT INTO treatment_program_instances(patient_user_id, title, assignment_source, organization_id) VALUES ($1::uuid, 'assigned', 'doctor', $2::uuid)`, [t, ORG_A]],
      [`INSERT INTO symptom_trackings(user_id, platform_user_id, symptom_title, symptom_key, organization_id) VALUES ($1::text, $1::uuid, 'колено', 'knee_pain', $2::uuid)`, [d, ORG_A]],
    ],
  },
  {
    name: '4_medical_in_different_orgs_must_merge',
    canon: '§18 «медицинские данные человека в РАЗНЫХ организациях слиянию не мешают вовсе»',
    pair: ['301', '302'],
    expect: 'merge',
    fixture: (t, d) => [
      [`INSERT INTO doctor_notes(user_id, author_id, text, organization_id, note_date) VALUES ($1::uuid, $2::uuid, 'org A note', $3::uuid, CURRENT_DATE)`, [t, AUTHOR, ORG_A]],
      [`INSERT INTO clinical_visit(patient_user_id, visit_type, visited_at, created_by, organization_id) VALUES ($1::uuid, 'first', now(), $2::uuid, $3::uuid)`, [d, AUTHOR, ORG_B]],
    ],
    after: async (q, t, d) => {
      const r = await q(`SELECT count(*)::int c FROM clinical_visit WHERE patient_user_id = $1`, [t]);
      return { visits_on_target: r.rows[0].c, want: 1 };
    },
  },
  {
    name: '5_null_org_on_both_sides_must_block',
    canon: 'candidate design decision (comment in assertAutomaticMergeHasNoMedicalHistory)',
    pair: ['401', '402'],
    expect: 'block',
    fixture: (t, d) => [
      [`INSERT INTO doctor_notes(user_id, author_id, text, organization_id, note_date) VALUES ($1::uuid, $3::uuid, 'no org', NULL, CURRENT_DATE), ($2::uuid, $3::uuid, 'no org', NULL, CURRENT_DATE - 1)`, [t, d, AUTHOR]],
    ],
  },
  {
    name: '6_non_blocking_categories_transfer',
    canon: '§18 «заявки… старые сообщения и переписка… отметки самочувствия, отметки разминок… Всё это переносится»',
    pair: ['501', '502'],
    expect: 'merge',
    fixture: (t, d) => [
      [`INSERT INTO patient_bookings(id, platform_user_id, booking_type, category, slot_start, slot_end, status, contact_phone, contact_name, source, organization_id)
        VALUES (gen_random_uuid(), $1::uuid, 'online', 'general', now() - interval '9 day', now() - interval '9 day' + interval '30 min', 'completed', '+70000000502', 'dup', 'imported', $2::uuid)`, [d, ORG_A]],
      [`INSERT INTO be_appointments(id, platform_user_id, organization_id, start_at, end_at, duration_minutes, source, status)
        VALUES (gen_random_uuid(), $1::uuid, $2::uuid, now() - interval '8 day', now() - interval '8 day' + interval '30 min', 30, 'imported', 'completed')`, [d, ORG_A]],
      [`INSERT INTO online_intake_requests(user_id, type, organization_id) VALUES ($1::uuid, 'lfk', $2::uuid)`, [d, ORG_A]],
      [`INSERT INTO support_conversations(platform_user_id, integrator_conversation_id, source, admin_scope, status, opened_at, last_message_at, organization_id)
        VALUES ($1::uuid, 'conv-9e100-502', 'telegram', 'organization', 'open', now(), now(), $2::uuid)`, [d, ORG_A]],
      [`INSERT INTO symptom_trackings(user_id, platform_user_id, symptom_title, symptom_key, organization_id)
        VALUES ($1::text, $1::uuid, 'Общее самочувствие', 'general_wellbeing', $2::uuid), ($1::text, $1::uuid, 'Разминка', 'warmup_feeling', $2::uuid)`, [d, ORG_A]],
      [`INSERT INTO message_log(user_id, platform_user_id, sender_id, text, category, outcome, organization_id)
        VALUES ($1::text, $1::uuid, 'system', 'рассылка', 'broadcast', 'sent', $2::uuid)`, [d, ORG_A]],
    ],
    after: async (q, t, d) => {
      const out = {};
      for (const [k, sqlText] of [
        ['patient_bookings', `SELECT count(*)::int c FROM patient_bookings WHERE platform_user_id = $1`],
        ['be_appointments', `SELECT count(*)::int c FROM be_appointments WHERE platform_user_id = $1`],
        ['online_intake_requests', `SELECT count(*)::int c FROM online_intake_requests WHERE user_id = $1`],
        ['support_conversations', `SELECT count(*)::int c FROM support_conversations WHERE platform_user_id = $1`],
        ['symptom_trackings', `SELECT count(*)::int c FROM symptom_trackings WHERE platform_user_id = $1`],
        ['message_log', `SELECT count(*)::int c FROM message_log WHERE platform_user_id = $1`],
      ]) out[k] = (await q(sqlText, [t])).rows[0].c;
      const left = {};
      for (const [k, sqlText] of [
        ['patient_bookings', `SELECT count(*)::int c FROM patient_bookings WHERE platform_user_id = $1`],
        ['be_appointments', `SELECT count(*)::int c FROM be_appointments WHERE platform_user_id = $1`],
        ['online_intake_requests', `SELECT count(*)::int c FROM online_intake_requests WHERE user_id = $1`],
        ['support_conversations', `SELECT count(*)::int c FROM support_conversations WHERE platform_user_id = $1`],
        ['symptom_trackings', `SELECT count(*)::int c FROM symptom_trackings WHERE platform_user_id = $1`],
        ['message_log', `SELECT count(*)::int c FROM message_log WHERE platform_user_id = $1`],
      ]) left[k] = (await q(sqlText, [d])).rows[0].c;
      return { on_target: out, left_on_duplicate: left, want: 'on_target all >=1, left_on_duplicate all 0' };
    },
  },
  {
    name: '7_manual_support_path_is_not_gated',
    canon: '§18а «Что может техподдержка: … перенести любые данные между аккаунтами»',
    pair: ['601', '602'],
    expect: 'merge',
    reason: 'manual',
    fixture: (t, d) => [
      [`INSERT INTO doctor_notes(user_id, author_id, text, organization_id, note_date) VALUES ($1::uuid, $2::uuid, 'note on duplicate', $3::uuid, CURRENT_DATE)`, [d, AUTHOR, ORG_A]],
      [`INSERT INTO clinical_visit(patient_user_id, visit_type, visited_at, created_by, organization_id) VALUES ($1::uuid, 'first', now(), $2::uuid, $3::uuid)`, [t, AUTHOR, ORG_A]],
      [`INSERT INTO clinical_visit(patient_user_id, visit_type, visited_at, created_by, organization_id) VALUES ($1::uuid, 'repeat', now(), $2::uuid, $3::uuid)`, [d, AUTHOR, ORG_A]],
    ],
    after: async (q, t, d) => {
      const n = await q(`SELECT count(*)::int c FROM doctor_notes WHERE user_id = $1`, [t]);
      const v = await q(`SELECT count(*)::int c FROM clinical_visit WHERE patient_user_id = $1`, [t]);
      return { notes_on_target: n.rows[0].c, visits_on_target: v.rows[0].c, want: 'notes 1, visits 2' };
    },
  },
  {
    name: '8_promo_programs_same_org_must_merge',
    canon: '§18 «отметки промо-упражнений» — не блокер',
    pair: ['701', '702'],
    expect: 'merge',
    fixture: (t, d) => [
      [`INSERT INTO treatment_program_instances(patient_user_id, title, assignment_source, organization_id) VALUES ($1::uuid, 'promo t', 'promo', $3::uuid), ($2::uuid, 'promo d', 'promo', $3::uuid)`, [t, d, ORG_A]],
    ],
  },
  {
    name: '9_wellbeing_and_warmup_same_org_must_merge',
    canon: '§18 «отметки самочувствия, отметки разминок» — не блокеры',
    pair: ['801', '802'],
    expect: 'merge',
    fixture: (t, d) => [
      [`INSERT INTO symptom_trackings(user_id, platform_user_id, symptom_title, symptom_key, organization_id)
        VALUES ($1::text, $1::uuid, 'Общее самочувствие', 'general_wellbeing', $3::uuid), ($2::text, $2::uuid, 'Общее самочувствие', 'general_wellbeing', $3::uuid),
               ($1::text, $1::uuid, 'Разминка', 'warmup_feeling', $3::uuid), ($2::text, $2::uuid, 'Разминка', 'warmup_feeling', $3::uuid)`, [t, d, ORG_A]],
      [`INSERT INTO symptom_entries(user_id, platform_user_id, tracking_id, value_0_10, entry_type, recorded_at, source, organization_id)
        SELECT st.user_id, st.platform_user_id, st.id, 5, 'daily', now(), 'webapp', $2::uuid
        FROM symptom_trackings st WHERE st.platform_user_id IN ($1::uuid, $3::uuid)`, [t, ORG_A, d]],
    ],
    after: async (q, t, d) => {
      const e = await q(`SELECT count(*)::int c FROM symptom_entries WHERE platform_user_id = $1`, [t]);
      const eLeft = await q(`SELECT count(*)::int c FROM symptom_entries WHERE platform_user_id = $1`, [d]);
      const live = await q(
        `SELECT symptom_key, count(*)::int c FROM symptom_trackings WHERE platform_user_id = $1 AND deleted_at IS NULL GROUP BY 1 ORDER BY 1`,
        [t],
      );
      return { entries_on_target: e.rows[0].c, entries_left_on_duplicate: eLeft.rows[0].c, live_trackings: live.rows, want: 'entries 4 on target / 0 left; one live tracking per singleton key' };
    },
  },
  {
    name: '10_appointment_overlap_same_org_canon_says_merge',
    canon: '§18 «Не блокеры ничего и никогда: история записей на приём»',
    pair: ['901', '902'],
    expect: 'merge',
    fixture: (t, d) => [
      [`INSERT INTO patient_bookings(id, platform_user_id, booking_type, category, slot_start, slot_end, status, contact_phone, contact_name, source, organization_id)
        VALUES (gen_random_uuid(), $1::uuid, 'online', 'general', now() + interval '2 day', now() + interval '2 day' + interval '60 min', 'confirmed', '+70000000901', 'target', 'imported', $3::uuid),
               (gen_random_uuid(), $2::uuid, 'online', 'general', now() + interval '2 day' + interval '15 min', now() + interval '2 day' + interval '45 min', 'confirmed', '+70000000902', 'dup', 'imported', $3::uuid)`, [t, d, ORG_A]],
    ],
  },
  {
    name: '11_cross_org_same_author_same_day_notes_must_merge',
    canon: '§18 «медицинские данные человека в РАЗНЫХ организациях слиянию не мешают вовсе… Всё это переносится»',
    pair: ['a01', 'a02'],
    expect: 'merge',
    fixture: (t, d) => [
      [`INSERT INTO doctor_notes(user_id, author_id, text, organization_id, note_date)
        VALUES ($1::uuid, $3::uuid, 'org A note', $4::uuid, CURRENT_DATE), ($2::uuid, $3::uuid, 'org B note', $5::uuid, CURRENT_DATE)`, [t, d, AUTHOR, ORG_A, ORG_B]],
    ],
    after: async (q, t) => {
      const n = await q(`SELECT count(*)::int c FROM doctor_notes WHERE user_id = $1`, [t]);
      return { notes_on_target: n.rows[0].c, want: 2 };
    },
  },
];

async function main() {
  const client = new pg.Client({ host: '/var/run/postgresql', port: 5432, database: 'bcb_webapp_dev', user: 'postgres' });
  await client.connect();
  const db = await client.query('select current_database() d');
  if (db.rows[0].d !== 'bcb_webapp_dev') throw new Error(`refusing to run on ${db.rows[0].d}`);

  const q = (text, values) => client.query(text, values);
  const results = [];
  await q('BEGIN');
  try {
    await q(`INSERT INTO be_organizations(id, title) VALUES ($1, 'recheck org A'), ($2, 'recheck org B')`, [ORG_A, ORG_B]);
    await q(`INSERT INTO platform_users(id, display_name, role) VALUES ($1, 'recheck author', 'doctor')`, [AUTHOR]);

    for (const s of SCENARIOS) {
      if (only.length && !only.some((o) => s.name.includes(o))) continue;
      const [ts, ds] = s.pair;
      const t = id(ts);
      const d = id(ds);
      await q('SAVEPOINT sc');
      let verdict;
      let detail = null;
      try {
        await q(`INSERT INTO platform_users(id, display_name, role) VALUES ($1, $3, 'client'), ($2, $4, 'client')`, [t, d, `t${ts}`, `d${ds}`]);
        for (const [text, values] of s.fixture(t, d)) await q(text, values);
        const reason = s.reason ?? 'phone_bind';
        const options = reason === 'manual' ? { resolution: resolution(t, d) } : undefined;
        try {
          await mergePlatformUsersInTransaction(client, t, d, reason, options);
          verdict = 'merge';
        } catch (e) {
          const name = e?.name ?? '';
          verdict = name === 'MergeConflictError' || name === 'MergeDependentConflictError' ? 'block' : 'CRASH';
          detail = `${name || 'Error'}: ${e?.message ?? String(e)}`;
        }
        if (verdict === 'merge' && s.after) detail = JSON.stringify(await s.after(q, t, d));
      } catch (e) {
        verdict = 'ERROR';
        detail = e?.message ?? String(e);
      }
      await q('ROLLBACK TO SAVEPOINT sc');
      results.push({ scenario: s.name, expected: s.expect, actual: verdict, pass: verdict === s.expect, detail, canon: s.canon });
    }
  } finally {
    await q('ROLLBACK');
  }

  const residual = await q(
    `SELECT (SELECT count(*)::int FROM platform_users WHERE id::text LIKE $1) users,
            (SELECT count(*)::int FROM be_organizations WHERE id::text LIKE $1) orgs`,
    [`${P}%`],
  );
  await client.end();

  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.scenario}  expected=${r.expected} actual=${r.actual}`);
    if (r.detail) console.log(`        ${r.detail}`);
  }
  console.log(`residual_rows_after_rollback = ${JSON.stringify(residual.rows[0])}`);
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} scenarios matched the canon`);
  process.exitCode = failed.length ? 1 : 0;
}

await main();
