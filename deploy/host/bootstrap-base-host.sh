#!/bin/bash
# Base host prerequisites: PostgreSQL 16 that never listens on a public interface, one unprivileged system
# user per service, and the directory layout the services are allowed to write to. Idempotent.
#
# This script owns the *host* side only. Database roles, grants and RLS belong to the DB privilege plan and
# are deliberately not created here. Application units and releases are installed by the deploy scripts.
set -euo pipefail

PG_VERSION="${BCB_PG_VERSION:-16}"
SERVICES="webapp api worker scheduler media-worker"
RELEASE_ROOT=/opt/bersoncarebot
BACKUP_ROOT=/opt/backups

log() { echo "[base] $*"; }
die() { echo "[base] FATAL: $*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || die "must run as root"

export DEBIAN_FRONTEND=noninteractive

# ---------------------------------------------------------------- packages
log "installing PostgreSQL $PG_VERSION and tooling"
apt-get update -qq
apt-get install -y -qq --no-install-recommends \
  "postgresql-$PG_VERSION" "postgresql-client-$PG_VERSION" \
  age restic rsync curl jq ca-certificates unattended-upgrades apt-listchanges

# ---------------------------------------------------------------- service users
# One user per service, no shell, no home to log into. A compromised media transcoder must not be able to
# read the webapp's environment file, so the split is by service rather than one shared "app" account.
for svc in $SERVICES; do
  user="bcb-$svc"
  if ! id -u "$user" >/dev/null 2>&1; then
    useradd --system --no-create-home --shell /usr/sbin/nologin --comment "BersonCare $svc" "$user"
    log "created $user"
  fi
done

# The deploy account owns released code; runtime users only read it. That way a compromised runtime process
# cannot rewrite the code it is about to execute on the next restart.
id -u deploy >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash --comment "BersonCare deploy" deploy

install -d -m 0755 -o deploy -g deploy "$RELEASE_ROOT"
install -d -m 0750 -o deploy -g deploy "$RELEASE_ROOT/releases"
install -d -m 0750 -o root   -g root   "$RELEASE_ROOT/env"
install -d -m 0700 -o root   -g root   "$BACKUP_ROOT"
install -d -m 0700 -o root   -g root   "$BACKUP_ROOT/scripts"

for svc in $SERVICES; do
  install -d -m 0750 -o "bcb-$svc" -g "bcb-$svc" "/var/lib/bersoncarebot/$svc"
  install -d -m 0750 -o "bcb-$svc" -g "bcb-$svc" "/var/log/bersoncarebot/$svc"
done
install -d -m 0755 -o root -g root /var/lib/bersoncarebot
install -d -m 0755 -o root -g root /var/log/bersoncarebot

# ---------------------------------------------------------------- postgresql
CLUSTER_DIR="/var/lib/postgresql/$PG_VERSION/main"
CONF_DIR="/etc/postgresql/$PG_VERSION/main"
# postgres server binaries are not on root's PATH on Debian/Ubuntu; calling pg_controldata by bare name
# silently means "command not found", which a `! ... | grep -q` test reads as "checksums are off".
PGBIN="/usr/lib/postgresql/$PG_VERSION/bin"

# Data checksums cannot be turned on later without rewriting the cluster, so a cluster created without them
# is recreated now, while it is empty, rather than discovered to be unfixable when it holds patient data.
if [ -d "$CLUSTER_DIR" ] && ! "$PGBIN/pg_controldata" "$CLUSTER_DIR" 2>/dev/null | grep -q "Data page checksum version: *[1-9]"; then
  if [ "$(su - postgres -c "psql -tAc \"select count(*) from pg_database where datname not in ('postgres','template0','template1')\"" 2>/dev/null || echo 0)" != 0 ]; then
    die "cluster has no checksums but already holds databases; refusing to recreate it"
  fi
  log "recreating the empty cluster with data checksums"
  pg_dropcluster --stop "$PG_VERSION" main 2>/dev/null || true
  # Order matters: version and cluster name come first, then options, and initdb arguments only after `--`.
  pg_createcluster "$PG_VERSION" main --start -- --data-checksums
fi

# A previous run may have dropped the cluster and failed before recreating it; without this the script would
# keep skipping the branch above and report a healthy host with no database at all.
if [ ! -d "$CLUSTER_DIR" ]; then
  log "no cluster present, creating one with data checksums"
  pg_createcluster "$PG_VERSION" main --start -- --data-checksums
fi

install -d -m 0755 "$CONF_DIR/conf.d"
cat > "$CONF_DIR/conf.d/10-bcb.conf" <<EOF
# Managed by deploy/host/bootstrap-base-host.sh
# The database is reachable over the local Unix socket only. Nothing on this host needs TCP to reach it,
# and an accidental bind to the public interface is the failure this line exists to make impossible.
listen_addresses = ''
password_encryption = scram-sha-256

logging_collector = on
log_destination = 'stderr'
log_line_prefix = '%m [%p] %q%u@%d '
log_min_duration_statement = 1000
log_checkpoints = on
log_connections = on
log_disconnections = on
# Statement text is not logged: query parameters on this system carry clinical values and contact details,
# and a log file is a copy of them that nobody accounted for.
log_statement = 'none'
EOF

systemctl enable postgresql >/dev/null 2>&1 || true
pg_ctlcluster "$PG_VERSION" main restart 2>/dev/null || systemctl restart postgresql

# ---------------------------------------------------------------- automatic security updates
cat > /etc/apt/apt.conf.d/20bcb-unattended <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
Unattended-Upgrade::Automatic-Reboot "false";
EOF
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true

# ---------------------------------------------------------------- verify
log "verifying"
set +o pipefail   # see harden-network-and-ssh.sh: grep -q plus pipefail turns a match into a failure
vfail=0
vcheck() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; vfail=1; fi; }

vcheck "postgres $PG_VERSION running"    "pg_isready -q"
# Asked of the running server rather than of the on-disk control file: it is the same fact, reported by the
# component that would actually use it, and it does not depend on where the server binaries live.
vcheck "data checksums enabled"          "su - postgres -c \"psql -tAc 'show data_checksums'\" | grep -q on"
vcheck "not listening on any interface"  "! ss -tlnp | grep -q ':5432'"
vcheck "unix socket present"             "ls /var/run/postgresql/.s.PGSQL.5432 >/dev/null 2>&1"
vcheck "scram password encryption"       "su - postgres -c \"psql -tAc 'show password_encryption'\" | grep -q scram-sha-256"
vcheck "statement logging off"           "su - postgres -c \"psql -tAc 'show log_statement'\" | grep -q none"
for svc in $SERVICES; do
  vcheck "user bcb-$svc has no shell"    "getent passwd bcb-$svc | grep -q nologin"
  vcheck "state dir for $svc is 0750"    "[ \"\$(stat -c %a /var/lib/bersoncarebot/$svc)\" = 750 ]"
done
vcheck "env dir is root-only"            "[ \"\$(stat -c '%U %a' $RELEASE_ROOT/env)\" = 'root 750' ]"
vcheck "backup dir is root-only 0700"    "[ \"\$(stat -c '%U %a' $BACKUP_ROOT)\" = 'root 700' ]"
vcheck "age present for backups"         "command -v age >/dev/null"
vcheck "restic present for offsite"      "command -v restic >/dev/null"
vcheck "unattended-upgrades enabled"     "systemctl is-enabled unattended-upgrades >/dev/null 2>&1"

[ "$vfail" = 0 ] || die "base host setup incomplete"
log "DONE"
