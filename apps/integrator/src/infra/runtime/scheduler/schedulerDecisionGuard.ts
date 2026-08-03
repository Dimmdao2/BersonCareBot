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

function collectBindings(source: ts.SourceFile): Map<string, ts.Expression> {
  const bindings = new Map<string, ts.Expression>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableStatement(node)) {
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
  const visit = (expression: ts.Expression, seen: Set<string>): boolean => {
    if (ts.isParenthesizedExpression(expression)) return visit(expression.expression, seen);
    if (ts.isIdentifier(expression)) {
      if (seen.has(expression.text)) return false;
      const next = bindings.get(expression.text);
      if (!next) return false;
      const nextSeen = new Set(seen);
      nextSeen.add(expression.text);
      return visit(next, nextSeen);
    }
    if (
      ts.isNumericLiteral(expression) ||
      ts.isStringLiteral(expression) ||
      ts.isNoSubstitutionTemplateLiteral(expression)
    ) {
      return true;
    }
    if (ts.isPrefixUnaryExpression(expression)) return visit(expression.operand, seen);
    if (
      ts.isBinaryExpression(expression) &&
      [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken].includes(
        expression.operatorToken.kind,
      )
    ) {
      return visit(expression.left, new Set(seen)) && visit(expression.right, new Set(seen));
    }
    return false;
  };
  return visit(node, new Set());
}

function isMessageProperty(node: ts.PropertyAssignment): boolean {
  const name = propertyName(node);
  if (name === 'text' || name === 'messageText' || name === 'caption' || name === 'label') return true;
  return name === 'message' && ts.isObjectLiteralExpression(node.initializer);
}

function expressionHasRussianText(node: ts.Expression): boolean {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return /[А-Яа-яЁё]/.test(node.text);
  if (ts.isTemplateExpression(node)) return /[А-Яа-яЁё]/.test(node.head.text) || node.templateSpans.some((span) => /[А-Яа-яЁё]/.test(span.literal.text));
  if (ts.isParenthesizedExpression(node)) return expressionHasRussianText(node.expression);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return expressionHasRussianText(node.left) || expressionHasRussianText(node.right);
  }
  return false;
}

function propertyNameFromAccess(
  node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  bindings: Map<string, ts.Expression>,
): string | null {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (!node.argumentExpression || !resolvesToLiteral(node.argumentExpression, bindings)) return null;
  let current = node.argumentExpression;
  const seen = new Set<string>();
  while (ts.isIdentifier(current)) {
    if (seen.has(current.text)) return null;
    seen.add(current.text);
    const next = bindings.get(current.text);
    if (!next) return null;
    current = next;
  }
  return ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current) ? current.text : null;
}

function hasLiteralArray(node: ts.Expression, bindings: Map<string, ts.Expression>): boolean {
  let current = node;
  const seen = new Set<string>();
  while (ts.isIdentifier(current)) {
    if (seen.has(current.text)) return false;
    seen.add(current.text);
    const next = bindings.get(current.text);
    if (!next) return false;
    current = next;
  }
  return ts.isArrayLiteralExpression(current) && current.elements.some(
    (element) => ts.isExpression(element) && resolvesToLiteral(element, bindings),
  );
}

function hasBusinessCollectionCheck(node: ts.CallExpression, bindings: Map<string, ts.Expression>): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  const method = node.expression.name.text;
  const collection = node.expression.expression;
  if (method === 'includes' && node.arguments.length === 1) {
    return hasLiteralArray(collection, bindings) && referencesBusinessField(node.arguments[0]!);
  }
  if (method === 'some' && node.arguments.length === 1 && hasLiteralArray(collection, bindings)) {
    const predicate = node.arguments[0];
    if (!predicate) return false;
    return (
      (ts.isArrowFunction(predicate) || ts.isFunctionExpression(predicate)) &&
      ts.isExpression(predicate.body) &&
      hasLiteralComparison(predicate.body, bindings)
    );
  }
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
  if (ts.isCallExpression(node) && hasBusinessCollectionCheck(node, bindings)) return true;
  let found = false;
  ts.forEachChild(node, (child) => {
    if (ts.isExpression(child) && hasLiteralComparison(child, bindings)) found = true;
  });
  return found;
}

function sqlText(node: ts.Node): string | null {
  const parent = node.parent;
  if (parent === undefined || !ts.isTaggedTemplateExpression(parent)) return null;
  if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isStringLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return `${node.head.text}${node.templateSpans.map((span) => span.literal.text).join('')}`;
  return null;
}

/** AST-only check. Its deliberate boundary is same-file aliases; imported identifiers are not resolved. */
export function findSchedulerDecisionViolations(fileName: string, sourceText: string): SchedulerDecisionViolation[] {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const bindings = collectBindings(source);
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
    if (ts.isShorthandPropertyAssignment(node) && SCHEDULE_FIELDS.has(node.name.text)) {
      if (resolvesToLiteral(node.name, bindings)) add(node, 'scheduled_literal');
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const target =
        ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left)
          ? propertyNameFromAccess(node.left, bindings)
          : null;
      if (target && SCHEDULE_FIELDS.has(target) && resolvesToLiteral(node.right, bindings)) {
        add(node, 'scheduled_literal');
      }
      if (target && ['text', 'messageText', 'caption', 'label'].includes(target) && expressionHasRussianText(node.right)) {
        add(node, 'russian_message');
      }
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
