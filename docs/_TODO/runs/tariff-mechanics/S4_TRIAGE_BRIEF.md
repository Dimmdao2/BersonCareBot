# MISSION: triage 53 surviving requirements — needed now, later, or not at all (read-only)

The old S4 plan was marked line by line. 53 requirements came out «живо, но пункта в новом плане НЕТ». The owner's
instruction for exactly this moment: «надо ли добавлять новые пункты — сверяйся аудиторами с мировой практикой и
разумностью идеи». So do not decide by taste: judge each against practice, against his own rulings, and against the
principle «необходимо и достаточно».

## Authority

- **The 53 items with the marker's reasons:** `docs/_TODO/runs/tariff-mechanics/S4_RECONCILE_REPORT.md`, section
  «Полный список "в §5a пункта НЕТ, нужен"».
- **The marked source file (original wording in context):** `docs/_TODO/SAAS_FOUNDATION/SAAS_S4_TARIFFS_STORE_ENTITLEMENTS.md`.
- **Current plan and canon:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5a and
  `docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` (§1 owner rulings verbatim, §4a the access
  lifecycle mechanism, §3–§7).
- **Practice reference (facts only, its recommendations are withdrawn — see its header):**
  `docs/_TODO/SAAS_FOUNDATION/QUOTAS_RESEARCH_2026-07-28.md`.
- **Owner's standing constraints:** he configures policy, the agent supplies mechanism; the store is deferred («магазин
  пока отложен. как сделаем сам магазин, так и сделаем в тарифах настройку»); «не переусложнить», «необходимо и
  достаточно»; critical mechanics are never limited.

## For each of the 53 items output exactly one verdict

- **`НУЖНО СЕЙЧАС`** — without it the mechanism the owner asked for does not work, or a real security/tenant-isolation
  or data-loss hole stays open. Say which plan stage it belongs to (2, 3, 4, 4a, 5, 6) and formulate it as ONE atomic
  checkbox in Russian, ready to paste. Name the concrete failure it prevents.
- **`НУЖНО ПОЗЖЕ`** — real requirement, but its precondition is absent (for example the store, the clinic-owned mailing
  channels, or the support ticket system). Name the precondition and where it is tracked. Not lost, not now.
- **`НЕ НУЖНО`** — the requirement is already satisfied elsewhere, or it contradicts an owner ruling, or it is machinery
  for its own sake. Quote the ruling or the place that already covers it.

Add, in one line per item, **how the world does it** where practice is relevant (tenant isolation of a content library,
platform base library versus clinic content, grant-based access, per-tenant credentials, audit of commercial state).
Where practice has nothing to say, write «практика молчит» rather than inventing a reference.

## Rules

- Cheap wins are not a reason to add. A checkbox that no failure scenario justifies is invented scope and must be
  `НЕ НУЖНО`.
- Tenant isolation and «one clinic must not see another's data» outrank convenience: if an item guards that, it is
  almost certainly `НУЖНО СЕЙЧАС` — but still name the reachable failure.
- Do not rewrite the plan and do not create files. Read-only; your report is your stdout.
- Group the output by verdict, keep the original item number from the report so the lead can map them back.

## Output

1. Counts per verdict (must sum to 53).
2. `НУЖНО СЕЙЧАС` — numbered, each with: original item number, the ready-to-paste checkbox, target stage, the failure it
   prevents, one line on world practice.
3. `НУЖНО ПОЗЖЕ` — item number, precondition, where tracked.
4. `НЕ НУЖНО` — item number, and the ruling or existing coverage that kills it.
5. «Не смог оценить» with reasons, if any.
