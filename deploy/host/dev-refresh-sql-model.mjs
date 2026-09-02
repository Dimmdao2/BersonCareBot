#!/usr/bin/env node
/**
 * Executable model of the PostgreSQL cluster the owner-gated TEST -> DEV refresh acts on.
 *
 * It exists for one reason: `deploy/postgres/dev-refresh-{capture,restore}-dev-owned-state.sql` are
 * the two files that decide whether DEV keeps its own environment credentials or silently inherits
 * TEST's, and a fake `psql` that throws the script away can only prove that some argument was
 * passed. This module EXECUTES those scripts -- psql meta-commands, transaction, DELETE/INSERT
 * predicates, foreign keys and the division-by-zero assertions included -- against modelled rows,
 * so the suite asserts on resulting VALUES. Deleting the SQL, neutering it with `\quit`, or dropping
 * the signing-secret repin all change the modelled rows and turn the suite red.
 *
 * Boundaries, on purpose:
 *   - No network, no PostgreSQL process, no database is created anywhere. It is a pure in-process
 *     model over a JSON state file, used only by tests.
 *   - The fixtures it runs on are synthetic and PII-free: no real patient, staff or clinic data, no
 *     real credential ever reaches this file.
 *   - It implements the documented SQL subset those two scripts use and NOTHING else. An
 *     unsupported statement is a loud error, never a silent no-op, so SQL that grows past the model
 *     fails the suite instead of quietly losing its oracle.
 *
 * The named DEV/TEST databases stay reserved for the future live `--execute`; this model is what the
 * repository can run offline, today, on every checkout.
 *
 * CLI (used by the test's fake binaries; state file in $BCB_REFRESH_MODEL_STATE):
 *   node dev-refresh-sql-model.mjs psql <psql-argv...>        # stdin script or -c/-Atqc
 *   node dev-refresh-sql-model.mjs pg_dump <pg_dump-argv...>
 *   node dev-refresh-sql-model.mjs pg_restore <pg_restore-argv...>
 *   node dev-refresh-sql-model.mjs dropdb <dropdb-argv...>
 *   node dev-refresh-sql-model.mjs event <name> <database>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ARCHIVE_MAGIC = 'PGDMP';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function loadState(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function saveState(path, state) {
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function database(state, name) {
  const found = state.databases[name];
  if (!found) throw new Error(`FATAL: database "${name}" does not exist`);
  return found;
}

function record(state, event) {
  state.events.push(event);
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

const TWO_CHAR = new Set(['::', '<>', '>=', '<=', '!=']);

function tokenize(sql) {
  const tokens = [];
  let at = 0;
  while (at < sql.length) {
    const character = sql[at];
    if (/\s/u.test(character)) { at += 1; continue; }
    if (character === '-' && sql[at + 1] === '-') {
      while (at < sql.length && sql[at] !== '\n') at += 1;
      continue;
    }
    if (character === "'") {
      let value = '';
      at += 1;
      while (at < sql.length) {
        if (sql[at] === "'" && sql[at + 1] === "'") { value += "'"; at += 2; continue; }
        if (sql[at] === "'") { at += 1; break; }
        value += sql[at];
        at += 1;
      }
      tokens.push({ type: 'string', value });
      continue;
    }
    if (character === '"') {
      let value = '';
      at += 1;
      while (at < sql.length && sql[at] !== '"') { value += sql[at]; at += 1; }
      at += 1;
      tokens.push({ type: 'ident', value });
      continue;
    }
    if (/[0-9]/u.test(character)) {
      let value = '';
      while (at < sql.length && /[0-9.]/u.test(sql[at])) { value += sql[at]; at += 1; }
      tokens.push({ type: 'number', value: Number(value) });
      continue;
    }
    if (/[A-Za-z_]/u.test(character)) {
      let value = '';
      while (at < sql.length && /[A-Za-z0-9_$]/u.test(sql[at])) { value += sql[at]; at += 1; }
      tokens.push({ type: 'ident', value, upper: value.toUpperCase() });
      continue;
    }
    const pair = sql.slice(at, at + 2);
    if (TWO_CHAR.has(pair)) { tokens.push({ type: 'op', value: pair }); at += 2; continue; }
    tokens.push({ type: 'op', value: character });
    at += 1;
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class Parser {
  constructor(sql) {
    this.tokens = tokenize(sql);
    this.at = 0;
    this.sql = sql;
  }

  peek(offset = 0) { return this.tokens[this.at + offset]; }

  next() { return this.tokens[this.at++]; }

  atEnd() { return this.at >= this.tokens.length; }

  isKeyword(word, offset = 0) {
    const token = this.peek(offset);
    return Boolean(token && token.type === 'ident' && token.upper === word);
  }

  isOp(value, offset = 0) {
    const token = this.peek(offset);
    return Boolean(token && token.type === 'op' && token.value === value);
  }

  expectKeyword(word) {
    if (!this.isKeyword(word)) this.fail(`expected ${word}`);
    return this.next();
  }

  expectOp(value) {
    if (!this.isOp(value)) this.fail(`expected '${value}'`);
    return this.next();
  }

  fail(what) {
    const token = this.peek();
    throw new Error(
      `dev-refresh-sql-model: unsupported SQL (${what}, saw ${JSON.stringify(token?.value ?? '<end>')}) in: ${this.sql.trim().slice(0, 220)}`,
    );
  }

  // qualified name: a[.b]
  parseName() {
    const first = this.next();
    if (!first || first.type !== 'ident') this.fail('expected an identifier');
    if (this.isOp('.')) {
      this.next();
      const second = this.next();
      if (!second || second.type !== 'ident') this.fail('expected an identifier after "."');
      return `${first.value}.${second.value}`;
    }
    return first.value;
  }

  parseSelect() {
    this.expectKeyword('SELECT');
    const items = [];
    do {
      if (this.isOp('*')) { this.next(); items.push({ star: true }); }
      else if (this.peek()?.type === 'ident' && this.isOp('.', 1) && this.isOp('*', 2)) {
        const alias = this.next().value;
        this.next();
        this.next();
        items.push({ star: true, alias });
      } else {
        const expression = this.parseExpression();
        let name = expression.column ?? null;
        if (this.isKeyword('AS')) { this.next(); name = this.next().value; }
        items.push({ expression, name });
      }
    } while (this.isOp(',') && this.next());

    let from = null;
    if (this.isKeyword('FROM')) {
      this.next();
      const table = this.parseName();
      let alias = null;
      if (this.isKeyword('AS')) { this.next(); alias = this.next().value; }
      else if (this.peek()?.type === 'ident' && !['WHERE', 'ORDER', 'GROUP'].includes(this.peek().upper)) {
        alias = this.next().value;
      }
      from = { table, alias };
    }

    let where = null;
    if (this.isKeyword('WHERE')) { this.next(); where = this.parseExpression(); }

    let orderBy = null;
    if (this.isKeyword('ORDER')) {
      this.next();
      this.expectKeyword('BY');
      orderBy = [];
      do { orderBy.push(this.parseExpression()); } while (this.isOp(',') && this.next());
    }
    return { kind: 'select', items, from, where, orderBy };
  }

  parseExpression() { return this.parseOr(); }

  parseOr() {
    let left = this.parseAnd();
    while (this.isKeyword('OR')) { this.next(); left = { kind: 'or', left, right: this.parseAnd() }; }
    return left;
  }

  parseAnd() {
    let left = this.parseNot();
    while (this.isKeyword('AND')) { this.next(); left = { kind: 'and', left, right: this.parseNot() }; }
    return left;
  }

  parseNot() {
    if (this.isKeyword('NOT')) {
      this.next();
      if (this.isKeyword('EXISTS')) {
        this.next();
        return { kind: 'not', operand: this.parseExistsBody() };
      }
      return { kind: 'not', operand: this.parseNot() };
    }
    if (this.isKeyword('EXISTS')) { this.next(); return this.parseExistsBody(); }
    return this.parseComparison();
  }

  parseExistsBody() {
    this.expectOp('(');
    const select = this.parseSelect();
    this.expectOp(')');
    return { kind: 'exists', select };
  }

  parseComparison() {
    let left = this.parseAdditive();
    for (;;) {
      if (this.isOp('=') || this.isOp('<>') || this.isOp('!=') || this.isOp('>') || this.isOp('<')
        || this.isOp('>=') || this.isOp('<=')) {
        const operator = this.next().value;
        left = { kind: 'compare', operator, left, right: this.parseAdditive() };
        continue;
      }
      if (this.isKeyword('IS')) {
        this.next();
        if (this.isKeyword('NOT') && this.isKeyword('DISTINCT', 1)) {
          this.next(); this.next(); this.expectKeyword('FROM');
          left = { kind: 'notDistinct', left, right: this.parseAdditive() };
          continue;
        }
        let negated = false;
        if (this.isKeyword('NOT')) { this.next(); negated = true; }
        if (this.isKeyword('NULL')) {
          this.next();
          left = { kind: 'isNull', operand: left, negated };
          continue;
        }
        this.fail('unsupported IS predicate');
      }
      if (this.isKeyword('IN') || (this.isKeyword('NOT') && this.isKeyword('IN', 1))) {
        let negated = false;
        if (this.isKeyword('NOT')) { this.next(); negated = true; }
        this.next();
        this.expectOp('(');
        if (this.isKeyword('SELECT')) {
          const select = this.parseSelect();
          this.expectOp(')');
          left = { kind: 'in', operand: left, select, negated };
        } else {
          const values = [];
          do { values.push(this.parseExpression()); } while (this.isOp(',') && this.next());
          this.expectOp(')');
          left = { kind: 'in', operand: left, values, negated };
        }
        continue;
      }
      return left;
    }
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (this.isOp('-') || this.isOp('+') || this.isOp('||')) {
      const operator = this.next().value;
      left = { kind: 'arith', operator, left, right: this.parseMultiplicative() };
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parseUnary();
    while (this.isOp('/') || this.isOp('*')) {
      const operator = this.next().value;
      left = { kind: 'arith', operator, left, right: this.parseUnary() };
    }
    return left;
  }

  parseUnary() {
    if (this.isOp('-')) { this.next(); return { kind: 'negate', operand: this.parseUnary() }; }
    return this.parsePostfix();
  }

  parsePostfix() {
    let value = this.parsePrimary();
    while (this.isOp('::')) {
      this.next();
      const type = this.next();
      if (!type || type.type !== 'ident') this.fail('expected a cast type');
      value = { kind: 'cast', operand: value, type: type.upper };
    }
    return value;
  }

  parsePrimary() {
    const token = this.peek();
    if (!token) this.fail('unexpected end of expression');
    if (token.type === 'number') { this.next(); return { kind: 'literal', value: token.value }; }
    if (token.type === 'string') { this.next(); return { kind: 'literal', value: token.value }; }
    if (this.isOp('(')) {
      this.next();
      if (this.isKeyword('SELECT')) {
        const select = this.parseSelect();
        this.expectOp(')');
        return { kind: 'scalarSelect', select };
      }
      const inner = this.parseExpression();
      this.expectOp(')');
      return inner;
    }
    if (token.type === 'ident') {
      if (token.upper === 'TRUE') { this.next(); return { kind: 'literal', value: true }; }
      if (token.upper === 'FALSE') { this.next(); return { kind: 'literal', value: false }; }
      if (token.upper === 'NULL') { this.next(); return { kind: 'literal', value: null }; }
      if (token.upper === 'COUNT' && this.isOp('(', 1)) {
        this.next(); this.next();
        if (this.isOp('*')) this.next(); else this.parseExpression();
        this.expectOp(')');
        return { kind: 'count' };
      }
      if (this.isOp('(', 1)) {
        const name = this.next().value.toLowerCase();
        this.next();
        const args = [];
        if (!this.isOp(')')) {
          do { args.push(this.parseExpression()); } while (this.isOp(',') && this.next());
        }
        this.expectOp(')');
        return { kind: 'call', name, args };
      }
      // possibly schema.function(...) e.g. pg_catalog.to_regclass
      if (this.isOp('.', 1) && this.peek(2)?.type === 'ident' && this.isOp('(', 3)) {
        this.next(); this.next();
        const name = this.next().value.toLowerCase();
        this.next();
        const args = [];
        if (!this.isOp(')')) {
          do { args.push(this.parseExpression()); } while (this.isOp(',') && this.next());
        }
        this.expectOp(')');
        return { kind: 'call', name, args };
      }
      const name = this.parseName();
      const parts = name.split('.');
      return parts.length === 2
        ? { kind: 'column', qualifier: parts[0], column: parts[1] }
        : { kind: 'column', qualifier: null, column: parts[0] };
    }
    return this.fail('unsupported expression');
  }
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

class SqlError extends Error {}

function canonicalJson(text) {
  return JSON.stringify(JSON.parse(text));
}

function equalValues(left, right) {
  if (left === null || right === null) return null;
  return left === right;
}

function truthy(value) {
  return value === true;
}

/**
 * True when this expression aggregates the select's own rows. It deliberately does NOT descend into
 * a subquery: `1 / ((SELECT count(*) FROM a) - (SELECT count(*) FROM b) = ...)` aggregates nothing
 * in the outer select, and treating it as an aggregate would evaluate the outer list once against
 * the wrong row set.
 */
