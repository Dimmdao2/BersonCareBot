#!/usr/bin/env node
/**
 * Гейт правды журнала миграций: собирает SQL, который спрашивает живую базу
 * «сбылось ли то, что обещала каждая миграция, помеченная применённой».
 *
 * Зачем он есть (15.09.2026). Мигратор считает миграцию применённой по ОДНОМУ признаку — её тег
 * лежит в `drizzle.__drizzle_migrations`. Больше он ничего не спрашивает. Артефакт переезда
 * `deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql` пишет теги в этот журнал
 * НАПРЯМУЮ, чтобы цель не переигрывала DDL, уже приехавший сгенерированной схемой. Один раз этого
 * оказалось достаточно, чтобы соврать: DDL миграции
 * `20260912T012000_the_organization_names_the_appointment_word` приехал, а её data-only вставка —
 * нет, и кабинет клиента упал целиком и на TEST, и на новом проде. Владелец 15.09: «вот это главный
 * баг что такое вообще возможно».
 *
 * Спрашивать было чем с самого начала: 207 из 216 миграций несут в заголовке строку
 * `-- BCB-MIGRATION-VERIFY: <предикат>` — готовый вопрос «сбылось ли обещанное». До этого гейта его
 * не задавал НИКТО: во всём репозитории маркер читали только три `*.test.mjs`.
 *
 * Два разных исхода, и они НЕ синонимы:
 *   ЛОЖЬ        — предикат исполнился и вернул не-истину (или ноль строк). Журнал врёт.
 *   НЕИСПОЛНИМ  — предикат не является исполнимым выражением (проза вместо SQL, несколько
 *                 операторов). Такую миграцию не проверяет никто, и это тоже отказ: «не смогли
 *                 проверить» — не то же самое, что «сбылось».
 *
 * Вывод — SQL на stdout. Ни узла, ни этого репозитория на цели не требуется:
 *   node deploy/postgres/migration-journal-truth.mjs > /tmp/truth.sql
 *   sudo -u postgres psql -d <база> -X -v ON_ERROR_STOP=1 -f /tmp/truth.sql
 * Ненулевой код возврата psql — отказ гейта.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Режим сравнения. Предикат `BCB-MIGRATION-VERIFY` — утверждение на МОМЕНТ своей миграции, а не
 * вечный инвариант: следующая миграция законно переименовывает функцию или убирает колонку, и
 * старый предикат перестаёт сбываться на ЛЮБОЙ честно отмигрированной базе. Поэтому гейт не судит
 * базу в одиночку, а сравнивает её с эталоном — базой, которая прошла миграции по-настоящему.
 * Предикат, не сбывшийся на обеих, — устаревшая формулировка; не сбывшийся ТОЛЬКО на цели — потеря.
 */
if (process.argv[2] === '--diff') {
  const [reference, target] = process.argv.slice(3);
  if (!reference || !target) {
    process.stderr.write('использование: --diff <эталон.tsv> <цель.tsv>\n');
    process.exit(2);
  }
  const read = (path) =>
    new Map(
      readFileSync(path, 'utf8')
        .split(/\r?\n/u)
        .filter((line) => line.startsWith('RESULT\t'))
        .map((line) => line.split('\t'))
        .map(([, tag, ordinal, verdict, detail]) => [`${tag}#${ordinal}`, { verdict, detail }]),
    );
  const held = read(reference);
  const actual = read(target);
  const lost = [];
  for (const [key, row] of held) {
    if (row.verdict !== 'СБЫЛОСЬ') continue;
    const there = actual.get(key);
    if (!there) {
      lost.push(`${key} — на цели этой миграции нет в журнале`);
    } else if (there.verdict !== 'СБЫЛОСЬ') {
      lost.push(`${key} — ${there.verdict}: ${there.detail ?? ''}`);
    }
  }
  const unjudged = [...actual.keys()].filter((key) => !held.has(key));
  if (unjudged.length !== 0) {
    process.stdout.write(
      `сравнить не с чем: ${unjudged.length} предикатов есть у цели и нет у эталона ` +
        '(их миграции до эталона ещё не доехали) — гейт по ним молчит\n',
    );
  }
  if (lost.length === 0) {
    process.stdout.write('журнал цели не врёт: всё, что сбылось на эталоне, сбылось и здесь\n');
    process.exit(0);
  }
  process.stdout.write(`журнал цели врёт: ${lost.length} обещаний не подтвердилось\n`);
  for (const line of lost) process.stdout.write(`  ${line}\n`);
  process.exit(1);
}

