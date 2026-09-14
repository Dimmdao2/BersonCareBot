/**
 * Third adversarial audit of plan stage Э1 (org-scoped automatic-merge gate), commit 77894c3a7.
 *
 * Independent of both earlier proofs: own fixtures, own scenarios, own id space. Imports the real
 * built `mergePlatformUsersInTransaction` and drives it against the named DEV database inside ONE
 * transaction that always ends in ROLLBACK (per-scenario SAVEPOINT).
 *
 * Oracle: docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md §18/§18а + plan Э1.
 * Run: sudo -n $(which node) docs/audit/merge-org-gate-third-audit-live-proof-2026-09-15.mjs [namefilter]
 */
import pg from '/home/dev/dev-projects/bcb-wt-merge-org-gate/apps/webapp/node_modules/pg/lib/index.js';
import { mergePlatformUsersInTransaction } from '/home/dev/dev-projects/bcb-wt-merge-org-gate/packages/platform-merge/dist/pgPlatformUserMerge.js';

if (typeof process.setuid === 'function' && process.getuid() === 0) {
  process.setgid('postgres');
  process.setuid('postgres');
}

const P = '7c3a0000-0000-4000-8000-';
const uid = (s) => `${P}${s.padStart(12, '0')}`;
const ORG_X = uid('11');
const ORG_Y = uid('22');
const DOC = uid('dd');
const filter = process.argv.slice(2).filter((a) => !a.startsWith('-'));

const manual = (t, d) => ({
  targetId: t,
  duplicateId: d,
  fields: { phone_normalized: 'target', display_name: 'target', first_name: 'target', last_name: 'target', email: 'target' },
  bindings: { telegram: 'both', max: 'both', vk: 'both' },
  oauth: {},
  channelPreferences: 'merge',
});

const note = (u, org) =>
  [`INSERT INTO doctor_notes(user_id, author_id, text, organization_id, note_date) VALUES ($1::uuid,$2::uuid,'n',$3::uuid,CURRENT_DATE)`, [u, DOC, org]];
const noteNullOrg = (u) =>
  [`INSERT INTO doctor_notes(user_id, author_id, text, organization_id, note_date) VALUES ($1::uuid,$2::uuid,'n',NULL,CURRENT_DATE)`, [u, DOC]];
const diagnosis = (u, org) =>
  [`INSERT INTO clinical_diagnosis(patient_user_id, text, organization_id) VALUES ($1::uuid,'M54.5',$2::uuid)`, [u, org]];
const trauma = (u, org) =>
  [`INSERT INTO clinical_anamnesis_trauma(patient_user_id, year, what, type, created_by, organization_id) VALUES ($1::uuid,'2019','knee','sport',$2::uuid,$3::uuid)`, [u, DOC, org]];
const complaint = (u, org) =>
  [`INSERT INTO clinical_complaint(patient_user_id, text, organization_id) VALUES ($1::uuid,'боль',$2::uuid)`, [u, org]];
const lfk = (u, org, tpl) =>
  [`INSERT INTO patient_lfk_assignments(patient_user_id, template_id, organization_id) VALUES ($1::uuid,$2::uuid,$3::uuid)`, [u, tpl, org]];
const symptomReal = (u, org) =>
  [`INSERT INTO symptom_trackings(user_id, platform_user_id, symptom_title, symptom_key, organization_id) VALUES ($1::text,$1::uuid,'колено','knee_pain',$2::uuid)`, [u, org]];
const program = (u, org, source, status) =>
  [`INSERT INTO treatment_program_instances(patient_user_id, title, assignment_source, status, organization_id) VALUES ($1::uuid,'p',$2,$3,$4::uuid)`, [u, source, status, org]];
const booking = (u, org, offsetDays) =>
  [`INSERT INTO patient_bookings(id, platform_user_id, booking_type, category, slot_start, slot_end, status, contact_phone, contact_name, source, organization_id)
    VALUES (gen_random_uuid(), $1::uuid,'online','general', now() + ($2||' day')::interval, now() + ($2||' day')::interval + interval '45 min','confirmed','+79990000000','x','native',$3::uuid)`, [u, String(offsetDays), org]];
const intake = (u, org) =>
  [`INSERT INTO online_intake_requests(user_id, type, organization_id) VALUES ($1::uuid,'lfk',$2::uuid)`, [u, org]];

