# Therapysto future-domain cutover readiness — closing audit 2026-08-24

- Candidate: `023007142d46b324b49005438e52bce8e687ee28`
- Base: `5272a07614aa068067431f40b8f3495e93bea054`
- Previous audit: `92d62b149` (`FAIL`)
- Fixer sequence: `e24a41785`, `023007142`
- Role: independent closing auditor; no product-code fixes
- Verdict: **FAIL**

The package now preserves the existing TEST nginx seam, models the intended production
host/certificate topology, binds normal apply to the exact map, compiles before mutation, rolls
back both installed files, and has actionable monitoring. Four reachable gaps remain: a hostname
suffix bypasses the split-certificate invariant, `--offline --apply` crosses the host boundary,
apply neither activates the new webapp env nor proves the DB-backed OAuth allowlist, and the
rollback acceptance scenario is not hermetic and can pass before exercising rollback.

## Closing result against the original blind kill-set

1. **PASS — existing TEST nginx seam survives.** `render()` prefixes the future blocks with the
   byte-for-byte output of `apply-test-nginx-webapp.sh --render`. The local comparison command
   below returned `existing renderer prefix: PASS (3744 bytes)`. The preserved prefix contains
   `test.bersoncare.ru`, the IP/VPN boundary, integrator routes, YooKassa exceptions, access log,
   maintenance fallback, body limit, timeouts, and forwarded `Host`/`X-Forwarded-Host`.
2. **PASS — unknown TLS Host fails closed and compiles.** The candidate has an SSL default server
   with the declared platform certificate/key and `return 444`. A transformed `/tmp`-only
   candidate passed real nginx 1.24 compilation. A platform certificate/private-key mismatch
   failed compilation with exit `1`, before any install.
3. **PASS — routing topology is exact at the nginx seam.** The rendered server names are
   `therapysto.ru`, `admin.therapysto.ru`, `therapygo.ru`, `bersoncare.therapygo.ru`, and the
   separate exact custom host `app.bersoncare.ru`. The technical branded host returns `308` to
   the exact custom host while preserving `$request_uri`; unknown HTTP and HTTPS hosts hit the
   `444` defaults.
4. **FAIL — TLS names/paths have a fixture suffix bypass.** For the real topology, one platform
   pair is rendered for staff/admin/apex/technical branded and checked separately for the apex
   and `*.therapygo.ru`; a distinct custom pair is rendered and checked for `app.bersoncare.ru`.
   Every cert/key path is consumed and mismatch is caught by candidate compile. However,
   `therapysto-domain-cutover.sh:70-72` waives the distinct-pair requirement whenever
   `STAFF_HOST` ends in `.test.example`. The newly added public-CLI acceptance scenario proves
   that a map with a shared platform/custom pair exits `0`.
5. **PASS — DNS proves the approved target.** Preflight and monitoring resolve the approved target
   and require each hostname's unique IPv4 answer set to equal it. The unchanged nine-scenario
   oracle catches weakening this equality in both preflight and monitor paths.
6. **FAIL — runtime inputs are not active/proven before owner apply.** The map requires exact
   `APP_BASE_URL`, `PATIENT_APP_ORIGIN`, and exactly the two patient OAuth callbacks. Apply writes
   the two env values, but reloads only nginx and never restarts the TEST webapp. It does not read
   or compare the DB-backed `yandex_oauth_redirect_uri`; the callback value in the map is only an
   assertion about operator input. Thus `apply OK` is reachable while the running resolver still
   uses the previous process env and while Admin Settings contains a stale callback allowlist.
7. **PASS — normal owner-gated apply is map-bound, precompiled, and file-atomic.** The Boolean gate
   and SHA-256 digest bind every allowed map value. Rendering, candidate nginx compilation, and
   candidate env generation occur before the first backup/install. Mutation flags are set before
   their respective installs; the trap independently restores env and nginx after either partial
   install. The final reload is sequenced only after the installed candidate passes `nginx -t`.