function aggregatesOwnRows(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.kind === 'count') return true;
  if (node.kind === 'scalarSelect' || node.kind === 'exists') return false;
  if (node.kind === 'in') return aggregatesOwnRows(node.operand);
  return Object.values(node).some((child) => (Array.isArray(child)
    ? child.some((entry) => aggregatesOwnRows(entry))
    : aggregatesOwnRows(child)));
}

class Session {
  constructor(state, databaseName) {
    this.state = state;
    this.databaseName = databaseName;
    this.database = database(state, databaseName);
    this.temp = new Map();
    this.views = new Map();
    this.onCommitDrop = new Set();
    this.aggregateCount = null;
  }

  relation(name) {
    if (this.temp.has(name)) return this.temp.get(name);
    if (this.views.has(name)) {
      const view = this.views.get(name);
      const rows = this.runSelect(view.select, []);
      return { columns: view.columns, rows: rows.rows, view: true };
    }
    const qualified = name.includes('.') ? name : `public.${name}`;
    const table = this.database.tables[qualified];
    if (!table) throw new SqlError(`relation "${name}" does not exist`);
    return table;
  }

  relationExists(name) {
    if (this.temp.has(name) || this.views.has(name)) return true;
    const qualified = name.includes('.') ? name : `public.${name}`;
    return Boolean(this.database.tables[qualified]);
  }

