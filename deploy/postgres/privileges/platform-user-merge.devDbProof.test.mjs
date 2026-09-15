/**
 * Live acceptance proof for the platform-user merge engine on a named DEV/TEST database.
 * Opt-in only: without RUN_PLATFORM_USER_MERGE_DB=1 this file is skipped and never opens a DB.
 *
 * Named expensive and silent failure: two unattributed medical histories are silently merged,
 * making different people's personal medical data one account without an operator noticing.
 * The oracle is AUTH_AND_IDENTITY_CANON.md §18 and plan stage Э1, not the SQL implementation.
 *
 * Run on DEV (the whole proof is one transaction and always ends with ROLLBACK):
 *   sudo -n bash -lc 'cd /home/dev/dev-projects/bcb-wt-merge-org-gate && \
 *     RUN_PLATFORM_USER_MERGE_DB=1 exec apps/webapp/node_modules/.bin/tsx --test \
 *     deploy/postgres/privileges/platform-user-merge.devDbProof.test.mjs'
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ENABLED = process.env.RUN_PLATFORM_USER_MERGE_DB === '1';
const DATABASE = process.env.PLATFORM_USER_MERGE_PROOF_DB ?? 'bcb_webapp_dev';
const ALLOWED_DATABASES = new Set(['bcb_webapp_dev', 'bersoncarebot_test']);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');

// Единственное место, где названы движок и его вход: и живая проба ниже, и гейт связи
// («proof stays bound…») берут путь и имя отсюда, поэтому разъехаться они не могут.
const ENGINE_RELATIVE_PATH = 'packages/platform-merge/src/pgPlatformUserMerge.ts';
const ENGINE_MERGE_EXPORT = 'mergePlatformUsersInTransaction';
const enginePath = path.join(repoRoot, ...ENGINE_RELATIVE_PATH.split('/'));
const prefix = 'a5e10000-0000-4000-8000-';
const uid = (suffix) => `${prefix}${suffix.padStart(12, '0')}`;
const ORG_A = uid('1');
const ORG_B = uid('2');
const DOCTOR = uid('3');

const manualResolution = (targetId, duplicateId) => ({
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
});

const note = (userId, organizationId, authorId = DOCTOR) => [
  `INSERT INTO doctor_notes (user_id, author_id, text, organization_id, note_date)
   VALUES ($1::uuid, $2::uuid, $3, $4::uuid, DATE '2026-09-15')`,
  [userId, authorId, `note-${userId.slice(-3)}`, organizationId],
];

const nullOrgNote = (userId, authorId) => [
  `INSERT INTO doctor_notes (user_id, author_id, text, organization_id, note_date)
   VALUES ($1::uuid, $2::uuid, $3, NULL, DATE '2026-09-15')`,
  [userId, authorId, `note-${userId.slice(-3)}`],
];

const program = (userId, organizationId, source, title, status = 'active') => [
  `INSERT INTO treatment_program_instances
     (patient_user_id, title, assignment_source, status, organization_id)
   VALUES ($1::uuid, $2, $3, $5, $4::uuid)`,
  [userId, title, source, organizationId, status],
];

const phoneHistory = (userId, phone) => [
  `INSERT INTO user_phone_history (platform_user_id, phone_normalized, source)
   VALUES ($1::uuid, $2, 'otp')`,
  [userId, phone],
];

const channelPreference = (userId, channel, preferred, updatedAt) => [
  `INSERT INTO user_channel_preferences
     (user_id, platform_user_id, channel_code, is_preferred_for_auth, updated_at)
   VALUES ($1::text, $1::uuid, $2, $3, $4::timestamptz)`,
  [userId, channel, preferred, updatedAt],
];

const nativePush = (userId, installationHash) => [
  `INSERT INTO native_push_targets
     (user_id, app_id, provider, installation_id_hash, token_hash, token_ciphertext, token_key_id)
   VALUES ($1::uuid, 'therapygo', 'fcm', $2, 'shared-token', 'ciphertext', 'key-1')`,
  [userId, installationHash],
];

const openAttemptFixtures = (targetId, duplicateId) => {
  const instanceId = uid('901');
  const stageId = uid('902');
  const itemId = uid('903');
  const targetAttemptId = uid('904');
  const duplicateAttemptId = uid('905');
  const testA = uid('906');
  const testB = uid('907');
  return [
    [
      `INSERT INTO treatment_program_instances
         (id, organization_id, patient_user_id, title, status, assignment_source)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'attempt proof', 'active', 'promo')`,
      [instanceId, ORG_A, targetId],
    ],
    [
      `INSERT INTO treatment_program_instance_stages
         (id, organization_id, instance_id, title, status)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'proof stage', 'available')`,
      [stageId, ORG_A, instanceId],
    ],
    [
      `INSERT INTO treatment_program_instance_stage_items
         (id, organization_id, stage_id, item_type, item_ref_id, snapshot)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'clinical_test', $4::uuid, '{}'::jsonb)`,
      [itemId, ORG_A, stageId, testA],
    ],
    [
      `INSERT INTO tests (id, owner_kind, organization_id, title)
       VALUES ($1::uuid, 'organization', $3::uuid, 'proof test A'),
              ($2::uuid, 'organization', $3::uuid, 'proof test B')`,
      [testA, testB, ORG_A],
    ],
    [
      `INSERT INTO test_attempts (id, organization_id, instance_stage_item_id, patient_user_id)
       VALUES ($1::uuid, $3::uuid, $4::uuid, $5::uuid),
              ($2::uuid, $3::uuid, $4::uuid, $6::uuid)`,
      [targetAttemptId, duplicateAttemptId, ORG_A, itemId, targetId, duplicateId],
    ],
    [
      `INSERT INTO test_results
         (organization_id, attempt_id, test_id, raw_value, normalized_decision)
       VALUES ($1::uuid, $2::uuid, $4::uuid, '{"source":"target"}'::jsonb, 'passed'),
              ($1::uuid, $3::uuid, $5::uuid, '{"source":"duplicate"}'::jsonb, 'partial')`,
      [ORG_A, targetAttemptId, duplicateAttemptId, testA, testB],
    ],
  ];
};


const TEMPLATE_A = uid('921');
const TEMPLATE_B = uid('922');
const WELLBEING_TARGET_TRACKING = uid('923');
const WELLBEING_DUPLICATE_TRACKING = uid('924');

const lfkTemplates = () => [
  [
    `INSERT INTO lfk_complex_templates (id, title, organization_id)
     VALUES ($1::uuid, 'merge proof template A', $3::uuid),
            ($2::uuid, 'merge proof template B', $3::uuid)`,
    [TEMPLATE_A, TEMPLATE_B, ORG_A],
  ],
];

const wellbeingDiary = (userId, trackingId, value) => [
  [
    `INSERT INTO symptom_trackings
       (id, user_id, platform_user_id, organization_id, symptom_key, symptom_title)
     VALUES ($1::uuid, $2::text, $2::uuid, $3::uuid, 'general_wellbeing', 'Самочувствие')`,
    [trackingId, userId, ORG_A],
  ],
  [
    `INSERT INTO symptom_entries
       (user_id, platform_user_id, organization_id, tracking_id, value_0_10, entry_type, recorded_at, source)
     VALUES ($1::text, $1::uuid, $2::uuid, $3::uuid, $4, 'daily', now(), 'webapp')`,
    [userId, ORG_A, trackingId, value],
  ],
];

/**
 * Приёмочная строка Э1: «две учётки с назначениями в ОДНОЙ клинике не сливаются». Канон §18
 * называет блокирующие категории поимённо, и гейт держит десять таблиц — по одному сценарию на
 * каждую: одна строка ЭТОЙ категории у обеих сторон внутри ОДНОЙ организации обязана остановить
 * автоматический путь. Вынос категории из блокирующего списка законен по типам (пятый аудит,
 * Н1) и до этих сценариев оставлял пробу зелёной; теперь такой вынос красит ровно её сценарий:
 * блок превращается в молчаливое слияние. Фикстуры независимы от списка в движке — они названы
 * здесь, поэтому сокращение списка не сокращает проверку.
 */
