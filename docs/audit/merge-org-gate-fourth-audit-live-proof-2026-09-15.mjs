/**
 * FOURTH independent adversarial audit of plan stage Э1 (org-scoped merge gate), head 73421587d.
 * Own id space, own fixtures, own scenarios. Imports merge engine SOURCE (not dist) and drives it
 * against named DEV inside ONE transaction that always ends in ROLLBACK (per-scenario SAVEPOINT).
 * Oracle: docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md §18/§18а/§18б + plan Э1.
 */
import pg from '/home/dev/dev-projects/bcb-wt-merge-org-gate/apps/webapp/node_modules/pg/lib/index.js';
import { mergePlatformUsersInTransaction } from '/home/dev/dev-projects/bcb-wt-merge-org-gate/packages/platform-merge/src/pgPlatformUserMerge.ts';
import { buildMergePreview } from '/home/dev/dev-projects/bcb-wt-merge-org-gate/apps/webapp/src/infra/platformUserMergePreview.ts';
import { canSubmitManualMerge } from '/home/dev/dev-projects/bcb-wt-merge-org-gate/apps/webapp/src/app/app/admin/account-merge/accountMergeLogic.ts';

if (typeof process.setuid === 'function' && process.getuid() === 0) {
  process.setgid('postgres');
  process.setuid('postgres');
}

const P = 'a4c40000-0000-4000-8000-';
const uid = (s) => `${P}${s.padStart(12, '0')}`;
const ORG_A = uid('a1');
const ORG_B = uid('b2');
const DOC_A = uid('d1');
const DOC_B = uid('d2');
const TPL_1 = uid('f1');
const SPEC_1 = uid('e1');
const filter = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const WITH_NEW_INDEX = !process.argv.includes('--old-index');

const manual = (t, d) => ({
  targetId: t,
  duplicateId: d,
  fields: { phone_normalized: 'target', display_name: 'target', first_name: 'target', last_name: 'target', email: 'target' },
  bindings: { telegram: 'both', max: 'both', vk: 'both' },
  oauth: {},
  channelPreferences: 'merge',
});

// ---- fixture builders (one per probed table; author/date varied so daily-author uq never collides)
const note = (u, org, author = DOC_A, dayOffset = 0) => [
  `INSERT INTO doctor_notes(user_id, author_id, text, organization_id, note_date)
   VALUES ($1::uuid,$2::uuid,'note',$3::uuid, CURRENT_DATE - ($4||' day')::interval)`,
  [u, author, org, String(dayOffset)],
];
const noteNullOrg = (u, author = DOC_A, dayOffset = 0) => [
  `INSERT INTO doctor_notes(user_id, author_id, text, organization_id, note_date)
   VALUES ($1::uuid,$2::uuid,'note',NULL, CURRENT_DATE - ($3||' day')::interval)`,
  [u, author, String(dayOffset)],
];
const diagnosis = (u, org) => [
  `INSERT INTO clinical_diagnosis(patient_user_id, text, organization_id) VALUES ($1::uuid,'M54.5',$2::uuid)`,
  [u, org],
];
const symptomReal = (u, org, key = 'knee_pain') => [
  `INSERT INTO symptom_trackings(user_id, platform_user_id, symptom_title, symptom_key, organization_id)
   VALUES ($1::text,$1::uuid,'колено',$2,$3::uuid)`,
  [u, key, org],
];
const symptomDiary = (u, org, key) => [
  `INSERT INTO symptom_trackings(user_id, platform_user_id, symptom_title, symptom_key, organization_id)
   VALUES ($1::text,$1::uuid,'самочувствие',$2,$3::uuid)`,
  [u, key, org],
];
const lfk = (u, org, tpl = TPL_1) => [
  `INSERT INTO patient_lfk_assignments(patient_user_id, template_id, organization_id) VALUES ($1::uuid,$2::uuid,$3::uuid)`,
  [u, tpl, org],
];
const program = (u, org, source, status, title = 'p') => [
  `INSERT INTO treatment_program_instances(patient_user_id, title, assignment_source, status, organization_id)
   VALUES ($1::uuid,$2,$3,$4,$5::uuid)`,
  [u, title, source, status, org],
];
const booking = (u, org, offsetDays) => [
  `INSERT INTO patient_bookings(id, platform_user_id, booking_type, category, slot_start, slot_end, status, contact_phone, contact_name, source, organization_id)
   VALUES (gen_random_uuid(), $1::uuid,'online','general', now() + ($2||' day')::interval, now() + ($2||' day')::interval + interval '45 min','confirmed','+79990000000','x','native',$3::uuid)`,
  [u, String(offsetDays), org],
];
const intake = (u, org) => [
  `INSERT INTO online_intake_requests(user_id, type, organization_id) VALUES ($1::uuid,'lfk',$2::uuid)`,
  [u, org],
];