  writableTable(name) {
    if (this.temp.has(name)) return this.temp.get(name);
    const qualified = name.includes('.') ? name : `public.${name}`;
    const table = this.database.tables[qualified];
    if (!table) throw new SqlError(`relation "${name}" does not exist`);
    return table;
  }

  evaluate(node, scopes) {
    switch (node.kind) {
      case 'literal':
        return node.value;
      case 'column': {
        for (let index = scopes.length - 1; index >= 0; index -= 1) {
          const scope = scopes[index];
          if (node.qualifier && scope.alias !== node.qualifier) continue;
          if (Object.hasOwn(scope.row, node.column)) return scope.row[node.column];
          if (node.qualifier) throw new SqlError(`column ${node.qualifier}.${node.column} does not exist`);
        }
        throw new SqlError(`column "${node.column}" does not exist`);
      }
      case 'count': {
        if (this.aggregateCount === null) {
          throw new SqlError('count(*) appeared outside an aggregated select list');
        }
        return this.aggregateCount;
      }
      case 'call': {
        if (node.name === 'current_database') return this.databaseName;
        if (node.name === 'to_regclass') {
          const name = this.evaluate(node.args[0], scopes);
          return this.relationExists(name) ? name : null;
        }
        if (node.name === 'to_regprocedure') {
          const name = this.evaluate(node.args[0], scopes);
          return this.database.objects.includes(name) ? name : null;
        }
        throw new SqlError(`function ${node.name}() is not modelled`);
      }
      case 'cast': {
        const value = this.evaluate(node.operand, scopes);
        if (value === null) return null;
        if (node.type === 'INT' || node.type === 'INTEGER' || node.type === 'INT4') {
          if (typeof value === 'boolean') return value ? 1 : 0;
          return Number(value);
        }
        if (node.type === 'TEXT') {
          if (typeof value === 'boolean') return value ? 'true' : 'false';
          return String(value);
        }
        if (node.type === 'BOOLEAN' || node.type === 'BOOL') {
          if (typeof value === 'boolean') return value;
          return ['true', 't', 'yes', 'on', '1'].includes(String(value).toLowerCase());
        }
        if (node.type === 'JSONB' || node.type === 'JSON') return canonicalJson(String(value));
        return value;
      }
      case 'and': {
        const left = this.evaluate(node.left, scopes);
        if (left === false) return false;
        const right = this.evaluate(node.right, scopes);
        if (left === null || right === null) return right === false ? false : null;
        return left && right;
      }
      case 'or': {
        const left = this.evaluate(node.left, scopes);
        if (left === true) return true;
        const right = this.evaluate(node.right, scopes);
        if (left === null || right === null) return right === true ? true : null;
        return left || right;
      }
      case 'not': {
        const value = this.evaluate(node.operand, scopes);
        return value === null ? null : !value;
      }
      case 'isNull': {
        const value = this.evaluate(node.operand, scopes);
        return node.negated ? value !== null : value === null;
      }
      case 'notDistinct': {
        const left = this.evaluate(node.left, scopes);
        const right = this.evaluate(node.right, scopes);
        if (left === null && right === null) return true;
        if (left === null || right === null) return false;
        return left === right;
      }
      case 'compare': {
        const left = this.evaluate(node.left, scopes);
        const right = this.evaluate(node.right, scopes);
        if (left === null || right === null) return null;
        switch (node.operator) {
          case '=': return equalValues(left, right);
          case '<>': case '!=': return !equalValues(left, right);
          case '>': return left > right;
          case '<': return left < right;
          case '>=': return left >= right;
          case '<=': return left <= right;
          default: throw new SqlError(`operator ${node.operator} is not modelled`);
        }
      }
      case 'arith': {
        const left = this.evaluate(node.left, scopes);
        const right = this.evaluate(node.right, scopes);
        if (left === null || right === null) return null;
        if (node.operator === '/') {
          if (Number(right) === 0) throw new SqlError('division by zero');
          return Math.trunc(Number(left) / Number(right));
        }
        if (node.operator === '-') return Number(left) - Number(right);
        if (node.operator === '+') return Number(left) + Number(right);
        if (node.operator === '||') return `${left}${right}`;
        throw new SqlError(`operator ${node.operator} is not modelled`);
      }
      case 'negate': {
        const value = this.evaluate(node.operand, scopes);
        return value === null ? null : -Number(value);
      }
      case 'exists': {
        const result = this.runSelect(node.select, scopes);
        return result.rows.length > 0;
      }
      case 'in': {
        const value = this.evaluate(node.operand, scopes);
        const values = node.select
          ? (() => {
            const result = this.runSelect(node.select, scopes);
            return result.rows.map((row) => row[result.columns[0].name]);
          })()
          : node.values.map((entry) => this.evaluate(entry, scopes));
        if (value === null) return null;
        const found = values.includes(value);
        if (!found && values.includes(null)) return null;
        return node.negated ? !found : found;
      }
      case 'scalarSelect': {
        const result = this.runSelect(node.select, scopes);
        if (result.rows.length === 0) return null;
        return result.rows[0][result.columns[0].name];
      }
      default:
        throw new SqlError(`expression kind ${node.kind} is not modelled`);
    }
  }

