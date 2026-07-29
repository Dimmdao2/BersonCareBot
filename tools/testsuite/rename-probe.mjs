/**
 * Зонд «переименование» — шаг 0б плана docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md.
 *
 * Идея владельца, обобщённая: форматтер ловит пиннинг кавычек и переносов, но не ловит третью
 * названную им причину ложных падений — переименование. Переименование идентификаторов —
 * преобразование с нулевым изменением поведения (переименовываем ВСЕ вхождения имени как
 * идентификатора, включая объявление). Строковые литералы и комментарии НЕ трогаем — поэтому
 * тест, который пиннит имя строкой, обязан покраснеть, а тест, проверяющий поведение, — нет.
 *
 * Кандидаты берём не наугад: только те имена, которые тесты упоминают ВНУТРИ строк И которые
 * действительно экспортируются кодом приложения. Длина >= 12 символов, чтобы не задеть
 * общеупотребительные ключи (id, name), совпадающие с полями объектов и колонками БД.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.argv[2] ?? '/home/dev/dev-projects/bcb-wt-fmtcut';
const SUFFIX = 'Zqx';
const APPS = ['apps/webapp/src', 'apps/webapp/scripts', 'apps/integrator/src'];

const walk = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
};

const files = APPS.flatMap((d) => walk(path.join(ROOT, d)));
const isTest = (f) => /\.(test|spec)\.tsx?$/.test(f);
// ScriptKind ОБЯЗАН соответствовать расширению: разбор .ts как .tsx меняет грамматику угловых
// скобок, разбор молча ломается на первом же приведении типа, и хвост файла остаётся необойдённым.
// Так первый заход переименовал начало service.ts и не тронул конец.
const parse = (f) =>
  ts.createSourceFile(
    f,
    fs.readFileSync(f, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

// 1. Имена, которые тесты упоминают внутри строковых литералов.
const pinned = new Set();
const IDENT = /[A-Za-z_$][A-Za-z0-9_$]{11,}/g;
for (const f of files.filter(isTest)) {
  const sf = parse(f);
  const visit = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateLiteral(n)) {
      for (const m of n.getText().matchAll(IDENT)) pinned.add(m[0]);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

// 2. Имена, которые код приложения действительно экспортирует.
const exported = new Set();
for (const f of files.filter((x) => !isTest(x))) {
  const sf = parse(f);
  const visit = (n) => {
    const mods = ts.canHaveModifiers(n) ? ts.getModifiers(n) : undefined;
    const isExported = mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (isExported) {
      if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) && n.name) exported.add(n.name.text);
      if (ts.isVariableStatement(n))
        for (const d of n.declarationList.declarations)
          if (ts.isIdentifier(d.name)) exported.add(d.name.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

// 2б. Имена, которые ГДЕ-ЛИБО живут свойством (ключ объекта, поле порта, имя метода, JSX-атрибут).
// Такие переименовывать нельзя: позиции свойств мы не трогаем (ключ может приходить из БД или
// JSON), а значит переименование объявления рассогласует код — 147 ошибок типов на первом заходе.
const propertyNames = new Set();
for (const f of files) {
  const sf = parse(f);
  const visit = (n) => {
    const p = n.parent;
    if (ts.isIdentifier(n) && p) {
      if (
        ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p)) && p.name === n) ||
        (ts.isPropertyAccessExpression(p) && p.name === n) ||
        ((ts.isMethodDeclaration(p) || ts.isMethodSignature(p)) && p.name === n) ||
        (ts.isJsxAttribute(p) && p.name === n) ||
        (ts.isEnumMember(p) && p.name === n) ||
        (ts.isBindingElement(p) && p.propertyName === n) ||
        (ts.isShorthandPropertyAssignment(p) && p.name === n)
      )
        propertyNames.add(n.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

const targets = new Set(
  [...pinned].filter((n) => exported.has(n) && !propertyNames.has(n)),
);
console.log(`имён в строках тестов: ${pinned.size}`);
console.log(`из них реально экспортируются кодом: ${targets.size}`);
if (process.argv.includes('--list')) console.log([...targets].sort().join('\n'));
if (process.argv.includes('--dry')) process.exit(0);

// 3. Переименование: только узлы-идентификаторы, строки и комментарии не трогаем.
let touchedFiles = 0;
let touchedNodes = 0;
for (const f of files) {
  const sf = parse(f);
  const edits = [];
  // Позиции СВОЙСТВ не трогаем: ключ объекта или поле, приходящее из БД/JSON, переименовывать
  // нельзя — это меняет поведение, а зонд обязан его сохранять. Экспортируемые символы в этих
  // позициях не живут: на них ссылаются обычным идентификатором или через import.
  const isPropertyPosition = (n) => {
    const p = n.parent;
    if (!p) return false;
    if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p)) && p.name === n) return true;
    if (ts.isPropertyAccessExpression(p) && p.name === n) return true;
    if ((ts.isMethodDeclaration(p) || ts.isMethodSignature(p)) && p.name === n) return true;
    if (ts.isJsxAttribute(p) && p.name === n) return true;
    if (ts.isEnumMember(p) && p.name === n) return true;
    if (ts.isBindingElement(p) && p.propertyName === n) return true;
    return false;
  };
  const visit = (n) => {
    if (ts.isIdentifier(n) && targets.has(n.text) && !isPropertyPosition(n)) {
      edits.push([n.getStart(sf), n.getEnd()]);
      touchedNodes++;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!edits.length) continue;
  let src = fs.readFileSync(f, 'utf8');
  for (const [start, end] of edits.sort((a, b) => b[0] - a[0]))
    src = src.slice(0, start) + src.slice(start, end) + SUFFIX + src.slice(end);
  fs.writeFileSync(f, src);
  touchedFiles++;
}
console.log(`переименовано вхождений: ${touchedNodes} в ${touchedFiles} файлах`);
