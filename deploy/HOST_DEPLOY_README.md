# Host Deployment for BersonCareBot

## Docker deployment preserved as backup
All Docker and blue/green deployment files are backed up in `deploy/docker-backup/`.

## Current deployment model
- Host runtime (Node.js runs directly on server)
- System PostgreSQL (no Docker for DB)
- systemd for process management
- nginx as reverse proxy

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

## Host scripts
See `deploy/host/` for build, migrate, start, and deploy scripts.

## DB backup scripts
See `deploy/db/` for backup scripts using pg_dump.