  runSelect(select, outerScopes) {
    const aggregate = select.items.some((item) => aggregatesOwnRows(item.expression));
    let sourceRows = [{}];
    let scopeTemplate = null;
    if (select.from) {
      const relation = this.relation(select.from.table);
      sourceRows = relation.rows;
      scopeTemplate = {
        alias: select.from.alias ?? select.from.table.split('.').pop(),
        columns: relation.columns,
      };
    }
    const matched = [];
    for (const row of sourceRows) {
      const scopes = scopeTemplate
        ? [...outerScopes, { alias: scopeTemplate.alias, row }]
        : [...outerScopes, { alias: null, row: {} }];
      if (select.where && !truthy(this.evaluate(select.where, scopes))) continue;
      matched.push({ row, scopes });
    }

    const columns = [];
    if (aggregate) {
      const values = {};
      const previousCount = this.aggregateCount;
      this.aggregateCount = matched.length;
      try {
        select.items.forEach((item, index) => {
          const name = item.name ?? `column${index + 1}`;
          columns.push({ name });
          const scopes = matched[0]?.scopes ?? [...outerScopes, { alias: null, row: {} }];
          values[name] = this.evaluate(item.expression, scopes);
        });
      } finally {
        this.aggregateCount = previousCount;
      }
      return { columns, rows: [values] };
    }

    const rows = [];
    const previousCount = this.aggregateCount;
    this.aggregateCount = null;
    for (const { row, scopes } of matched) {
      const output = {};
      select.items.forEach((item, index) => {
        if (item.star) {
          for (const [key, value] of Object.entries(row)) output[key] = value;
          return;
        }
        const name = item.name ?? `column${index + 1}`;
        output[name] = this.evaluate(item.expression, scopes);
      });
      rows.push(output);
    }
    this.aggregateCount = previousCount;
    if (rows.length > 0) {
      for (const key of Object.keys(rows[0])) columns.push({ name: key });
    } else {
      select.items.forEach((item, index) => {
        if (!item.star) columns.push({ name: item.name ?? `column${index + 1}` });
      });
    }
    if (select.orderBy) {
      const keys = select.orderBy
        .map((expression) => (expression.kind === 'column' ? expression.column : null))
        .filter(Boolean);
      rows.sort((left, right) => {
        for (const key of keys) {
          const a = left[key];
          const b = right[key];
          if (a === b) continue;
          if (a === null) return -1;
          if (b === null) return 1;
          return a < b ? -1 : 1;
        }
        return 0;
      });
    }
    return { columns, rows };
  }
}

// ---------------------------------------------------------------------------
// COPY text format (the psql default: tab separated, \N for NULL)
// ---------------------------------------------------------------------------