const MIGRATIONS = process.argv[2] ?? join(REPO, 'apps', 'webapp', 'db', 'drizzle-migrations');
const QUOTE = '$bcb_verify$';

/** Заголовочная строка предиката. Тело миграции не трогаем: маркер живёт только в комментарии. */
const MARKER = /^--\s*BCB-MIGRATION-VERIFY:\s*(.+?)\s*$/u;

function predicatesOf(source) {
  const out = [];
  for (const line of source.split(/\r?\n/u)) {
    const match = MARKER.exec(line);
    if (match) out.push(match[1]);
  }
  return out;
}

/**
 * Предикаты написаны в двух формах — целым `SELECT …` и голым булевым выражением. Обе законны,
 * приводим к одной. Несколько операторов в одной строке исполнять нельзя: это уже не предикат.
 */
function normalize(raw) {
  const trimmed = raw.replace(/;\s*$/u, '').trim();
  if (trimmed.includes(';')) return { runnable: false, reason: 'несколько операторов в предикате' };
  if (trimmed.includes(QUOTE)) return { runnable: false, reason: 'предикат содержит служебную кавычку' };
  const sql = /^select\b/iu.test(trimmed) ? trimmed : `SELECT ${trimmed}`;
  return { runnable: true, sql };
}

const rows = [];
for (const file of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) {
  const tag = file.replace(/\.sql$/u, '');
  const list = predicatesOf(readFileSync(join(MIGRATIONS, file), 'utf8'));
  list.forEach((raw, index) => {
    const normalized = normalize(raw);
    rows.push({
      tag,
      ordinal: index + 1,
      sql: normalized.runnable ? normalized.sql : null,
      reason: normalized.runnable ? null : normalized.reason,
    });
  });
}

const lit = (value) => (value === null ? 'NULL' : `${QUOTE}${value}${QUOTE}`);
const values = rows
  .map((r) => `  (${lit(r.tag)}, ${r.ordinal}, ${lit(r.sql)}, ${lit(r.reason)})`)
  .join(',\n');

process.stdout.write(`-- Сгенерировано deploy/postgres/migration-journal-truth.mjs. Правки вносить в генератор.
\\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE bcb_migration_truth (tag text, ordinal int, verdict text, detail text) ON COMMIT DROP;

DO $bcb_truth$
DECLARE
  promise record;
  held text;
  verdict text;
  detail text;
BEGIN
  FOR promise IN
    SELECT p.tag, p.ordinal, p.predicate, p.unrunnable
    FROM (VALUES
${values}
    ) AS p(tag, ordinal, predicate, unrunnable)
    WHERE EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations j WHERE j.tag = p.tag)
    ORDER BY p.tag, p.ordinal
  LOOP
    IF promise.unrunnable IS NOT NULL THEN
      verdict := 'НЕИСПОЛНИМ'; detail := promise.unrunnable;
    ELSE
      BEGIN
        -- Забираем ТЕКСТОМ, а не boolean: часть предикатов написана выражением другого типа, и
        -- приведение на входе превратило бы «предикат не булев» в «предикат не сбылся».
        EXECUTE promise.predicate INTO held;
        IF held IN ('t', 'true') THEN
          verdict := 'СБЫЛОСЬ'; detail := NULL;
        ELSIF held IS NULL THEN
          verdict := 'НЕ СБЫЛОСЬ'; detail := 'NULL или ни одной строки';
        ELSIF held IN ('f', 'false') THEN
          verdict := 'НЕ СБЫЛОСЬ'; detail := 'false';
        ELSE
          verdict := 'НЕБУЛЕВ'; detail := left(held, 120);
        END IF;
      EXCEPTION WHEN others THEN
        verdict := 'ОТКАЗ'; detail := SQLSTATE || ' ' || SQLERRM;
      END;
    END IF;
    INSERT INTO bcb_migration_truth VALUES (promise.tag, promise.ordinal, verdict, detail);
  END LOOP;
END
$bcb_truth$;

SELECT 'RESULT' AS marker, tag, ordinal, verdict, coalesce(left(detail, 200), '') AS detail
FROM bcb_migration_truth ORDER BY tag, ordinal;

ROLLBACK;
`);
