# VM-09 owner VPN reconciler audit — 2026-09-08

Candidate: `af4e18e46aede9b4c6c33d3b5d8afcf8ab5de560`.

Commands run:

```bash
node /home/dev/brain/tools/code-search.mjs '10.9.1.1 awg1' --repo bcb -k 50
rg -n -S '10\.9\.1\.1|10\.9\.1\.0/24|10\.9\.1\.' . --glob '!docs/audit/**' --glob '!docs/**/archive/**' --glob '!.git/**'
bash -n deploy/host/apply-test-vpn-dns.sh
bash -n deploy/host/apply-test-nginx-webapp.sh
bash deploy/host/apply-test-vpn-dns.sh
bash deploy/host/apply-test-nginx-webapp.sh
git diff --check af4e18e46^ af4e18e46
```

Results: both apply scripts passed safe default dry-run (exit `0`); both `bash -n` checks passed; `git diff --check` passed. All five VM-09 sources use owner `awg1` subnet `172.31.9.0/24` and gateway `172.31.9.1` where applicable: both nginx allow blocks, VPN DNS gateway/listen/address/DNAT/guard, Jitsi vhost template, Jitsi network policy, and `SERVER CONVENTIONS.md`. Legitimate `awg0` / `10.9.0.0/24` remains unchanged. No active executable/reconciler source for the retired `10.9.1.*` network was found; remaining matches are owner/history documentation only.

**Verdict: PASS**

No live `/etc`, systemd, nginx, PROD/TEST runtime, or taskdb changes were performed.
