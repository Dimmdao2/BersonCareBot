#!/usr/bin/env bash
# Baseline screenshot script for BersonCareBot webapp
# Uses chromium-browser headless mode as documented in:
#   docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md §4.7
#
# DO NOT COMMIT this file — it is a temp QA artifact.
# Output: /home/dev/dev-projects/.lead/runs/design-primitives/baseline/

set -euo pipefail

BASE_URL="http://127.0.0.1:5200"
OUT="/home/dev/dev-projects/.lead/runs/design-primitives/baseline"
PROF_PATIENT="${OUT}/.chromium-prof-patient"
PROF_DOCTOR="${OUT}/.chromium-prof-doctor"
WINDOW="1440,900"
VTIMEOUT=12000

mkdir -p "$OUT" "$PROF_PATIENT" "$PROF_DOCTOR"

take_shot() {
  local prof="$1"
  local url="$2"
  local outfile="$3"
  local vtimeout="${4:-$VTIMEOUT}"

  echo "  → Screenshot: $url → $outfile"
  timeout 60 chromium-browser \
    --headless=old \
    --no-sandbox \
    --disable-gpu \
    --hide-scrollbars \
    --window-size="$WINDOW" \
    --virtual-time-budget="$vtimeout" \
    --user-data-dir="$prof" \
    --screenshot="$outfile" \
    "$url" 2>/dev/null || echo "    WARNING: chromium exited non-zero for $url"
}

auth_profile() {
  local prof="$1"
  local token="$2"  # URL-encoded token e.g. dev%3Aclient
  echo "  → Authenticating profile $prof with token $token"
  # Auth step: NO --virtual-time-budget (so cookie persists to disk)
  timeout 50 chromium-browser \
    --headless=old \
    --no-sandbox \
    --disable-gpu \
    --user-data-dir="$prof" \
    --screenshot="${prof}/_auth.png" \
    "${BASE_URL}/api/auth/dev-bypass?token=${token}" 2>/dev/null || true

  # Verify cookie was saved
  local cookie_count
  cookie_count=$(find "$prof" -name "Cookies" -exec sh -c 'strings "$1" | grep -c bersoncare_webapp_session || true' _ {} \; 2>/dev/null | head -1)
  echo "    Cookie check: ${cookie_count:-0} session cookie(s) found in profile"
}

echo "========================================"
echo "STEP 1: Authenticate PATIENT profile"
echo "========================================"
auth_profile "$PROF_PATIENT" "dev%3Aclient"

echo ""
echo "========================================"
echo "STEP 2: Patient screenshots"
echo "========================================"

take_shot "$PROF_PATIENT" \
  "${BASE_URL}/app/patient/home" \
  "${OUT}/patient-home-1440.png"

take_shot "$PROF_PATIENT" \
  "${BASE_URL}/app/patient/treatment" \
  "${OUT}/patient-programs-1440.png"

# Exercise/treatment item — use promo (no instanceId needed)
take_shot "$PROF_PATIENT" \
  "${BASE_URL}/app/patient/treatment/promo" \
  "${OUT}/patient-treatment-promo-1440.png"

take_shot "$PROF_PATIENT" \
  "${BASE_URL}/app/patient/booking" \
  "${OUT}/patient-booking-1440.png"

take_shot "$PROF_PATIENT" \
  "${BASE_URL}/app/patient/booking/new" \
  "${OUT}/patient-booking-new-1440.png"

take_shot "$PROF_PATIENT" \
  "${BASE_URL}/app/patient/notifications" \
  "${OUT}/patient-notifications-1440.png"

take_shot "$PROF_PATIENT" \
  "${BASE_URL}/app/patient/profile" \
  "${OUT}/patient-profile-1440.png"

take_shot "$PROF_PATIENT" \
  "${BASE_URL}/app/patient/cabinet" \
  "${OUT}/patient-cabinet-1440.png"

take_shot "$PROF_PATIENT" \
  "${BASE_URL}/app/patient/diary" \
  "${OUT}/patient-diary-1440.png"

take_shot "$PROF_PATIENT" \
  "${BASE_URL}/app/patient/sections" \
  "${OUT}/patient-sections-1440.png"

echo ""
echo "========================================"
echo "STEP 3: Authenticate DOCTOR profile"
echo "========================================"
auth_profile "$PROF_DOCTOR" "dev%3Adoctor"

echo ""
echo "========================================"
echo "STEP 4: Doctor screenshots"
echo "========================================"

take_shot "$PROF_DOCTOR" \
  "${BASE_URL}/app/doctor" \
  "${OUT}/doctor-home-1440.png"

take_shot "$PROF_DOCTOR" \
  "${BASE_URL}/app/doctor/patients" \
  "${OUT}/doctor-patients-list-1440.png"

take_shot "$PROF_DOCTOR" \
  "${BASE_URL}/app/doctor/clients" \
  "${OUT}/doctor-clients-list-1440.png"

take_shot "$PROF_DOCTOR" \
  "${BASE_URL}/app/doctor/exercises" \
  "${OUT}/doctor-exercises-1440.png"

take_shot "$PROF_DOCTOR" \
  "${BASE_URL}/app/doctor/schedule" \
  "${OUT}/doctor-schedule-1440.png"

take_shot "$PROF_DOCTOR" \
  "${BASE_URL}/app/doctor/communications" \
  "${OUT}/doctor-communications-1440.png"

take_shot "$PROF_DOCTOR" \
  "${BASE_URL}/app/doctor/analytics" \
  "${OUT}/doctor-analytics-1440.png"

echo ""
echo "========================================"
echo "DONE — listing captured files:"
echo "========================================"
ls -lh "${OUT}"/*.png 2>/dev/null || echo "No .png files found!"
echo ""
echo "File count: $(ls "${OUT}"/*.png 2>/dev/null | wc -l)"
