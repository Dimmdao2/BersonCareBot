/** Проверка одного входа: две учётки с назначениями ВРАЧА в ОДНОЙ клинике, автоматический путь.
 *  План Э1: «две с назначениями в одной — [не сливаются]». Канон §18: «назначения» — первая
 *  блокирующая категория. Одна транзакция на bcb_webapp_dev, всегда ROLLBACK. */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root='/home/dev/dev-projects/bcb-wt-merge-org-gate';
const { default: pg } = await import(pathToFileURL(path.join(root,'apps/webapp/node_modules/pg/lib/index.js')).href);
const { mergePlatformUsersInTransaction } = await import(pathToFileURL(path.join(root,'packages/platform-merge/src/pgPlatformUserMerge.ts')).href);
if (typeof process.setuid==='function' && process.getuid?.()===0){process.setgid('postgres');process.setuid('postgres');}
const P='c9e30000-0000-4000-8000-', uid=s=>`${P}${String(s).padStart(12,'0')}`;
const ORG=uid(1), T=uid(2), D=uid(3);
const c=new pg.Client({host:'/var/run/postgresql',port:5432,database:'bcb_webapp_dev',user:'postgres'});
await c.connect(); const q=(t,v)=>c.query(t,v);
let verdict='';
await q('BEGIN');
try{
  await q(`INSERT INTO be_organizations (id,title) VALUES ($1::uuid,'gap org')`,[ORG]);
  await q(`INSERT INTO platform_users (id,display_name,role) VALUES ($1::uuid,'t','client'),($2::uuid,'d','client')`,[T,D]);
  for (const [u,t] of [[T,'назначение target'],[D,'назначение duplicate']])
    await q(`INSERT INTO treatment_program_instances (organization_id,patient_user_id,title,status,assignment_source)
             VALUES ($1::uuid,$2::uuid,$3,'completed','doctor')`,[ORG,u,t]);
  try{
    await mergePlatformUsersInTransaction(c,T,D,'phone_bind');
    const r=await q(`SELECT count(*)::int n FROM treatment_program_instances WHERE patient_user_id=$1::uuid`,[T]);
    verdict=`СЛИЛОСЬ МОЛЧА — назначения обеих сторон одной клиники теперь на одной учётке (${r.rows[0].n} шт.)`;
  }catch(e){ verdict=`ЗАБЛОКИРОВАНО — ${e?.name}: ${String(e?.message).split('\n')[0]}`; }
} finally { await q('ROLLBACK'); await c.end(); }
console.log(verdict);