const SCENARIOS = [
  // ---- point 1: F1 (appointments must never block) ----
  {
    name: 'p1_bookings_only_same_org_must_merge',
    oracle: '§18 «Не блокеры ничего и никогда: история записей на приём»',
    pair: ['101', '102'], expect: 'merge',
    fx: (t, d) => [booking(t, ORG_X, 3), booking(d, ORG_X, 5)],
  },
  {
    name: 'p1_overlapping_bookings_same_org_must_merge',
    oracle: '§18 то же — совпадение слотов каноном не упомянуто как блокер',
    pair: ['103', '104'], expect: 'merge',
    fx: (t, d) => [booking(t, ORG_X, 7), booking(d, ORG_X, 7)],
  },
  {
    name: 'p1_intake_requests_only_same_org_must_merge',
    oracle: '§18 «заявки … сливается штатно»',
    pair: ['105', '106'], expect: 'merge',
    fx: (t, d) => [intake(t, ORG_X), intake(d, ORG_X)],
  },
  // ---- point 2: gate must not have weakened ----
  {
    name: 'p2_diagnosis_vs_trauma_same_org_must_block',
    oracle: '§18 «блокирует только … в ОДНОЙ организации … заполненная карточка клиента»',
    pair: ['201', '202'], expect: 'block',
    fx: (t, d) => [diagnosis(t, ORG_X), trauma(d, ORG_X)],
  },
  {
    name: 'p2_lfk_vs_notes_same_org_must_block',
    oracle: '§18 «назначенные упражнения … заметки»',
    pair: ['203', '204'], expect: 'block',
    fx: (t, d) => [lfk(t, ORG_X, 'bcc82563-7d4a-4488-8fc2-4a6bfbc2a5ae'), note(d, ORG_X)],
  },
  {
    name: 'p2_symptom_vs_complaint_same_org_must_block',
    oracle: '§18 «отслеживание симптомов»',
    pair: ['205', '206'], expect: 'block',
    fx: (t, d) => [symptomReal(t, ORG_X), complaint(d, ORG_X)],
  },
  {
    name: 'p2_doctor_program_vs_diagnosis_same_org_must_block',
    oracle: '§18 «назначения»',
    pair: ['207', '208'], expect: 'block',
    fx: (t, d) => [program(t, ORG_X, 'doctor', 'completed'), diagnosis(d, ORG_X)],
  },
  {
    name: 'p2_diagnosis_orgX_vs_trauma_orgY_must_merge',
    oracle: '§18 «медицинские данные … в РАЗНЫХ организациях слиянию не мешают вовсе»',
    pair: ['209', '210'], expect: 'merge',
    fx: (t, d) => [diagnosis(t, ORG_X), trauma(d, ORG_Y)],
    after: async (q, t, d) => ({
      diagnoses_on_target: (await q(`SELECT count(*)::int c FROM clinical_diagnosis WHERE patient_user_id=$1`, [t])).rows[0].c,
      traumas_on_target: (await q(`SELECT count(*)::int c FROM clinical_anamnesis_trauma WHERE patient_user_id=$1`, [t])).rows[0].c,
      want: '1 and 1',
    }),
  },
  {
    name: 'p2_notes_orgX_vs_notes_orgY_must_merge',
    oracle: '§18 то же, другая таблица',
    pair: ['211', '212'], expect: 'merge',
    fx: (t, d) => [note(t, ORG_X), note(d, ORG_Y)],
  },
  {
    name: 'p2_null_org_both_sides_must_block',
    oracle: 'Э1 + IS NOT DISTINCT FROM: неатрибутированные истории не проскакивают молча',
    pair: ['213', '214'], expect: 'block',
    fx: (t, d) => [noteNullOrg(t), noteNullOrg(d)],
  },
  {
    name: 'p2_null_org_vs_orgX__observed_only',
    oracle: 'канон прямой строки не даёт — фиксирую фактическое поведение',
    pair: ['215', '216'], expect: 'merge', observe: true,
    fx: (t, d) => [noteNullOrg(t), note(d, ORG_X)],
  },
  {
    name: 'p2_active_doctor_programs_different_orgs_canon_says_merge',
    oracle: '§18 «у одного человека спокойно живут две организации, каждая со СВОИМИ НАЗНАЧЕНИЯМИ» + план Э1',
    pair: ['217', '218'], expect: 'merge',
    fx: (t, d) => [program(t, ORG_X, 'doctor', 'active'), program(d, ORG_Y, 'doctor', 'active')],
  },
  {
    name: 'p2_active_doctor_programs_same_org_must_block',
    oracle: '§18 конфликт назначений внутри одной организации',
    pair: ['219', '220'], expect: 'block',
    fx: (t, d) => [program(t, ORG_X, 'doctor', 'active'), program(d, ORG_X, 'doctor', 'active')],
  },
  // ---- point 3: transfer must not be lost ----
  {
    name: 'p3_non_blocking_categories_all_transfer',
    oracle: '§18 «Всё это переносится»',
    pair: ['301', '302'], expect: 'merge',
    fx: (t, d) => [
      booking(d, ORG_X, 2),
      [`INSERT INTO be_appointments(id, platform_user_id, organization_id, start_at, end_at, duration_minutes, source, status)
        VALUES (gen_random_uuid(),$1::uuid,$2::uuid, now()+interval '1 day', now()+interval '1 day'+interval '30 min',30,'native','confirmed')`, [d, ORG_X]],
      intake(d, ORG_X),
      [`INSERT INTO support_conversations(platform_user_id, integrator_conversation_id, source, admin_scope, status, opened_at, last_message_at, organization_id)
        VALUES ($1::uuid,'conv-7c3a-302','telegram','organization','open',now(),now(),$2::uuid)`, [d, ORG_X]],
      [`INSERT INTO symptom_trackings(user_id, platform_user_id, symptom_title, symptom_key, organization_id)
        VALUES ($1::text,$1::uuid,'Общее самочувствие','general_wellbeing',$2::uuid),($1::text,$1::uuid,'Разминка','warmup_feeling',$2::uuid)`, [d, ORG_X]],
      [`INSERT INTO symptom_entries(user_id, platform_user_id, tracking_id, value_0_10, entry_type, recorded_at, source, organization_id)
        SELECT st.user_id, st.platform_user_id, st.id, 7, 'daily', now(), 'webapp', $2::uuid FROM symptom_trackings st WHERE st.platform_user_id=$1::uuid`, [d, ORG_X]],
      [`INSERT INTO message_log(user_id, platform_user_id, sender_id, text, category, outcome, organization_id)
        VALUES ($1::text,$1::uuid,'system','рассылка','broadcast','sent',$2::uuid)`, [d, ORG_X]],
      program(d, ORG_X, 'promo', 'active'),
    ],
    after: async (q, t, d) => {
      const tables = [
        ['patient_bookings', 'platform_user_id'], ['be_appointments', 'platform_user_id'],
        ['online_intake_requests', 'user_id'], ['support_conversations', 'platform_user_id'],
        ['symptom_trackings', 'platform_user_id'], ['symptom_entries', 'platform_user_id'],
        ['message_log', 'platform_user_id'], ['treatment_program_instances', 'patient_user_id'],
      ];
      const on_target = {}; const left_on_duplicate = {};
      for (const [tbl, col] of tables) {
        on_target[tbl] = (await q(`SELECT count(*)::int c FROM ${tbl} WHERE ${col}=$1`, [t])).rows[0].c;
        left_on_duplicate[tbl] = (await q(`SELECT count(*)::int c FROM ${tbl} WHERE ${col}=$1`, [d])).rows[0].c;
      }
      return { on_target, left_on_duplicate, want: 'each on_target >=1, each left_on_duplicate = 0' };
    },
  },
  {
    name: 'p3_cross_org_medical_transfers_too',
    oracle: '§18 «Всё это переносится» — медицина едет на целевую учётку, оставаясь при своей организации',
    pair: ['303', '304'], expect: 'merge',
    fx: (t, d) => [note(t, ORG_X), note(d, ORG_Y), diagnosis(d, ORG_Y), symptomReal(d, ORG_Y)],
    after: async (q, t, d) => ({
      notes_on_target: (await q(`SELECT count(*)::int c FROM doctor_notes WHERE user_id=$1`, [t])).rows[0].c,
      diagnoses_on_target: (await q(`SELECT count(*)::int c FROM clinical_diagnosis WHERE patient_user_id=$1`, [t])).rows[0].c,
      symptom_orgs_on_target: (await q(`SELECT organization_id::text o FROM symptom_trackings WHERE platform_user_id=$1`, [t])).rows.map((r) => r.o),
      left_on_duplicate: (await q(`SELECT count(*)::int c FROM doctor_notes WHERE user_id=$1`, [d])).rows[0].c,
      want: 'notes 2, diagnoses 1, symptom org preserved = ORG_Y, left 0',
    }),
  },
  // ---- manual support path must not be gated ----
  {
    name: 'p5_manual_support_path_not_gated_same_org_medical',
    oracle: '§18а «Что может техподдержка: … перенести любые данные между аккаунтами в любом направлении»',
    pair: ['401', '402'], expect: 'merge', reason: 'manual',
    fx: (t, d) => [diagnosis(t, ORG_X), trauma(d, ORG_X), note(d, ORG_X)],
    after: async (q, t) => ({
      notes_on_target: (await q(`SELECT count(*)::int c FROM doctor_notes WHERE user_id=$1`, [t])).rows[0].c,
      traumas_on_target: (await q(`SELECT count(*)::int c FROM clinical_anamnesis_trauma WHERE patient_user_id=$1`, [t])).rows[0].c,
      want: 'notes 1, traumas 1',
    }),
  },
];

