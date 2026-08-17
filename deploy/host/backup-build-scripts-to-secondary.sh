#!/bin/bash
# Copies everything needed to rebuild the production host from scratch onto the secondary host.
#
# Why this exists: the build scripts are the rebuild. They live in the repository, and until that repository
# is pushed they live on exactly one laptop-shaped machine. Losing it would not lose the running server, but
# it would lose the ability to reproduce it — which is the only reason the scripts were written as scripts.
#
# This is a *second* copy, not the authoritative one. The authoritative copy is git; pushing the branch is
# the primary fix and this does not replace it. What it adds is independence: a copy that survives losing
# the development machine, the git host, or the account on it.
#
# Nothing secret is copied, and that is enforced rather than assumed — see the scan below. The wrapper files
# on the hosts (run-stage-b.sh and friends) DO carry the disk passphrase and are deliberately not part of
# the repository or of this copy.
set -uo pipefail

SECONDARY="${BCB_SECONDARY:?BCB_SECONDARY is required, e.g. bcbadmin@81.26.183.196}"
SSH_KEY="${BCB_SSH_KEY:-$HOME/.ssh/bcb_prod_build_20260817}"
DEST="${BCB_DEST:-/opt/bcb-rebuild}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

log() { echo "[backup-scripts] $*"; }
die() { echo "[backup-scripts] FATAL: $*" >&2; exit 1; }

cd "$REPO_ROOT" || die "cannot find the repository root"

PATHS=(
  deploy/host
  deploy/systemd
  deploy/postgres
  deploy/nginx
  docs/_TODO/INFRASTRUCTURE_SECURITY_PLAN.md
  docs/_TODO/DEFERRED_INFRA_TRIGGERS.md
  docs/ARCHITECTURE/SERVER\ CONVENTIONS.md
  docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/EVIDENCE
)

STAGE=$(mktemp -d) || die "cannot create a staging directory"
trap 'rm -rf "$STAGE"' EXIT

for p in "${PATHS[@]}"; do
  [ -e "$p" ] || { log "skipping missing $p"; continue; }
  mkdir -p "$STAGE/$(dirname "$p")"
  cp -a "$p" "$STAGE/$(dirname "$p")/"
done

# ---------------------------------------------------------------- refuse to copy secrets
# A repository is not automatically free of secrets, and this copy leaves the machine, so the check runs on
# what is actually about to be sent rather than on what the repository is believed to contain.
log "scanning the staged copy for anything that must not leave"
LEAKS=$(grep -rIlE \
  'BEGIN (OPENSSH|RSA|EC|PGP) PRIVATE KEY|AGE-SECRET-KEY-1|BCB_LUKS_PASSPHRASE=[^"$]|aws_secret_access_key *=|password *= *[^ $]' \
  "$STAGE" 2>/dev/null | head -20)
if [ -n "$LEAKS" ]; then
  echo "$LEAKS" | sed 's/^/  /'
  die "the staged copy contains secret-looking material; nothing was sent"
fi

STAMP=$(git -C "$REPO_ROOT" log -1 --format=%H 2>/dev/null || echo unknown)
cat > "$STAGE/REBUILD_README.md" <<EOF
# Пересборка боевого хоста — автономная копия

Скопировано с машины разработки. **Это вторая копия, не источник истины** — источник в git.
Коммит на момент копирования: \`$STAMP\`.

Порядок пересборки описан в \`docs/_TODO/INFRASTRUCTURE_SECURITY_PLAN.md\`. Кратко:

1. \`deploy/host/encrypted-install/stage-a-temp-installer.sh\` — из аварийного режима провайдера: разметка
   и временная система (у аварийного ядра нет поддержки шифрования, поэтому в два шага).
2. \`deploy/host/encrypted-install/stage-b-encrypted-system.sh\` — из временной системы: LUKS2 + LVM,
   боевая система, разблокировка по сети.
3. \`deploy/host/encrypted-install/stage-c-reclaim-temp-partition.sh\` — вернуть место временного раздела.
4. \`deploy/host/harden-network-and-ssh.sh\`, \`bootstrap-base-host.sh\`,
   \`install-systemd-sandbox.sh\`, \`setup-nginx-tls.sh\`, \`setup-audit-and-integrity.sh\`.
5. \`deploy/host/verify-host-baseline.sh\` — приёмка, должна пройти целиком.

**Секретов здесь нет и быть не должно.** Парольная фраза от диска, ключи восстановления и учётные данные
хранилища передаются скриптам переменными окружения и живут отдельно, у владельца.
EOF

log "sending to $SECONDARY:$DEST"
ssh -i "$SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes "$SECONDARY" \
  "sudo install -d -m 0755 -o root -g root '$DEST' && sudo chown -R \$(id -un) '$DEST'" ||
  die "cannot prepare $DEST on the secondary host"

rsync -a --delete -e "ssh -i $SSH_KEY -o IdentitiesOnly=yes -o BatchMode=yes" \
  "$STAGE"/ "$SECONDARY:$DEST/" || die "rsync failed"

ssh -i "$SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes "$SECONDARY" \
  "sudo chown -R root:root '$DEST' && sudo chmod -R go-w '$DEST'" || die "cannot re-own $DEST"

# ---------------------------------------------------------------- verify
log "verifying the copy on the far side"
set +o pipefail
vfail=0
vcheck() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; vfail=1; fi; }
R() { ssh -i "$SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes "$SECONDARY" "$1"; }

vcheck "three install stages present" 'R "ls '"$DEST"'/deploy/host/encrypted-install/stage-[abc]*.sh | wc -l" | grep -q 3'
vcheck "baseline verifier present"    'R "test -s '"$DEST"'/deploy/host/verify-host-baseline.sh"'
vcheck "hardening scripts present"    'R "ls '"$DEST"'/deploy/host/*.sh | wc -l" | grep -qE "[0-9]+"'
vcheck "plan present"                 'R "test -s '"$DEST"'/docs/_TODO/INFRASTRUCTURE_SECURITY_PLAN.md"'
vcheck "rebuild readme present"       'R "test -s '"$DEST"'/REBUILD_README.md"'
vcheck "copy is owned by root"        'R "stat -c %U '"$DEST"'" | grep -qx root'
vcheck "no private keys in the copy"  '! R "grep -rIl \"BEGIN OPENSSH PRIVATE KEY\" '"$DEST"' 2>/dev/null" | grep -q .'
vcheck "scripts are executable"       'R "test -x '"$DEST"'/deploy/host/verify-host-baseline.sh"'

[ "$vfail" = 0 ] || die "the copy is not usable"
log "DONE — $DEST holds a rebuild-capable copy at commit ${STAMP:0:9}"
