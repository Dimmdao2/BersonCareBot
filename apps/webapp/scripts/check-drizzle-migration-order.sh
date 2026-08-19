#!/usr/bin/env bash
# The order of db/drizzle-migrations is the file name, and nothing else.
#
# It used to be the file name AND meta/_journal.json's `when`, and this check enforced that the two
# agreed. Two places for one fact is what made merging branches a hand-edit: on 19.08 the journal was
# corrected by hand three times, and one of those corrections dropped a migration on TEST. The
# runners now read the folder listing, so there is nothing left to keep in sync — what is checked
# here is that a file name can be sorted, that the journal — which survives only as the frozen
# historical `when -> tag` map used to label pre-existing ledger rows — still points at real files and
# still digests to the pin in meta/_journal.frozen, and that every migration owes the database a
# proof it actually ran.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MIG_DIR="${ROOT}/db/drizzle-migrations"
JOURNAL="${MIG_DIR}/meta/_journal.json"
LEGACY="${MIG_DIR}/meta/_legacy_names.txt"
[[ -f "${LEGACY}" ]] || { echo "check-drizzle-migration-order: нет ${LEGACY} — замороженный список исторических имён обязателен" >&2; exit 1; }

failed=0
shopt -s nullglob
for sql in "${MIG_DIR}"/*.sql; do
  base="$(basename "${sql}" .sql)"
  # Four digits first, so the listing sorts the way a human reads it; a suffix letter is how a
  # migration slots between two already-applied ones without renaming either.
  # Каноническая схема ОДНА: YYYYMMDDTHHMMSS_lower_snake_case (владелец, 20.08). Рукописный номер
  # при параллельных ветках даёт коллизии — время не даёт. Старая схема NNNN[suffix]_ законна ТОЛЬКО
  # для пятидесяти уже применённых файлов: их имена привязаны к тегам в леджере, переименование
  # разорвало бы тождество. Список заморожен в meta/_legacy_names.txt и НЕ пополняется.
  if [[ ! "${base}" =~ ^[0-9]{8}T[0-9]{6}_[a-z0-9_]+$ ]]; then
    if grep -qxF "${base}" "${LEGACY}" 2>/dev/null; then
      : # историческое имя из замороженного списка
    else
      echo "check-drizzle-migration-order: ${base}.sql — недопустимое имя. Новые миграции называются" >&2
      echo "  YYYYMMDDTHHMMSS_lower_snake_case (например $(date -u +%Y%m%dT%H%M%S)_what_this_changes)." >&2
      echo "  Схема с номером NNNN_ закрыта: номер выбирается рукой и в параллельных ветках сталкивается." >&2
      echo "  Если это переименование уже применённой миграции — так нельзя: тег в леджере привязан к имени." >&2
      failed=1
    fi
  fi
done

if [[ -f "${JOURNAL}" ]]; then
  node - "${JOURNAL}" "${MIG_DIR}" <<'NODE' || failed=1
const fs = require("node:fs");
const path = require("node:path");

const [journalPath, migrationsDir] = process.argv.slice(2);
const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
const seenTags = new Set();
const seenWhens = new Set();
let failed = false;

for (const entry of journal.entries ?? []) {
  if (seenTags.has(entry.tag)) {
    console.error(`check-drizzle-migration-order: duplicate tag ${entry.tag} in the historical map`);
    failed = true;
  }
  if (seenWhens.has(entry.when)) {
    console.error(
      `check-drizzle-migration-order: two entries claim when=${entry.when}; one ledger row cannot get two names`,
    );
    failed = true;
  }
  seenTags.add(entry.tag);
  seenWhens.add(entry.when);
  if (!fs.existsSync(path.join(migrationsDir, `${entry.tag}.sql`))) {
    console.error(
      `check-drizzle-migration-order: the historical map names ${entry.tag}, which has no .sql file; ` +
        "an applied migration was deleted or renamed",
    );
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
NODE
fi

if (( failed != 0 )); then
  echo "Новая миграция: db/drizzle-migrations/YYYYMMDDTHHMMSS_name.sql и ничего больше." >&2
  echo "Порядок применения ничего не гарантирует: тождество миграции — её тег в леджере, вопрос один —" >&2
  echo "применена или нет (решение владельца 20.08)." >&2
  echo "meta/_journal.json is the frozen historical map; do not hand-edit it to reorder anything." >&2
  exit 1
fi

node "${ROOT}/scripts/run-webapp-drizzle-migrate.mjs" --check-online-index-layout
# The frozen historical map really is frozen (its digest matches meta/_journal.frozen), and every
# migration owes the database a proof it ran — an object it still holds, or a VERIFY probe. A
# migration that owes nothing makes a hand-written ledger row indistinguishable from a real one.
node "${ROOT}/scripts/run-webapp-drizzle-migrate.mjs" --check-migration-proofs

echo "check-drizzle-migration-order: OK"
