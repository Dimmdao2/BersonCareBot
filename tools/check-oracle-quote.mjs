#!/usr/bin/env node
/**
 * Гейт §24.2 требовал от брифа абзац «Источник оракула» с дословной цитатой в «…». Он проверял только
 * НАЛИЧИЕ кавычек — не то, что цитата действительно есть в названном файле. 20.08 ведущий написал в брифе
 * «дословно из package.json: „eslint src --max-warnings=0“», завёл под это работу и объявил владельцу
 * блокер полного CI. Команда `grep -c max-warnings package.json` даёт 0: строки там нет никогда не было,
 * CI гоняет `eslint .` и на предупреждениях НЕ падает. Выдуманная цитата прошла гейт, потому что гейт
 * смотрел на кавычки, а не на файл.
 *
 * Теперь: хотя бы одна цитата из абзаца обязана реально встречаться хотя бы в одном файле, названном в
 * том же абзаце. Сравнение устойчиво к разметке — из цитаты и из файла одинаково вычищаются `*`, `_`,
 * обратные кавычки и повторные пробелы.
 *
 * Использование: node tools/check-oracle-quote.mjs <путь-к-брифу> [--repo <корень>]
 *                node tools/check-oracle-quote.mjs --self-test
 */
import { readFileSync, existsSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';

const MIN_ANCHOR = 24; // короче — совпадение случайно и ничего не доказывает

export function normalize(text) {
  return text
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractOracleBlock(brief) {
  const lines = brief.split('\n');
  const start = lines.findIndex((l) => /Источник оракула|Строка плана, дающая оракул/.test(l));
  if (start === -1) return '';
  const block = [];
  for (let i = start; i < lines.length; i += 1) {
    if (i > start && /^\s*$/.test(lines[i])) break;
    block.push(lines[i]);
  }
  return block.join('\n');
}

export function extractQuotes(block) {
  return [...block.matchAll(/«([^»]+)»/g)].map((m) => normalize(m[1])).filter((q) => q.length > 0);
}

export function extractPaths(block) {
  return [...block.matchAll(/[A-Za-z0-9_@./-]+\.(?:md|json|ts|tsx|mjs|cjs|js|sql|sh|yml|yaml)/g)]
    .map((m) => m[0].replace(/^`|`$/g, ''))
    .filter((p, i, all) => all.indexOf(p) === i);
}

/** Цитата длиннее файла-строки не бывает целиком — ищем самый длинный якорь, который реально есть. */
export function quoteFoundIn(quote, haystack) {
  if (quote.length <= MIN_ANCHOR) return haystack.includes(quote);
  if (haystack.includes(quote)) return true;
  // Длинная цитата могла быть склеена из двух мест файла: достаточно устойчивого начала.
  const anchor = quote.slice(0, Math.max(MIN_ANCHOR, Math.floor(quote.length * 0.6)));
  return haystack.includes(anchor);
}

export function verify(briefPath, repoRoot) {
  const brief = readFileSync(briefPath, 'utf8');
  const block = extractOracleBlock(brief);
  if (!block) return { ok: true, skipped: 'в брифе нет абзаца «Источник оракула» — этот гейт не его работа' };
  const quotes = extractQuotes(block);
  if (quotes.length === 0) return { ok: false, reason: 'в абзаце «Источник оракула» нет ни одной цитаты в «…»' };
  const paths = extractPaths(block);
  if (paths.length === 0) {
    return { ok: false, reason: 'в абзаце «Источник оракула» не назван ни один файл-источник — цитату не с чем сверить' };
  }
  const readable = [];
  const missing = [];
  for (const p of paths) {
    const full = isAbsolute(p) ? p : resolve(repoRoot, p);
    if (existsSync(full)) readable.push({ p, text: normalize(readFileSync(full, 'utf8')) });
    else missing.push(p);
  }
  if (readable.length === 0) {
    return { ok: false, reason: `ни один названный файл не читается: ${missing.join(', ')}` };
  }
  for (const q of quotes) {
    for (const f of readable) {
      if (quoteFoundIn(q, f.text)) return { ok: true, matched: { quote: q.slice(0, 60), file: f.p } };
    }
  }
  return {
    ok: false,
    reason: `ни одна цитата не найдена в названных файлах (${readable.map((f) => f.p).join(', ')})`
      + (missing.length ? `; не читаются: ${missing.join(', ')}` : ''),
  };
}

function selfTest() {
  const cases = [];
  const tmp = resolve(process.cwd(), 'runs');
  const fake = resolve(tmp, '.oracle-selftest.md');
  mkdirSync(tmp, { recursive: true });
  writeFileSync(fake, 'Требование: Файл упражнения длиннее 10 минут не принимается (проверка после duration).\n');

  const briefOk = resolve(tmp, '.oracle-selftest-brief-ok.md');
  writeFileSync(briefOk, `## Источник оракула\nПлан \`runs/.oracle-selftest.md\`, дословно:\n«Файл упражнения длиннее 10 минут не принимается (проверка после duration).»\n\nдальше\n`);
  cases.push(['настоящая цитата проходит', verify(briefOk, process.cwd()).ok === true]);

  const briefFake = resolve(tmp, '.oracle-selftest-brief-fake.md');
  writeFileSync(briefFake, `## Источник оракула\nГейт \`runs/.oracle-selftest.md\`, дословно: «eslint src --max-warnings=0»\n\nдальше\n`);
  cases.push(['выдуманная цитата отвергается', verify(briefFake, process.cwd()).ok === false]);

  const briefNoFile = resolve(tmp, '.oracle-selftest-brief-nofile.md');
  writeFileSync(briefNoFile, `## Источник оракула\nдословно: «что-то без источника»\n\nдальше\n`);
  cases.push(['цитата без файла-источника отвергается', verify(briefNoFile, process.cwd()).ok === false]);

  for (const f of [fake, briefOk, briefFake, briefNoFile]) rmSync(f, { force: true });
  let failed = 0;
  for (const [name, ok] of cases) {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
    if (!ok) failed += 1;
  }
  console.log(`self-test: ${cases.length - failed}/${cases.length}`);
  process.exit(failed === 0 ? 0 : 1);
}

const args = process.argv.slice(2);
if (args[0] === '--self-test') {
  selfTest();
} else {
  const briefPath = args[0];
  const repoIdx = args.indexOf('--repo');
  const repoRoot = repoIdx !== -1 ? args[repoIdx + 1] : process.cwd();
  if (!briefPath) {
    console.error('нужен путь к брифу');
    process.exit(2);
  }
  const result = verify(briefPath, repoRoot);
  if (result.ok) {
    if (result.matched) console.error(`  цитата оракула сверена с файлом: ${result.matched.file}`);
    process.exit(0);
  }
  console.error(`ОТКАЗ: цитата «Источник оракула» не подтверждена источником.\n  ${result.reason}\n`
    + '  Цитата обязана дословно встречаться в файле, названном в том же абзаце.\n'
    + '  Выдуманная цитата — это ложная authority: под неё заводится работа, которой никто не просил.');
  process.exit(1);
}
