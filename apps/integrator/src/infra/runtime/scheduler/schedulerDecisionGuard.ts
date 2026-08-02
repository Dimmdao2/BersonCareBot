/** D30 Ш0.1: the resident runtime executes ready intents; product decisions stay in webapp. */
import ts from 'typescript';

export type SchedulerDecisionViolation = {
  kind: 'scheduled_literal' | 'russian_message' | 'business_branch' | 'decision_table_read';
  line: number;
  text: string;
};

const SCHEDULE_FIELDS = new Set([
  'offsetMs',
  'offsetMinutes',
  'firstTryDelaySeconds',
  'nextTryAt',
  'nextRetryAt',
  'dueAt',
  'remindAt',
]);
const BUSINESS_FIELDS = new Set([
  'tariff',
  'plan',
  'category',
  'topicCode',
  'preset',
  'channelPreference',
  'reminderKind',
]);
const DECISION_TABLES = new Set(['reminder_rules', 'system_settings', 'tariffs', 'tariff_plans']);

function propertyName(node: ts.PropertyAssignment): string | null {
  return ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null;
}

function collectConstBindings(source: ts.SourceFile): Map<string, ts.Expression> {
  const bindings = new Map<string, ts.Expression>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableStatement(node) && (node.declarationList.flags & ts.NodeFlags.Const) !== 0) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          bindings.set(declaration.name.text, declaration.initializer);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return bindings;
}

function resolvesToLiteral(node: ts.Expression, bindings: Map<string, ts.Expression>): boolean {
  const seen = new Set<string>();
  let current = node;
  while (ts.isIdentifier(current)) {
    if (seen.has(current.text)) return false;
    seen.add(current.text);
    const next = bindings.get(current.text);
    if (!next) return false;
    current = next;
  }
  return ts.isNumericLiteral(current) || ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current);
}

function isMessageProperty(node: ts.PropertyAssignment): boolean {
  const name = propertyName(node);
  if (name === 'text' || name === 'messageText' || name === 'caption' || name === 'label') return true;
  return name === 'message' && ts.isObjectLiteralExpression(node.initializer);
}

function expressionHasRussianText(node: ts.Expression): boolean {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return /[А-Яа-яЁё]/.test(node.text);
  if (ts.isTemplateExpression(node)) return /[А-Яа-яЁё]/.test(node.head.text) || node.templateSpans.some((span) => /[А-Яа-яЁё]/.test(span.literal.text));
  return false;
}

function referencesBusinessField(node: ts.Expression): boolean {
  if (ts.isPropertyAccessExpression(node)) return BUSINESS_FIELDS.has(node.name.text);
  if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression)) {
    return BUSINESS_FIELDS.has(node.argumentExpression.text);
  }
  let found = false;
  ts.forEachChild(node, (child) => {
    if (ts.isExpression(child) && referencesBusinessField(child)) found = true;
  });
  return found;
}

function hasLiteralComparison(node: ts.Expression, bindings: Map<string, ts.Expression>): boolean {
  if (ts.isBinaryExpression(node) && [ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(node.operatorToken.kind)) {
    if (ts.isTypeOfExpression(node.left) || ts.isTypeOfExpression(node.right)) return false;
    return (referencesBusinessField(node.left) && resolvesToLiteral(node.right, bindings)) ||
      (referencesBusinessField(node.right) && resolvesToLiteral(node.left, bindings));
  }
  let found = false;
  ts.forEachChild(node, (child) => {
    if (ts.isExpression(child) && hasLiteralComparison(child, bindings)) found = true;
  });
  return found;
}

function sqlText(node: ts.Node): string | null {
  const parent = node.parent;
  const isSqlTag =
    parent !== undefined &&
    ts.isTaggedTemplateExpression(parent) &&
    ts.isIdentifier(parent.tag) &&
    parent.tag.text === 'sql';
  if (!isSqlTag) return null;
  if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isStringLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return `${node.head.text}${node.templateSpans.map((span) => span.literal.text).join('')}`;
  return null;
}

/** AST-only check. Its deliberate boundary is same-file aliases; imported identifiers are not resolved. */
export function findSchedulerDecisionViolations(fileName: string, sourceText: string): SchedulerDecisionViolation[] {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const bindings = collectConstBindings(source);
  const violations: SchedulerDecisionViolation[] = [];
  const add = (node: ts.Node, kind: SchedulerDecisionViolation['kind']): void => {
    violations.push({ kind, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, text: node.getText(source) });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node);
      if (name && SCHEDULE_FIELDS.has(name) && resolvesToLiteral(node.initializer, bindings)) add(node, 'scheduled_literal');
      if (isMessageProperty(node) && expressionHasRussianText(node.initializer)) add(node, 'russian_message');
    }
    if (ts.isIfStatement(node) && hasLiteralComparison(node.expression, bindings)) add(node.expression, 'business_branch');
    if (ts.isConditionalExpression(node) && hasLiteralComparison(node.condition, bindings)) add(node.condition, 'business_branch');
    if (ts.isSwitchStatement(node) && referencesBusinessField(node.expression)) add(node.expression, 'business_branch');
    const text = sqlText(node);
    if (text && [...DECISION_TABLES].some((table) => new RegExp(`\\b${table}\\b`, 'i').test(text))) add(node, 'decision_table_read');
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
}
