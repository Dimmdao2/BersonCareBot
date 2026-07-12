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
OVERRIDE=/tmp/bcb-test-setup/test-settings-override.sql
DATAFIX=deploy/postgres/p0-data-fix-doctor-admin-split.sql
UNITS=(api worker scheduler webapp media-worker)

log(){ echo; echo "== [deploy-test-saas] $* =="; }
revoke_bypass(){ sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE $DBROLE NOBYPASSRLS;" >/dev/null 2>&1 || true; }
trap revoke_bypass EXIT   # NEVER leave BYPASSRLS on

# 0. preflight
for f in "$RESTORE" "$OVERRIDE" "$API_ENV" "$WEBAPP_ENV"; do
  [ -r "$f" ] || { echo "FATAL: missing required file: $f"; exit 1; }
done

# 1. fresh test DB = clean copy of the newest production dump
DUMP="$(sudo -u postgres bash -lc "ls -t /opt/backups/postgres/hourly/*.dump 2>/dev/null | head -1")"
[ -n "$DUMP" ] || { echo "FATAL: no prod dump in /opt/backups/postgres/hourly"; exit 1; }
log "restore $DB from $(basename "$DUMP")"
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

# 5. test-only settings override — fix ON CONFLICT for the org-aware PARTIAL unique index (global rows)
log "test settings override"
sudo -u postgres bash -lc "sed 's/ON CONFLICT (key, scope) DO UPDATE/ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE/g' '$OVERRIDE' | psql -d $DB -v ON_ERROR_STOP=1"

# 6. restart test units + verify (and that the prod WireGuard relay is untouched)
log "restart test units"
for u in "${UNITS[@]}"; do sudo systemctl restart "bersoncarebot-$u-test"; done
sleep 4
for u in "${UNITS[@]}"; do printf "   %-13s %s\n" "$u:" "$(systemctl is-active "bersoncarebot-$u-test")"; done
echo -n "   health: "; curl -sk --max-time 10 https://test.bersoncare.ru/api/health || true; echo
echo "   awg-quick@awg0 (must stay active): $(systemctl is-active awg-quick@awg0)"
log "DONE — clean dormant deploy from zero (walls DORMANT / legacy-guc)"
