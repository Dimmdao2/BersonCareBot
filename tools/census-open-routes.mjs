import { execSync } from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {
  analyzeNextRouteFile,
  callExpressionName,
  handlerCandidateBodies,
  handlerContainsCall,
} from './lib/next-route-handlers.mjs';

const files = execSync('find apps/webapp/src/app/api -name "route.ts"', { encoding: 'utf8' })
  .trim()
  .split('\n')
  .sort();
const open = [];
let handlerCount = 0;
/* Независимый аудит 16.09 (`docs/_TODO/AUDIT_PUBLIC_DOORS_CUT_2026-09-16.md`, MUST FIX 1): раньше файл,
   в котором не нашлось НИ ОДНОГО узнанного экспорта метода, молча пропускался — и перепись занижала
   число, не сказав об этом. Так из замера исчез `public/domains/ask`, отдававший обработчик
   реэкспортом (`export { GET } from '…'`), то есть один из двух адресов той самой двери, которую
   перепись и проверяла. Перепись, которая молча недосчитывает двери, хуже отсутствующей: теперь
   каждый нераспознанный `route.ts` попадает в отдельный список и роняет код возврата. */
const unparsed = [];
function isGuardCall(call) {
  const name = callExpressionName(call);
  return Boolean(
    name &&
    (/^require[A-Z]/u.test(name) ||
      /^assert[A-Z]/u.test(name) ||
      (/^with[A-Z]/u.test(name) && /(Access|Principal|Session|Context)$/u.test(name)) ||
      name === 'verifyInternalJobBearer' ||
      name === 'verifyIntegratorSignature' ||
      name === 'getCurrentSession' ||
      name === 'getOptionalPatientSession'),
  );
}

function handlerHasGuard(handler) {
  if (ts.isCallExpression(handler.root) && isGuardCall(handler.root)) return true;
  const bodies = handlerCandidateBodies(handler);
  if (bodies.length === 0) return handlerContainsCall(handler, isGuardCall);
  return bodies.every((body) => handlerContainsCall({ ...handler, root: body }, isGuardCall));
}

function selfTest() {
  const analyzeFixture = (files, entry = '/fixture/route.ts') => {
    const readSource = (target) => {
      const source = files.get(path.resolve(target));
      if (source !== undefined) return source;
      const error = new Error(`missing fixture module: ${target}`);
      error.code = 'ENOENT';
      throw error;
    };
    return analyzeNextRouteFile(entry, { readSource });
  };
  const mixed = analyzeFixture(
    new Map([
      [
        '/fixture/route.ts',
        `const openHandler = async () => Response.json({ ok: true });
         export { openHandler as GET };
         export const POST = async () => { await requireAuthenticatedApiSession(); return Response.json({ ok: true }); };`,
      ],
    ]),
  );
  assert.deepEqual(mixed.issues, []);
  assert.deepEqual(mixed.handlers.map((handler) => handler.method).sort(), ['GET', 'POST']);
  assert.equal(
    handlerContainsCall(
      mixed.handlers.find((handler) => handler.method === 'GET'),
      isGuardCall,
    ),
    false,
  );
  assert.equal(
    handlerContainsCall(
      mixed.handlers.find((handler) => handler.method === 'POST'),
      isGuardCall,
    ),
    true,
  );

  const splitWrapper = analyzeFixture(
    new Map([
      [
        '/fixture/route.ts',
        `export const GET = wrap(
           async () => Response.json({ open: true }),
           async () => { await requireAuthenticatedApiSession(); return Response.json({ closed: true }); },
         );`,
      ],
    ]),
  );
  assert.equal(handlerHasGuard(splitWrapper.handlers[0]), false);

  const reexport = analyzeFixture(
    new Map([
      ['/fixture/route.ts', "export { handler as GET } from './handler';"],
      [
        '/fixture/handler.ts',
        'export async function handler() { await requireAuthenticatedApiSession(); return Response.json({ ok: true }); }',
      ],
    ]),
  );
  assert.deepEqual(reexport.issues, []);
  assert.equal(reexport.handlers.length, 1);
  assert.equal(handlerContainsCall(reexport.handlers[0], isGuardCall), true);

  const unknown = analyzeFixture(
    new Map([['/fixture/route.ts', 'export const { GET } = buildHandlers();']]),
  );
  assert.equal(unknown.handlers.length, 0);
  assert.match(unknown.issues.join('\n'), /destructured handler export is not traceable/u);
  console.log(
    'open-route census self-test: OK (local alias/method split, wrapper-path split, relative re-export, fail-closed unknown)',
  );
}

if (process.argv.includes('--self-test')) selfTest();

for (const f of files) {
  const rel = f.replace('apps/webapp/src/app/api/', '').replace('/route.ts', '');
  const analysis = analyzeNextRouteFile(path.resolve(f));
  if (analysis.issues.length > 0) {
    unparsed.push({ rel, issues: analysis.issues });
  }
  handlerCount += analysis.handlers.length;
  for (const handler of analysis.handlers) {
    if (handlerHasGuard(handler)) continue;
    open.push({
      rel,
      method: handler.method,
      boot: handlerContainsCall(
        handler,
        (call) => callExpressionName(call) === 'stampBootstrapPrincipal',
      ),
    });
  }
}
function callers(rel) {
  const path = '/api/' + rel;
  // для динамических сегментов ищем статический префикс
  const needle = path.split('/[')[0];
  let out = '';
  try {
    out = execSync(
      `grep -rIl --include=*.ts --include=*.tsx --include=*.mjs --include=*.js --exclude-dir=node_modules --exclude-dir=.next -F ${JSON.stringify(needle)} apps packages 2>/dev/null || true`,
      { encoding: 'utf8' },
    );
  } catch {
    out = '';
  }
  const list = out
    .trim()
    .split('\n')
    .filter(Boolean)
    .filter((p) => !p.includes(`app/api/${rel.split('/[')[0]}`))
    .filter((p) => !p.includes('.next/'));
  const prod = list.filter((p) => !/\.test\.|\.spec\./.test(p));
  return { total: list.length, prod: prod.length, sample: prod.slice(0, 2).join(' ') };
}
console.log(`route-файлов всего: ${files.length}`);
console.log(`экспортированных HTTP-обработчиков всего: ${handlerCount}`);
console.log(`обработчиков без двери в своём теле: ${open.length}`);
console.log(`нераспознанных route-файлов/методов: ${unparsed.length}\n`);
console.log('вызывающих(боевых/всего) | методы | адрес | пример вызывающего');
for (const r of open) {
  const c = callers(r.rel);
  const flag = c.prod === 0 ? '🔴' : '  ';
  console.log(
    `${flag} ${String(c.prod).padStart(2)}/${String(c.total).padStart(2)} | ${r.method.padEnd(10)} | ${r.boot ? '' : '[без метки] '}${r.rel}${c.prod ? '  ← ' + c.sample : ''}`,
  );
}

if (unparsed.length > 0) {
  console.error(
    `\n⛔ НЕРАСПОЗНАННЫЕ route-файлы (${unparsed.length}) — перепись без них НЕПОЛНАЯ:`,
  );
  for (const item of unparsed) {
    console.error(`   ${item.rel}: ${item.issues.join('; ')}`);
  }
  console.error('   Научи перепись их форме прежде, чем верить её числам.');
  process.exitCode = 1;
}
