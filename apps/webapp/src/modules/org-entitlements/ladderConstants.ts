/**
 * §5a item 2.6 — «зашитых констант не остаётся: любая длительность, порог и конечное состояние —
 * значение поля, а не число в коде. Механическая проверка: в коде нет длительностей и конечных
 * состояний, выбранных агентом».
 *
 * This analyzer is that mechanical check. It reads the TypeScript PARSE TREE, not the text: quotes,
 * line breaks and formatting are invisible to it (`.cursor/rules/tests-check-behaviour-not-
 * circumstances.mdc` — «структуру кода проверяй по дереву разбора, а не регуляркой по тексту»).
 *
 * Two shapes are forbidden, and both are exactly how an agent puts its own policy back:
 *
 * 1. **A ladder value written as a literal.** `graceDays: 14`, `terminalState: 'disabled'`,
 *    `offsetDays: 3` — the owner sets these in the constructor; a literal in product code is a
 *    decision taken away from him.
 * 2. **A fallback for a ladder value.** `policy.graceDays ?? 14`, `tariff.includedSeats || 1` — a
 *    substitution for a value the owner did not configure. The rule is refusal, not substitution.
 *
 * A literal does not stop being the agent's decision when it is given a name first: `const
 * GRACE_DAYS = 14; ... graceDays: GRACE_DAYS` is shape 1 wearing an identifier. The analyzer
 * resolves an identifier through same-file `const X = <expr>` bindings — including a chain of
 * aliases — to the literal it ultimately is, and reports the violation at the property/fallback
 * site (not at the harmless `const` declaration, which by itself picks nothing for the owner).
 * Known boundary: resolution does not cross a file's `import` — a constant pulled in from another
 * module is not resolved, and is not claimed to be covered.
 *
 * Test fixtures legitimately construct policies, so `.test.` files are not scanned; the analyzer
 * takes source text so the test can also run it over inline fixtures for its own self-test.
 */
import ts from 'typescript';

/** The fields whose value is the owner's, on every level of the ladder. */
export const OWNER_LADDER_FIELDS = [
  'graceDays',
  'readOnlyDays',
  'terminalState',
  'offsetDays',
  'includedSeats',
  'warningAtPercent',
  'durationDays',
] as const;

export type LadderConstantViolation = {
  field: string;
  kind: 'literal' | 'fallback';
  line: number;
  text: string;
};

function isOwnerLadderField(name: string): boolean {
  return (OWNER_LADDER_FIELDS as readonly string[]).includes(name);
}

function propertyName(node: ts.PropertyAssignment): string | null {
  const name = node.name;
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name)) return name.text;
  return null;
}

/**
 * The ladder's own enum values. A string literal only counts as a hardcoded policy value when it
 * IS one of these — the tariff constructor legitimately holds unfilled form fields as `''` and an
 * "unset" select sentinel, and those are absence of a value, not a value chosen by the agent.
 */
const LADDER_ENUM_VALUES = [
  'read_only',
  'disabled',
  'payment_succeeded',
  'payment_failed',
] as const;

/** A literal that really is a duration, a threshold or a terminal state. */
function isPolicyValueLiteral(node: ts.Expression): boolean {
  if (ts.isNumericLiteral(node)) return true;
  if (ts.isStringLiteral(node)) {
    return (LADDER_ENUM_VALUES as readonly string[]).includes(node.text);
  }
  // `-3` is a prefix expression around a numeric literal, not a literal node itself.
  return (
    ts.isPrefixUnaryExpression(node) &&
    (node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken) &&
    ts.isNumericLiteral(node.operand)
  );
}

/** Same-file `const NAME = <expr>` bindings, flat over the whole source (no block scoping —
 *  the directories this gate scans are settings glue, not general application code, so a
 *  same-named `const` shadowed in another scope is not a realistic case here). */
function collectConstBindings(source: ts.SourceFile): Map<string, ts.Expression> {
  const bindings = new Map<string, ts.Expression>();
  function visit(node: ts.Node): void {
    if (ts.isVariableStatement(node) && (node.declarationList.flags & ts.NodeFlags.Const) !== 0) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer) {
          bindings.set(decl.name.text, decl.initializer);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return bindings;
}

type LiteralResolution = {
  /** The literal the expression ultimately is. */
  literal: ts.Expression;
  /** Names of the `const` aliases walked to reach it, in walk order; empty if `node` was already
   *  the literal (no naming involved). */
  chain: string[];
};

/** Is `node` a policy-value literal, or an identifier that resolves to one through a chain of
 *  same-file `const` aliases? Cycle-guarded; an unresolvable or cross-file identifier is not a
 *  violation (see file header — import boundary). */
function resolvePolicyLiteral(
  node: ts.Expression,
  bindings: Map<string, ts.Expression>,
): LiteralResolution | null {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current: ts.Expression = node;
  while (ts.isIdentifier(current)) {
    if (seen.has(current.text)) return null;
    seen.add(current.text);
    chain.push(current.text);
    const next = bindings.get(current.text);
    if (!next) return null;
    current = next;
  }
  if (isPolicyValueLiteral(current)) return { literal: current, chain };
  return null;
}

/** Name of the property a `??`/`||` fallback is defaulting, if it is one of the owner's, plus how
 *  the substituted value resolves to a literal. */
function fallbackResolution(
  node: ts.BinaryExpression,
  bindings: Map<string, ts.Expression>,
): { field: string; resolved: LiteralResolution } | null {
  const isFallback =
    node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
    node.operatorToken.kind === ts.SyntaxKind.BarBarToken;
  if (!isFallback) return null;
  const resolved = resolvePolicyLiteral(node.right, bindings);
  if (!resolved) return null;
  let left: ts.Expression = node.left;
  while (ts.isParenthesizedExpression(left)) left = left.expression;
  if (ts.isPropertyAccessExpression(left) && isOwnerLadderField(left.name.text)) {
    return { field: left.name.text, resolved };
  }
  if (
    ts.isElementAccessExpression(left) &&
    left.argumentExpression &&
    ts.isStringLiteral(left.argumentExpression) &&
    isOwnerLadderField(left.argumentExpression.text)
  ) {
    return { field: left.argumentExpression.text, resolved };
  }
  return null;
}

export function findLadderConstantViolations(
  fileName: string,
  sourceText: string,
): LadderConstantViolation[] {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const bindings = collectConstBindings(source);
  const violations: LadderConstantViolation[] = [];

  function record(
    node: ts.Node,
    field: string,
    kind: LadderConstantViolation['kind'],
    resolved: LiteralResolution,
  ): void {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    const text =
      resolved.chain.length === 0
        ? node.getText(source)
        : `${node.getText(source)} (${resolved.chain.join(' -> ')} = ${resolved.literal.getText(source)})`;
    violations.push({ field, kind, line: line + 1, text });
  }

  function visit(node: ts.Node): void {
    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node);
      if (name && isOwnerLadderField(name)) {
        const resolved = resolvePolicyLiteral(node.initializer, bindings);
        if (resolved) record(node, name, 'literal', resolved);
      }
    }
    if (ts.isBinaryExpression(node)) {
      const result = fallbackResolution(node, bindings);
      if (result) record(node, result.field, 'fallback', result.resolved);
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return violations;
}
