# MISSION: what is the integrator actually for today — inventory, complexity, and the правильная target (read-only research)

The owner's own framing, verbatim: «интегратор сегодня это просто блок модулей по доставке сообщений и приему вебхуков.
Это то как я понимаю его». He asks whether that is true, what the thing really does now, how over-complicated it has
become, and how it should work properly. You are one of several independent researchers — do not assume the others cover
anything.

## What you may NOT do

Read-only. Change no files, run no migrations, no deploys, never the full CI. You may read code, docs, migrations and
tests, and you may run read-only queries against DEV if that is the only way to establish a fact (say so if you do).
Produce findings, not patches. Do not propose a rewrite plan longer than the section asked for below.

## The four questions

**1. What does it actually do — by code, not by name.** Build an inventory of the integrator's real responsibilities:
entry points (webhooks, scheduled ticks, queues), outbound delivery (channels, templates, retries), identification of a
person, and everything it writes. For each responsibility say: is this **delivery/ingress** (the owner's definition), or
is it **domain logic that leaked in** (business rules, canon computation, product decisions)? Name files and give counts.
Facts already known, use as starting points, verify them: `apps/integrator/src/kernel/domain/executor/**` (scenario
executor), `apps/integrator/src/infra/db/directPublic/**` (seven files writing canon straight into `public`),
`apps/integrator/src/infra/db/repos/**` (41 repositories), the unified-database model in
`docs/ARCHITECTURE/DATABASE_UNIFIED_POSTGRES.md`, and the hard rules in `apps/webapp/ARCHITECTURE.md:40-44`.

**2. How complicated is it, in numbers.** Files, lines, modules, scenario actions, tables it touches in each schema,
HTTP endpoints it exposes and calls, background loops. Where is the complexity concentrated, and how much of it exists
only because of history (two databases, HTTP projection, outbox retries) rather than because of a current need? The
history is documented: the two-database model and the HTTP projection were replaced by one database in April 2026.

**3. What is the правильная target — with world practice.** How do mature products structure a messenger/webhook
channel adapter next to a main application: what belongs in the adapter, what must never live there, how identification
and idempotency are usually split, how outbound delivery is organised (queues, retries, provider abstraction), and how
the walls are drawn (roles, least privilege) when both share one database. Cite real sources; where practice is silent,
write «практика молчит» rather than inventing one.

**4. What would you cut, and in what order.** Given the owner's «не переусложнять» and «необходимо и достаточно»: name
what can be deleted or moved as-is, what needs a migration first, and what must stay. For each item: the concrete risk of
touching it, and the concrete cost of leaving it. Do not write a full plan — a prioritised list with reasons.

## Two things to check specifically, because they are already suspected

- **Leaked domain logic:** the integrator was found deciding tariff lifecycle state on its own; that has just been moved
  to one database function. Look for the same shape elsewhere — any place where the integrator decides a product rule
  rather than asking for it.
- **Privileges:** today both services use the same database role, so the adapter can write anything the main app can.
  Say what the least-privilege shape would be for a pure delivery/ingress component, and what stands in the way.

## Output

1. `КОРОТКИЙ ОТВЕТ` — три-пять строк: прав ли владелец в своём определении, и если нет, то в чём именно.
2. Inventory table: responsibility → files → delivery/ingress or leaked domain → evidence.
3. Complexity numbers, with the share attributable to history.
4. Target shape with sources.
5. Prioritised cut list.
6. «Чего я не смог установить» with reasons.
