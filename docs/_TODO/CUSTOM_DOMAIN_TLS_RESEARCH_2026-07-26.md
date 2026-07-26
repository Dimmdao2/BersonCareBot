# Custom-domain TLS — off-the-shelf research (Tilda-shaped flow)

**Date:** 2026-07-26/27. **Author:** research agent, read-only pass, no writes except this file.
**Question asked:** what ready-made component gets us "clinic types in their domain, points DNS at us,
gets a working `https://their-domain.ru` automatically" — without us building an ACME client, a
certificate store or a renewal daemon ourselves.

**Bottom line up front:** the ready-made component exists and this is exactly the use case it was built
for — **Caddy's `on_demand_tls`**. Nothing needs to be written to obtain, store or renew a certificate.
What still has to be written (by us, because it is inherently product logic, not infrastructure) is: (a)
the `ask` authorization endpoint Caddy calls before issuing, and (b) resolving the incoming custom
hostname to an `organization_id` inside the app, because the app has no hostname→org lookup today (see
"What's already decided" below — confirmed absent in code, not just undocumented).

---

## 1. What we actually run today (measured, not assumed)

This finding matters more than it looks: **the box this research ran on (`localhost`, public IP
`151.241.228.122`) is the same box that serves `test.bersoncare.ru`**, confirmed by `hostname -I` and by
`/etc/nginx/sites-enabled/test.bersoncare.ru` being live. PROD is a separate host (`135.106.162.170`,
per `docs/ARCHITECTURE/SERVER CONVENTIONS.md:43`) that this research never touched, never contacted,
per the hard prohibition. Where this report describes PROD's setup it is inferred from repo docs only
and marked as such.

### TLS termination, TEST (measured on this box)
- nginx `1.24.0` (Ubuntu), confirmed by `nginx -v`.
- `test.bersoncare.ru` vhost: `/etc/nginx/sites-available/test.bersoncare.ru` (live content matches
  `deploy/host/apply-test-nginx-webapp.sh:95-157`, the repo-managed source of truth). TLS via
  `ssl_certificate /etc/letsencrypt/live/test.bersoncare.ru/{fullchain,privkey}.pem`.
- **This vhost is IP-allowlisted at the nginx layer**: `allow 10.9.0.0/24; allow 172.17.0.0/16; allow
  151.241.228.122; allow 127.0.0.1; deny all;` (same file, lines 111-115). Confirmed live via `sudo cat`
  of the active config.
- At the OS/firewall layer there is **no restriction**: `ufw status` returned nothing (inactive), and
  `sudo iptables -L INPUT -n` shows the default `ACCEPT` policy with zero rules. `ss -lntup` shows nginx
  bound to `0.0.0.0:80` and `0.0.0.0:443` (and `[::]` for both). So the IP lock on `test.bersoncare.ru`
  is purely an nginx `allow/deny` directive on that one vhost — the port itself is reachable from the
  public internet, confirmed by the routing table (`default via 151.241.228.1 dev ens1`, a real WAN
  route, not NAT-behind-something).
- **Consequence for this research's own recommendation**: a *new* vhost/edge added for arbitrary
  customer hostnames would not need to fight this allowlist — it would be reachable from the internet
  today, on this same public IP, without any firewall change. The allowlist is a property of the
  `test.bersoncare.ru` server block, not of the box.

### TLS termination, PROD (from docs only — not probed, per hard prohibition)
- `docs/ARCHITECTURE/SERVER CONVENTIONS.md:216-218`: nginx vhost
  `/etc/nginx/sites-available/bersoncarebot-webapp` serves `bersoncare.ru`/`www.bersoncare.ru` →
  `127.0.0.1:6200`; separate vhost `tgcarebot.conf` serves the integrator API. TLS via Let's Encrypt at
  `/etc/letsencrypt/live/bersoncare.ru/`.
- Note (unverified, out of scope to chase further): this same *research* box also has a live
  `/etc/letsencrypt/live/bersoncare.ru/` cert and an enabled `bersoncarebot-webapp` nginx site
  (`ls /etc/nginx/sites-enabled/`), which — read together with
  `docs/archive/FULL_DEV_PLAN_DONE/PLANS/STAGE_18_SERVER_MIGRATION/PLAN.md` — looks like a pre-migration
  leftover from before PROD moved to `135.x`. Not touched, not investigated further; flagged only so
  nobody mistakes this box for a second live PROD.

