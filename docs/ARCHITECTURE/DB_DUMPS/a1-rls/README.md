# A1 real-PostgreSQL tenant-isolation gate

This package extends the canonical PII-free A0 greenfield baseline with one deterministic second
organization. The verifier restores A0 into a private disposable PostgreSQL cluster, applies current
migrations, installs the canonical runtime roles, protected principal context and locked policies,
forces RLS on the exercised appointment boundary, and then queries through the real webapp pool
provider with non-owner staff and patient login principals.

The proof covers both organizations' own appointment, both cross-organization negatives, a missing
principal rejection before checkout, exact runtime role routing and the complete signed organization /
patient context. `bcb_a0_owner` is used only during restore and migration and is explicitly returned to
`NOBYPASSRLS` before evidence is collected.

Run the complete gate with:

```bash
pnpm run check:saas-a1-rls-conformance
```

The verifier uses only a mode-0700 directory below `/tmp`, a Unix-domain socket, synthetic `.test`
identities and a synthetic signing key. It never reads repository env files or connects to DEV, TEST or
PROD. Cleanup stops the exact private cluster and removes only its own guarded scratch directory.
