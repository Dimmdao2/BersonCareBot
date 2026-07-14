#!/usr/bin/env bash
# deploy-test-saas.sh — ONE clean cycle from zero: fresh prod-copy test DB → deploy branch code →
# apply the SaaS migration chain the CORRECT way (#667/#708) → restart test units → verify healthy.
# Walls stay DORMANT (legacy-guc). Proven sequence; see docs/_TODO/SAAS_FOUNDATION/SAAS_DEPLOY_SEQUENCE.md.
#
# Why the plain deploy-test.sh is not enough:
#   - a migration asserts the doctor/admin membership seed → needs p0-data-fix-doctor-admin-split.sql FIRST;
#   - some migrations backfill under already-installed FORCE RLS → need a TEMP BYPASSRLS migrator.
#
# Run as user `dev` (uses sudo for postgres/deploy/systemctl). Idempotent: recreates the test DB every run.
# Usage:  bash deploy/host/deploy-test-saas.sh [branch]   (default: auto/code-pg-delta)
set -euo pipefail

SRC_REPO=/home/dev/dev-projects/BersonCareBot
DEPLOY_REPO=/opt/projects/bersoncarebot-test
BRANCH="${1:-auto/code-pg-delta}"
API_ENV=/opt/env/bersoncarebot/api.test
WEBAPP_ENV=/opt/env/bersoncarebot/webapp.test
BUNDLE=/tmp/bcb-test-deploy.bundle
DB=bersoncarebot_test
DBROLE=bersoncarebot_test
RESTORE=/tmp/bcb-test-setup/restore-test-db.sh
OVERRIDE=deploy/postgres/test-settings-override.sql   # repo-tracked (was /tmp); post-migrate partial-index upserts + identity normalization
DATAFIX=deploy/postgres/p0-data-fix-doctor-admin-split.sql
UNITS=(api worker scheduler webapp media-worker)

# ── KNOWN ANCHORS (owner's real, stable prod identities — the whole sequence keys off these; same on prod) ──
#   doctor phone   +79643805480   (p0-data-fix + override: role=doctor, owns yandex email, doctor allowlist)
#   client phone   +79189000782   (p0-data-fix: same-name client, must NOT hold the doctor email)
#   doctor email   dimmdao@yandex.ru   admin email  dimmdao@gmail.com
#   org id         a0000000-0000-4000-8000-000000000001
#   canonical specialist  c9515025-7224-4d9b-86b6-9cb7d26ea503  (the "Дмитрий Берсон" row holding the full
#                         appointment history; the per-branch rubitime dup is merged into it + deactivated)
ORG_ID=a0000000-0000-4000-8000-000000000001
CANONICAL_SPECIALIST=c9515025-7224-4d9b-86b6-9cb7d26ea503
# LIVE prod source (adelaide / 135.106.162.170). The local /opt/backups on THIS (test/151.x) box are of a
# DEAD June-28 prod copy — NEVER use them for a real rehearsal. Pull a fresh dump from live prod via ssh.
PROD_SSH=bcb-clone
PROD_DB=bersoncarebot

