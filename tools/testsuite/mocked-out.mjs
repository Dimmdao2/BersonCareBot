/**
 * Шаг 0в, бесплатная часть: тестовые файлы, которые НЕ исполняют код приложения.
 *
 * Признак строгий и статический: файл импортирует модули приложения, но КАЖДЫЙ такой импорт
 * заглушён через vi.mock. Тогда исполняется только сам тест и его заглушки — проверять там нечего,
 * кроме того, что заглушка была вызвана. Это механическая замена гадательному признаку «только
 * заглушки» (381 файл в карте 29.07), который считал по количеству vi.fn(), а не по факту.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.argv[2] ?? '/home/dev/dev-projects/BersonCareBot';
const DIRS = ['apps/webapp/src', 'apps/webapp/scripts', 'apps/integrator/src'];

const walk = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue;
      walk(p, out);
    } else if (/\.(test|spec)\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
};

const isAppModule = (s) => s.startsWith('@/') || s.startsWith('./') || s.startsWith('../');

const rows = [];
for (const f of walk(path.join(ROOT, ''), []).length ? [] : []) void f; // no-op, читаемость
for (const dir of DIRS) {
  for (const f of walk(path.join(ROOT, dir))) {
    const src = fs.readFileSync(f, 'utf8');
    const sf = ts.createSourceFile(
      f,
      src,
      ts.ScriptTarget.Latest,
      true,
      f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const imports = new Set();
    const mocked = new Set();
    let typeOnly = new Set();
    const visit = (n) => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        const spec = n.moduleSpecifier.text;
        if (isAppModule(spec)) {
          if (n.importClause?.isTypeOnly) typeOnly.add(spec);
          else imports.add(spec);
        }
      }
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.expression.getText(sf) === 'vi' &&
        ['mock', 'doMock'].includes(n.expression.name.text) &&
        n.arguments[0] &&
        ts.isStringLiteral(n.arguments[0])
      ) {
        mocked.add(n.arguments[0].text);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);

    const real = [...imports].filter((s) => !mocked.has(s));
    rows.push({
      file: path.relative(ROOT, f),
      imports: imports.size,
      mocked: mocked.size,
      real: real.length,
      readsSource: /readFileSync|readdirSync/.test(src),
    });
  }
}

const noAppCode = rows.filter((r) => r.imports > 0 && r.real === 0 && !r.readsSource);
const noImportsAtAll = rows.filter((r) => r.imports === 0 && !r.readsSource);

console.log(`тестовых файлов осмотрено: ${rows.length}`);
console.log(`— все импорты приложения заглушены: ${noAppCode.length}`);
console.log(`— вообще не импортируют код приложения: ${noImportsAtAll.length}`);
if (process.argv.includes('--list')) {
  console.log('\n[все импорты заглушены]');
  for (const r of noAppCode) console.log(`  ${r.file}  (импортов ${r.imports}, заглушено ${r.mocked})`);
  console.log('\n[не импортируют код приложения]');
  for (const r of noImportsAtAll) console.log(`  ${r.file}`);
}
