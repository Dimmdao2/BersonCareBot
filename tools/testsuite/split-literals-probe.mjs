/**
 * ЗОНД «разрезание литералов» — шаг ревизии тестового набора
 * (docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md).
 *
 * ЗАЧЕМ. Форматтер меняет только пять вещей: кавычки, пробелы, переносы, висячие запятые и скобки.
 * СОДЕРЖИМОЕ строковых литералов он не трогает, поэтому проверка вида
 * `expect(src).toContain('runWebappPgText')` переживает любое форматирование. Этот зонд закрывает
 * ровно этот пробел.
 *
 * КАК. Каждый строковый литерал разрезается пополам: 'cms_pages' -> 'cms' + '_pages'. Для программы
 * это ТА ЖЕ строка — склеится при выполнении, поведение не меняется ни на йоту. Но в ТЕКСТЕ файла
 * подстроки больше нет, поэтому тест или гейт, ищущий её в исходнике, обязан покраснеть.
 *
 * ГРАНИЦА. Красный под зондом = проверка привязана к тексту, а не к поведению. Зелёный не доказывает
 * ничего. Зонд ОДНОРАЗОВЫЙ: прогнал, снял список красных, откатил `git checkout -- .`.
 *
 * ОБЯЗАТЕЛЬНО перед доверием к результату: `pnpm typecheck` = 0 ошибок. Иначе красные будут смесью
 * «пиннит текст» и «зонд сломал сборку», и прогон в мусор.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.argv[2] ?? '/home/dev/dev-projects/BersonCareBot';
const DIRS = ['apps/webapp/src', 'apps/webapp/scripts', 'apps/integrator/src', 'apps/media-worker/src'];
const MIN_LEN = 6; // короткие литералы резать бессмысленно и шумно

const walk = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.next', 'dist', 'coverage'].includes(e.name)) continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name)) {
      out.push(p); // ТОЛЬКО код приложения: тесты не трогаем, иначе разрежем их же ожидания
    }
  }
  return out;
};

const parse = (f) =>
  ts.createSourceFile(
    f,
    fs.readFileSync(f, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

/**
 * Места, где строковый литерал НЕ является выражением и разрезать его нельзя:
 * пути импорта/экспорта, ключи объектов и типов, значения перечислений, атрибуты JSX,
 * литеральные типы, `as const`-ключи, директивы вроде 'use client'.
 */
const isUnsplittable = (n) => {
  const p = n.parent;
  if (!p) return true;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
  if (ts.isImportTypeNode(p) || ts.isModuleDeclaration(p)) return true;
  if (ts.isExternalModuleReference(p)) return true;
  if (ts.isCallExpression(p) && p.expression.kind === ts.SyntaxKind.ImportKeyword) return true;
  if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p)) && p.name === n) return true;
  if (ts.isEnumMember(p) && p.name === n) return true;
  if (ts.isJsxAttribute(p)) return true;
  if (ts.isLiteralTypeNode(p)) return true;
  if (ts.isComputedPropertyName(p)) return true;
  if (ts.isMethodSignature(p) || ts.isMethodDeclaration(p)) return true;
  // директива в начале файла/функции: 'use client', 'use server'
  if (ts.isExpressionStatement(p) && p.expression === n) return true;
  return false;
};

let files = 0;
let cuts = 0;
for (const dir of DIRS) {
  for (const f of walk(path.join(ROOT, dir))) {
    const sf = parse(f);
    const edits = [];
    const visit = (n) => {
      if (ts.isStringLiteral(n) && !isUnsplittable(n)) {
        const raw = n.getText(sf);
        const quote = raw[0];
        const body = raw.slice(1, -1);
        // не режем экранированные и слишком короткие — риск задеть \n, \' и т.п.
        if (body.length >= MIN_LEN && !body.includes('\\')) {
          const at = Math.floor(body.length / 2);
          edits.push([
            n.getStart(sf),
            n.getEnd(),
            `${quote}${body.slice(0, at)}${quote} + ${quote}${body.slice(at)}${quote}`,
          ]);
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    if (!edits.length) continue;
    let src = fs.readFileSync(f, 'utf8');
    for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0]))
      src = src.slice(0, start) + text + src.slice(end);
    fs.writeFileSync(f, src);
    files++;
    cuts += edits.length;
  }
}
console.log(`разрезано литералов: ${cuts} в ${files} файлах`);
console.log('ДАЛЬШЕ: pnpm typecheck (должно быть 0 ошибок) -> pnpm run ci -> откат git checkout -- .');
