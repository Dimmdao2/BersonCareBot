# SERVER_CONVENTION.md

## Project keys

Stable internal project keys:

- `bersoncarebot`
- `storylama`
- `fordoc`
- `bersonservices`

Do not rename project keys after adoption.

---

## Directory layout

### Production
```text
/opt/projects/bersoncarebot
/opt/projects/storylama
/opt/projects/fordoc
/opt/projects/bersonservices

Development

/home/dev/dev-projects/BersonCareBot
/home/dev/dev-projects/StoryLama
/home/dev/dev-projects/ForDoc
/home/dev/dev-projects/BersonServices


⸻

PostgreSQL strategy

One shared system PostgreSQL instance on the server.

Bind only to:

127.0.0.1:5432

No public PostgreSQL exposure.

Each project has separate databases.

If one project is intentionally split into multiple isolated services, service-specific databases are allowed.
Use the project key plus the service suffix.

Production databases
 • bersoncarebot_prod
 • bcb_webapp_prod
 • storylama_prod
 • fordoc_prod
 • bersonservices_prod

Development databases
 • bersoncarebot_dev
 • bcb_webapp_dev
 • storylama_dev
 • fordoc_dev
 • bersonservices_dev

Optional staging databases
 • bersoncarebot_stage
 • storylama_stage
 • fordoc_stage
 • bersonservices_stage

⸻

PostgreSQL users

Preferred model: separate DB users per project and environment.

Production users
 • bersoncarebot_user
 • bcb_webapp_user
 • storylama_user
 • fordoc_user
 • bersonservices_user

Development users
 • bersoncarebot_dev_user
 • bcb_webapp_dev_user
 • storylama_dev_user
 • fordoc_dev_user
 • bersonservices_dev_user

⸻

Port allocation policy

Reserved / forbidden for new services

Do NOT use:
 • 3000
 • 3001
 • 3002
 • 3100
 • 3101

Production API ports

Use range:

3200–3299

Assigned:
 • bersoncarebot → 3200
 • storylama → 3201
 • fordoc → 3202
 • bersonservices → 3203

Development API ports

Use range:

4200–4299

Assigned:
 • bersoncarebot → 4200
 • storylama → 4201
 • fordoc → 4202
 • bersonservices → 4203

Production web/frontend ports

Use range:

6200–6299

Assigned if needed:
 • bersoncarebot-webapp → 6200

Optional dev frontend/admin ports

Use range:

5200–5299

Assigned if needed:
 • bersoncarebot-webapp → 5200
 • storylama → 5201
 • fordoc → 5202
 • bersonservices → 5203

Workers do not require public ports.

⸻

Environment file convention

Production env (stored in /opt/env/, not inside project tree)

/opt/env/bersoncarebot.prod          — integrator API + worker
/opt/env/bersoncarebot-webapp.prod  — webapp
/opt/projects/storylama/.env.prod
/opt/projects/fordoc/.env.prod
/opt/projects/bersonservices/.env.prod

Development env

/home/dev/dev-projects/BersonCareBot/.env.dev
/home/dev/dev-projects/BersonCareBot/webapp/.env.dev
/home/dev/dev-projects/StoryLama/.env.dev
/home/dev/dev-projects/ForDoc/.env.dev
/home/dev/dev-projects/BersonServices/.env.dev


⸻

DATABASE_URL convention

Production

postgres://bersoncarebot_user:***@127.0.0.1:5432/bersoncarebot_prod
postgres://bcb_webapp_user:***@127.0.0.1:5432/bcb_webapp_prod
postgres://storylama_user:***@127.0.0.1:5432/storylama_prod
postgres://fordoc_user:***@127.0.0.1:5432/fordoc_prod
postgres://bersonservices_user:***@127.0.0.1:5432/bersonservices_prod

Development

postgres://bersoncarebot_dev_user:***@127.0.0.1:5432/bersoncarebot_dev
postgres://bcb_webapp_dev_user:***@127.0.0.1:5432/bcb_webapp_dev
postgres://storylama_dev_user:***@127.0.0.1:5432/storylama_dev
postgres://fordoc_dev_user:***@127.0.0.1:5432/fordoc_dev
postgres://bersonservices_dev_user:***@127.0.0.1:5432/bersonservices_dev


⸻

systemd naming convention

Production
 • bersoncarebot-api-prod.service
 • bersoncarebot-worker-prod.service
 • bersoncarebot-webapp-prod.service
 • storylama-api-prod.service
 • storylama-worker-prod.service
 • fordoc-api-prod.service
 • fordoc-worker-prod.service
 • bersonservices-api-prod.service
 • bersonservices-worker-prod.service

Development
 • bersoncarebot-api-dev.service
 • bersoncarebot-worker-dev.service
 • bersoncarebot-webapp-dev.service
 • storylama-api-dev.service
 • storylama-worker-dev.service
 • fordoc-api-dev.service
 • fordoc-worker-dev.service
 • bersonservices-api-dev.service
 • bersonservices-worker-dev.service

⸻

Nginx routing model

One host nginx instance routes traffic by domain/subdomain to localhost ports.

Production routing
 • tgcarebot.<domain> → 127.0.0.1:3200
 • webapp.<domain> → 127.0.0.1:6200
 • storylama.ru / storylama.io → 127.0.0.1:3201
 • fordoc.<domain> → 127.0.0.1:3202
 • bersonservices.ru → 127.0.0.1:3203

Development routing
 • dev-tgcarebot.<domain> → 127.0.0.1:4200
 • dev-webapp.<domain> → 127.0.0.1:5200
 • dev-storylama.<domain> → 127.0.0.1:4201
 • dev-fordoc.<domain> → 127.0.0.1:4202
 • dev-bersonservices.<domain> → 127.0.0.1:4203

⸻

Runtime model

Production
 • app runs directly on host via systemd
 • API binds to 127.0.0.1:<prod-port>
 • optional webapp/frontend service binds to 127.0.0.1:<prod-web-port>
 • worker runs without public port
 • nginx proxies external traffic to localhost app port
 • PostgreSQL is shared system service

Development
 • app runs directly on host via systemd or manual process
 • API binds to 127.0.0.1:<dev-port>
 • optional webapp/frontend service binds to 127.0.0.1:<dev-web-port>
 • development DB is separate from production DB
 • optional routing through nginx dev subdomains

⸻

Docker policy

Docker is NOT required for new projects in the temporary server model.

Allowed temporary use cases:
 • legacy projects during migration
 • optional isolated utilities if needed

Preferred default for now:
 • API without Docker
 • Next.js webapp without Docker
 • worker without Docker
 • one shared system PostgreSQL
 • one shared host nginx

⸻

Naming rule for future projects

For any new project with key X:
 • production API port = next free port in 3200–3299
 • development API port = corresponding port in 4200–4299
 • optional production web port = next free port in 6200–6299
 • optional development web port = corresponding port in 5200–5299
 • production DB = x_prod
 • development DB = x_dev
 • production API service = x-api-prod.service
 • development API service = x-api-dev.service
 • production worker service = x-worker-prod.service
 • development worker service = x-worker-dev.service

For a split service inside an existing project:
 • service DB = x_service_prod / x_service_dev
 • service DB user = x_service_user / x_service_dev_user
 • service unit = x-service-prod.service / x-service-dev.service
 • service env path = /opt/env/x-webapp.prod (or project-specific) and /home/dev/dev-projects/X/service/.env.dev
 • service web domain may use a dedicated subdomain (example: webapp.<domain>)

⸻

Operational rule

Never mix:
 • production and development databases
 • production and development ports
 • project keys
 • service names

All routing must be explicit and deterministic.

Production and development must always be distinguishable by:
 • directory
 • port
 • database name
 • service name
 • domain/subdomain

