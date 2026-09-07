# Custom-domain TLS edge — repository-managed infrastructure (B7/B8/C5a)

Status: **repository correction ready; no host, DNS, firewall, service, TEST, or PROD operation was
performed.** The application now owns the binding/readiness/verifier/permission path; React UI and
owner-authorized live edge cutover remain separate gates.

## Delivered contract

The edge is one Caddy process on the new production host `135.106.187.95`; it is the sole public
listener on 80/443 after an owner-authorized cutover. The existing nginx blue/green switch remains
the downstream application frontend, but its listener becomes loopback-only. Caddy asserts the
external Host, `https` scheme, direct client identity and forwarding chain; nginx preserves those
headers exactly. The loopback-only nginx listener is therefore the explicit trusted-proxy boundary.

The only supported binary is reproducibly built with these pins:

| Component | Pin |
| --- | --- |
| Caddy | `v2.11.2` |
| REG.RU DNS module | `github.com/heinwol/caddy-dns-regru@v0.1.10` |
| xcaddy | `v0.4.5` |
| temporary Go toolchain | `1.27.1`, SHA-256 recorded in `deploy/caddy/build-caddy-edge.sh` |

`deploy/caddy/validate-caddy-edge-config.sh` builds that exact binary under `mktemp -d`, checks that
the REG.RU module is present, and runs `caddy validate` with placeholders only. It installs no
binary or Go toolchain. The cutover builds the same binary at `/usr/local/bin/bcb-caddy`; stock apt
Caddy is not used because it lacks the required DNS module.

## TLS policy

- **B7:** one DNS-01 certificate covers exactly `therapygo.ru` and `*.therapygo.ru`. The Caddy site
  block carries both names and uses the REG.RU DNS provider; it is not a collection of per-slug
  HTTP-01 certificates.
- **Platform hosts other than Therapygo's pair:** ordinary automatic HTTP-01/TLS-ALPN certificates.
- **Every clinic custom hostname, including `app.bersoncare.ru`:** the one address-only on-demand
  block. Before issuance Caddy calls
  `GET https://therapygo.ru/api/public/domains/ask?domain=<host>` using built-in
  `on_demand_tls { permission http <endpoint> }`. A timeout, unavailable endpoint, redirect, or
  non-2xx response denies issuance. The stable Therapygo origin makes this permission check
  independent of the candidate hostname's not-yet-issued certificate.

There is no per-clinic nginx edit, Certbot work, reload, or static Caddy hostname registration.
Clinic domains stay on approved on-demand HTTP-01/TLS-ALPN; DNS-01 is reserved for the Therapygo
wildcard certificate.

## Required one-time owner/operator prerequisite

The authoritative DNS provider for `therapygo.ru` is REG.RU. Before an owner-authorized cutover,
the owner/operator must enable REG.API, allow-list the edge public IP `135.106.187.95`, and create
the REG.RU API credentials. This repository cannot perform those account-level actions. Put the
resulting credentials only in `/opt/bersoncarebot/env/caddy.prod`, owned `root:caddy` mode `0640`;
do not print them or place them in repository files.

## DNS instructions source

The B8 settings lifecycle reads its public values from the webapp runtime template:

- `CUSTOM_DOMAIN_EDGE_IP=135.106.187.95` renders `A @ → 135.106.187.95` for an apex app domain.
- `CUSTOM_DOMAIN_CNAME_TARGET=edge.therapygo.ru` renders `CNAME app → edge.therapygo.ru` when a
  clinic already has a site at its apex.

They are intentionally absent from Caddy's env: the edge does not consume them.

## Installed pipeline and scheduler

`setup-docker-bluegreen.sh` and `tools/deploy-prod-from-dev.sh` install/update every edge asset under
`/opt/bersoncarebot/pipeline`: Caddyfile, build script, internal nginx template, cutover/rollback,
health probe and systemd unit templates. The cutover never relies on source-relative `../../` paths.

The cutover installs, enables and verifies:

- `bersoncarebot-caddy-edge.service`;
- `bersoncarebot-caddy-edge-health.timer`, hourly and persistent;
- `bersoncarebot-caddy-edge-health.service`, which runs the certificate-store/process/socket probe.

This timer is independent of the application's external per-domain monitor. It does not use
crontab. Rollback disables and stops both the Caddy service and the timer before restoring the saved
public nginx configuration.

## Repository validation

Run only locally, without a real `caddy.prod`:

```bash
bash deploy/caddy/validate-caddy-edge-config.sh
bash -n deploy/caddy/build-caddy-edge.sh deploy/caddy/validate-caddy-edge-config.sh \
  deploy/host/prod/cutover-edge-to-caddy.sh deploy/host/prod/rollback-edge-to-nginx.sh \
  deploy/host/prod/check-caddy-edge-health.sh deploy/host/prod/setup-docker-bluegreen.sh \
  tools/deploy-prod-from-dev.sh
```

The nginx template is rendered with a placeholder loopback port and passed to `nginx -t` when nginx
is available on the validation host. This only proves template syntax; it is not a production probe.

## Remaining live gates

With explicit owner authorization on `135.106.187.95`: install the root-owned env after the REG.RU
prerequisite, execute cutover, verify the installed timer, issue the B7 certificate, prove one
approved custom hostname through DNS → trusted TLS → exact application routing, run rollback once,
and observe renewal. No such live gate is claimed complete by this repository correction.
