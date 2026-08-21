# D31 VK messenger — evidence

Authority rechecked before implementation:

```text
node /home/dev/brain/tools/code-search.mjs "R-D31 VK messenger channel owner decision" --repo bcb -k 12  # exit 0
rg -n -C 4 "D31|Р-D31|VK как настоящий" docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md  # exit 0
```

The active owner decision is R-D31, dated 2026-07-31: “делать API для VK, инсту удалять”.
No later contradictory owner decision was found in the requested owner sources.

Official protocol pages consulted:

- https://dev.vk.com/ru/method/messages.send
- https://dev.vk.com/ru/api/callback/getting-started
- https://dev.vk.com/ru/method/messages.sendMessageEventAnswer

Validation:

```text
pnpm install --frozen-lockfile  # exit 0
pnpm --dir packages/operator-db-schema run build && pnpm --dir packages/db-principal run build && pnpm --dir packages/platform-merge run build && pnpm --dir packages/error-tracking run build && pnpm --dir apps/integrator typecheck  # exit 0
pnpm --dir apps/webapp typecheck  # exit 0
pnpm --dir apps/integrator exec vitest --run src/integrations/vk/client.unit.test.ts src/integrations/vk/mapIn.unit.test.ts src/integrations/vk/webhook.route.test.ts  # exit 0; 3 files, 6 tests
pnpm --dir apps/webapp lint  # exit 0
pnpm --dir apps/integrator lint  # exit 1; pre-existing unused imports in src/infra/db/schema/integratorPublicProduct.ts:8,13,24, outside D31
```

No database, deployment, live VK call, secret read, push, or full CI was performed.
