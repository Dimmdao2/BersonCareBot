# Custom-domain TLS edge — repository-managed infrastructure (B7/B8/C5a)

Status: **infrastructure config + cutover/rollback scripts written, none of it executed or installed
anywhere**. This document is the design record, the exact unexecuted gates, and the named blockers
for the pieces this change does not (and by scope, cannot) resolve. taskdb #787.

Scope of this change, precisely: the repository-managed edge that makes automatic custom-domain TLS
possible — Caddy config, the nginx-coexistence cutover, env templates, and edge-level observability.
It does **not** implement the application-side pieces `IMPLEMENTATION_PLAN.md` also lists under
B1–B4a/B8 (Host→organization resolver, the hostname-binding DB model, the settings UI, the `ask`
endpoint itself) — those are application source/DB/UI, out of scope for this change by the worker
brief and by AGENTS.md's module boundaries. Nothing here flips any checkbox in that plan.

## Why this design, not the one the 2026-07-26 research led with

`docs/_TODO/CUSTOM_DOMAIN_TLS_RESEARCH_2026-07-26.md` recommended Caddy on a **standalone edge with
its own IP**. That assumed a second public IP would exist. `SERVER CONVENTIONS.md` documents exactly
one IP for the new prod host (`135.106.187.95`) and no second one anywhere; inventing one was ruled
out by the brief. The research's own fallback — nginx `stream{}` SNI-preread passthrough — was
flagged there as "the bigger, riskier option," and depends on `stream_ssl_preread` being compiled
into nginx on the **new** host, which has never been checked (the module presence was only confirmed
on the unrelated TEST host's nginx).

A third option turned out to be available once the new host's actual bring-up scripts were read
(`deploy/host/setup-nginx-tls.sh`, `deploy/host/prod/setup-docker-bluegreen.sh`,
`deploy/host/prod/bcb-bluegreen-lib.sh`): **nginx on this host currently terminates TLS with a single
self-signed placeholder certificate on one `default_server` block that does not differentiate by
hostname at all.** No real per-domain certificate has ever been issued here (`SURFACE_AND_DOMAIN_MAP
finding C33: "Нет"`), and the host is documented as reachable on 443 only from the dev box while it
is a trial production. There is no working per-hostname TLS behaviour on this host today for this
change to disturb.

That makes the minimal-diff coherent option **Caddy replaces nginx as the sole public listener on
80/443; nginx keeps doing exactly what it does today (blue-green upstream selection, unchanged
`proxy_set_header Host $host` reverse proxy) on a loopback-only port that only Caddy talks to.** The
blue-green pipeline's most load-bearing, most-tested file — `bcb-bluegreen-lib.sh`'s
`switch_nginx_to()` and the `bcb_webapp`/`bcb_api` upstream names it rewrites — is untouched by this
change; only the site file's `listen` directives and TLS/security-header lines move.

## What is delivered

| File | Purpose |
| --- | --- |
| `deploy/caddy/Caddyfile.template` | The edge config: automatic HTTPS for known platform hostnames, `on_demand_tls` + `permission http` (fail-closed ask) for everything else, `header_up Host {hostport}`, security headers |
| `deploy/env/.env.caddy.prod.example` | Non-secret parameterized config (ask URL, upstream, ACME email/CA, data dir, platform domain list, stable edge IP, CNAME target) |
| `deploy/nginx/prod/bcb-internal.conf.template` | The post-cutover nginx site: same `location /` → `bcb_webapp` contract, loopback-only, no TLS |
| `deploy/host/prod/cutover-edge-to-caddy.sh` | Installs Caddy, validates config against the live env **before** touching nginx, then atomically swaps the public site and starts Caddy, with post-flip checks |
| `deploy/host/prod/rollback-edge-to-nginx.sh` | Stops Caddy, restores nginx from the cutover's own timestamped backup |
| `deploy/host/prod/check-caddy-edge-health.sh` | Read-only: edge process/socket health + per-certificate expiry from Caddy's own store |

## The `ask` contract, and why it is fail-closed by construction

Caddy's on-demand TLS calls `GET {$CADDY_ASK_URL}?domain=<host>` before issuing any certificate not
covered by the static platform-domain list. Per Caddy 2.11's `tls.permission.http` module (verified
against upstream source in `MULTI_BRAND_DOMAIN_WORLD_PRACTICE.md` §3.9, since the 2026-07-26 research
predates this module replacing the older, now-deprecated `ask` directive): only `?domain=` is sent, no
custom headers, a 10s timeout, redirects are rejected, and **anything other than a 2xx response —
including connection refused, timeout, or 5xx — is a deny.** This means:

- The endpoint this env var points at does not exist in the application yet. That is expected: it is
  application source, out of scope here. Until it ships, every on-demand hostname this edge sees is
  denied automatically — the edge's idle default is "refuse a new custom domain," never "let it
  through unauthenticated."
- Because the module sends no header and no body, the endpoint cannot require a bearer secret the way
  every other `/api/internal/*` route in this app does (`INTERNAL_JOB_SECRET`). It must be a narrow,
  unauthenticated, read-only "is this exact hostname eligible right now" check — revealing eligibility
  for a hostname the caller already knows, nothing more. This is a naming/placement decision for
  whoever implements the app-side endpoint (a candidate path is
  `/api/public/domains/ask`, since `/api/internal/*` implies the bearer convention this cannot use);
  it is **not** decided by this change.