const BLOCKING_CATEGORY_FIXTURES = [
  {
    table: 'clinical_visit',
    rows: (userId) => [
      [
        `INSERT INTO clinical_visit (patient_user_id, organization_id, visit_type, visited_at, created_by)
         VALUES ($1::uuid, $2::uuid, 'first', now(), $3::uuid)`,
        [userId, ORG_A, DOCTOR],
      ],
    ],
  },
  {
    table: 'clinical_complaint',
    rows: (userId) => [
      [
        `INSERT INTO clinical_complaint (patient_user_id, organization_id, text)
         VALUES ($1::uuid, $2::uuid, 'боль в колене')`,
        [userId, ORG_A],
      ],
    ],
  },
  {
    table: 'clinical_diagnosis',
    rows: (userId) => [
      [
        `INSERT INTO clinical_diagnosis (patient_user_id, organization_id, text)
         VALUES ($1::uuid, $2::uuid, 'гонартроз')`,
        [userId, ORG_A],
      ],
    ],
  },
  {
    table: 'clinical_anamnesis_trauma',
    rows: (userId) => [
      [
        `INSERT INTO clinical_anamnesis_trauma
           (patient_user_id, organization_id, year, what, type, created_by)
         VALUES ($1::uuid, $2::uuid, '2019', 'перелом', 'спорт', $3::uuid)`,
        [userId, ORG_A, DOCTOR],
      ],
    ],
  },
  {
    table: 'clinical_anamnesis_illness',
    rows: (userId) => [
      [
        `INSERT INTO clinical_anamnesis_illness
           (patient_user_id, organization_id, period, what, created_by)
         VALUES ($1::uuid, $2::uuid, '2020', 'бронхит', $3::uuid)`,
        [userId, ORG_A, DOCTOR],
      ],
    ],
  },
  {
    table: 'clinical_anamnesis_lifestyle',
    rows: (userId) => [
      [
        `INSERT INTO clinical_anamnesis_lifestyle
           (patient_user_id, organization_id, record_date, text, created_by)
         VALUES ($1::uuid, $2::uuid, '2026-09-15', 'сидячая работа', $3::uuid)`,
        [userId, ORG_A, DOCTOR],
      ],
    ],
  },
  {
    table: 'doctor_notes',
    rows: (userId, side) => [note(userId, ORG_A, side === 'target' ? DOCTOR : uid('4'))],
  },
  {
    table: 'symptom_trackings',
    rows: (userId) => [
      [
        `INSERT INTO symptom_trackings (user_id, platform_user_id, organization_id, symptom_title)
         VALUES ($1::text, $1::uuid, $2::uuid, 'колено')`,
        [userId, ORG_A],
      ],
    ],
  },
  {
    // Разные шаблоны у сторон: совпадающий шаблон остановил бы автоматический путь и без гейта
    // (`reconcilePatientLfkAssignmentsForMerge`), и сценарий перестал бы быть двоичным.
    table: 'patient_lfk_assignments',
    setup: lfkTemplates,
    rows: (userId, side) => [
      [
        `INSERT INTO patient_lfk_assignments (patient_user_id, organization_id, template_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid)`,
        [userId, ORG_A, side === 'target' ? TEMPLATE_A : TEMPLATE_B],
      ],
    ],
  },
  {
    // Пройденные программы, а не активные: активные у обеих сторон автоматический путь
    // останавливает и без гейта (`reconcileActiveTreatmentProgramInstancesForMerge`), и сценарий
    // перестал бы быть двоичным. Гейт §18 шире той двери — он держит и ИСТОРИЮ назначений врача
    // внутри одной клиники, которую reconcile не смотрит вовсе.
    table: 'treatment_program_instances',
    rows: (userId, side) => [
      program(userId, ORG_A, 'doctor', `${side}-doctor-program`, 'completed'),
    ],
  },
];