const activePrograms = async (q, u) =>
  (await q(
    `SELECT organization_id::text org, assignment_source src, status, title FROM treatment_program_instances
      WHERE patient_user_id=$1 ORDER BY title, status`,
    [u],
  )).rows;

const SCENARIOS = [
  // ================= point 1: org gate across ALL probes, not just clinical_visit =================
  {
    name: 'g1_doctor_notes_different_orgs_merges',
    oracle: '§18: «медицинские данные человека в РАЗНЫХ организациях слиянию не мешают вовсе»',
    pair: ['101', '102'], expect: 'merge',
    fx: (t, d) => [note(t, ORG_A, DOC_A), note(d, ORG_B, DOC_B)],
    after: async (q, t, d) => ({
      notes_on_target: (await q(`SELECT organization_id::text o FROM doctor_notes WHERE user_id=$1 ORDER BY o`, [t])).rows.map((r) => r.o),
      notes_left_on_duplicate: (await q(`SELECT count(*)::int c FROM doctor_notes WHERE user_id=$1`, [d])).rows[0].c,
      want: 'both org rows on target, 0 left on duplicate',
    }),
  },
  {
    name: 'g2_doctor_notes_same_org_blocks',
    oracle: '§18: блокирует только конфликт медицинских данных ВНУТРИ ОДНОЙ организации',
    pair: ['103', '104'], expect: 'block',
    fx: (t, d) => [note(t, ORG_A, DOC_A), note(d, ORG_A, DOC_B)],
  },
  {
    name: 'g3_doctor_note_vs_diagnosis_same_org_blocks',
    oracle: '§18: организация протаскивается через РАЗНЫЕ пробы (заметка × карточка) внутри одной клиники',
    pair: ['105', '106'], expect: 'block',
    fx: (t, d) => [note(t, ORG_A), diagnosis(d, ORG_A)],
  },
  {
    name: 'g4_doctor_note_vs_diagnosis_different_orgs_merges',
    oracle: '§18: разные клиники — не конфликт даже при разных категориях',
    pair: ['107', '108'], expect: 'merge',
    fx: (t, d) => [note(t, ORG_A), diagnosis(d, ORG_B)],
  },
  {
    name: 'g5_program_doctor_source_same_org_blocks',
    oracle: '§18: «назначения» — блокирующая категория внутри одной организации',
    pair: ['109', '110'], expect: 'block',
    fx: (t, d) => [program(t, ORG_A, 'doctor', 'completed'), program(d, ORG_A, 'doctor', 'completed')],
  },
  {
    name: 'g6_program_doctor_source_different_orgs_merges',
    oracle: '§18: назначения в разных клиниках живут рядом',
    pair: ['111', '112'], expect: 'merge',
    fx: (t, d) => [program(t, ORG_A, 'doctor', 'completed'), program(d, ORG_B, 'doctor', 'completed')],
    after: async (q, t) => ({ programs_on_target: await activePrograms(q, t), want: 'both instances on target, orgs preserved' }),
  },
  {
    name: 'g7_promo_programs_same_org_merge_not_a_blocker',
    oracle: '§18: «отметки промо-упражнений» — не блокер (проба несёт AND assignment_source = doctor)',
    pair: ['113', '114'], expect: 'merge',
    fx: (t, d) => [program(t, ORG_A, 'promo', 'completed'), program(d, ORG_A, 'promo', 'completed')],
  },
  {
    name: 'g8_null_org_both_sides_still_blocks',
    oracle: '§18 + комментарий гейта: недостающая атрибуция клиники не имеет права РАСШИРЯТЬ слияние',
    pair: ['115', '116'], expect: 'block',
    fx: (t, d) => [noteNullOrg(t, DOC_A), noteNullOrg(d, DOC_B)],
  },
  {
    name: 'g9_null_org_vs_real_org_merges',
    oracle: '§18: неатрибутированная история и история клиники A пересечения не дают',
    pair: ['117', '118'], expect: 'merge',
    fx: (t, d) => [noteNullOrg(t, DOC_A), note(d, ORG_A, DOC_B)],
  },
  {
    name: 'g10_symptom_tracking_same_org_blocks',
    oracle: '§18: «отслеживание симптомов» — блокирующая категория внутри одной организации',
    pair: ['119', '120'], expect: 'block',
    fx: (t, d) => [symptomReal(t, ORG_A), symptomReal(d, ORG_A, 'back_pain')],
  },
  {
    name: 'g11_symptom_tracking_different_orgs_merges',
    oracle: '§18: тот же симптом-трекинг в разных клиниках слиянию не мешает',
    pair: ['121', '122'], expect: 'merge',
    fx: (t, d) => [symptomReal(t, ORG_A), symptomReal(d, ORG_B, 'back_pain')],
  },
  {
    name: 'g12_wellbeing_and_warmup_marks_never_block',
    oracle: '§18: «отметки самочувствия, отметки разминок» — НЕ блокеры ничего и никогда',
    pair: ['123', '124'], expect: 'merge',
    fx: (t, d) => [
      symptomDiary(t, ORG_A, 'general_wellbeing'), symptomDiary(t, ORG_A, 'warmup_feeling'),
      symptomDiary(d, ORG_A, 'general_wellbeing'), symptomDiary(d, ORG_A, 'warmup_feeling'),
    ],
    after: async (q, t, d) => ({
      singleton_trackings_on_target: (await q(
        `SELECT symptom_key k, count(*)::int c FROM symptom_trackings WHERE platform_user_id=$1 AND deleted_at IS NULL GROUP BY 1 ORDER BY 1`, [t])).rows,
      left_on_duplicate: (await q(`SELECT count(*)::int c FROM symptom_trackings WHERE platform_user_id=$1`, [d])).rows[0].c,
      want: 'exactly 1 live row per singleton key on target, 0 left on duplicate',
    }),
  },
  {
    name: 'g13_lfk_assignments_same_org_blocks',
    oracle: '§18: «назначенные упражнения» — блокирующая категория внутри одной организации',
    pair: ['125', '126'], expect: 'block',
    fx: (t, d) => [lfk(t, ORG_A), lfk(d, ORG_A)],
  },
  {
    name: 'g14_lfk_same_template_different_orgs_merges',
    oracle: '§18: тот же комплекс, назначенный в двух клиниках, слиянию не мешает',
    pair: ['127', '128'], expect: 'merge',
    fx: (t, d) => [lfk(t, ORG_A), lfk(d, ORG_B)],
    after: async (q, t) => ({
      lfk_on_target: (await q(`SELECT organization_id::text o, is_active FROM patient_lfk_assignments WHERE patient_user_id=$1 ORDER BY o`, [t])).rows,
      want: 'two active assignments, one per org',
    }),
  },
  {
    name: 'g15_appointments_and_intakes_never_block_and_transfer',
    oracle: '§18: «история записей на приём, заявки … Всё это переносится»',
    pair: ['129', '130'], expect: 'merge',
    fx: (t, d) => [booking(t, ORG_A, 1), booking(d, ORG_A, 1), intake(t, ORG_A), intake(d, ORG_A)],
    after: async (q, t, d) => ({
      bookings_on_target: (await q(`SELECT count(*)::int c FROM patient_bookings WHERE platform_user_id=$1`, [t])).rows[0].c,
      intakes_on_target: (await q(`SELECT count(*)::int c FROM online_intake_requests WHERE user_id=$1`, [t])).rows[0].c,
      left_on_duplicate: (await q(
        `SELECT (SELECT count(*)::int FROM patient_bookings WHERE platform_user_id=$1) b,
                (SELECT count(*)::int FROM online_intake_requests WHERE user_id=$1) i`, [d])).rows[0],
      want: 'bookings 2, intakes 2, nothing left on duplicate (overlapping slots do NOT block)',
    }),
  },

  // ================= point 3: reconcileActiveTreatmentProgramInstancesForMerge =================
  {
    name: 'r1_auto_two_active_doctor_programs_different_orgs_merge_and_both_stay_active',
    oracle: 'план Э1 + §18: две клиники со своими назначениями — нормальное состояние',
    pair: ['201', '202'], expect: 'merge',
    fx: (t, d) => [program(t, ORG_A, 'doctor', 'active', 'A'), program(d, ORG_B, 'doctor', 'active', 'B')],
    after: async (q, t) => ({ programs_on_target: await activePrograms(q, t), want: 'A active in ORG_A, B active in ORG_B' }),
  },
  {
    name: 'r2_auto_two_active_course_programs_same_org_blocks_in_reconcile',
    oracle: '§18: две активные программы в ОДНОЙ клинике — конфликт (проба гейта не покрывает source=course, ловит reconcile)',
    pair: ['203', '204'], expect: 'block',
    fx: (t, d) => [program(t, ORG_A, 'course', 'active', 'A'), program(d, ORG_A, 'course', 'active', 'B')],
  },
  {
    name: 'r3_auto_two_active_course_programs_different_orgs_merge',
    oracle: 'план Э1: reconcile режет по организации',
    pair: ['205', '206'], expect: 'merge',
    fx: (t, d) => [program(t, ORG_A, 'course', 'active', 'A'), program(d, ORG_B, 'course', 'active', 'B')],
    after: async (q, t) => ({ programs_on_target: await activePrograms(q, t), want: 'both still active, one per org' }),
  },
  {
    name: 'r4_manual_two_active_doctor_programs_same_org_what_happens',
    oracle: '§18а «техподдержка … перенести любые данные»; §18 «медицина не смешивается»',
    pair: ['207', '208'], expect: 'merge', reason: 'manual',
    after: async (q, t) => ({ programs_on_target: await activePrograms(q, t), want: 'OBSERVE what manual did to the duplicate active doctor program' }),
    fx: (t, d) => [program(t, ORG_A, 'doctor', 'active', 'A-target'), program(d, ORG_A, 'doctor', 'active', 'B-duplicate')],
  },
  {
    name: 'r5_manual_two_active_doctor_programs_different_orgs_both_survive',
    oracle: '§18: медицина остаётся при своей организации',
    pair: ['209', '210'], expect: 'merge', reason: 'manual',
    fx: (t, d) => [program(t, ORG_A, 'doctor', 'active', 'A-target'), program(d, ORG_B, 'doctor', 'active', 'B-duplicate')],
    after: async (q, t) => ({ programs_on_target: await activePrograms(q, t), want: 'both active, one per org — nothing closed' }),
  },
  {
    name: 'r6_auto_promo_vs_doctor_same_org_closes_promo_only',
    oracle: 'промо — платформенный дефолт, он уступает назначению врача внутри клиники',
    pair: ['211', '212'], expect: 'merge',
    fx: (t, d) => [program(t, ORG_A, 'promo', 'active', 'A-promo'), program(d, ORG_A, 'doctor', 'active', 'B-doctor')],
    after: async (q, t) => ({ programs_on_target: await activePrograms(q, t), want: 'promo completed, doctor program stays active' }),
  },
  {
    name: 'r7_auto_promo_vs_doctor_different_orgs_nothing_closed',
    oracle: 'план Э1: разрез по организации — промо другой клиники не трогаем',
    pair: ['213', '214'], expect: 'merge',
    fx: (t, d) => [program(t, ORG_A, 'promo', 'active', 'A-promo'), program(d, ORG_B, 'doctor', 'active', 'B-doctor')],
    after: async (q, t) => ({ programs_on_target: await activePrograms(q, t), want: 'BOTH stay active — promo of org A untouched' }),
  },
  {
    name: 'r8_auto_two_org_pairs_at_once_each_pair_reconciled',
    oracle: 'план Э1: reconcile обязан обработать ВСЕ пары, не первую (r.rows[0] в прежней версии)',
    pair: ['215', '216'], expect: 'merge',
    fx: (t, d) => [
      program(t, ORG_A, 'promo', 'active', 'A-promo-t'), program(d, ORG_A, 'course', 'active', 'A-course-d'),
      program(t, ORG_B, 'course', 'active', 'B-course-t'), program(d, ORG_B, 'promo', 'active', 'B-promo-d'),
    ],
    after: async (q, t) => ({ programs_on_target: await activePrograms(q, t), want: 'exactly one active per org; both promos completed' }),
  },
  {
    name: 'r9_no_orphan_active_left_on_duplicate',
    oracle: 'после слияния на дубликате не остаётся НИ ОДНОЙ строки программ',
    pair: ['217', '218'], expect: 'merge', reason: 'manual',
    fx: (t, d) => [
      program(t, ORG_A, 'doctor', 'active', 'A-t'),
      program(d, ORG_A, 'doctor', 'active', 'A-d'), program(d, ORG_B, 'promo', 'active', 'B-d'),
    ],
    after: async (q, t, d) => ({
      left_on_duplicate: (await q(`SELECT count(*)::int c FROM treatment_program_instances WHERE patient_user_id=$1`, [d])).rows[0].c,
      programs_on_target: await activePrograms(q, t),
      want: '0 left on duplicate; at most one active per org on target',
    }),
  },

  // ================= point 5: manual/support path stays ungated, preview + console button =======
  {
    name: 'p5_manual_merges_through_same_org_medical_conflict',
    oracle: '§18а «Что может техподдержка: … перенести любые данные между аккаунтами в любом направлении»',
    pair: ['301', '302'], expect: 'merge', reason: 'manual', previewMustAllow: true,
    fx: (t, d) => [note(t, ORG_A, DOC_A), note(d, ORG_A, DOC_B), diagnosis(t, ORG_A), diagnosis(d, ORG_A), symptomReal(t, ORG_A), symptomReal(d, ORG_A, 'back_pain')],
    after: async (q, t, d) => ({
      notes_on_target: (await q(`SELECT count(*)::int c FROM doctor_notes WHERE user_id=$1`, [t])).rows[0].c,
      diagnoses_on_target: (await q(`SELECT count(*)::int c FROM clinical_diagnosis WHERE patient_user_id=$1`, [t])).rows[0].c,
      left_on_duplicate: (await q(`SELECT count(*)::int c FROM doctor_notes WHERE user_id=$1`, [d])).rows[0].c,
      want: 'notes 2, diagnoses 2, 0 left on duplicate',
    }),
  },
  {
    name: 'p5_preview_and_console_button_allow_overlapping_bookings',
    oracle: 'Д2 прошлого аудита: движок сливает пересекающиеся записи — экран поддержки не имеет права гасить кнопку',
    pair: ['303', '304'], expect: 'merge', reason: 'manual', previewMustAllow: true,
    fx: (t, d) => [booking(t, ORG_A, 2), booking(d, ORG_A, 2), lfk(t, ORG_A), lfk(d, ORG_A),
      program(t, ORG_A, 'doctor', 'active', 'A-t'), program(d, ORG_A, 'doctor', 'active', 'A-d')],
  },
  {
    name: 'p5_auto_path_still_blocked_on_the_same_fixture',
    oracle: 'тот же набор данных на АВТОМАТИЧЕСКОМ пути обязан блокироваться (§18)',
    pair: ['305', '306'], expect: 'block',
    fx: (t, d) => [booking(t, ORG_A, 2), booking(d, ORG_A, 2), lfk(t, ORG_A), lfk(d, ORG_A),
      program(t, ORG_A, 'doctor', 'active', 'A-t'), program(d, ORG_A, 'doctor', 'active', 'A-d')],
  },
  // ============ point 5 (attack): can support ALWAYS merge, or does the engine crash? ==========
  {
    name: 'm1_manual_same_author_same_day_doctor_notes_same_org',
    oracle: '§18а «техподдержка … перенести любые данные»: ручной путь обязан довести слияние, а не упасть',
    pair: ['401', '402'], expect: 'merge', reason: 'manual',
    fx: (t, d) => [note(t, ORG_A, DOC_A, 0), note(d, ORG_A, DOC_A, 0)],
    after: async (q, t) => ({ notes_on_target: (await q(`SELECT count(*)::int c FROM doctor_notes WHERE user_id=$1`, [t])).rows[0].c, want: '2' }),
  },
  {
    name: 'm2_manual_both_sides_have_active_phone_history',
    oracle: '§18а: ручной путь обязан довести слияние даже когда у обеих сторон живая история телефона',
    pair: ['403', '404'], expect: 'merge', reason: 'manual',
    fx: (t, d) => [
      [`INSERT INTO user_phone_history(platform_user_id, phone_normalized, source) VALUES ($1::uuid,'+79990000401','otp')`, [t]],
      [`INSERT INTO user_phone_history(platform_user_id, phone_normalized, source) VALUES ($1::uuid,'+79990000402','otp')`, [d]],
    ],
    after: async (q, t) => ({ history_on_target: (await q(`SELECT count(*)::int c FROM user_phone_history WHERE platform_user_id=$1`, [t])).rows[0].c, want: '2' }),
  },
  {
    name: 'm3_auto_both_sides_have_active_phone_history',
    oracle: 'тот же вход на АВТОМАТИЧЕСКОМ пути (привязка телефона через мессенджер — горячий путь)',
    pair: ['405', '406'], expect: 'merge',
    fx: (t, d) => [
      [`INSERT INTO user_phone_history(platform_user_id, phone_normalized, source) VALUES ($1::uuid,'+79990000405','otp')`, [t]],
      [`INSERT INTO user_phone_history(platform_user_id, phone_normalized, source) VALUES ($1::uuid,'+79990000406','otp')`, [d]],
    ],
    after: async (q, t) => ({ history_on_target: (await q(`SELECT count(*)::int c FROM user_phone_history WHERE platform_user_id=$1`, [t])).rows[0].c, want: '2' }),
  },
  {
    name: 'm4_manual_same_specialist_active_link_both_sides',
    oracle: '§18а: перенос связей со специалистом не имеет права падать на уникальном индексе',
    pair: ['407', '408'], expect: 'merge', reason: 'manual',
    fx: (t, d) => [
      [`INSERT INTO patient_specialist_links(organization_id, patient_user_id, specialist_id, status, created_via) VALUES ($1::uuid,$2::uuid,$3::uuid,'active','manual_assign')`, [ORG_A, t, SPEC_1]],
      [`INSERT INTO patient_specialist_links(organization_id, patient_user_id, specialist_id, status, created_via) VALUES ($1::uuid,$2::uuid,$3::uuid,'active','manual_assign')`, [ORG_A, d, SPEC_1]],
    ],
    after: async (q, t) => ({ links_on_target: (await q(`SELECT organization_id::text o, status FROM patient_specialist_links WHERE patient_user_id=$1 ORDER BY o`, [t])).rows, want: 'both rows moved; only one stays active' }),
  },
  {
    name: 'm5_cross_org_medical_pair_with_live_phone_history_is_the_canon_case',
    oracle: '§18: «медицинские данные … в РАЗНЫХ организациях слиянию не мешают вовсе» + план Э1: такая пара ДОЛЖНА слиться',
    pair: ['409', '410'], expect: 'merge',
    fx: (t, d) => [
      note(t, ORG_A, DOC_A), note(d, ORG_B, DOC_B),
      [`INSERT INTO user_phone_history(platform_user_id, phone_normalized, source) VALUES ($1::uuid,'+79990000409','otp')`, [t]],
      [`INSERT INTO user_phone_history(platform_user_id, phone_normalized, source) VALUES ($1::uuid,'+79990000410','otp')`, [d]],
    ],
    after: async (q, t) => ({ history_on_target: (await q(`SELECT count(*)::int c FROM user_phone_history WHERE platform_user_id=$1`, [t])).rows[0].c, want: '2' }),
  },
];

