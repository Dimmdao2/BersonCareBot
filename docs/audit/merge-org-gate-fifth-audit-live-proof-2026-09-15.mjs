/** Independent auditor proof: canon case §18 + the ten unique indexes the branch probe never touches.
 *  One transaction on bcb_webapp_dev, savepoint per scenario, always ROLLBACK. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = '/home/dev/dev-projects/bcb-wt-merge-org-gate';
const { default: pg } = await import(pathToFileURL(path.join(repoRoot,'apps/webapp/node_modules/pg/lib/index.js')).href);
const { mergePlatformUsersInTransaction } = await import(
  pathToFileURL(path.join(repoRoot,'packages/platform-merge/src/pgPlatformUserMerge.ts')).href);

if (typeof process.setuid === 'function' && process.getuid?.() === 0) {
  process.setgid('postgres'); process.setuid('postgres');
}
const P = 'b7e20000-0000-4000-8000-';
const uid = (s) => `${P}${String(s).padStart(12,'0')}`;
const ORG_A = uid(1), ORG_B = uid(2), DOC = uid(3), DOC2 = uid(4), SPEC = uid(5),
      TPL = uid(6), AUDIT = uid(7), ITEM = uid(8), INST = uid(9), STAGE = uid(10);

const client = new pg.Client({ host:'/var/run/postgresql', port:5432, database:'bcb_webapp_dev', user:'postgres' });
await client.connect();
const q = (t,v) => client.query(t,v);
const manual = (t,d) => ({ targetId:t, duplicateId:d,
  fields:{phone_normalized:'target',display_name:'target',first_name:'target',last_name:'target',email:'target'},
  bindings:{telegram:'both',max:'both',vk:'both'}, oauth:{}, channelPreferences:'merge' });

const out = [];
await q('BEGIN');
try {
  await q("SELECT pg_advisory_xact_lock(hashtext('platform-user-merge-audit-proof'))");
  await q(`INSERT INTO be_organizations (id,title) VALUES ($1::uuid,'audit org A'),($2::uuid,'audit org B')`,[ORG_A,ORG_B]);
  await q(`INSERT INTO platform_users (id,display_name,role) VALUES ($1::uuid,'audit doc A','doctor'),($2::uuid,'audit doc B','doctor')`,[DOC,DOC2]);
  await q(`INSERT INTO be_specialists (id,organization_id,full_name) VALUES ($1::uuid,$2::uuid,'audit spec')`,[SPEC,ORG_A]);
  await q(`INSERT INTO lfk_complex_templates (id,title,owner_kind,organization_id) VALUES ($1::uuid,'audit tpl','organization',$2::uuid)`,[TPL,ORG_A]);
  await q(`INSERT INTO broadcast_audit (id,actor_id,category,audience_filter,message_title)
           VALUES ($1::uuid,'audit-actor','audit','all','audit title')`,[AUDIT]);
  await q(`INSERT INTO treatment_program_instances (id,organization_id,patient_user_id,title,status,assignment_source)
           VALUES ($1::uuid,$2::uuid,$3::uuid,'audit inst','completed','promo')`,[INST,ORG_A,DOC]);
  await q(`INSERT INTO treatment_program_instance_stages (id,organization_id,instance_id,title,status)
           VALUES ($1::uuid,$2::uuid,$3::uuid,'audit stage','available')`,[STAGE,ORG_A,INST]);
  await q(`INSERT INTO treatment_program_instance_stage_items (id,organization_id,stage_id,item_type,item_ref_id,snapshot)
           VALUES ($1::uuid,$2::uuid,$3::uuid,'clinical_test',$1::uuid,'{}'::jsonb)`,[ITEM,ORG_A,STAGE]);

  const scenarios = [
  { name:'A. КАНОН §18: заметка A против заметки B + две живые истории телефона (auto)',
    pair:[101,102], reason:'phone_bind',
    fix: async (t,d) => {
      await q(`INSERT INTO doctor_notes (user_id,author_id,text,organization_id,note_date)
               VALUES ($1::uuid,$2::uuid,'note-target-orgA',$3::uuid,DATE '2026-09-15')`,[t,DOC,ORG_A]);
      await q(`INSERT INTO doctor_notes (user_id,author_id,text,organization_id,note_date)
               VALUES ($1::uuid,$2::uuid,'note-dup-orgB',$3::uuid,DATE '2026-09-15')`,[d,DOC2,ORG_B]);
      await q(`INSERT INTO user_phone_history (platform_user_id,phone_normalized,source,valid_from)
               VALUES ($1::uuid,'+79990000101','otp',TIMESTAMPTZ '2026-01-01T00:00:00Z')`,[t]);
      await q(`INSERT INTO user_phone_history (platform_user_id,phone_normalized,source,valid_from)
               VALUES ($1::uuid,'+79990000102','otp',TIMESTAMPTZ '2026-02-01T00:00:00Z')`,[d]);
    },
    check: async (t,d) => {
      const n = await q(`SELECT text, organization_id::text org, user_id::text FROM doctor_notes
                         WHERE user_id = ANY($1::uuid[]) ORDER BY text`,[[t,d]]);
      assert.deepEqual(n.rows.map(r=>[r.text,r.org,r.user_id]), [
        ['note-dup-orgB',ORG_B,t], ['note-target-orgA',ORG_A,t]], 'обе заметки у target, каждая при своей клинике');
      const h = await q(`SELECT phone_normalized, valid_from::text, valid_to IS NULL AS active, platform_user_id::text pu
                         FROM user_phone_history WHERE platform_user_id = ANY($1::uuid[]) ORDER BY valid_from`,[[t,d]]);
      assert.equal(h.rows.length, 2, 'ни один интервал не потерян');
      assert.deepEqual(h.rows.map(r=>r.pu), [t,t], 'вся история связна — на выжившем');
      assert.equal(h.rows.filter(r=>r.active).length, 1, 'ровно один текущий интервал');
      assert.equal(h.rows[0].valid_from.slice(0,10), '2026-01-01', 'valid_from старого интервала не переписан');
      const m = await q('SELECT merged_into_id::text m FROM platform_users WHERE id=$1::uuid',[d]);
      assert.equal(m.rows[0].m, t, 'дубль помечен alias');
    }},
  { name:'B. idx_patient_lfk_assign_active_template — одна клиника, один шаблон, активны оба (manual)',
    pair:[103,104], reason:'manual',
    fix: async (t,d) => { for (const u of [t,d])
      await q(`INSERT INTO patient_lfk_assignments (patient_user_id,template_id,organization_id,is_active)
               VALUES ($1::uuid,$2::uuid,$3::uuid,true)`,[u,TPL,ORG_A]); },
    check: async (t,d) => {
      const r = await q(`SELECT count(*)::int total, count(*) FILTER (WHERE is_active)::int active,
                                count(*) FILTER (WHERE patient_user_id=$2::uuid)::int dup
                         FROM patient_lfk_assignments WHERE patient_user_id = ANY($1::uuid[])`,[[t,d],d]);
      assert.deepEqual(r.rows[0], {total:2, active:1, dup:0}); }},
  { name:'C. uq_symptom_trackings_general_wellbeing_active — дневник самочувствия у обоих (auto)',
    pair:[105,106], reason:'phone_bind',
    fix: async (t,d) => { for (const u of [t,d])
      await q(`INSERT INTO symptom_trackings (user_id,platform_user_id,symptom_key,symptom_title,organization_id)
               VALUES ($1::text,$1::uuid,'general_wellbeing','самочувствие',$2::uuid)`,[u,ORG_A]); },
    check: async (t,d) => {
      const r = await q(`SELECT count(*)::int total, count(*) FILTER (WHERE platform_user_id=$2::uuid)::int dup
                         FROM symptom_trackings WHERE platform_user_id = ANY($1::uuid[]) AND deleted_at IS NULL`,[[t,d],d]);
      assert.equal(r.rows[0].dup, 0); assert.ok(r.rows[0].total >= 1); }},
  { name:'D. uq_patient_specialist_links_active_pair — один специалист активен у обоих (auto)',
    pair:[107,108], reason:'phone_bind',
    fix: async (t,d) => { for (const u of [t,d])
      await q(`INSERT INTO patient_specialist_links (organization_id,patient_user_id,specialist_id,created_via,status)
               VALUES ($1::uuid,$2::uuid,$3::uuid,'manual_assign','active')`,[ORG_A,u,SPEC]); },
    check: async (t,d) => {
      const r = await q(`SELECT count(*)::int total, count(*) FILTER (WHERE status='active')::int active,
                                count(*) FILTER (WHERE patient_user_id=$2::uuid)::int dup
                         FROM patient_specialist_links WHERE patient_user_id = ANY($1::uuid[])`,[[t,d],d]);
      assert.deepEqual(r.rows[0], {total:2, active:1, dup:0}); }},
  { name:'E. patient_diary_day_snapshots_pk — один и тот же день у обоих (auto)',
    pair:[109,110], reason:'phone_bind',
    fix: async (t,d) => { for (const u of [t,d])
      await q(`INSERT INTO patient_diary_day_snapshots (platform_user_id,local_date,iana,warmup_slot_limit,warmup_done_count,warmup_all_done)
               VALUES ($1::uuid,DATE '2026-09-15','Europe/Moscow',3,1,false)`,[u]); },
    check: async (t,d) => {
      const r = await q(`SELECT count(*)::int total, count(*) FILTER (WHERE platform_user_id=$2::uuid)::int dup
                         FROM patient_diary_day_snapshots WHERE platform_user_id = ANY($1::uuid[])`,[[t,d],d]);
      assert.deepEqual(r.rows[0], {total:1, dup:0}); }},
  { name:'F. program_item_discussion_reads_pkey — один элемент программы прочитан обоими (auto)',
    pair:[111,112], reason:'phone_bind',
    fix: async (t,d) => { for (const u of [t,d])
      await q(`INSERT INTO program_item_discussion_reads (patient_user_id,instance_stage_item_id)
               VALUES ($1::uuid,$2::uuid)`,[u,ITEM]); },
    check: async (t,d) => {
      const r = await q(`SELECT count(*)::int total, count(*) FILTER (WHERE patient_user_id=$2::uuid)::int dup
                         FROM program_item_discussion_reads WHERE patient_user_id = ANY($1::uuid[])`,[[t,d],d]);
      assert.deepEqual(r.rows[0], {total:1, dup:0}); }},
  { name:'G. broadcast_audit_recipients_pk — одна рассылка ушла обоим (auto)',
    pair:[113,114], reason:'phone_bind',
    fix: async (t,d) => { for (const u of [t,d])
      await q(`INSERT INTO broadcast_audit_recipients (audit_id,platform_user_id,organization_id)
               VALUES ($1::uuid,$2::uuid,$3::uuid)`,[AUDIT,u,ORG_A]); },
    check: async (t,d) => {
      const r = await q(`SELECT count(*)::int total, count(*) FILTER (WHERE platform_user_id=$2::uuid)::int dup
                         FROM broadcast_audit_recipients WHERE platform_user_id = ANY($1::uuid[])`,[[t,d],d]);
      assert.deepEqual(r.rows[0], {total:1, dup:0}); }},
  { name:'H. user_password_credentials_pkey — пароль есть у обоих (manual)',
    pair:[115,116], reason:'manual',
    fix: async (t,d) => { for (const u of [t,d])
      await q(`INSERT INTO user_password_credentials (user_id,password_hash) VALUES ($1::uuid,'audit-hash')`,[u]); },
    check: async (t,d) => {
      const r = await q(`SELECT count(*)::int total, count(*) FILTER (WHERE user_id=$2::uuid)::int dup
                         FROM user_password_credentials WHERE user_id = ANY($1::uuid[])`,[[t,d],d]);
      assert.deepEqual(r.rows[0], {total:1, dup:0}); }},
  { name:'I. user_channel_preferences (user_id,channel_code) — ОДИН И ТОТ ЖЕ канал у обоих (manual)',
    pair:[117,118], reason:'manual',
    fix: async (t,d) => { for (const [u,pref,ts] of [[t,true,'2026-09-14T00:00:00Z'],[d,true,'2026-09-15T00:00:00Z']])
      await q(`INSERT INTO user_channel_preferences (user_id,platform_user_id,channel_code,is_preferred_for_auth,updated_at)
               VALUES ($1::text,$1::uuid,'telegram',$2,$3::timestamptz)`,[u,pref,ts]); },
    check: async (t,d) => {
      const r = await q(`SELECT count(*)::int total, count(*) FILTER (WHERE is_preferred_for_auth)::int pref,
                                count(*) FILTER (WHERE platform_user_id=$2::uuid)::int dup
                         FROM user_channel_preferences WHERE platform_user_id = ANY($1::uuid[])`,[[t,d],d]);
      assert.deepEqual(r.rows[0], {total:1, pref:1, dup:0}); }},
  ];

  for (const s of scenarios) {
    const t = uid(s.pair[0]), d = uid(s.pair[1]);
    await q('SAVEPOINT sc');
    try {
      await q(`INSERT INTO platform_users (id,display_name,role) VALUES ($1::uuid,'t','client'),($2::uuid,'d','client')`,[t,d]);
      await s.fix(t,d);
      await mergePlatformUsersInTransaction(client, t, d, s.reason,
        s.reason === 'manual' ? { resolution: manual(t,d) } : undefined);
      await s.check(t,d);
      out.push(`PASS  ${s.name}`);
    } catch (e) {
      out.push(`FAIL  ${s.name}\n      ${e?.name ?? 'Error'}: ${String(e?.message ?? e).split('\n')[0]}`);
    } finally { await q('ROLLBACK TO SAVEPOINT sc'); }
  }
} finally {
  await q('ROLLBACK');
  const r = await q(`SELECT ((SELECT count(*) FROM platform_users WHERE id::text LIKE $1)
                          + (SELECT count(*) FROM be_organizations WHERE id::text LIKE $1)
                          + (SELECT count(*) FROM doctor_notes WHERE user_id::text LIKE $1)
                          + (SELECT count(*) FROM be_specialists WHERE id::text LIKE $1)
                          + (SELECT count(*) FROM user_phone_history WHERE platform_user_id::text LIKE $1))::int c`,[`${P}%`]);
  out.push(`residual_rows=${r.rows[0].c}`);
  await client.end();
}
for (const l of out) console.log(l);
process.exit(out.some(l=>l.startsWith('FAIL')) ? 1 : 0);
