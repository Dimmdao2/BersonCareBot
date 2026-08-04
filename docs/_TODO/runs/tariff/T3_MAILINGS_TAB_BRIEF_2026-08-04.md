# Т3 — mailings get their own tab and a real editor

Rules: `AGENTS.md` — Маршрут, CORE rules, «Как решать, что делать» (measure first, do not multiply entities),
§5, §10/§10a/§10b, §16 (doctor UI primitives), §21 (UI copy), §22 (`<Select>`), §24.
Language: internal work is English; UI copy is Russian.

Authority: `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` — item **Т3**, dictated by the owner
2026-08-03.

Источник оракула: тот же план, Т3 — «не вижу места где правятся шаблоны. Я бы вообще настройку этих рассылок
вынес в отдельную вкладку и правил там через полноценный редактор — письма для маркетинга должны быть красивыми».

## Measured state — start from this, do not re-derive

The commercial constructor (`app/app/admin/commercial/CommercialConstructorClient.tsx`) has four tabs today:
«Тарифы», «Организации», «Триал», «Уведомления». The notification rows already render a TipTap-based
`MarkdownEditor` inline (`shared/ui/doctor/markdown/MarkdownEditor.tsx`) with the hint «Маркетинговый шаблон
письма — форматирование и картинки, как в рассылках врача». So an editor exists; what does not exist is a place
where writing a letter is the point rather than a field inside a rule row.

## Work

1. **Give mailings their own tab.** Move the letter-writing surface out of the notification rule rows: a rule
   keeps what it is — condition, offset, which template — while the letter itself is composed on its own tab with
   room to work. Do not duplicate the rule model; the rule points at a template, the tab edits templates.
2. **Reuse the existing editor**, `MarkdownEditor`, and the existing doctor UI primitives — no new editor, no new
   component library, no second markdown pipeline. §16 and §22 apply.
3. **Make it usable for a marketing letter**: a subject line, the body in the editor, the variables the template
   may use listed where the person writes (they cannot guess them), and a preview of the result. If a variable
   list already exists in the notification code, derive it from there — never a second copy.
4. **Do not break what landed today**: the five owner-named conditions, the grace-window offsets, and the Т1
   exception list all stay as they are. A rule with no template must keep working exactly as now.

## Boundaries

- No sending, no test-send, no queue changes in this slice — composing and storing only.
- Do not touch the trial/discount model, payment capture, or the access-inheritance work from Т1.
- Migration if needed: temporary number in the clone; the final one is assigned at land by the lead.
- **PROD (`135.106.162.170`) is untouchable.** No deploy, no push.

## Done means

- Mailings are edited on their own tab; rules reference templates instead of embedding the letter.
- Behavioral/UI tests: a template survives a round-trip through the editor; a rule without a template still works;
  the variable list shown matches the one the notification code actually substitutes.
- Typecheck, scoped ESLint, `git diff --check` clean; one commit on your branch.