const blockingCategoryScenarios = BLOCKING_CATEGORY_FIXTURES.map((category, index) => ({
  name: `same-organization ${category.table} blocks automatic merge`,
  pair: [String(201 + index * 2), String(202 + index * 2)],
  expected: 'block',
  fixtures: (targetId, duplicateId) => [
    ...(category.setup?.() ?? []),
    ...category.rows(targetId, 'target'),
    ...category.rows(duplicateId, 'duplicate'),
  ],
}));

const scenarios = [
  ...blockingCategoryScenarios,
  {
    name: 'different-organization doctor notes merge',
    pair: ['103', '104'],
    expected: 'merge',
    fixtures: (targetId, duplicateId) => [
      note(targetId, ORG_A),
      note(duplicateId, ORG_B, uid('4')),
    ],
    verify: async (query, targetId, duplicateId) => {
      const result = await query(
        `SELECT count(*)::int AS target_count,
                count(*) FILTER (WHERE user_id = $2::uuid)::int AS duplicate_count
           FROM doctor_notes
          WHERE user_id = ANY($1::uuid[])`,
        [[targetId, duplicateId], duplicateId],
      );
      assert.deepEqual(result.rows[0], { target_count: 2, duplicate_count: 0 });
    },
  },
  {
    name: 'two unattributed medical histories block automatic merge',
    pair: ['105', '106'],
    expected: 'block',
    fixtures: (targetId, duplicateId) => [
      nullOrgNote(targetId, DOCTOR),
      nullOrgNote(duplicateId, uid('4')),
    ],
  },
  {
    // Смешанная пара: одна сторона — легаси-заметка доSaaS-эпохи (`organization_id IS NULL`),
    // другая уже атрибутирована ORG_A. Легаси-строка ФАКТИЧЕСКИ принадлежит какой-то клинике, мы
    // просто не знаем какой, и по §18 это медицинские данные с обеих сторон внутри одной
    // организации. Названный дорогой и молчаливый отказ: сравнение, считающее NULL совпадающим
    // только с NULL, пропускает такую пару в автоматическое слияние — медкарты двух разных людей
    // становятся одной учёткой, и оператор об этом не узнаёт. Сценарий отдельный от NULL/NULL
    // именно потому, что тот зелёный и при узком сравнении.
    name: 'legacy unattributed history blocks merge against an attributed organization',
    pair: ['121', '122'],
    expected: 'block',
    fixtures: (targetId, duplicateId) => [
      nullOrgNote(targetId, DOCTOR),
      note(duplicateId, ORG_A, uid('4')),
    ],
  },
  {
    name: 'manual merge consolidates same-author same-day doctor notes',
    pair: ['107', '108'],
    expected: 'merge',
    reason: 'manual',
    fixtures: (targetId, duplicateId) => [note(targetId, ORG_A), note(duplicateId, ORG_A)],
    verify: async (query, targetId, duplicateId) => {
      const result = await query(
        `SELECT user_id::text, text
           FROM doctor_notes
          WHERE user_id = ANY($1::uuid[])`,
        [[targetId, duplicateId]],
      );
      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].user_id, targetId);
      assert.match(result.rows[0].text, /note-107/u);
      assert.match(result.rows[0].text, /note-108/u);
    },
  },
  {
    name: 'cross-organization active programs keep their organization boundary',
    pair: ['109', '110'],
    expected: 'merge',
    fixtures: (targetId, duplicateId) => [
      program(targetId, ORG_A, 'promo', 'org-a-promo'),
      program(duplicateId, ORG_B, 'doctor', 'org-b-doctor'),
    ],
    verify: async (query, targetId) => {
      const result = await query(
        `SELECT organization_id::text, status
           FROM treatment_program_instances
          WHERE patient_user_id = $1::uuid
          ORDER BY organization_id`,
        [targetId],
      );
      assert.deepEqual(result.rows, [
        { organization_id: ORG_A, status: 'active' },
        { organization_id: ORG_B, status: 'active' },
      ]);
    },
  },
  {
    name: 'canonical cross-organization notes merge with two active phone histories',
    pair: ['111', '112'],
    expected: 'merge',
    fixtures: (targetId, duplicateId) => [
      note(targetId, ORG_A),
      note(duplicateId, ORG_B, uid('4')),
      phoneHistory(targetId, '+79995000111'),
      phoneHistory(duplicateId, '+79995000112'),
    ],
    verify: async (query, targetId, duplicateId) => {
      const history = await query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE valid_to IS NULL)::int AS active,
                count(*) FILTER (WHERE platform_user_id = $2::uuid)::int AS duplicate_rows
           FROM user_phone_history
          WHERE platform_user_id = ANY($1::uuid[])`,
        [[targetId, duplicateId], duplicateId],
      );
      assert.deepEqual(history.rows[0], { total: 2, active: 1, duplicate_rows: 0 });
      const merged = await query(
        'SELECT merged_into_id::text FROM platform_users WHERE id = $1::uuid',
        [duplicateId],
      );
      assert.equal(merged.rows[0]?.merged_into_id, targetId);
    },
  },
  {
    name: 'manual merge keeps one preferred auth channel across different channels',
    pair: ['113', '114'],
    expected: 'merge',
    reason: 'manual',
    fixtures: (targetId, duplicateId) => [
      channelPreference(targetId, 'telegram', true, '2026-09-14T00:00:00Z'),
      channelPreference(duplicateId, 'max', true, '2026-09-15T00:00:00Z'),
    ],
    verify: async (query, targetId, duplicateId) => {
      const result = await query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE is_preferred_for_auth)::int AS preferred,
                max(channel_code) FILTER (WHERE is_preferred_for_auth) AS preferred_channel,
                count(*) FILTER (WHERE user_id = $2::text OR platform_user_id = $2::uuid)::int
                  AS duplicate_rows
           FROM user_channel_preferences
          WHERE user_id = ANY($1::text[]) OR platform_user_id = ANY($1::uuid[])`,
        [[targetId, duplicateId], duplicateId],
      );
      assert.deepEqual(result.rows[0], {
        total: 2,
        preferred: 1,
        preferred_channel: 'max',
        duplicate_rows: 0,
      });
    },
  },
  {
    name: 'manual merge deduplicates the same native push token',
    pair: ['115', '116'],
    expected: 'merge',
    reason: 'manual',
    fixtures: (targetId, duplicateId) => [
      nativePush(targetId, 'target-installation'),
      nativePush(duplicateId, 'duplicate-installation'),
    ],
    verify: async (query, targetId, duplicateId) => {
      const result = await query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE user_id = $2::uuid)::int AS duplicate_rows
           FROM native_push_targets
          WHERE user_id = ANY($1::uuid[])`,
        [[targetId, duplicateId], duplicateId],
      );
      assert.deepEqual(result.rows[0], { total: 1, duplicate_rows: 0 });
    },
  },
  {
    name: 'manual merge consolidates colliding open test attempts without losing results',
    pair: ['117', '118'],
    expected: 'merge',
    reason: 'manual',
    fixtures: openAttemptFixtures,
    verify: async (query, targetId, duplicateId) => {
      const result = await query(
        `SELECT count(DISTINCT attempt.id)::int AS attempts,
                count(result.id)::int AS results,
                count(*) FILTER (WHERE attempt.patient_user_id = $2::uuid)::int AS duplicate_rows
           FROM test_attempts attempt
           LEFT JOIN test_results result ON result.attempt_id = attempt.id
          WHERE attempt.patient_user_id = ANY($1::uuid[])`,
        [[targetId, duplicateId], duplicateId],
      );
      assert.deepEqual(result.rows[0], { attempts: 1, results: 2, duplicate_rows: 0 });
    },
  },
  {
    name: 'manual merge reconciles same-organization active doctor programs',
    pair: ['119', '120'],
    expected: 'merge',
    reason: 'manual',
    fixtures: (targetId, duplicateId) => [
      program(targetId, ORG_A, 'doctor', 'target-doctor-program'),
      program(duplicateId, ORG_A, 'doctor', 'duplicate-doctor-program'),
    ],
    verify: async (query, targetId, duplicateId) => {
      const result = await query(
        `SELECT array_agg(status ORDER BY status)::text[] AS statuses,
                count(*) FILTER (WHERE patient_user_id = $2::uuid)::int AS duplicate_rows
           FROM treatment_program_instances
          WHERE patient_user_id = ANY($1::uuid[])`,
        [[targetId, duplicateId], duplicateId],
      );
      assert.deepEqual(result.rows[0], {
        statuses: ['active', 'completed'],
        duplicate_rows: 0,
      });
    },
  },
  {
    // Пятый аудит, Н2: из десяти непокрытых уникальных индексов ТИХИЙ класс здесь один.
    // Дневник самочувствия — синглтон на учётку (`uq_symptom_trackings_general_wellbeing_active_
    // platform_user`), поэтому перед переносом дубликатный дневник гасится (`deleted_at`), а его
    // отметки переподвешиваются на дневник выжившего. Потеряется переподвешивание — база смолчит
    // (гашение снимает коллизию, 23505 не будет), а отметки останутся висеть на погашенном
    // дневнике: КАЖДЫЙ читатель отметок в продукте джойнит `symptom_trackings … deleted_at IS NULL`
    // (`apps/webapp/src/infra/repos/pgSymptomDiary.ts`), то есть история самочувствия человека
    // исчезает из приложения целиком и молча. Утверждение ниже смотрит ровно этим предикатом
    // видимости, а не наличием строк в таблице.
    name: 'wellbeing diary entries stay visible after singleton tracking dedup',
    pair: ['221', '222'],
    expected: 'merge',
    fixtures: (targetId, duplicateId) => [
      ...wellbeingDiary(targetId, WELLBEING_TARGET_TRACKING, 7),
      ...wellbeingDiary(duplicateId, WELLBEING_DUPLICATE_TRACKING, 3),
    ],
    verify: async (query, targetId, duplicateId) => {
      const visible = await query(
        `SELECT count(*)::int AS visible_entries,
                count(*) FILTER (WHERE entry.platform_user_id = $2::uuid)::int AS duplicate_rows
           FROM symptom_entries entry
           JOIN symptom_trackings tracking ON tracking.id = entry.tracking_id
          WHERE entry.platform_user_id = ANY($1::uuid[])
            AND tracking.deleted_at IS NULL`,
        [[targetId, duplicateId], duplicateId],
      );
      assert.deepEqual(visible.rows[0], { visible_entries: 2, duplicate_rows: 0 });
      const trackings = await query(
        `SELECT count(*) FILTER (WHERE deleted_at IS NULL)::int AS active
           FROM symptom_trackings
          WHERE platform_user_id = ANY($1::uuid[]) AND symptom_key = 'general_wellbeing'`,
        [[targetId, duplicateId]],
      );
      assert.deepEqual(trackings.rows[0], { active: 1 });
    },
  },
];