8. **FAIL — offline apply can have host effects.** `--offline` and `--apply` are accepted together.
   With the exact owner digest this skips DNS/TLS verification and reaches `sudo` candidate
   compilation, contradicting the CLI contract that offline never calls host/TLS/service/sudo
   binaries. The newly added acceptance scenario is red on both required assertions.
9. **PASS — monitoring is actionable.** The monitor compares every DNS answer with the approved
   target, uses `openssl x509 -checkhost` for each concrete host and the wildcard name, and fails
   at the configured `-checkend` threshold. Fault injection caught DNS drift and disabled expiry
   enforcement; an independent fake served-certificate run returned `FAIL certificate name
   therapysto.ru` with exit `1`.
10. **FAIL — the runbook does not yet describe a truthful end-to-end apply.** It correctly preserves
    `test.bersoncare.ru`, documents exact activation/rollback, and leaves B7/B8/C5a/D1-D3/runtime
    C5 open. It says the exact OAuth list “must already be stored,” but the executable flow never
    proves that prerequisite, and the normal success path never restarts the webapp after changing
    its process env. Following the documented apply can therefore end with `apply OK` before the
    new runtime routing/auth inputs are active.

## Disposition of primary findings F1-F6

- **F1 PASS:** the existing TEST seam is composed rather than replaced; the candidate compiles
  with a valid TLS default server.
- **F2 FAIL:** real target topology, SAN checks, key use, and pre-install mismatch detection are
  present, but the `.test.example` branch permits the forbidden shared certificate pair.
- **F3 FAIL:** env candidates exist, but successful apply neither restarts the webapp nor proves
  the DB-backed OAuth setting used by the resolver.
- **F4 PASS for normal apply:** exact-map owner approval, pre-install compile, per-file rollback,
  and no reload after failed validation are present. Kill-set item 8 separately fails because
  offline and apply modes can be combined.
- **F5 PASS:** DNS drift, certificate hostname mismatch, and warning-threshold/expiry all fail the
  monitor.
- **F6 FAIL:** the original nine scenarios now cover the primary fault classes, but the rollback
  test reads a hard-coded live TEST env path and can pass on early failure without exercising the
  env install/restore path. The two additional public-CLI scenarios also expose two current gaps.

## Blocking findings

### CF1 — Fixture-looking names bypass the split TLS boundary

- **Reachable scenario:** supply a syntactically valid map whose `STAFF_HOST` ends in
  `.test.example` and point both platform and custom certificate/key fields at the same pair.
  `bash deploy/host/therapysto-domain-cutover.sh --host-map MAP --offline` exits `0`.
- **Impact:** the public CLI can approve a certificate model that does not enforce the separate
  exact custom-domain ownership boundary. This is a product/operator contract bypass, not merely
  a test-fixture convenience; the apply gate digests the already accepted invalid map.
- **Requirement:** original kill-set 4; B7/B8/C5a; closing brief “exact map-bound owner gate without
  fixture bypass” and “custom cert separated.”
- **Evidence:** `therapysto-domain-cutover.sh:70-72`; red acceptance test
  `fixture-looking hosts cannot bypass the split TLS certificate boundary` (`actual 0`).

### CF2 — `--offline --apply` skips readiness checks and crosses the privileged boundary

- **Reachable scenario:** request `--offline --apply` with `THERAPYSTO_CUTOVER_OWNER_APPROVED=yes`
  and the exact map digest. The CLI skips `verify_dns`/`verify_tls`, then calls `sudo nginx -t` from
  `compile_candidate`; with a valid candidate it continues into backups and installs.
- **Impact:** a mode documented as side-effect-free can mutate host state and can apply without
  DNS or certificate readiness proof.
- **Requirement:** original kill-set 8; CLI usage contract; closing brief “offline modes without
  host effects.”