log(){ echo; echo "== [deploy-test-saas] $* =="; }
revoke_bypass(){ sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE $DBROLE NOBYPASSRLS;" >/dev/null 2>&1 || true; }
trap revoke_bypass EXIT   # NEVER leave BYPASSRLS on

run_a2_nginx_preflight(){
  local dump_file
  dump_file="$(mktemp /tmp/bcb-nginx-dump.XXXXXX)"
  sudo nginx -T >"$dump_file" 2>/tmp/bcb-nginx-dump.err
  node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-a2-nginx-forwarded-host.mjs --nginx-dump="$dump_file"
  rm -f "$dump_file" /tmp/bcb-nginx-dump.err
}

run_a2_product_smoke_if_configured(){
  if [ -z "${SAAS_PRODUCT_SMOKE_FIXTURE:-}" ]; then
    echo "   saas product smoke: skipped (SAAS_PRODUCT_SMOKE_FIXTURE not set)"
    return 0
  fi

  [ -r "$SAAS_PRODUCT_SMOKE_FIXTURE" ] || { echo "FATAL: SAAS_PRODUCT_SMOKE_FIXTURE is not readable: $SAAS_PRODUCT_SMOKE_FIXTURE"; exit 1; }
  local smoke_dir
  smoke_dir="${SAAS_PRODUCT_SMOKE_OUTPUT_DIR:-/tmp/bcb-saas-product-smoke}"
  mkdir -p "$smoke_dir"
  local smoke_args=()
  if [ -n "${SAAS_PRODUCT_SMOKE_CATEGORIES:-}" ]; then
    smoke_args+=("--categories=$SAAS_PRODUCT_SMOKE_CATEGORIES")
  fi
  if [ -n "${SAAS_PRODUCT_SMOKE_SCENARIO_IDS:-}" ]; then
    smoke_args+=("--scenario-ids=$SAAS_PRODUCT_SMOKE_SCENARIO_IDS")
  fi
  node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-saas-product.mjs \
    --mode="${SAAS_PRODUCT_SMOKE_MODE:-dormant}" \
    --base-url="${SAAS_PRODUCT_SMOKE_BASE_URL:-https://test.bersoncare.ru}" \
    --fixture-file="$SAAS_PRODUCT_SMOKE_FIXTURE" \
    --json-output="$smoke_dir/saas-product-smoke.json" \
    --junit-output="$smoke_dir/saas-product-smoke.junit.xml" \
    "${smoke_args[@]}"
}

run_b1_doctor_admin_identity_assertion(){
  if [ "${SAAS_B1_IDENTITY_ASSERTION_SKIP:-0}" = "1" ]; then
    echo "   B1 doctor/admin identity assertion: skipped (SAAS_B1_IDENTITY_ASSERTION_SKIP=1)"
    return 0
  fi

  sudo -u deploy bash -lc "cd '$DEPLOY_REPO' && set -a && . '$WEBAPP_ENV' && set +a && \
    node docs/_TODO/SAAS_FOUNDATION/scripts/check-b1-doctor-admin-identity.mjs \
      --execute \
      --allow-test-target \
      --database-url \"\$DATABASE_URL\""
}

# 0. preflight (env files are deploy-owned → check as deploy, not as dev)
[ -r "$RESTORE" ] || { echo "FATAL: missing required file: $RESTORE"; exit 1; }
[ -r "$SRC_REPO/$OVERRIDE" ] || { echo "FATAL: missing repo file: $SRC_REPO/$OVERRIDE"; exit 1; }
for f in "$API_ENV" "$WEBAPP_ENV"; do
  sudo -u deploy test -r "$f" || { echo "FATAL: deploy cannot read required env file: $f"; exit 1; }
done

# 1. fresh test DB = FRESH dump streamed from LIVE prod (read-only pg_dump over ssh; no file left on prod).
#    Override with DUMP=/path env to reuse a pre-pulled dump. Do NOT fall back to /opt/backups here —
#    those are the DEAD local copy; a silent stale restore is exactly the bug that wasted hours.
if [ -z "${DUMP:-}" ]; then
  DUMP=/tmp/bcb-prod-fresh.dump
  log "pull FRESH dump from live prod ($PROD_SSH:$PROD_DB) → $DUMP"
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$PROD_SSH" "sudo -u postgres pg_dump -Fc --no-owner --no-acl $PROD_DB" > "$DUMP"
  chmod 644 "$DUMP"
fi
[ -s "$DUMP" ] || { echo "FATAL: dump missing/empty: $DUMP"; exit 1; }
log "restore $DB from $(basename "$DUMP") ($(du -h "$DUMP" | cut -f1))"
sudo -u postgres bash "$RESTORE" "$DUMP"

# 2. deliver branch code (bundle → checkout → build); deploy user cannot read /home/dev, so bundle via /tmp
log "bundle + checkout $BRANCH -> $DEPLOY_REPO"
git -C "$SRC_REPO" bundle create "$BUNDLE" "$BRANCH"; chmod 644 "$BUNDLE"
sudo -u deploy git -C "$DEPLOY_REPO" fetch "$BUNDLE" "$BRANCH"
sudo -u deploy git -C "$DEPLOY_REPO" checkout -f -B "$BRANCH" FETCH_HEAD
echo "   HEAD: $(sudo -u deploy git -C "$DEPLOY_REPO" rev-parse --short HEAD)"
log "build (install + build + build:webapp + media-worker + assets)"
sudo -u deploy bash -lc "cd '$DEPLOY_REPO' && export CI=true && \
  pnpm install --frozen-lockfile && \
  rm -rf dist && pnpm build && \
  rm -rf apps/webapp/.next && pnpm build:webapp && \
  pnpm --dir apps/media-worker build && \
  bash deploy/host/sync-webapp-standalone-assets.sh"

# 3. DATA-FIX first (the missing step — deploy-saas-667.sh Step 2)
log "data-fix (doctor/admin split)"
sudo -u deploy bash -lc "cd '$DEPLOY_REPO' && set -a && . '$WEBAPP_ENV' && set +a && \
  psql \"\$DATABASE_URL\" -v ON_ERROR_STOP=1 -f '$DATAFIX'"

# 4. migrate integrator + webapp Drizzle with TEMP BYPASSRLS (backfills under FORCE RLS), then revoke
log "migrate (temp BYPASSRLS)"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE $DBROLE BYPASSRLS;"
sudo -u deploy bash -lc "cd '$DEPLOY_REPO' && \
  API_ENV_FILE='$API_ENV' WEBAPP_ENV_FILE='$WEBAPP_ENV' pnpm migrate"
revoke_bypass
CNT="$(sudo -u postgres psql -d "$DB" -tAc "SELECT count(*) FROM drizzle.__drizzle_migrations;")"
[ "${CNT:-0}" -ge 178 ] || { echo "FATAL: drizzle migration count ${CNT:-0} < 178"; exit 1; }
for col in "system_settings.organization_id" "user_phone_history.organization_id"; do
  t="${col%.*}"; c="${col#*.}"
  ok="$(sudo -u postgres psql -d "$DB" -tAc "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='$t' AND column_name='$c');")"
  [ "$ok" = "t" ] || { echo "FATAL: missing column $col after migrate"; exit 1; }
