import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const files = execSync('find apps/webapp/src/app/api -name "route.ts"', { encoding: 'utf8' }).trim().split('\n').sort();
const GUARD = [/\brequire[A-Z]\w*\s*\(/,/\bwith[A-Z]\w*(Access|Principal|Session|Context)\s*\(/,/\bverifyInternalJobBearer\s*\(/,/\bverifyIntegratorSignature\s*\(/,/\bgetCurrentSession\s*\(/,/\bgetOptionalPatientSession\s*\(/,/\bassert[A-Z]\w*\s*\(/];
const open = [];
/* Независимый аудит 16.09 (`docs/_TODO/AUDIT_PUBLIC_DOORS_CUT_2026-09-16.md`, MUST FIX 1): раньше файл,
   в котором не нашлось НИ ОДНОГО узнанного экспорта метода, молча пропускался — и перепись занижала
   число, не сказав об этом. Так из замера исчез `public/domains/ask`, отдававший обработчик
   реэкспортом (`export { GET } from '…'`), то есть один из двух адресов той самой двери, которую
   перепись и проверяла. Перепись, которая молча недосчитывает двери, хуже отсутствующей: теперь
   каждый нераспознанный `route.ts` попадает в отдельный список и роняет код возврата. */
const unparsed = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const rel = f.replace('apps/webapp/src/app/api/','').replace('/route.ts','');
  const declared = [...src.matchAll(/export\s+(?:async\s+)?(?:function\s+|const\s+)(GET|POST|PUT|PATCH|DELETE)\b/g)].map(m=>m[1]);
  const reexported = [...src.matchAll(/export\s*\{([^}]*)\}\s*from/g)]
    .flatMap((m) => m[1].split(','))
    .map((part) => part.trim().split(/\s+as\s+/).pop().trim())
    .filter((name) => ['GET','POST','PUT','PATCH','DELETE'].includes(name));
  const methods = [...new Set([...declared, ...reexported])];
  if (!methods.length) { unparsed.push(rel); continue; }
  if (GUARD.some(re=>re.test(src))) continue;
  open.push({ rel, methods: methods.join(','), boot: /stampBootstrapPrincipal/.test(src), viaReexport: declared.length === 0 });
}
function callers(rel) {
  const path = '/api/' + rel;
  // для динамических сегментов ищем статический префикс
  const needle = path.split('/[')[0];
  let out = '';
  try {
    out = execSync(`grep -rIl --include=*.ts --include=*.tsx --include=*.mjs --include=*.js --exclude-dir=node_modules --exclude-dir=.next -F ${JSON.stringify(needle)} apps packages 2>/dev/null || true`, { encoding: 'utf8' });
  } catch { out = ''; }
  const list = out.trim().split('\n').filter(Boolean)
    .filter(p => !p.includes(`app/api/${rel.split('/[')[0]}`))
    .filter(p => !p.includes('.next/'));
  const prod = list.filter(p => !/\.test\.|\.spec\./.test(p));
  return { total: list.length, prod: prod.length, sample: prod.slice(0,2).join(' ') };
}
console.log(`route-файлов всего: ${files.length}`);
console.log(`маршрутов без двери в файле: ${open.length}\n`);
console.log('вызывающих(боевых/всего) | методы | адрес | пример вызывающего');
for (const r of open) {
  const c = callers(r.rel);
  const flag = c.prod === 0 ? '🔴' : '  ';
  console.log(`${flag} ${String(c.prod).padStart(2)}/${String(c.total).padStart(2)} | ${r.methods.padEnd(10)} | ${(r.boot?'':'[без метки] ')}${r.rel}${c.prod?'  ← '+c.sample:''}`);
}

if (unparsed.length > 0) {
  console.error(`\n⛔ НЕРАСПОЗНАННЫЕ route-файлы (${unparsed.length}) — перепись без них НЕПОЛНАЯ:`);
  for (const rel of unparsed) console.error(`   ${rel}`);
  console.error('   Научи перепись их форме прежде, чем верить её числам.');
  process.exitCode = 1;
}
