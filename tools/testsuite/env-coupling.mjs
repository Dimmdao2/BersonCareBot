/**
 * Поиск тестов, привязанных к ОБСТОЯТЕЛЬСТВАМ ЗАПУСКА, а не к поведению (задача владельца 29.07).
 *
 * Обобщение трёх находок дня: вмороженные `файл:строка`, жёсткие кавычки в сканере исходников и
 * путь от текущего каталога. Общее у них — тест падает или зеленеет из-за того, ГДЕ и КАК его
 * запустили, а не из-за того, что делает код.
 *
 * Признаки ищутся статически, по дереву разбора и по тексту. Каждый — кандидат, не приговор:
 * решение принимает человек, поэтому вывод сгруппирован по классам с примерами.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] ?? '/home/dev/dev-projects/BersonCareBot';
const DIRS = ['apps/webapp/src', 'apps/webapp/scripts', 'apps/webapp/e2e', 'apps/integrator/src', 'packages'];

const walk = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['node_modules', '.next', 'dist', 'coverage'].includes(e.name)) continue;
      walk(p, out);
    } else if (/\.(test|spec)\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
};

const CLASSES = [
  {
    id: 'путь от текущего каталога',
    why: 'ломается при запуске из другого каталога или в песочнице (нашлось прогоном мутаций)',
    re: /(readFileSync|readdirSync|readFile|existsSync)\(\s*['"`]\.\.?\//,
  },
  {
    id: 'абсолютный путь машины',
    why: 'привязка к конкретному боксу — на другой машине или в CI пути нет',
    re: /['"`]\/(home|Users|tmp|var)\//,
  },
  {
    id: 'process.cwd()',
    why: 'результат зависит от каталога запуска',
    re: /process\.cwd\(\)/,
  },
  {
    id: 'текущее время без подмены',
    why: 'зелёный сегодня, красный в другой день/час; полночь и високосный год ловят такие тесты',
    re: /(new Date\(\s*\)|Date\.now\(\))/,
    unless: /vi\.(useFakeTimers|setSystemTime)/,
  },
  {
    id: 'часовой пояс в тексте',
    why: 'результат меняется вместе с TZ машины',
    re: /Europe\/Moscow|America\/|Asia\/|process\.env\.TZ/,
  },
  {
    id: 'локаль без явного указания',
    why: 'toLocale* без локали форматирует по настройкам машины',
    re: /toLocale(String|DateString|TimeString)\(\s*\)/,
  },
  {
    id: 'случайность',
    why: 'невоспроизводимый прогон',
    re: /Math\.random\(\)/,
  },
  {
    id: 'сеть или живой хост',
    why: 'зависит от того, что поднято рядом',
    re: /https?:\/\/(localhost|127\.0\.0\.1|[a-z0-9.-]+\.(ru|com))(:\d+)?/,
    unless: /nock|msw|http:\/\/localhost\/api/,
  },
  {
    id: 'переменная окружения без установки',
    why: 'зелёный только при определённом .env',
    re: /process\.env\.[A-Z_]{3,}/,
    unless: /vi\.stubEnv|process\.env\.[A-Z_]+\s*=/,
  },
  {
    id: 'текст .sql деплоя или миграции',
    why: 'деплой проверяет то же против живой базы и строже — дублирование (решение владельца 29.07)',
    re: /['"`][^'"`]*\.sql['"`]|deploy\/postgres/,
  },
];

const files = DIRS.flatMap((d) => walk(path.join(ROOT, d)));
const hits = new Map(CLASSES.map((c) => [c.id, []]));

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  // строки-комментарии выкидываем: упоминание в комментарии не делает тест хрупким
  const code = src
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
  for (const c of CLASSES) {
    if (!c.re.test(code)) continue;
    if (c.unless && c.unless.test(code)) continue;
    hits.get(c.id).push(path.relative(ROOT, f));
  }
}

console.log(`осмотрено тестовых файлов: ${files.length}\n`);
const rows = CLASSES.map((c) => ({ ...c, n: hits.get(c.id).length })).sort((a, b) => b.n - a.n);
for (const r of rows) {
  console.log(`${String(r.n).padStart(4)}  ${r.id}`);
  console.log(`      ${r.why}`);
}
if (process.argv.includes('--list')) {
  const only = process.argv[process.argv.indexOf('--list') + 1];
  for (const r of rows) {
    if (only && !r.id.includes(only)) continue;
    console.log(`\n### ${r.id} (${r.n})`);
    for (const f of hits.get(r.id)) console.log('  ' + f);
  }
}
