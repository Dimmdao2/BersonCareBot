# Rubitime retirement R5 production disable runbook

Date: 2026-07-14.
Branch: `feat/doctor-ui-rebuild`.

## Scope

This is the prepared R5 production runbook for disabling legacy v1 Rubitime profile resolve:

- `RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED=false`
- v1 `/api/bersoncare/rubitime/slots`
- v1 `/api/bersoncare/rubitime/create-record`

It does not approve or execute any production change. Run it only after owner approval for the flag-change timestamp
and monitoring window.

Final proof file:

`docs/_TODO/SAAS_FOUNDATION/RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_PROOF.md`

## Preconditions

- R1-R4 proofs remain green in the working branch.
- Owner approved the production flag-change timestamp.
- Owner approved the monitoring window length.
- Rollback boundary from `RUBITIME_RETIREMENT_R5_LEGACY_PROFILE_RESOLVE_PROOF.md` is accepted.
- Operator has root/operator access on the production host. User `deploy` does not have arbitrary sudo; use the
  documented root/operator path for env edits and service restarts.

## 0. Record Pre-Change State Without Printing Secrets

On the production host:

```bash
sudo test -f /opt/env/bersoncarebot/api.prod
sudo grep -n '^RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED=' /opt/env/bersoncarebot/api.prod || true
sudo systemctl is-active \
  bersoncarebot-api-prod.service \
  bersoncarebot-worker-prod.service \
  bersoncarebot-scheduler-prod.service
```

Do not print full env values or credential-bearing lines.

## 1. Apply Owner-Approved Flag Change

Run only inside the approved production window.

```bash
sudo install -m 600 -o root -g root \
  /opt/env/bersoncarebot/api.prod \
  "/opt/env/bersoncarebot/api.prod.r5-rubitime-disable.$(date -u +%Y%m%dT%H%M%SZ).bak"

sudo python3 - <<'PY'
from pathlib import Path

path = Path('/opt/env/bersoncarebot/api.prod')
key = 'RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED'
lines = path.read_text().splitlines()
updated = False
out = []
for line in lines:
    if line.startswith(f'{key}='):
        out.append(f'{key}=false')
        updated = True
    else:
        out.append(line)
if not updated:
    out.append(f'{key}=false')
path.write_text('\n'.join(out) + '\n')
PY

sudo systemctl restart \
  bersoncarebot-api-prod.service \
  bersoncarebot-worker-prod.service \
  bersoncarebot-scheduler-prod.service

sudo systemctl is-active \
  bersoncarebot-api-prod.service \
  bersoncarebot-worker-prod.service \
  bersoncarebot-scheduler-prod.service
```

Record the production flag-change timestamp in the final proof.

## 2. Monitoring Window

Set the exact owner-approved window. Use ISO timestamps with timezone.

```bash
WINDOW_START='YYYY-MM-DDTHH:mm:ss+03:00'
WINDOW_END='YYYY-MM-DDTHH:mm:ss+03:00'
```

### 2.1. Service Errors

```bash
sudo journalctl -u bersoncarebot-api-prod.service \
  --since "$WINDOW_START" --until "$WINDOW_END" \
  -p warning --no-pager
```

The final proof should summarize whether there was an error spike related to booking/Rubitime v1 profile resolve.
Do not paste PII or raw request bodies.

### 2.2. Aggregate v1 Request Counts

Preferred source: nginx access logs for the integrator API vhost. Count only aggregate route hits; do not paste raw
request lines.

```bash
sudo zgrep -hE ' /(api/bersoncare/rubitime/slots)([ ?]| )' \
  /var/log/nginx/access.log /var/log/nginx/access.log.* 2>/dev/null | wc -l

sudo zgrep -hE ' /(api/bersoncare/rubitime/create-record)([ ?]| )' \
  /var/log/nginx/access.log /var/log/nginx/access.log.* 2>/dev/null | wc -l
```

If the nginx log set covers more than the approved monitoring window, record that limitation and use a narrower
operator-approved log query. The final proof must state the source of aggregate counts without secrets or PII.

Optional cross-check from service logs, if route names are present in structured logs:

```bash
sudo journalctl -u bersoncarebot-api-prod.service \
  --since "$WINDOW_START" --until "$WINDOW_END" --no-pager \
  | grep -F '/api/bersoncare/rubitime/slots' | wc -l

sudo journalctl -u bersoncarebot-api-prod.service \
  --since "$WINDOW_START" --until "$WINDOW_END" --no-pager \
  | grep -F '/api/bersoncare/rubitime/create-record' | wc -l
```

### 2.3. User-Facing Booking Confirmation

Confirm that no production user-facing booking path required legacy v1 profile resolution during the monitoring
window. Acceptable evidence:

- no booking incident or rollback was opened for patient/public booking;
- canonical patient/public booking smoke stayed healthy;
- any v1 hits, if present, were admin/legacy/provider traffic and owner-reviewed.

Record this confirmation in the final proof.

## 3. Rollback

Rollback is documented in `RUBITIME_RETIREMENT_R5_LEGACY_PROFILE_RESOLVE_PROOF.md`.

Use rollback only if owner/operator decides production v1 traffic must be temporarily restored:

1. Set `RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED=true` in `/opt/env/bersoncarebot/api.prod`, or restore the backup
   created in Section 1.
2. Restart `bersoncarebot-api-prod.service`, `bersoncarebot-worker-prod.service`, and
   `bersoncarebot-scheduler-prod.service`.
3. Record rollback timestamp and reason in the final proof.

Database rollback is not part of R5.

## 4. Final Proof Checklist

Save `RUBITIME_RETIREMENT_R5_PRODUCTION_DISABLE_PROOF.md` only after the production action and monitoring window are
complete. It must include:

- production flag-change timestamp;
- monitoring window start/end;
- v1 `/api/bersoncare/rubitime/slots` request count;
- v1 `/api/bersoncare/rubitime/create-record` request count;
- source of aggregate counts without secrets or PII;
- confirmation that no user-facing booking path required v1 profile resolution;
- owner approval note;
- rollback notes.

Do not create placeholder final proof files.