function decodeCopyValue(raw, type) {
  if (raw === '\\N') return null;
  if (type === 'boolean') return raw === 't' || raw === 'true';
  if (type === 'integer') return Number(raw);
  if (type === 'jsonb') return canonicalJson(raw);
  return raw;
}

function encodeCopyValue(value) {
  if (value === null || value === undefined) return '\\N';
  if (typeof value === 'boolean') return value ? 't' : 'f';
  const text = String(value);
  if (/[\t\n\\]/u.test(text)) {
    throw new SqlError('the model refuses a COPY value containing a tab, newline or backslash');
  }
  return text;
}

// ---------------------------------------------------------------------------
// Statement execution
// ---------------------------------------------------------------------------

function parseColumnDefinitions(text) {
  return text.split(',').map((piece) => {
    const parts = piece.trim().split(/\s+/u);
    return { name: parts[0], type: (parts[1] ?? 'text').toLowerCase() };
  });
}

function cloneDatabase(value) {
  return JSON.parse(JSON.stringify(value));
}

class Runner {
  constructor(state, statePath, databaseName, variables, io) {
    this.state = state;
    this.statePath = statePath;
    this.session = new Session(state, databaseName);
    this.variables = variables;
    this.io = io;
    this.snapshot = null;
    this.quitCode = null;
  }

  substitute(line) {
    return line
      .replaceAll(/:'([A-Za-z_][A-Za-z0-9_]*)'/gu, (whole, name) => {
        if (!Object.hasOwn(this.variables, name)) return whole;
        return `'${String(this.variables[name]).replaceAll("'", "''")}'`;
      })
      .replaceAll(/:([A-Za-z_][A-Za-z0-9_]*)/gu, (whole, name) => {
        if (!Object.hasOwn(this.variables, name)) return whole;
        return String(this.variables[name]);
      });
  }

  execute(sql) {
    const trimmed = sql.trim().replace(/;$/u, '').trim();
    if (trimmed === '') return null;
    const upper = trimmed.toUpperCase();

    if (upper === 'BEGIN' || upper === 'START TRANSACTION') {
      this.snapshot = cloneDatabase(this.session.database);
      return null;
    }
    if (upper === 'COMMIT') {
      for (const name of this.session.onCommitDrop) this.session.temp.delete(name);
      this.session.onCommitDrop.clear();
      this.snapshot = null;
      return null;
    }
    if (upper === 'ROLLBACK') {
      if (this.snapshot) this.restoreSnapshot();
      return null;
    }
    if (/^CREATE\s+EXTENSION\b/u.test(upper)) {
      record(this.state, { kind: 'create-extension', database: this.session.databaseName });
      return null;
    }
    if (/^CREATE\s+DATABASE\b/u.test(upper)) return this.createDatabase(trimmed);
    if (/^ALTER\s+DATABASE\b/u.test(upper)) return this.alterDatabase(trimmed);
    if (/^SELECT\s+PG_TERMINATE_BACKEND\b/u.test(upper)) {
      record(this.state, { kind: 'terminate-backends', database: this.terminateTarget(trimmed) });
      return null;
    }
    if (/^DROP\s+TRIGGER\b/u.test(upper)) return this.dropObject(trimmed, /^DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?(\S+)\s+ON\s+(\S+)/iu, (match) => `${match[2]}.${match[1]}`);
    if (/^DROP\s+FUNCTION\b/u.test(upper)) return this.dropObject(trimmed, /^DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(\S+\(\))/iu, (match) => match[1]);
    if (/^CREATE\s+TEMP\s+VIEW\b/u.test(upper)) return this.createTempView(trimmed);
    if (/^CREATE\s+TEMP\s+TABLE\b/u.test(upper)) return this.createTempTable(trimmed);
    if (/^TRUNCATE\b/u.test(upper)) return this.truncate(trimmed);
    if (/^DELETE\s+FROM\b/u.test(upper)) return this.delete(trimmed);
    if (/^INSERT\s+INTO\b/u.test(upper)) return this.insert(trimmed);
    if (/^SELECT\b/u.test(upper)) {
      const parser = new Parser(trimmed);
      const select = parser.parseSelect();
      if (!parser.atEnd()) parser.fail('trailing tokens');
      return this.session.runSelect(select, []);
    }
    throw new SqlError(
      `dev-refresh-sql-model: unsupported statement (no oracle would exist for it): ${trimmed.slice(0, 200)}`,
    );
  }