- **Evidence:** `therapysto-domain-cutover.sh:21,153-175`; red acceptance test `offline apply is
  rejected before reaching sudo even with a valid owner digest` (sudo marker was created).

### CF3 — `apply OK` does not mean the required runtime origins/settings are in use

- **Reachable scenario A:** apply atomically replaces `webapp.test` with new `APP_BASE_URL` and
  `PATIENT_APP_ORIGIN`, validates nginx, reloads nginx, and prints success. The already-running
  TEST webapp is not restarted, so its resolver retains the previous process env while nginx
  forwards the new hosts.
- **Reachable scenario B:** Admin Settings still has an old or single
  `yandex_oauth_redirect_uri`. The map contains the expected two callbacks, but the CLI compares
  only the map string to its own derived expectation; it neither prepares nor reads the DB-backed
  value. Normal apply still prints success.
- **Impact:** the new staff/default-patient hosts can fail surface resolution until a separate
  restart, and OAuth on `therapygo.ru` or `app.bersoncare.ru` can remain disabled despite a green
  owner apply. This breaks the Stage D journey at the moment the package claims cutover success.
- **Requirement:** original kill-set 3, 6, and 10; implementation plan C1/C2 and Gate D; closing
  brief “package prepares/proves all runtime inputs before owner apply.” A manual prerequisite
  that the executable flow cannot verify is not sufficient readiness under that explicit gate.
- **Evidence:** env install at `therapysto-domain-cutover.sh:173`, nginx-only reload at line 175;
  runbook says the setting “must already be stored” but supplies no proof command.

### CF4 — The rollback acceptance case can be green without reaching rollback

- **Reachable scenario:** `therapysto-domain-cutover.acceptance.test.mjs` invokes the exact
  candidate for its rollback case, but the candidate hard-codes
  `/opt/env/bersoncarebot/webapp.test`. On a clean runner without that file,
  `render_env_candidate` fails before any env/nginx install. The test asserts only non-zero status,
  unchanged virtual nginx state, and no reload, so this early failure satisfies the test while
  env rollback is unexercised.
- **Impact:** the repeatable acceptance gate can report the rollback class green without proving
  restoration after either partial env or nginx install. On this development host, the same test
  also read the live TEST env despite being intended as a hermetic oracle.
- **Requirement:** AGENTS.md §10a/§10b; original F6; closing brief requires reuse of the independent
  oracle and rollback for every partial install without live-state reads.
- **Evidence:** acceptance test rollback case and candidate `WEBAPP_ENV_FILE` constant. A later
  `/tmp`-only copy fault injection did catch removal of the rollback commands, but it does not make
  the committed public oracle hermetic.

## Lead-correction checks

- `platform_wildcard="*.$PATIENT_DEFAULT_HOST"`: **PASS** (`*.therapygo.ru`, not a fixture-derived
  product contract).
- OAuth allowlist: **PASS at map validation**; extra and duplicate callbacks each exit non-zero,
  and the accepted set is exactly the default and exact custom callback. **FAIL at runtime proof**
  per CF3.
- Rollback restores env even when nginx install has not started: **PASS by view and `/tmp` fault
  injection**; `env_mutation_started=1` precedes env install and the trap does not depend on the
  nginx flag.
- Live monitor certificate hostname check: **PASS**; injected mismatch exits `1`.
- Exact map digest: **PASS**; changing any allowed map field invalidates prior approval. The TLS
  contract itself still has CF1.

## Commands and observed results

Candidate identity and diff:

```text
git rev-parse HEAD
023007142d46b324b49005438e52bce8e687ee28

git diff --stat 5272a0761..HEAD
10 files changed, 866 insertions(+), 1 deletion(-)
```

Original oracle before adding the two closing scenarios:

```text
node --test deploy/host/therapysto-domain-cutover.acceptance.test.mjs
9 tests, 9 pass, 0 fail
```

