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

/** Name of the property a `??`/`||` fallback is defaulting, if it is one of the owner's. */
function fallbackFieldName(node: ts.BinaryExpression): string | null {
  const isFallback =
    node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
    node.operatorToken.kind === ts.SyntaxKind.BarBarToken;
  if (!isFallback || !isPolicyValueLiteral(node.right)) return null;
  let left: ts.Expression = node.left;
  while (ts.isParenthesizedExpression(left)) left = left.expression;
  if (ts.isPropertyAccessExpression(left) && isOwnerLadderField(left.name.text)) {
    return left.name.text;
  }
  if (
    ts.isElementAccessExpression(left) &&
    left.argumentExpression &&
    ts.isStringLiteral(left.argumentExpression) &&
    isOwnerLadderField(left.argumentExpression.text)
  ) {
    return left.argumentExpression.text;
  }
  return null;
}

export function findLadderConstantViolations(
  fileName: string,
  sourceText: string,
): LadderConstantViolation[] {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const violations: LadderConstantViolation[] = [];

  function record(node: ts.Node, field: string, kind: LadderConstantViolation['kind']): void {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
    violations.push({ field, kind, line: line + 1, text: node.getText(source) });
  }

  function visit(node: ts.Node): void {
    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node);
      if (name && isOwnerLadderField(name) && isPolicyValueLiteral(node.initializer)) {
        record(node, name, 'literal');
      }
    }
    if (ts.isBinaryExpression(node)) {
      const field = fallbackFieldName(node);
      if (field) record(node, field, 'fallback');
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return violations;
}
