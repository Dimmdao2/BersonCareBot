# C1 webapp dual-pool fanout

> **УСТАРЕЛО/ЗАМЕНЕНО 12.08.2026:** dual-pool — подтверждённая исходная реализация, но не полный target.
> Webapp target владеет тремя физическими pools/logins/certificates: staff, patient/pre-session и global-admin;
> integrator остаётся вторым software port со своим login. Канон — DB privilege scheme revision 11.

Status: Phase C1 repo-side webapp stage. No live runtime credential flip.

## Scope

This stage hardens the existing webapp dual-pool baseline:

- staff, organization, and clinic-billing principals select the staff pool before checkout;
- patient, integrator, and bootstrap principals select the nonstaff pool before checkout;
- missing and infra principals fail closed in locked mode before checkout;
- protected-context apply and clear still bracket checked-out clients;
- cleanup failure still destroys the client by releasing with an error;
- pool routing metrics remain exposed through `getWebappPoolRoutingMetrics`.

## Implemented Artifacts

- [`../../../apps/webapp/src/infra/db/webappPoolProvider.ts`](../../../apps/webapp/src/infra/db/webappPoolProvider.ts)
- [`../../../apps/webapp/src/infra/db/withClient.ts`](../../../apps/webapp/src/infra/db/withClient.ts)
- [`../../../packages/db-principal/src/index.ts`](../../../packages/db-principal/src/index.ts)
- [`../../../apps/webapp/src/infra/db/webappPoolProvider.test.ts`](../../../apps/webapp/src/infra/db/webappPoolProvider.test.ts)
- [`../../../apps/webapp/src/infra/db/withClient.test.ts`](../../../apps/webapp/src/infra/db/withClient.test.ts)

## Non-goals

- No TEST/PROD/prod-copy database execution.
- No `/opt/env/*` reads or credential provisioning.
- No integrator, scheduler, or media-worker pool split.
- No production runtime flip to dual credentials.
- No owner acceptance replacement for later deployed process-family smokes.