done
echo "   drizzle migrations = $CNT (org columns present)"

# 5. test-only settings override (repo-tracked; post-migrate partial-index upserts, send-safety,
#    maintenance, allowlist, identity role-allowlist normalization, DB lock). Applied from the deploy
#    checkout so it is version-matched to the branch.
log "test settings override"
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -f "$DEPLOY_REPO/$OVERRIDE"

# 6. consolidate duplicate specialists → one canonical (idempotent; deterministic pinned --canonical).
#    Historical rubitime-per-branch dups split the owner's appointments/working-hours across TWO
#    "Дмитрий Берсон" be_specialists rows, so the solo-model resolver (resolveDoctorOwnSpecialistId)
#    picks arbitrarily and the doctor sees a partial/empty schedule. The consolidation REPOINTS every FK
#    ref of the dup → canonical and SOFT-deactivates the dup (never deletes appointment data). Idempotent:
#    a 2nd run finds 0 dups and changes 0 rows.
log "consolidate duplicate specialists → $CANONICAL_SPECIALIST"
sudo -u deploy bash -lc "cd '$DEPLOY_REPO' && set -a && . '$WEBAPP_ENV' && set +a && \
  pnpm --dir apps/webapp run consolidate-specialist-identity -- --commit --canonical='$CANONICAL_SPECIALIST' --org='$ORG_ID'"

# 7. end-state self-check (reproducibility gate — same asserted state every run, from zero)
log "verify end-state"
ACTIVE="$(sudo -u postgres psql -d "$DB" -tAc "SELECT count(*) FROM be_specialists WHERE is_active=true;")"
[ "${ACTIVE:-0}" = "1" ] || { echo "FATAL: expected exactly 1 active specialist, got ${ACTIVE:-0}"; exit 1; }
ORPHAN="$(sudo -u postgres psql -d "$DB" -tAc "SELECT count(*) FROM be_appointments WHERE specialist_id IS NULL OR specialist_id IN (SELECT id FROM be_specialists WHERE is_active=false);")"
[ "${ORPHAN:-1}" = "0" ] || { echo "FATAL: ${ORPHAN} appointments left on NULL/inactive specialist (data not fully consolidated)"; exit 1; }
DROLE="$(sudo -u postgres psql -d "$DB" -tAc "SELECT role FROM platform_users WHERE phone_normalized='+79643805480' AND merged_into_id IS NULL;")"
[ "$DROLE" = "doctor" ] || { echo "FATAL: canonical doctor role is '$DROLE', expected 'doctor'"; exit 1; }
APADMIN="$(sudo -u postgres psql -d "$DB" -tAc "SELECT value_json->>'value' FROM public.system_settings WHERE key='admin_phones' AND scope='admin' AND organization_id IS NULL;")"
[ "$APADMIN" = "[]" ] || { echo "FATAL: admin_phones is '$APADMIN', expected [] (owner phone must be doctor, not admin)"; exit 1; }
APPTS="$(sudo -u postgres psql -d "$DB" -tAc "SELECT count(*) FROM be_appointments WHERE specialist_id='$CANONICAL_SPECIALIST';")"
FUT="$(sudo -u postgres psql -d "$DB" -tAc "SELECT count(*) FROM be_appointments WHERE specialist_id='$CANONICAL_SPECIALIST' AND start_at>=now();")"
echo "   OK: 1 active specialist · $APPTS appointments on canonical ($FUT future) · doctor role held · admin_phones=[]"
[ "${FUT:-0}" -gt 0 ] || echo "   ⚠ WARNING: 0 future appointments — dump may be stale (live prod should have upcoming bookings)"
log "B1 doctor/admin identity assertion"
run_b1_doctor_admin_identity_assertion

# 8. restart test units + verify (and that the prod WireGuard relay is untouched)
log "restart test units"
for u in "${UNITS[@]}"; do sudo systemctl restart "bersoncarebot-$u-test"; done
sleep 4
for u in "${UNITS[@]}"; do printf "   %-13s %s\n" "$u:" "$(systemctl is-active "bersoncarebot-$u-test")"; done
echo -n "   health: "; curl -sk --max-time 10 https://test.bersoncare.ru/api/health || true; echo
log "A2 nginx forwarded-host preflight"
run_a2_nginx_preflight
log "A2 product smoke gate"
run_a2_product_smoke_if_configured
echo "   awg-quick@awg0 (must stay active): $(systemctl is-active awg-quick@awg0)"
log "DONE — clean dormant deploy from zero (walls DORMANT / legacy-guc)"