  terminateTarget(sql) {
    return /datname\s*=\s*'([^']+)'/u.exec(sql)?.[1] ?? this.session.databaseName;
  }

  createDatabase(sql) {
    const name = /^CREATE\s+DATABASE\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/iu.exec(sql)?.[1];
    if (!name) throw new SqlError('CREATE DATABASE without a parseable name');
    if (this.state.databases[name]) throw new SqlError(`database "${name}" already exists`);
    const limitMatch = /CONNECTION\s+LIMIT\s+(-?\d+)/iu.exec(sql);
    const connectionLimit = limitMatch ? Number(limitMatch[1]) : -1;
    this.state.databases[name] = {
      connectionLimit,
      allowConnections: true,
      owner: /OWNER\s*=?\s*([A-Za-z_][A-Za-z0-9_]*)/iu.exec(sql)?.[1] ?? 'postgres',
      tables: {},
      objects: [],
    };
    record(this.state, { kind: 'create-database', database: name, connectionLimit });
    return null;
  }

  alterDatabase(sql) {
    const name = /^ALTER\s+DATABASE\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/iu.exec(sql)?.[1];
    const limitMatch = /CONNECTION\s+LIMIT\s+(-?\d+)/iu.exec(sql);
    if (!name || !limitMatch) throw new SqlError(`unsupported ALTER DATABASE: ${sql.slice(0, 120)}`);
    const target = database(this.state, name);
    target.connectionLimit = Number(limitMatch[1]);
    record(this.state, { kind: 'connection-limit', database: name, connectionLimit: target.connectionLimit });
    return null;
  }

  dropObject(sql, pattern, identify) {
    const match = pattern.exec(sql);
    if (!match) throw new SqlError(`unsupported DROP: ${sql.slice(0, 120)}`);
    const identity = identify(match);
    const objects = this.session.database.objects;
    const at = objects.indexOf(identity);
    if (at >= 0) objects.splice(at, 1);
    record(this.state, { kind: 'drop-object', database: this.session.databaseName, object: identity });
    return null;
  }

  createTempView(sql) {
    const match = /^CREATE\s+TEMP\s+VIEW\s+([A-Za-z_][A-Za-z0-9_]*)\s+AS\s+([\s\S]+)$/iu.exec(sql);
    if (!match) throw new SqlError(`unsupported CREATE TEMP VIEW: ${sql.slice(0, 120)}`);
    const parser = new Parser(match[2]);
    const select = parser.parseSelect();
    const probe = this.session.runSelect(select, []);
    this.session.views.set(match[1], { select, columns: probe.columns });
    return null;
  }

  createTempTable(sql) {
    const asMatch = /^CREATE\s+TEMP\s+TABLE\s+([A-Za-z_][A-Za-z0-9_]*)\s*(ON\s+COMMIT\s+DROP\s+)?AS\s+([\s\S]+)$/iu.exec(sql);
    if (asMatch) {
      const parser = new Parser(asMatch[3]);
      const select = parser.parseSelect();
      const result = this.session.runSelect(select, []);
      const columns = result.columns.map((column) => ({ name: column.name, type: 'text' }));
      this.session.temp.set(asMatch[1], { columns, rows: result.rows });
      if (asMatch[2]) this.session.onCommitDrop.add(asMatch[1]);
      return null;
    }
    const match = /^CREATE\s+TEMP\s+TABLE\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*)\)\s*(ON\s+COMMIT\s+DROP)?$/iu.exec(sql);
    if (!match) throw new SqlError(`unsupported CREATE TEMP TABLE: ${sql.slice(0, 120)}`);
    this.session.temp.set(match[1], { columns: parseColumnDefinitions(match[2]), rows: [] });
    if (match[3]) this.session.onCommitDrop.add(match[1]);
    return null;
  }

  truncate(sql) {
    const name = /^TRUNCATE\s+(?:TABLE\s+)?([A-Za-z_][A-Za-z0-9_.]*)/iu.exec(sql)?.[1];
    if (!name) throw new SqlError(`unsupported TRUNCATE: ${sql.slice(0, 120)}`);
    this.session.writableTable(name).rows = [];
    return null;
  }

  delete(sql) {
    const match = /^DELETE\s+FROM\s+([A-Za-z_][A-Za-z0-9_.]*)(?:\s+AS\s+([A-Za-z_][A-Za-z0-9_]*))?\s*([\s\S]*)$/iu.exec(sql);
    if (!match) throw new SqlError(`unsupported DELETE: ${sql.slice(0, 120)}`);
    const table = this.session.writableTable(match[1]);
    const alias = match[2] ?? match[1].split('.').pop();
    let where = null;
    if (match[3].trim() !== '') {
      const parser = new Parser(match[3].trim().replace(/^WHERE\s+/iu, ''));
      where = parser.parseExpression();
      if (!parser.atEnd()) parser.fail('trailing tokens in DELETE');
    }
    table.rows = table.rows.filter((row) => {
      if (!where) return false;
      return !truthy(this.session.evaluate(where, [{ alias, row }]));
    });
    return null;
  }

  insert(sql) {
    const match = /^INSERT\s+INTO\s+([A-Za-z_][A-Za-z0-9_.]*)\s*\(([^)]*)\)\s*([\s\S]+)$/iu.exec(sql);
    if (!match) throw new SqlError(`unsupported INSERT: ${sql.slice(0, 120)}`);
    const table = this.session.writableTable(match[1]);
    const targetColumns = match[2].split(',').map((name) => name.trim());
    const body = match[3].trim();
    if (!/^SELECT\b/iu.test(body)) throw new SqlError('only INSERT ... SELECT is modelled');
    const parser = new Parser(body);
    const select = parser.parseSelect();
    if (!parser.atEnd()) parser.fail('trailing tokens in INSERT');
    const result = this.session.runSelect(select, []);
    const names = result.columns.map((column) => column.name);
    for (const row of result.rows) {
      const inserted = {};
      targetColumns.forEach((column, index) => { inserted[column] = row[names[index]] ?? null; });
      for (const column of table.columns) {
        if (!Object.hasOwn(inserted, column.name)) inserted[column.name] = null;
      }
      this.enforceConstraints(match[1], table, inserted);
      table.rows.push(inserted);
    }
    return null;
  }

  enforceConstraints(name, table, row) {
    for (const constraint of table.foreignKeys ?? []) {
      const value = row[constraint.column];
      if (value === null || value === undefined) continue;
      const referenced = this.session.database.tables[constraint.references];
      if (!referenced) {
        throw new SqlError(`relation "${constraint.references}" does not exist`);
      }
      const present = referenced.rows.some((candidate) => candidate[constraint.referencedColumn] === value);
      if (!present) {
        throw new SqlError(
          `insert or update on table "${name.split('.').pop()}" violates foreign key constraint "${constraint.name}"`,
        );
      }
    }
    for (const column of table.columns) {
      if (column.notNull && (row[column.name] === null || row[column.name] === undefined)) {
        throw new SqlError(`null value in column "${column.name}" violates not-null constraint`);
      }
    }
  }

  restoreSnapshot() {
    const name = this.session.databaseName;
    this.state.databases[name] = this.snapshot;
    this.session.database = this.state.databases[name];
    this.snapshot = null;
  }
}