async function main() {
  const client = new pg.Client({ host: '/var/run/postgresql', port: 5432, database: 'bcb_webapp_dev', user: 'postgres' });
  await client.connect();
  const dbName = (await client.query('select current_database() d')).rows[0].d;
  if (dbName !== 'bcb_webapp_dev') throw new Error(`refusing to run on ${dbName}`);
  const q = (text, values) => client.query(text, values);
  let tail = Promise.resolve();
  const previewPool = {
    query: (text, values) => {
      const pending = tail.then(() => client.query(text, values));
      tail = pending.then(() => undefined, () => undefined);
      return pending;
    },
  };

  const results = [];
  await q('BEGIN');
  try {
    if (WITH_NEW_INDEX) {
      await q('DROP INDEX public.uq_treatment_program_instances_one_active_per_patient');
      await q(`CREATE UNIQUE INDEX uq_treatment_program_instances_one_active_per_patient
        ON public.treatment_program_instances (organization_id, patient_user_id) NULLS NOT DISTINCT
        WHERE status = 'active'::text`);
    }
    await q(`INSERT INTO be_organizations(id,title) VALUES ($1,'a4 org A'),($2,'a4 org B')`, [ORG_A, ORG_B]);
    await q(`INSERT INTO platform_users(id,display_name,role) VALUES ($1,'a4 doc A','doctor'),($2,'a4 doc B','doctor')`, [DOC_A, DOC_B]);
    await q(`INSERT INTO lfk_complex_templates(id,title,status,owner_kind,organization_id) VALUES ($1,'a4 tpl','published','platform',NULL)`, [TPL_1]);
    await q(`INSERT INTO be_specialists(id,organization_id,full_name) VALUES ($1,$2,'a4 spec')`, [SPEC_1, ORG_A]);

    for (const s of SCENARIOS) {
      if (filter.length && !filter.some((f) => s.name.includes(f))) continue;
      const [ts, ds] = s.pair;
      const t = uid(ts);
      const d = uid(ds);
      await q('SAVEPOINT sc');
      let actual;
      let detail = null;
      try {
        await q(`INSERT INTO platform_users(id,display_name,role) VALUES ($1,$3,'client'),($2,$4,'client')`, [t, d, `t${ts}`, `d${ds}`]);
        for (const [text, values] of s.fx(t, d)) await q(text, values);
        if (s.previewMustAllow) {
          const preview = await buildMergePreview(previewPool, t, d);
          if (!preview.ok || !preview.mergeAllowed || preview.hardBlockers.length > 0) {
            throw new Error(`support preview blocked: ${JSON.stringify(preview.hardBlockers ?? preview)}`);
          }
          if (!canSubmitManualMerge(preview, manual(t, d))) throw new Error('console merge button stayed disabled');
        }
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
        actual = 'FIXTURE_ERROR';
        detail = e?.message ?? String(e);
      }
      await q('ROLLBACK TO SAVEPOINT sc');
      results.push({ name: s.name, expect: s.expect, actual, detail, oracle: s.oracle });
    }
  } finally {
    await q('ROLLBACK');
  }

  const residual = (await q(
    `SELECT (SELECT count(*)::int FROM platform_users WHERE id::text LIKE $1) users,
            (SELECT count(*)::int FROM be_organizations WHERE id::text LIKE $1) orgs,
            (SELECT count(*)::int FROM doctor_notes WHERE user_id::text LIKE $1) notes,
            (SELECT count(*)::int FROM treatment_program_instances WHERE patient_user_id::text LIKE $1) programs,
            (SELECT count(*)::int FROM patient_bookings WHERE platform_user_id::text LIKE $1) bookings`,
    [`${P}%`])).rows[0];
  const liveIndex = (await q(
    `SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='uq_treatment_program_instances_one_active_per_patient'`)).rows[0].indexdef;
  await client.end();

  let failed = 0;
  for (const r of results) {
    const ok = r.actual === r.expect;
    if (!ok) failed += 1;
    console.log(`${ok ? 'PASS   ' : 'FAIL   '} ${r.name}  expected=${r.expect} actual=${r.actual}`);
    console.log(`         oracle: ${r.oracle}`);
    if (r.detail) console.log(`         ${r.detail}`);
  }
  console.log(`\nindex_on_dev_after_rollback = ${liveIndex}`);
  console.log(`residual_rows_after_rollback = ${JSON.stringify(residual)}`);
  console.log(`${results.length - failed}/${results.length} scenarios matched the oracle`);
  process.exitCode = failed ? 1 : 0;
}

await main();