- Eligibility logic — is this hostname bound to an active, non-quarantined organization; is a
  `<slug>.therapygo.ru` slug real — stays entirely application-side, per the brief ("the application
  remains the authority for whether a hostname is eligible"). This edge asks a yes/no question and
  acts on the answer; it holds no tenant data.

## Named blockers (not resolved by this change)

1. **Wildcard `*.therapygo.ru` vs. per-subdomain on-demand (owner-facing fork).** `IMPLEMENTATION_PLAN.md`'s
   `B7` asks for one certificate whose SAN list explicitly contains both `therapygo.ru` and
   `*.therapygo.ru`. A literal wildcard SAN can only be issued via the ACME DNS-01 challenge, which
   needs a Caddy build with a DNS provider module matching whichever registrar/DNS host `therapygo.ru`
   uses, plus that registrar's API credentials — neither the module choice nor the credentials are
   documented anywhere in this repository, and picking one here would be inventing an unverified
   integration, which the brief rules out. **This change does not attempt DNS-01 or wildcard SAN.**
   Instead, `<slug>.therapygo.ru` branded subdomains fall through to the same `on_demand_tls` +
   `permission http` path as arbitrary custom domains — the app's `ask` endpoint can validate a known
   slug exactly as it validates a bound custom domain, and each subdomain gets its own exact-host
   certificate via HTTP-01 the first time it is requested, no wildcard needed. Whether that satisfies
   the owner's actual intent behind `B7`, or a literal wildcard SAN is still wanted, is an open
   question for the owner, not something this change decides.
2. **The `ask` endpoint does not exist.** Tracked as application work, not part of this change (see
   above). Caddy's fail-closed default keeps this edge safe in the meantime, not broken.
3. **`stream_ssl_preread` on the new host was never checked, and is now moot.** The design chosen
   here does not need it (no SNI-preread passthrough is used); recorded here only so a future reader
   does not re-derive the same dead end the 2026-07-26 research flagged.
4. **The firewall/security documentation names nginx as the process on 80/443.** `SERVER
   CONVENTIONS.md`'s "Сетевой периметр" table lists `tcp 80, 443 | nginx | наружу`. The port numbers
   this change uses do not change (no nftables edit is needed or included), but the *process* bound to
   them does, once `cutover-edge-to-caddy.sh` is actually run. That table should be updated by whoever
   runs the cutover, as a documentation fact, not as a firewall change — flagged here so it is not
   missed silently.
5. **A same-host cutover has an unavoidable gap.** Between nginx releasing 80/443 and Caddy binding
   them, nothing answers publicly for a few seconds (documented in the script's own header). Accepted
   given the host's current trial-only reachability; revisit if this host starts carrying live public
   traffic before this cutover runs.

## Validation performed (static, in this repository, no live host)

- `deploy/nginx/prod/bcb-internal.conf.template` — rendered with a placeholder port and checked with
  a sandboxed `nginx -t` (this box's nginx, syntax-only; confirms the block parses and the
  `bcb_webapp`/`bcb_api` upstream references are well-formed).
- `deploy/host/prod/{cutover-edge-to-caddy,rollback-edge-to-nginx,check-caddy-edge-health}.sh` —
  `bash -n` syntax check on all three.
- Caddyfile syntax was reviewed by hand against Caddy 2.11's documented Caddyfile grammar; **no
  `caddy validate` was run** — this sandbox has no `caddy` binary, and the brief requires not
  installing one to get it. This is the primary unexecuted gate below.

## Explicit unexecuted live gates (do not report this feature "working" without them)

- `caddy validate` against `deploy/caddy/Caddyfile.template` with a real `caddy.prod` env sourced —
  the script runs this itself before touching nginx, but it has never actually run anywhere.
- The full `cutover-edge-to-caddy.sh` sequence on the real host: package install, nginx swap, caddy
  start, all six post-flip checks.
- Real certificate issuance for at least one platform hostname (HTTP-01) and one on-demand hostname,
  once the `ask` endpoint exists — end-to-end proof that a clinic pointing DNS at this host actually
  gets a valid browser-trusted certificate.
- `check-caddy-edge-health.sh` against a host that has actually issued certificates (the `.crt` file
  layout assumption comes from Caddy's documented default file-storage layout, not from an observed
  directory on this host).
- `rollback-edge-to-nginx.sh` exercised for real after a real cutover.
- Renewal behaviour over time (weeks), and confirmation that a deliberately-broken `ask` response
  correctly blocks issuance for a new hostname without affecting already-issued certificates.

## Notes carried forward from research, applied here

- **`.ru` domains get real Let's Encrypt certificates today** — verified live on this box's TEST
  nginx per the 2026-07-26 research; no CA fallback or special-casing needed.
- **HSTS on tenant/custom domains omits `includeSubDomains` and `preload`** (`MULTI_BRAND_DOMAIN_WORLD_PRACTICE.md`
  §9.3) — a clinic that points only `app.clinic.ru` at us should not have this edge force HSTS onto
  every other subdomain of `clinic.ru` it does not control.
- **`header_up Host {hostport}` is mandatory**, not cosmetic — without it every clinic's request would
  arrive at the internal nginx hop as whatever Host `{$CADDY_UPSTREAM}` itself answers to, breaking
  Host-based org resolution and the origin-derived CSRF check in
  `apps/webapp/src/middleware/csrfOrigin.ts` alike.
- **An apex `A @` record is a long-lived commitment to `CADDY_EDGE_STABLE_IP`** — changing this host's
  IP later breaks every clinic that used the apex option, not just the platform's own domains. This is
  not a concern this change can resolve, only one to keep in mind before treating the IP as freely
  movable.