// ---------------------------------------------------------------------------
// psql script execution (meta-commands included)
// ---------------------------------------------------------------------------

const TRUE_WORDS = new Set(['true', 't', 'yes', 'on', '1']);

Runner.prototype.copyIn = function copyIn(relationName, path) {
  const table = this.session.writableTable(relationName);
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n').filter((line) => line !== '');
  for (const line of lines) {
    const fields = line.split('\t');
    if (fields.length !== table.columns.length) {
      throw new SqlError(
        `COPY ${relationName}: expected ${table.columns.length} columns, got ${fields.length}`,
      );
    }
    const row = {};
    table.columns.forEach((column, index) => {
      row[column.name] = decodeCopyValue(fields[index], column.type);
    });
    this.enforceConstraints(relationName, table, row);
    table.rows.push(row);
  }
};

Runner.prototype.copyOut = function copyOut(selectSql, path) {
  const parser = new Parser(selectSql);
  const select = parser.parseSelect();
  if (!parser.atEnd()) parser.fail('trailing tokens in \\copy');
  const result = this.session.runSelect(select, []);
  const body = result.rows
    .map((row) => result.columns.map((column) => encodeCopyValue(row[column.name])).join('\t'))
    .join('\n');
  writeFileSync(path, body === '' ? '' : `${body}\n`, { mode: 0o600 });
};

Runner.prototype.metaCommand = function metaCommand(line) {
  const copyOutMatch = /^\\copy\s*\(([\s\S]+)\)\s+TO\s+'([^']+)'\s*$/iu.exec(line);
  if (copyOutMatch) return this.copyOut(copyOutMatch[1], copyOutMatch[2]);
  const copyInMatch = /^\\copy\s+([A-Za-z_][A-Za-z0-9_.]*)\s+FROM\s+'([^']+)'\s*$/iu.exec(line);
  if (copyInMatch) return this.copyIn(copyInMatch[1], copyInMatch[2]);
  if (/^\\set\b/u.test(line)) return undefined;
  if (/^\\warn\b/u.test(line)) {
    this.io.stderr(`${line.replace(/^\\warn\s*/u, '').replace(/^'|'$/gu, '')}\n`);
    return undefined;
  }
  throw new SqlError(`dev-refresh-sql-model: unsupported psql meta-command: ${line.slice(0, 120)}`);
};

Runner.prototype.runScript = function runScript(script) {
  const lines = script.split('\n');
  const conditions = [];
  const active = () => conditions.every((entry) => entry.active);
  let buffer = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('--')) continue;

    if (/^\\if\b/u.test(line)) {
      const condition = line.replace(/^\\if\s*/u, '');
      let value;
      const existence = /^:\{\?([A-Za-z_][A-Za-z0-9_]*)\}$/u.exec(condition);
      if (existence) value = Object.hasOwn(this.variables, existence[1]);
      else value = TRUE_WORDS.has(this.substitute(condition).trim().toLowerCase());
      conditions.push({ active: active() && value });
      continue;
    }
    if (/^\\else\b/u.test(line)) {
      const current = conditions.at(-1);
      if (!current) throw new SqlError('\\else without \\if');
      const outer = conditions.slice(0, -1).every((entry) => entry.active);
      current.active = outer && !current.active;
      continue;
    }
    if (/^\\endif\b/u.test(line)) {
      if (conditions.pop() === undefined) throw new SqlError('\\endif without \\if');
      continue;
    }
    if (!active()) continue;

    if (/^\\quit\b/u.test(line)) {
      this.quitCode = Number(line.replace(/^\\quit\s*/u, '').trim() || '0');
      return;
    }
    if (line.startsWith('\\') && !line.includes('\\gset')) {
      if (buffer.trim() !== '') throw new SqlError('a meta-command interrupted an unterminated statement');
      this.metaCommand(this.substitute(line));
      continue;
    }

    const gsetAt = line.indexOf('\\gset');
    if (gsetAt >= 0) {
      buffer += `${line.slice(0, gsetAt)}\n`;
      const result = this.execute(this.substitute(buffer));
      buffer = '';
      if (!result || result.rows.length !== 1) throw new SqlError('\\gset needs exactly one result row');
      for (const column of result.columns) {
        const value = result.rows[0][column.name];
        this.variables[column.name] = value === null ? '' : String(value);
      }
      continue;
    }

    buffer += `${line}\n`;
    while (buffer.includes(';')) {
      const at = buffer.indexOf(';');
      const statement = buffer.slice(0, at + 1);
      buffer = buffer.slice(at + 1);
      this.execute(this.substitute(statement));
    }
  }
  if (buffer.trim() !== '') this.execute(this.substitute(buffer));
};

// ---------------------------------------------------------------------------
// Catalog probes. These are the wrapper's identity/readiness questions, not the
// capture/restore semantics under test; they answer from modelled cluster state,
// with explicit per-test overrides for the fault-injection cases.
// ---------------------------------------------------------------------------

