#!/usr/bin/env bash
# Прогон живых сценариев Э3 (§18а) из отчёта аудита 15.09 против движка ЭТОГО клона.
#
# Зачем отдельная обёртка: дословные команды отчёта аудита не воспроизводятся — банер
# `--banner:js="import { createRequire } …"` сталкивается с таким же импортом в самом файле;
# OS-пользователь `postgres` не читает каталог бокса, поэтому `createRequire(<repo>/apps/webapp/
# package.json)('pg')` даёт MODULE_NOT_FOUND; а `await import(`${sourceRoot}/x.ts`)` остаётся
# динамическим, и голый node TypeScript не исполняет.
#
# Меняется ТОЛЬКО транспорт: драйвер `pg` вкладывается в бандл, путь движка становится литералом
# ТОГО ЖЕ каталога. Сценарии, фикстуры и утверждения — авторские, из файла аудита.
#
#   bash docs/audit/evidence/merge-fio-on-canon-fix-2026-09-15/e3-rerun.sh \
#     docs/audit/evidence/merge-fio-on-canon-2026-09-15/e3-live-fio-scenarios.rerun.mts AUDIT_PGHOST
#   bash docs/audit/evidence/merge-fio-on-canon-fix-2026-09-15/e3-rerun.sh \
#     docs/audit/evidence/merge-fio-on-canon-2026-09-15/e3-live-manual-fio.rerun.mts LIVE_PGHOST
#
# Гонять через общий замок хоста: /home/dev/brain/host-orch/run-tests.sh "bash …"
set -euo pipefail
src="$1"; envvar="$2"
cd /home/dev/dev-projects/bcb-wt-conflict-screens
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
esb=$(ls -d node_modules/.pnpm/@esbuild+linux-x64@*/node_modules/@esbuild/linux-x64/bin/esbuild | head -1)
# Единственная правка исходника — ТРАНСПОРТ драйвера: runtime-require по пути, который OS-пользователь
# postgres не читает, заменяется статическим импортом, и esbuild вкладывает `pg` в бандл. Движок
# слияния импортируется как был — из ЭТОГО клона.
python3 - "$src" "$tmp/entry.mts" <<'PY'
import sys, pathlib, re
s = pathlib.Path(sys.argv[1]).read_text()
s2 = re.sub(
    r"const requireFromWebapp = createRequire\([^;]*?\);\nconst pg = requireFromWebapp\('pg'\) as typeof import\('pg'\);",
    "import pg from 'pg';",
    s,
)
assert s2 != s, 'pg require shape not found'
# Второй транспортный шов: `await import(`${sourceRoot}/x.ts`)` — шаблонная строка, esbuild её не
# видит, а голый node не исполняет TypeScript. Путь становится литералом ТОГО ЖЕ каталога, и движок
# попадает в бандл из исходников этого клона.
root = re.search(r"const sourceRoot = [`']([^`']+)[`'];", s2).group(1).replace('${repoRoot}', re.search(r"const repoRoot = '([^']+)';", s2).group(1) if 'repoRoot' in s2 else '')
s3 = re.sub(r"await import\(\s*`\$\{sourceRoot\}/([A-Za-z]+\.ts)`\s*\)", lambda m: f"await import('{root}/" + m.group(1) + "')", s2)
assert s3 != s2, 'dynamic engine import shape not found'
# Главная страховка прогона: движок обязан приехать ИЗ ЭТОГО клона. Однажды набор Э3 уже был ложно
# зелёным ровно потому, что зашитый абсолютный путь импортировал движок из соседнего клона.
here = '/home/dev/dev-projects/bcb-wt-conflict-screens'
assert root.startswith(here + '/'), f'engine would come from another clone: {root}'
print(f'engine bundled from: {root}')
s2 = s3
pathlib.Path(sys.argv[2]).write_text(s2)
PY
"$esb" "$tmp/entry.mts" --bundle --platform=node --format=esm --banner:js="import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" \
  --outfile="$tmp/run.mjs" \
  --alias:pg=/home/dev/dev-projects/bcb-wt-conflict-screens/apps/webapp/node_modules/pg \
  --external:pg-native --external:cloudflare:sockets >/dev/null
chmod -R a+rX "$tmp"
sudo -n -u postgres env "$envvar=/var/run/postgresql" /usr/bin/node "$tmp/run.mjs"