### Certificate issuance/renewal today (measured)
- `certbot 2.9.0-1` (apt package, `python3-certbot-nginx` plugin) — confirmed by `dpkg -l`.
- Renewal is a **systemd timer**, not the cron layer covered by `cronport.mjs`:
  `systemctl list-timers` shows `certbot.timer` (`Run certbot twice daily`, next-fire ~07:20/~19:20
  local) and a redundant `snap.certbot.renew.timer`. `node /home/dev/brain/tools/cronport.mjs list`
  correctly shows **no** certbot entry — it genuinely isn't in cron, so that tool's list is not
  incomplete, the mechanism just lives elsewhere on this host.
- `/etc/letsencrypt/renewal/test.bersoncare.ru.conf`: `authenticator = nginx`, `installer = nginx`,
  `key_type = ecdsa`. Same pattern confirmed for every other vhost on the box (`bersoncare.ru`,
  `tgcarebot.bersonservices.ru`, `storylama.ru`, etc. — 10 certs total under `/etc/letsencrypt/live/`).
- `journalctl -u certbot.service` shows the timer actually firing on schedule for the last week
  (multiple runs/day visible 2026-07-20 through 2026-07-26), and `/var/log/letsencrypt/letsencrypt.log`
  shows the most recent run (2026-07-26 15:44) walked all 10 certs and correctly skipped renewal for
  each (all >30 days from expiry: `test.bersoncare.ru` expires 2026-09-23, `bersoncare.ru` 2026-09-06).
  **This is today's real signal that renewal works** — not a green dashboard, an actual log of a
  scheduled job that ran and made a real decision per domain.