function probe(state, sql, connectedDatabase, environment) {
  const override = (name, fallback) => (environment[name] === undefined ? fallback : environment[name]);
  const named = /datname\s*=\s*'([A-Za-z_][A-Za-z0-9_]*)'/u.exec(sql)?.[1];
  if (sql.includes('inet_server_addr')) return override('BCB_TEST_LOCAL_SOCKET', 'true');
  if (sql.includes('pg_auth_members')) return override('BCB_TEST_MIGRATOR_STATIONARY', 'false|false|false|true|0');
  if (sql.includes('rolpassword IS NULL')) return override('BCB_TEST_MIGRATOR_STATE', 'false|false|false|true');
  if (sql.includes('pg_roles')) return override('BCB_TEST_OWNER_STATE', 'false|false|false');
  if (sql.includes('datconnlimit')) {
    const target = state.databases[named ?? connectedDatabase];
    return target ? String(target.connectionLimit) : '';
  }
  if (sql.includes('datistemplate')) {
    if (environment.BCB_TEST_SOURCE_IDENTITY !== undefined) return environment.BCB_TEST_SOURCE_IDENTITY;
    const source = state.databases[named];
    return source ? `${named}|${source.allowConnections}|false` : '';
  }
  if (sql.includes('datdba')) {
    if (environment.BCB_TEST_TARGET_IDENTITY !== undefined) return environment.BCB_TEST_TARGET_IDENTITY;
    const target = state.databases[named];
    return target ? `${named}|${target.owner}|${target.allowConnections}` : '';
  }
  if (sql.includes('string_agg')) return override('BCB_TEST_BACKEND_ROLES', '');
  if (sql.includes('pg_stat_activity')) return override('BCB_TEST_FOREIGN_BACKENDS', '0');
  if (sql.includes('to_regprocedure')) {
    if (environment.BCB_TEST_TEST_LOCK_PRESENT !== undefined) return environment.BCB_TEST_TEST_LOCK_PRESENT;
    const identity = /to_regprocedure\('([^']+)'\)/u.exec(sql)?.[1] ?? '';
    return String(state.databases[connectedDatabase]?.objects.includes(identity) ?? false);
  }
  if (sql.includes('current_database')) return connectedDatabase;
  return '';
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parsePsqlArgv(argv) {
  const parsed = { database: 'postgres', variables: {}, command: null, scalar: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '-d') { parsed.database = argv[index + 1]; index += 1; continue; }
    if (argument === '-v') {
      const [name, ...rest] = argv[index + 1].split('=');
      parsed.variables[name] = rest.join('=');
      index += 1;
      continue;
    }
    if (argument === '-c') { parsed.command = argv[index + 1]; index += 1; continue; }
    if (argument === '-Atqc') { parsed.command = argv[index + 1]; parsed.scalar = true; index += 1; continue; }
    if (argument === '-h' || argument === '-p' || argument === '-U' || argument === '-f') { index += 1; continue; }
  }
  return parsed;
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function archivePath(argv, flag) {
  const at = argv.indexOf(flag);
  return at >= 0 ? argv[at + 1] : null;
}

export function main(argv, environment, io) {
  const statePath = environment.BCB_REFRESH_MODEL_STATE;
  if (!statePath) throw new Error('BCB_REFRESH_MODEL_STATE is required');
  const tool = argv[0];
  const rest = argv.slice(1);
  const state = loadState(statePath);

  if (tool === 'event') {
    record(state, { kind: rest[0], database: rest[1] ?? null });
    saveState(statePath, state);
    return 0;
  }

  if (tool === 'dropdb') {
    const name = rest.at(-1);
    delete state.databases[name];
    record(state, { kind: 'drop-database', database: name });
    saveState(statePath, state);
    return 0;
  }

  if (tool === 'pg_dump') {
    const name = rest[rest.indexOf('-d') + 1];
    const out = archivePath(rest, '-f');
    const source = database(state, name);
    writeFileSync(out, `${ARCHIVE_MAGIC}\n${JSON.stringify({ database: name, tables: source.tables, objects: source.objects })}\n`, { mode: 0o600 });
    record(state, { kind: 'dump', database: name });
    saveState(statePath, state);
    return 0;
  }

  if (tool === 'pg_restore') {
    if (rest[0] === '--list') {
      const header = readFileSync(rest[1], 'utf8').slice(0, ARCHIVE_MAGIC.length);
      return header === ARCHIVE_MAGIC ? 0 : 4;
    }
    const nameAt = rest.findIndex((argument) => argument.startsWith('--dbname='));
    const name = rest[nameAt].slice('--dbname='.length);
    const archive = rest.at(-1);
    const payload = JSON.parse(readFileSync(archive, 'utf8').split('\n').slice(1).join('\n'));
    const target = database(state, name);
    target.tables = payload.tables;
    target.objects = payload.objects;
    record(state, { kind: 'restore', database: name, from: payload.database });
    saveState(statePath, state);
    return 0;
  }

  if (tool !== 'psql') throw new Error(`dev-refresh-sql-model: unknown tool ${tool}`);

  const parsed = parsePsqlArgv(rest);
  if (parsed.scalar) {
    io.stdout(`${probe(state, parsed.command, parsed.database, environment)}\n`);
    return 0;
  }

  const runner = new Runner(state, statePath, parsed.database, parsed.variables, io);
  const script = parsed.command ?? readStdin();
  record(state, {
    kind: 'psql-script',
    database: parsed.database,
    connectionLimit: state.databases[parsed.database]?.connectionLimit ?? null,
  });
  try {
    runner.runScript(script);
  } catch (error) {
    if (runner.snapshot) runner.restoreSnapshot();
    saveState(statePath, state);
    io.stderr(`ERROR: ${error.message}\n`);
    return 1;
  }
  saveState(statePath, state);
  return runner.quitCode ?? 0;
}

if (process.argv[1] && process.argv[1].endsWith('dev-refresh-sql-model.mjs')) {
  const io = {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  };
  process.exitCode = main(process.argv.slice(2), process.env, io);
}
