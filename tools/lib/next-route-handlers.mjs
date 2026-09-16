import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export const NEXT_HTTP_METHODS = new Set([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
]);

function isExported(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function parseSource(filePath, readSource) {
  const source = readSource(filePath);
  const kind =
    filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, kind);
}

function resolveRelativeModule(fromFile, specifier, readSource) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = path.extname(base)
    ? [base]
    : [
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.js`,
        `${base}.jsx`,
        `${base}.mjs`,
        path.join(base, 'index.ts'),
        path.join(base, 'index.tsx'),
        path.join(base, 'index.js'),
        path.join(base, 'index.jsx'),
        path.join(base, 'index.mjs'),
      ];
  for (const candidate of candidates) {
    try {
      readSource(candidate);
      return candidate;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
        continue;
      throw error;
    }
  }
  return null;
}

function declarationsByName(sourceFile) {
  const declarations = new Map();
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      declarations.set(statement.name.text, statement.body ?? null);
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        declarations.set(declaration.name.text, declaration.initializer ?? null);
      }
    }
  }
  return declarations;
}

function importedBindings(sourceFile) {
  const imports = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
      continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      imports.set(element.name.text, {
        importedName: element.propertyName?.text ?? element.name.text,
        specifier: statement.moduleSpecifier.text,
      });
    }
  }
  return imports;
}

function resolveNamedExport(filePath, exportedName, readSource, seen) {
  const key = `${path.resolve(filePath)}#${exportedName}`;
  if (seen.has(key)) return { issue: `${exportedName}: circular export resolution` };
  seen.add(key);

  const sourceFile = parseSource(filePath, readSource);
  const declarations = declarationsByName(sourceFile);
  const imports = importedBindings(sourceFile);

  const resolveLocal = (localName) => {
    if (declarations.has(localName)) {
      const root = declarations.get(localName);
      return root
        ? { root, sourceFile, filePath }
        : { issue: `${exportedName}: declaration '${localName}' has no handler body` };
    }
    const imported = imports.get(localName);
    if (!imported) return { issue: `${exportedName}: local export '${localName}' is unresolved` };
    const target = resolveRelativeModule(filePath, imported.specifier, readSource);
    if (!target) {
      return {
        issue: `${exportedName}: imported handler module '${imported.specifier}' is unresolved`,
      };
    }
    return resolveNamedExport(target, imported.importedName, readSource, seen);
  };

  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      isExported(statement) &&
      statement.name?.text === exportedName
    ) {
      return statement.body
        ? { root: statement.body, sourceFile, filePath }
        : { issue: `${exportedName}: exported function has no body` };
    }
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === exportedName) {
          if (!declaration.initializer) {
            return { issue: `${exportedName}: exported variable has no initializer` };
          }
          return ts.isIdentifier(declaration.initializer)
            ? resolveLocal(declaration.initializer.text)
            : { root: declaration.initializer, sourceFile, filePath };
        }
      }
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        if (element.name.text !== exportedName) continue;
        const sourceName = element.propertyName?.text ?? element.name.text;
        if (!statement.moduleSpecifier) return resolveLocal(sourceName);
        if (!ts.isStringLiteral(statement.moduleSpecifier)) {
          return { issue: `${exportedName}: non-literal re-export module` };
        }
        const target = resolveRelativeModule(filePath, statement.moduleSpecifier.text, readSource);
        if (!target) {
          return {
            issue: `${exportedName}: re-export module '${statement.moduleSpecifier.text}' is unresolved`,
          };
        }
        return resolveNamedExport(target, sourceName, readSource, seen);
      }
    }
  }

  return resolveLocal(exportedName);
}

function exportedHttpMethods(sourceFile) {
  const methods = new Set();
  const issues = [];
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && isExported(statement) && statement.name) {
      if (NEXT_HTTP_METHODS.has(statement.name.text)) methods.add(statement.name.text);
      continue;
    }
    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          if (NEXT_HTTP_METHODS.has(declaration.name.text)) methods.add(declaration.name.text);
          continue;
        }
        if (ts.isObjectBindingPattern(declaration.name)) {
          for (const element of declaration.name.elements) {
            const exportedName = element.name.getText(sourceFile);
            if (NEXT_HTTP_METHODS.has(exportedName)) {
              methods.add(exportedName);
              issues.push(`${exportedName}: destructured handler export is not traceable`);
            }
          }
        }
      }
      continue;
    }
    if (!ts.isExportDeclaration(statement)) continue;
    if (!statement.exportClause) {
      issues.push('export * cannot prove which HTTP methods the route exposes');
      continue;
    }
    if (!ts.isNamedExports(statement.exportClause)) continue;
    for (const element of statement.exportClause.elements) {
      if (NEXT_HTTP_METHODS.has(element.name.text)) methods.add(element.name.text);
    }
  }
  return { methods: [...methods], issues };
}

/**
 * Returns every exported Next route method and the exact AST subtree that defines its handler.
 * Local aliases, named imports, and relative named re-exports are followed. Anything else is an
 * explicit issue: callers must fail closed instead of silently dropping a method or route file.
 */
export function analyzeNextRouteFile(
  filePath,
  { readSource = (target) => fs.readFileSync(target, 'utf8') } = {},
) {
  const sourceFile = parseSource(filePath, readSource);
  const discovered = exportedHttpMethods(sourceFile);
  const handlers = [];
  const issues = [...discovered.issues];

  for (const method of discovered.methods) {
    const resolved = resolveNamedExport(filePath, method, readSource, new Set());
    if ('issue' in resolved) {
      issues.push(resolved.issue);
      continue;
    }
    handlers.push({ method, ...resolved });
  }
  if (discovered.methods.length === 0) issues.push('no exported Next HTTP method was recognized');
  return { handlers, issues };
}

export function nodeContainsCall(root, predicate) {
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (ts.isCallExpression(node) && predicate(node)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

/**
 * Like nodeContainsCall, but follows calls to functions declared in the same source module. This
 * is still deliberately bounded structural analysis: imported helpers stay opaque and therefore
 * cannot make a route look guarded merely because some other file contains a guard.
 */
export function handlerContainsCall(handler, predicate) {
  const locals = declarationsByName(handler.sourceFile);
  const seen = new Set();
  let found = false;
  const visit = (node) => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      if (predicate(node)) {
        found = true;
        return;
      }
      if (ts.isIdentifier(node.expression) && locals.has(node.expression.text)) {
        const name = node.expression.text;
        const target = locals.get(name);
        if (target && !seen.has(name)) {
          seen.add(name);
          visit(target);
          if (found) return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(handler.root);
  return found;
}

export function callExpressionName(call) {
  let expression = call.expression;
  while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

/** Candidate bodies used by method-level structural gates for wrapper-style handlers. */
export function handlerCandidateBodies(handler) {
  const locals = declarationsByName(handler.sourceFile);
  const bodies = [];
  const seen = new Set();
  const visitRoot = (root) => {
    if (ts.isBlock(root)) {
      bodies.push(root);
      return;
    }
    if (ts.isArrowFunction(root) || ts.isFunctionExpression(root)) {
      bodies.push(root.body);
      return;
    }
    if (ts.isIdentifier(root) && locals.has(root.text) && !seen.has(root.text)) {
      seen.add(root.text);
      const target = locals.get(root.text);
      if (target) visitRoot(target);
      return;
    }
    if (ts.isCallExpression(root)) {
      for (const argument of root.arguments) visitRoot(argument);
    }
  };
  visitRoot(handler.root);
  return bodies;
}