Each original fault class was then changed independently in a copied tree rooted at
`/tmp/bcb-therapysto-faults-qdV1iw`, and the same public command was run:

```text
node --test /tmp/bcb-therapysto-faults-qdV1iw/deploy/host/therapysto-domain-cutover.acceptance.test.mjs
```

All nine mutations made the suite non-zero: declared key ignored; DNS equality weakened; runtime
map guards removed; env/nginx restore removed; Boolean/digest owner gates bypassed; offline DNS
call forced; distinct-host guard weakened; monitor DNS equality weakened; expiry check disabled.
The red subtests were respectively the existing key-path, preflight DNS, runtime-input,
rollback-state, owner-gate, offline-boundary, duplicate-host, monitor-DNS, and expired-certificate
scenarios.

Contract/syntax/static checks before the audit artifact:

```text
node deploy/host/therapysto-domain-cutover.test.mjs
therapysto domain cutover contracts: PASS

bash -n deploy/host/apply-test-nginx-webapp.sh deploy/host/therapysto-domain-cutover.sh deploy/host/check-therapysto-domain-certificates.sh
exit 0

node --check deploy/host/therapysto-domain-cutover.acceptance.test.mjs
node --check deploy/host/therapysto-domain-cutover.test.mjs
both exit 0

git diff --check 5272a0761..HEAD
git diff --check
both exit 0
```

Real local nginx/TLS validation used only generated files under
`/tmp/bcb-therapysto-compile-1cgs8X`:

```text
base_bytes=$(wc -c < /tmp/bcb-therapysto-compile-1cgs8X/base.conf)
head -c "$base_bytes" /tmp/bcb-therapysto-compile-1cgs8X/candidate.conf | cmp - /tmp/bcb-therapysto-compile-1cgs8X/base.conf
existing renderer prefix: PASS (3744 bytes)

nginx -t -c /tmp/bcb-therapysto-compile-1cgs8X/nginx.conf
syntax is ok; test is successful

nginx -t -c /tmp/bcb-therapysto-compile-1cgs8X/nginx-key-mismatch.conf
exit 1

for host in therapysto.ru admin.therapysto.ru therapygo.ru '*.therapygo.ru' bersoncare.therapygo.ru; do
  openssl x509 -in /tmp/bcb-therapysto-compile-1cgs8X/platform.crt -noout -checkhost "$host"
done
openssl x509 -in /tmp/bcb-therapysto-compile-1cgs8X/clinic.crt -noout -checkhost app.bersoncare.ru
all six checks match
```

The added tests are intentionally red against the audited candidate:

```text
node --test --test-name-pattern='fixture-looking hosts|offline apply is rejected' deploy/host/therapysto-domain-cutover.acceptance.test.mjs
2 tests, 0 pass, 2 fail; fixture bypass actual status 0; offline sudo marker actual true

node --test deploy/host/therapysto-domain-cutover.acceptance.test.mjs
11 tests, 9 pass, 2 fail
```

The final command statuses were: full acceptance `1`, targeted closing scenarios `1`, contract
test `0`, `bash -n` `0`, both `node --check` commands `0`, base diff check `0`, and worktree diff
check `0`. The two non-zero statuses are the committed reproductions of CF1 and CF2, not an
unrelated validation failure.

## Host-state boundary

No DNS, certificate, nginx, env, systemd, database, cron, deploy, merge, or push state was changed.
All nginx and certificate generation/compilation used `/tmp` files. No live values or secrets were
printed. One prohibited read did occur: the unmodified rollback acceptance scenario caused the
candidate to read `/opt/env/bersoncarebot/webapp.test` because that path is hard-coded and the fake
`sudo` boundary cannot intercept a direct shell read. After discovery, all rollback fault work used
the hermetic `/tmp` copy. This read and the oracle defect that caused it are reported as CF4 rather
than being hidden behind the otherwise green nine-scenario result.
