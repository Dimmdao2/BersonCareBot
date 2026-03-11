# Host Deployment for BersonCareBot

## Docker deployment preserved as backup
All Docker and blue/green deployment files are backed up in `deploy/docker-backup/`.

## Current deployment model
- Host runtime (Node.js runs directly on server)
- System PostgreSQL (no Docker for DB)
- systemd for process management
- nginx as reverse proxy

GitHub Actions runs the regular host deploy only. It does not install or update `systemd` units during each deploy.

## Ports
- Production API: 3200
- Development API: 4200

## Database names
- Production: bersoncarebot_prod
- Development: bersoncarebot_dev

## Environment templates
See `deploy/env/.env.prod.example` and `deploy/env/.env.dev.example` for configuration.

## Systemd templates
See `deploy/systemd/` for ready-to-use service files (not installed automatically).

## One-time host bootstrap
Install or refresh the production `systemd` units on the host before running CI deploys:

```bash
cd /opt/projects/bersoncarebot
bash deploy/host/bootstrap-systemd-prod.sh
```

The bootstrap script copies these templates into `/etc/systemd/system/`, reloads `systemd`, and enables the production API and worker services:
- `deploy/systemd/bersoncarebot-api-prod.service`
- `deploy/systemd/bersoncarebot-worker-prod.service`

If `.env.prod` and the build artifacts already exist, the bootstrap script also starts both services. Otherwise it enables them and leaves startup to the next `deploy/host/deploy-prod.sh` run.

## CI deploy requirements
`deploy/host/deploy-prod.sh` now uses `sudo -n` and fails fast if the deploy user is missing the required `NOPASSWD` rules.

Example sudoers entry for the deploy user:

```sudoers
deployuser ALL=(root) NOPASSWD: /opt/backups/scripts/postgres-backup.sh pre-migrations
deployuser ALL=(root) NOPASSWD: /bin/systemctl restart bersoncarebot-api-prod.service
deployuser ALL=(root) NOPASSWD: /bin/systemctl restart bersoncarebot-worker-prod.service
deployuser ALL=(root) NOPASSWD: /bin/systemctl is-active --quiet bersoncarebot-api-prod.service
deployuser ALL=(root) NOPASSWD: /bin/systemctl is-active --quiet bersoncarebot-worker-prod.service
```

Without those permissions, CI deploy will exit before `pnpm install` or `pnpm build`.

## Host scripts
See `deploy/host/` for build, migrate, start, and deploy scripts.

## Scheduler
`src/infra/runtime/scheduler/main.ts` exists but is not run as a separate service in the current host deploy (no systemd unit). Only API and worker are started.

## DB backup scripts
See `deploy/db/` for backup scripts using pg_dump.