- **This mechanism (certbot's nginx plugin, a systemd timer, one static vhost per domain) fundamentally
  cannot serve the target feature.** It renews a fixed, pre-configured list of domains. A clinic typing
  a new domain into our admin panel would need a `certbot certonly -d <new-domain>` run and a matching
  nginx vhost written, per domain, before HTTPS works — the opposite of "on the first request,
  automatically."

### Public reachability of port 80 (the HTTP-01 precondition)
- Measured: `0.0.0.0:80`/`0.0.0.0:443` bound, no `ufw`/`iptables` restriction, a real WAN route. Port 80
  is reachable from the internet for **this box** generally.
- **But `test.bersoncare.ru` specifically is not**, because of the nginx-layer allowlist above — and its
  own `default_server` fallback (`/etc/nginx/sites-available/default:22-23`, `listen 80 default_server`)
  answers unmatched `Host` headers with a plain `try_files … =404` on `/var/www/html`, which has **no**
  `/.well-known/acme-challenge/` location today. So an HTTP-01 challenge for an arbitrary customer
  hostname pointed at this IP would currently 404 — not because the box can't be reached, but because
  nothing on it answers that path for an unrecognized hostname yet. This is exactly the kind of vhost a
  new edge (Caddy or otherwise) is meant to add, it is not evidence against the approach.
- **What this means for testing this specific feature on TEST**: you cannot validate on-demand issuance
  *through the existing `test.bersoncare.ru` vhost*, because its `allow`/`deny` would need loosening
  (defeats the point of the VPN lock) or the new custom-domain vhost has to be a genuinely separate
  server block that does not inherit that allowlist. It can share the box and the IP — nginx serves
  many independent vhosts on one IP already (10 sites-available today) — it just must be its own
  `server {}` block, unrestricted, per the design below.

---

## 2. Candidates, evaluated

| Candidate | On-demand issuance for *arbitrary* hostnames, zero config/restart per domain? | What our app must expose | Migration cost from today | Verdict |
|---|---|---|---|---|
| **Caddy `on_demand_tls`** | **Yes — this is the literal feature.** Cert requested at first TLS handshake for any hostname that passes the `ask` check; cached; auto-renewed; auto-expired when traffic stops. [caddyserver.com/docs/automatic-https](https://caddyserver.com/docs/automatic-https), [caddyserver.com/on-demand-tls](https://caddyserver.com/on-demand-tls) | One HTTP endpoint: `GET /ask?domain=<host>` → `2xx` = allow, anything else = deny. Must respond in low milliseconds (Caddy's own guidance), constant-time DB lookup only, no network calls inside it. | New standalone edge (see §4) — **does not require touching PROD's existing nginx/cert estate at all**. | **Recommended.** |
| **Traefik (ACME + dynamic providers)** | **No**, not for truly arbitrary/unknown hostnames without a config push first. Traefik requests a cert only for domains that already appear in its *dynamic configuration* (labels, file provider, etc.); an unconfigured `Host` gets served Traefik's invalid default self-signed cert instead of failing closed or issuing on demand — confirmed as expected-but-surprising behavior by Traefik's own maintainers on [github.com/traefik/traefik/issues/6848](https://github.com/traefik/traefik/issues/6848). There is no `ask`-style abuse-controlled on-demand mode in Traefik at all. | A config-push mechanism per new domain (file provider write + reload, or a custom provider) — i.e. we'd be building the "on demand" part ourselves, defeating the point of "find ready-made." | Would replace nginx as edge, same as Caddy, but for less capability. | **Rejected for this use case** — it does the *fixed multi-domain* ACME case well, not the *arbitrary customer-typed domain* case. |
| **nginx + companion (`lua-resty-auto-ssl` / OpenResty)** | Yes, this is the historical prior-art for exactly this problem (predates Caddy's on-demand feature). Runs inside OpenResty (nginx + LuaJIT), stores certs in Redis/SQLite, calls a configurable `allow_domain`/`request_domain` Lua callback per new hostname. Actively used in production (Hostinger's fork: [github.com/hostinger/lua-resty-auto-ssl-multi](https://github.com/hostinger/lua-resty-auto-ssl-multi); multi-tenant Redis-backed fork: [github.com/ronaldgrn/docker-lua-resty-auto-ssl](https://github.com/ronaldgrn/docker-lua-resty-auto-ssl)). | Same shape of check, but as a Lua callback embedded in nginx config rather than an HTTP endpoint — less clean to keep app-side, and couples cert logic into nginx's own process. | **Requires OpenResty**, not stock nginx (`nginx -V` on this box shows `--with-http_ssl_module` only, **no** `--with-http_lua_module` — confirmed by grepping `nginx -V` output for `lua`, zero hits). So this is not a drop-in for the nginx binary already running here; it's a parallel/replacement install, same order of migration cost as switching to Caddy, for a less actively-maintained, more DIY-assembly path (you are wiring Lua + Redis + an ACME client yourself; Caddy ships this as one binary). | **Not recommended** — same migration cost as Caddy, more moving parts, thinner ecosystem support in 2026. |

**Why not "sit nginx in front, Caddy behind"?** On-demand TLS is decided at the TLS ClientHello (the
`ask` check happens *during the handshake*, before decryption) — the component doing `on_demand_tls`
must be the one terminating TLS for that hostname. If nginx keeps terminating TLS for these hostnames,
Caddy never sees the handshake and can't act. This is confirmed by community guidance: "if your load
balancer rewrites the SNI or terminates TLS, the challenge fails" ([stackharbor.com/en/knowledge-base/caddy-on-demand-tls](https://stackharbor.com/en/knowledge-base/caddy-on-demand-tls)).
So this is a real either/or, not a taste preference: **whatever does on-demand TLS must own port 443 for
those hostnames.**

---

## 3. The parts that bite

### Abuse / authorization (fail-closed shape)
Caddy's own docs are explicit that `on_demand` without the global `on_demand_tls` restriction is
"insecure... in production" ([caddyserver.com/docs/caddyfile/directives/tls](https://caddyserver.com/docs/caddyfile/directives/tls)).
The `ask` endpoint is the entire abuse gate: `GET /ask?domain=<hostname>`, `2xx` → proceed with
issuance, **any other status cancels issuance and fails the TLS handshake** — i.e. it is fail-closed by
construction, not by our discipline. Caddy's internal HTTP client for this call has a **10-second
timeout** (`ondemand.go`, per Caddy community/GitHub discussion); a timeout or non-2xx has the same
effect as an explicit deny — the handshake fails, no cert is requested. There is a documented internal
rate limit on top (10 ACME attempts per account per 10 seconds) as defense in depth, and the previous
per-hostname `interval`/`burst` Caddyfile knobs are now **explicitly deprecated** ("NOT recommended...
remove them from your config") in favor of the `ask` check doing the real gating.

### Let's Encrypt rate limits — the real numbers, and whether we'd hit them
Source: [letsencrypt.org/docs/rate-limits/](https://letsencrypt.org/docs/rate-limits/) (fetched live,
current page):
- **New orders per account:** 300 / 3 hours (refill 1 per 36s). This is the one that could matter at
  scale — every new clinic onboarding a domain is one order — but at clinic-SaaS volume (tens to low
  hundreds of clinics, not thousands per hour) this is nowhere close.
- **New certificates per *registered* domain:** 50 / 7 days, **global across all accounts, scoped to
  that one registered domain** (e.g. `tochka-zdorovya.ru`). This limit is about *one customer's own
  domain getting re-issued many times*, not about our platform's total domain count — each clinic has a
  different registered domain, so this practically never bites a multi-tenant platform. It would only
  bite one clinic that keeps forcing re-issuance (e.g. a broken retry loop) for its own domain.
- **Duplicate certificate limit:** 5 / 7 days for the exact same identifier set — same story, per-domain
  not per-platform.
- **Renewals are exempt** from the per-account and per-domain limits when using ARI (Automatic Renewal
  Info); non-ARI renewals still skip those two limits but remain subject to the duplicate-cert and
  failed-validation limits.
- **Failed validations:** 5 / hour per hostname (then a slower backoff up to a documented cap). This is
  the one to watch operationally — a clinic that sets DNS wrong and we keep retrying blind would burn
  this quickly; the ask endpoint should not be the retry driver, Caddy's own on-demand logic already
  avoids hammering (it issues once per handshake, not per request).
- **Conclusion: a clinic-SaaS with realistic onboarding volume does not realistically hit these limits.**
  The design risk is not rate limits, it's the abuse/auth gate above (unbounded *attempts* from
  unrelated domains being pointed at us, which the `ask` check is specifically what prevents — see
  above).

### Renewal failure — the signal, not the intention
This is explicitly the same silent-failure class flagged elsewhere in this repo's own history (`docs`
memory: "Алертинг не ловит отказ доставки email/SMS"). For on-demand TLS specifically:
- Caddy exposes Prometheus metrics; `caddy_storage_io_errors_total` was called out by one production
  write-up as the metric to alert on for a **shared storage backend** (Redis/etc.) going down silently —
  "if Redis is down, every node falls back to its local view, which may not include the cert" —
  [stackharbor.com/en/knowledge-base/caddy-on-demand-tls](https://stackharbor.com/en/knowledge-base/caddy-on-demand-tls).
  For a single-instance Caddy (the realistic size here, see §4) this specific failure mode is smaller,
  but the general point holds: **a renewal failure for one clinic's cert is invisible until that
  clinic's browser shows a warning**, unless something checks expiry proactively. Concretely: a daily
  job hitting our own domain-management table and checking each `base_ready` hostname's actual served
  cert `notAfter` (or Caddy's admin API, which exposes certificate state) against a threshold (e.g. <14
  days) is the standard shape — not documented as built into Caddy itself, this is the "smallest glue"
  we would still have to write, because Caddy renews silently by design and does not push a
  business-facing alert.
- Concrete unverified-by-this-research item: whether Caddy's admin API or metrics endpoint is the
  cleaner integration point for that check versus a periodic external TLS probe of each domain — this
  is an implementation decision for build time, not something a "ready-made" search resolves further.

### Russia specifics — verified, not assumed
This is the one area the task explicitly warned is expensive to get wrong, so it got the most direct
verification, including against our own live evidence:
- **Direct evidence on this box**: `bersoncare.ru` and `test.bersoncare.ru` — both `.ru` — **already
  have live, valid, auto-renewing Let's Encrypt certificates today** (`/etc/letsencrypt/live/`, expiring
  2026-09-06 and 2026-09-23 respectively). Let's Encrypt issuing for `.ru` is not hypothetical here, it
  is the status quo this repo already runs on.
- **The June 2026 subscriber-agreement change is real but is not a technical block on `.ru`/`.su`**:
  Let's Encrypt's Subscriber Agreement v1.7 (dated 2026-06-04) added a *warranty clause* — the
  certificate applicant confirms they are not a sanctioned party / not subject to comprehensive US
  export-control prohibitions. This is legal-agreement language, not a new ACME-protocol-level
  country-code filter. Verified via Let's Encrypt's own community forum
  ([community.letsencrypt.org/t/russia-certs-and-sectoral-sanctions/189631](https://community.letsencrypt.org/t/russia-certs-and-sectoral-sanctions/189631)):
  a moderator states plainly, "The only domains that are blocked for 'political' reasons are those
  owned by entities on the US's 'SDN List'" (the Treasury's Specially Designated Nationals list), and
  that for anyone not on that list, "issuance happening within seconds" via the normal automated path.
  A second, older thread ([community.letsencrypt.org/t/russian-domains-not-blocked-anymore/188429](https://community.letsencrypt.org/t/russian-domains-not-blocked-anymore/188429))
  has a Let's Encrypt staff member (`danb35`) stating "LE has never had a ban on Russian domains
  generally" — the SDN-list check is the same mechanism that has existed since 2022, this year's
  agreement update just wrote it into the contract text explicitly.
  - Caveat worth carrying forward, from the same thread: a moderator notes it's *possible* for an order
    to succeed and then get revoked later if the registrant is subsequently identified as SDN-listed.
    For an ordinary Russian medical clinic this is not a realistic scenario, but it means "issued" is
    not permanently risk-free the way it would be for a US/EU domain — flagged for completeness, not
    as a blocker.
  - **Other CAs differ and this matters if Caddy's default ACME CA ever needs a fallback**: the same
    thread notes ZeroSSL (a Sectigo reseller), DigiCert and Sectigo block `.ru` domains outright as a
    company policy, not a legal requirement. **Do not silently fall back to ZeroSSL/Sectigo as a Caddy
    alternate ACME endpoint for `.ru` domains** — that would break for reasons unrelated to Let's
    Encrypt's own policy. Caddy defaults to Let's Encrypt; this is a "don't change it" note, not an
    action item.
  - One source (`abit.ee`) returned HTTP 403 to this research's fetch attempt and could not be read
    directly — its claims are **not** relied on above; everything above comes from Let's Encrypt's own
    community forum (staff/moderator posts) plus our own live evidence.
- **The separate Минцифры/НУЦ (Russian national root CA) story is unrelated and not a requirement
  here.** Recent RIA Novosti coverage (2026-07-23, [ria.ru/20260723/mintsifry-2106485138.html](https://ria.ru/20260723/mintsifry-2106485138.html))
  is Минцифры *recommending users install the Russian national root CA certificate on their own
  devices/browsers*, framed around sites whose **foreign-issued** certificates have already been
  revoked (mostly sanctioned banks, e.g. Sberbank/VTB, a story that dates back to 2022, resurfacing now
  because more revocations are happening). This is not a rule that a private clinic's Let's
  Encrypt-issued site needs a НУЦ certificate instead — nothing found requires it for a normal, non-SDN
  business. It is a real fallback path to know about (if a clinic's LE cert were ever unexpectedly
  revoked for sanctions reasons, НУЦ is the documented Russian alternative), not a day-one requirement.
  **Marking this specific "is it ever mandatory" question as not fully resolvable from public sources in
  this pass** — it is a slow-moving regulatory area; if the owner wants a harder guarantee here, it
  needs a follow-up check closer to build time, not a one-time research answer.

### Wildcard for our own subdomains (`clinic.<our-domain>`)
**Same component, no separate mechanism needed — and no wildcard actually required.** The owner already
decided subdomains come first; the reason wildcard sounds necessary is "so we don't reconfigure per
subdomain," but that is precisely what on-demand TLS already gives you without a wildcard: Caddy issues
an individual HTTP-01 certificate for `clinic-a.<our-domain>` the first time it's hit, same as for a
fully external customer domain — no DNS-01 challenge, no DNS-provider API plugin, no wildcard cert
needed at all. A wildcard (`*.<our-domain>`) would only earn its keep if subdomains were ever created
*without* Caddy ever seeing a first request for them (e.g., issued out-of-band) — not the case here. One
Caddy instance, one `on_demand_tls` config, covers both the owner's subdomain-first path and the
external custom-domain path; the only difference between the two is which hostnames the `ask` endpoint
is willing to say yes to (our own subdomain pattern vs. a clinic's verified custom domain).

---

## 4. Recommendation, concretely

**Component:** Caddy, current stable **v2.11.4** (released 2026-06-03,
[github.com/caddyserver/caddy/releases](https://github.com/caddyserver/caddy/releases)).

**Topology — do not touch the existing nginx/cert estate at all.** Run Caddy as a **small, standalone
edge**, its own instance with its own public IP, whose only job is: terminate TLS for clinic custom
domains (and, if desired, our own `*.{subdomain}.<our-domain>` traffic too), then `reverse_proxy` to the
existing app over the network. This is not a novel pattern — it's the documented production shape for
this exact problem (one public write-up ran this for 100k+ users on a single small VPS for over a year:
[jhumanj.com/saas-custom-domain-feature-caddy-dynamodb](https://jhumanj.com/saas-custom-domain-feature-caddy-dynamodb)).
Rationale for *not* replacing the box's existing nginx instead: this host runs nginx for ten unrelated
vhosts (`brain`, `storylama`, `penpot`, `minio`, `fs`, plus BCB's own test/legacy configs) — swapping
the front door for all of them to touch one feature is a large, unrelated blast radius for zero benefit;
a dedicated edge has none of that risk and is cheaper to build.

**Config shape (illustrative, not final):**
```
{
    on_demand_tls {
        ask https://bersoncare.ru/api/internal/domains/ask
    }
}

:443 {
    tls {
        on_demand
    }
    reverse_proxy https://bersoncare.ru {
        header_up Host {hostport}
    }
}
```
Two things in that snippet are load-bearing and easy to get wrong silently:
1. `header_up Host {hostport}` is **required**, not optional decoration. As of Caddy v2.11.0,
   `reverse_proxy` to an **HTTPS** upstream *automatically rewrites* the `Host` header to match the
   upstream's own hostname (`bersoncare.ru`) unless told otherwise
   ([caddyserver.com/docs/caddyfile/directives/reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)).
   Without the explicit override, the app would receive every clinic's traffic with
   `Host: bersoncare.ru` and could never resolve which organization the request is for.
2. The `ask` endpoint must be a **new** route — nothing in the app resolves an organization by incoming
   hostname today. Confirmed by reading `apps/webapp/src/middleware/platformContext.ts` (handles
   Telegram/Max mini-app entry context only, no hostname→org lookup) and by
   `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/BRANDING_DOMAIN_CONTRACT.md:25-27` stating outright that
   "Полноценные org-brand profile, publication, domain... сущности — требования к будущей реализации, а
   не заявление о готовом backend." This is the one piece of genuinely new app code the "ready-made"
   search cannot avoid — it is product logic (which org owns this hostname), not infrastructure.

**Existing product contract vs. this task's framing — a discrepancy worth surfacing, not resolving here.**
`docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/BRANDING_DOMAIN_CONTRACT.md:340-356` already defines a
`HostnameBase` state machine with an explicit `ownership_pending → ownership_verified` step *before*
`certificate_pending`. This task's brief states the owner's newer, verbal instruction is that **pointing
DNS at us is itself the proof — there is no separate verification step**, citing Tilda as precedent.
Technically the two are reconcilable: the ACME HTTP-01 challenge itself only succeeds if DNS already
points at us and port 80 is reachable, so a successful on-demand issuance *is* the ownership proof,
collapsed into the same step as certificate issuance rather than a distinct screen before it. Whether
`HostnameBase`'s `ownership_pending`/`ownership_verified` states get **collapsed into**
`certificate_pending` (matching "no separate screen") or kept as a UI-only status label over the same
underlying check is a product decision for whoever builds this, not something this research should
decide — flagged here so it doesn't get silently designed either way by an implementer skimming only the
older document.

---

## 5. Ordered install/config plan

**Biggest unknown, named first: where does this edge's public IP/DNS come from, and does the owner want
it validated on TEST before PROD, given TEST's VPN lock makes the existing `test.bersoncare.ru` vhost
unusable as a stand-in (§1).** The plan below assumes a small new box (or a second public IP on an
existing one — not confirmed available on this box, `ip addr` showed exactly one WAN address) is an
open, cheap owner decision, not a technical blocker; if the owner wants zero new infrastructure spend,
the fallback is the SNI-passthrough architecture below, which is real but adds a second moving part.

1. **Decide the edge's address.** Cheapest realistic option: a small VPS (the referenced production
   write-up ran comfortably on a `t3.small`-class box for 100k+ users) with its own public IPv4, DNS
   pointed at it. Alternative without new infrastructure spend: nginx `stream { ssl_preread on; }` on
   an existing box, routing by SNI to either the existing nginx TLS vhosts (moved to a different local
   port) or to Caddy — confirmed *possible* on this box specifically, since `nginx -V` shows
   `--with-stream_ssl_preread_module` already compiled in, but this is a more invasive change to the
   existing working nginx setup and is the "bigger, riskier" of the two options, not the recommended
   default.
2. **Stand up Caddy** on that address (single static binary, no dependency install beyond the binary
   itself — this is one reason it wins over the OpenResty/Lua path in §2).
3. **Build the `ask` endpoint** as a new internal route in the existing webapp (pattern already exists
   for other internal endpoints: `POST /api/internal/*` gated by `INTERNAL_JOB_SECRET`, per
   `docs/ARCHITECTURE/SERVER CONVENTIONS.md:313` — reusing that convention rather than inventing a new
   auth shape is the "single chokepoint" the owner has repeatedly asked for elsewhere in this repo).
   Contract: `GET ?domain=<host>` → `200` iff an organization has that hostname registered (any lifecycle
   status is a product decision — likely just "registered", not "DNS already confirmed," since DNS
   confirmation is what the ACME challenge itself will do next).
4. **Build hostname→organization resolution** in the request path (the piece flagged in §4 as
   unavoidable new app code) — this is what makes the reverse-proxied request actually render the right
   clinic once TLS succeeds.
5. **Point one real test domain at the new edge and prove the full loop live**: DNS → first request →
   cert issued → page renders the right clinic → second request served from cache, no re-issuance.
   Given §1's finding, this **cannot** go through the existing `test.bersoncare.ru` vhost's VPN lock;
   either use a disposable domain the owner controls, pointed at the new edge directly, or accept this
   validation genuinely needs a reachable-from-internet target.
6. **Add the renewal-failure signal** named in §3 (expiry-proximity check against the domains table,
   alerted through whatever channel the rest of this repo already uses for operator incidents — the
   pattern exists, e.g. `system-health-guard/tick`, per `docs/ARCHITECTURE/SERVER CONVENTIONS.md:313`).
7. **Cut over one real (owner-approved) clinic domain**, then generalize.

## 6. Size estimate

**Rough size: 3–5 engineer-days**, most of it in steps 3–4 (app-side hostname resolution, which is real
product/tenant-routing work, not infra) and step 5 (getting a genuinely public, non-VPN-locked
validation loop working end to end, which depends on the still-open "where does the edge live" decision
in step 1). Caddy install/config itself (steps 1–2) is closer to hours than days — it is one binary and
a config file, that is the entire point of picking a component built for this. What drives the estimate
up or down:
- **Up**: if the owner wants the SNI-passthrough-behind-existing-nginx architecture instead of a
  dedicated edge (more moving parts, more risk to the working PROD nginx estate, harder to validate
  safely).
- **Up**: if `HostnameBase`'s full state machine (§9.1 of `BRANDING_DOMAIN_CONTRACT.md`) is built in
  full for this first cut, rather than the minimal "DNS-points-at-us-is-the-proof" version this task
  asked for — that richer machine (degraded/suspended/quarantine states, per-surface bindings) is
  already scoped elsewhere and is clearly more than "get one clinic's browser bar to show their own domain."
- **Down**: nothing in this research suggests a smaller path exists than "stand up Caddy, write the ask
  endpoint, write hostname resolution, prove it live" — this is close to the floor for the feature as
  specified.

---

## Unverified / flagged for follow-up, explicitly

- Whether a second public IP is available on the existing infrastructure budget (not something this
  read-only pass could determine — `ip addr` on the research box shows one WAN address, PROD's own
  interface config was not probed per the hard prohibition on touching `135.x`).
- The `abit.ee` source on `.ru` LE restrictions could not be fetched (HTTP 403) — not relied upon;
  Let's Encrypt's own community forum was used instead and is the stronger source regardless.
- Whether Минцифры/НУЦ certificates will ever become a practical requirement for an *unsanctioned*
  Russian small business's website — nothing found says yes today; this is a slow-moving regulatory
  question worth a fresh check close to actual build/launch time, not resolvable definitively from a
  single research pass now.
- The exact mechanism for the renewal-failure monitoring signal (Caddy admin API vs. an external TLS
  probe) is named as a requirement, not designed — that is implementation work, correctly out of scope
  for "which ready-made component."