/**
 * Связь пробы с предметом — единственная проверка этого файла, которая идёт БЕЗ базы и потому
 * реально исполняется в CI (`pnpm test:db-privileges`). Названный дорогой и молчаливый отказ:
 * движок переименовали или перенесли, все TypeScript-вызовы поправили — `tsc` зелёный, CI зелёный,
 * а живая проба ниже подключается строкой пути и именем символа и с этого момента не проверяет
 * ничего. Форму исходника здесь не сверяют: файл разбирается компилятором TypeScript, поэтому
 * переформатирование, кавычки и переносы строк проверку не трогают — только реальная пропажа
 * экспорта. Ступень 3 канона (§10a, «защита от отката»): условие снятия — проба, которую CI гоняет
 * против живой базы, тогда эта косвенная проверка не нужна.
 */
test('the proof stays bound to the live merge engine export', async () => {
  assert.ok(
    existsSync(enginePath),
    `движок merge не найден по ${ENGINE_RELATIVE_PATH}: проба подключается к нему строкой пути и ` +
      'без него молча не проверяет ничего — почини путь в ENGINE_RELATIVE_PATH или верни файл',
  );
  const ts = (await import('typescript')).default;
  const parsed = ts.createSourceFile(
    enginePath,
    readFileSync(enginePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const exportedNames = new Set();
  for (const statement of parsed.statements) {
    const exported =
      (ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Export) !== 0 ||
      (ts.canHaveModifiers(statement) &&
        (ts.getModifiers(statement) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
    if (!exported) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      exportedNames.add(statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) exportedNames.add(declaration.name.text);
      }
    }
  }
  assert.ok(
    exportedNames.has(ENGINE_MERGE_EXPORT),
    `${ENGINE_RELATIVE_PATH} больше не экспортирует ${ENGINE_MERGE_EXPORT}: живая проба ниже ` +
      'подключается к движку по этому имени и без него проверяет пустоту',
  );
});

test(
  'live PostgreSQL enforces the organization merge gate and completes collision-prone transfers',
  { skip: !ENABLED },
  async () => {
    assert.ok(ALLOWED_DATABASES.has(DATABASE), `refusing to run merge proof on ${DATABASE}`);

    const pgPath = path.join(repoRoot, 'apps', 'webapp', 'node_modules', 'pg', 'lib', 'index.js');
    const [{ default: pg }, engine] = await Promise.all([
      import(pathToFileURL(pgPath).href),
      import(pathToFileURL(enginePath).href),
    ]);
    const mergePlatformUsersInTransaction = engine[ENGINE_MERGE_EXPORT];

    if (typeof process.setuid === 'function' && process.getuid?.() === 0) {
      process.setgid('postgres');
      process.setuid('postgres');
    }

    const client = new pg.Client({
      host: '/var/run/postgresql',
      port: 5432,
      database: DATABASE,
      user: 'postgres',
    });
    await client.connect();
    const query = (text, values) => client.query(text, values);
    const results = [];
    let residualRows = -1;

    await query('BEGIN');
    try {
      await query("SELECT pg_advisory_xact_lock(hashtext('platform-user-merge-dev-proof'))");
      const index = await query(
        `SELECT indexdef
           FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = 'uq_treatment_program_instances_one_active_per_patient'`,
      );
      if (!index.rows[0]?.indexdef.includes('(organization_id, patient_user_id)')) {
        await query('DROP INDEX public.uq_treatment_program_instances_one_active_per_patient');
        await query(
          `CREATE UNIQUE INDEX uq_treatment_program_instances_one_active_per_patient
             ON public.treatment_program_instances (organization_id, patient_user_id)
             NULLS NOT DISTINCT
          WHERE status = 'active'::text`,
        );
      }

      await query(
        `INSERT INTO be_organizations (id, title)
         VALUES ($1::uuid, 'merge proof org A'), ($2::uuid, 'merge proof org B')`,
        [ORG_A, ORG_B],
      );
      await query(
        `INSERT INTO platform_users (id, display_name, role)
         VALUES ($1::uuid, 'merge proof doctor A', 'doctor'),
                ($2::uuid, 'merge proof doctor B', 'doctor')`,
        [DOCTOR, uid('4')],
      );

      for (const scenario of scenarios) {
        const targetId = uid(scenario.pair[0]);
        const duplicateId = uid(scenario.pair[1]);
        await query('SAVEPOINT scenario');
        let actual = 'merge';
        let detail = '';
        try {
          await query(
            `INSERT INTO platform_users (id, display_name, role)
             VALUES ($1::uuid, $3, 'client'), ($2::uuid, $4, 'client')`,
            [targetId, duplicateId, `target-${scenario.pair[0]}`, `duplicate-${scenario.pair[1]}`],
          );
          for (const [sql, values] of scenario.fixtures(targetId, duplicateId)) {
            await query(sql, values);
          }
          try {
            await mergePlatformUsersInTransaction(
              client,
              targetId,
              duplicateId,
              scenario.reason ?? 'phone_bind',
              scenario.reason === 'manual'
                ? { resolution: manualResolution(targetId, duplicateId) }
                : undefined,
            );
          } catch (error) {
            if (
              error?.name === 'MergeConflictError' ||
              error?.name === 'MergeDependentConflictError'
            ) {
              actual = 'block';
            } else {
              actual = 'crash';
            }
            detail = `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`;
          }
          if (actual === 'merge' && scenario.verify) {
            await scenario.verify(query, targetId, duplicateId);
          }
          assert.equal(actual, scenario.expected, detail || scenario.name);
          results.push(`PASS ${scenario.name}`);
        } catch (error) {
          results.push(`FAIL ${scenario.name}: ${error?.message ?? String(error)}`);
        } finally {
          await query('ROLLBACK TO SAVEPOINT scenario');
        }
      }
    } finally {
      await query('ROLLBACK');
      const residual = await query(
        `SELECT (
           (SELECT count(*) FROM platform_users WHERE id::text LIKE $1) +
           (SELECT count(*) FROM be_organizations WHERE id::text LIKE $1) +
           (SELECT count(*) FROM doctor_notes WHERE user_id::text LIKE $1) +
           (SELECT count(*) FROM user_phone_history WHERE platform_user_id::text LIKE $1) +
           (SELECT count(*) FROM treatment_program_instances WHERE patient_user_id::text LIKE $1) +
           (SELECT count(*) FROM clinical_visit WHERE patient_user_id::text LIKE $1) +
           (SELECT count(*) FROM clinical_complaint WHERE patient_user_id::text LIKE $1) +
           (SELECT count(*) FROM clinical_diagnosis WHERE patient_user_id::text LIKE $1) +
           (SELECT count(*) FROM clinical_anamnesis_trauma WHERE patient_user_id::text LIKE $1) +
           (SELECT count(*) FROM clinical_anamnesis_illness WHERE patient_user_id::text LIKE $1) +
           (SELECT count(*) FROM clinical_anamnesis_lifestyle WHERE patient_user_id::text LIKE $1) +
           (SELECT count(*) FROM patient_lfk_assignments WHERE patient_user_id::text LIKE $1) +
           (SELECT count(*) FROM lfk_complex_templates WHERE id::text LIKE $1) +
           (SELECT count(*) FROM symptom_trackings WHERE platform_user_id::text LIKE $1) +
           (SELECT count(*) FROM symptom_entries WHERE platform_user_id::text LIKE $1)
         )::int AS count`,
        [`${prefix}%`],
      );
      residualRows = residual.rows[0]?.count ?? -1;
      await client.end();
    }

    for (const result of results) console.log(result);
    const failures = results.filter((result) => result.startsWith('FAIL'));
    assert.deepEqual(failures, [], failures.join('\n'));
    assert.equal(residualRows, 0, `ROLLBACK left ${residualRows} proof rows`);
    console.log(
      `proof_status=PASS scenarios=${results.length} rollback=complete residual_rows=${residualRows}`,
    );
  },
);