async function main() {
  const client = new pg.Client({ host: '/var/run/postgresql', port: 5432, database: 'bcb_webapp_dev', user: 'postgres' });
  await client.connect();
  const dbName = (await client.query('select current_database() d')).rows[0].d;
  if (dbName !== 'bcb_webapp_dev') throw new Error(`refusing to run on ${dbName}`);
  const q = (text, values) => client.query(text, values);

  const results = [];
  await q('BEGIN');
  try {
    await q(`INSERT INTO be_organizations(id,title) VALUES ($1,'audit3 org X'),($2,'audit3 org Y')`, [ORG_X, ORG_Y]);
    await q(`INSERT INTO platform_users(id,display_name,role) VALUES ($1,'audit3 doctor','doctor')`, [DOC]);

    for (const s of SCENARIOS) {
      if (filter.length && !filter.some((f) => s.name.includes(f))) continue;
      const [ts, ds] = s.pair;
      const t = uid(ts); const d = uid(ds);
      await q('SAVEPOINT sc');
      let actual; let detail = null;
      try {
        await q(`INSERT INTO platform_users(id,display_name,role) VALUES ($1,$3,'client'),($2,$4,'client')`, [t, d, `t${ts}`, `d${ds}`]);
        for (const [text, values] of s.fx(t, d)) await q(text, values);
        const reason = s.reason ?? 'phone_bind';
        const options = reason === 'manual' ? { resolution: manual(t, d) } : undefined;
        try {
          await mergePlatformUsersInTransaction(client, t, d, reason, options);
          actual = 'merge';
        } catch (e) {
          const n = e?.name ?? '';
          actual = n === 'MergeConflictError' || n === 'MergeDependentConflictError' ? 'block' : 'CRASH';
          detail = `${n || 'Error'}: ${e?.message ?? String(e)}`;
        }
        if (actual === 'merge' && s.after) detail = JSON.stringify(await s.after(q, t, d));
      } catch (e) {
        actual = 'FIXTURE_ERROR'; detail = e?.message ?? String(e);
      }
      await q('ROLLBACK TO SAVEPOINT sc');
      results.push({ name: s.name, expect: s.expect, actual, detail, oracle: s.oracle, observe: !!s.observe });
    }
  } finally {
    await q('ROLLBACK');
  }

  const residual = (await q(
    `SELECT (SELECT count(*)::int FROM platform_users WHERE id::text LIKE $1) users,
            (SELECT count(*)::int FROM be_organizations WHERE id::text LIKE $1) orgs,
            (SELECT count(*)::int FROM doctor_notes WHERE user_id::text LIKE $1) notes,
            (SELECT count(*)::int FROM patient_bookings WHERE platform_user_id::text LIKE $1) bookings`,
    [`${P}%`],
  )).rows[0];
  await client.end();

  let failed = 0;
  for (const r of results) {
    const ok = r.actual === r.expect;
    if (!ok && !r.observe) failed += 1;
    console.log(`${r.observe ? 'OBSERVE' : ok ? 'PASS   ' : 'FAIL   '} ${r.name}  expected=${r.expect} actual=${r.actual}`);
    console.log(`         oracle: ${r.oracle}`);
    if (r.detail) console.log(`         ${r.detail}`);
  }
  console.log(`\nresidual_rows_after_rollback = ${JSON.stringify(residual)}`);
  console.log(`${results.filter((r) => !r.observe).length - failed}/${results.filter((r) => !r.observe).length} graded scenarios matched the oracle`);
  process.exitCode = failed ? 1 : 0;
}

await main();
