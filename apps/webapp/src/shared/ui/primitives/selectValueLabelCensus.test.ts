import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Гейт против многолетнего дефекта «в выпадающем списке подписи, а в самом поле — КЛЮЧ».
 *
 * Почему он существует. Base UI (в отличие от Radix) не читает подпись из смонтированного
 * `<Select.Item>`: `Select.Value` резолвит её только через проп `items` на `Select.Root`, а при
 * промахе печатает `stringifyAsLabel(value)` — сырой ключ/uuid. До этого правки были ОПТ-ИН
 * (`displayLabel` на каждом вызове, 105 штук), поэтому каждый новый экран заводил баг заново.
 * Теперь подпись собирается в самой обёртке `Select` (`./select.tsx`), и этот файл сторожит
 * два условия, при которых обёртка перестаёт помогать:
 *   1) кто-то мимо обёртки берёт `@base-ui/react/select` напрямую;
 *   2) `<SelectValue />` стоит там, где авто-сбор физически не видит опций
 *      (опции рендерит отдельный компонент, а не литеральные дети `<Select>`).
 *
 * Поведенческая половина гейта — `./select.selectedLabel.test.tsx` (рендерит и читает триггер).
 * Здесь — исходники, по образцу `app-layer/principal/pagePrincipalCensus.test.ts` и
 * `app-layer/guards/doctorLaunchCensus.test.ts`: собственный детектор + self-test детектора,
 * чтобы гейт нельзя было «удовлетворить», сломав сам детектор.
 */

const SRC = new URL("../../../", import.meta.url);
const CANONICAL_PRIMITIVE = "shared/ui/primitives/select.tsx";

function collectTsx(dir: URL, result: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
    if (entry.isDirectory()) collectTsx(child, result);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      result.push(fileURLToPath(child).replace(fileURLToPath(SRC), ""));
    }
  }
  return result;
}

type Surface = Readonly<{
  line: number;
  /** Причина, по которой подпись гарантированно человекочитаемая; `null` = дефект. */
  safeBy: string | null;
}>;

/** Конец открывающего тега с учётом `{…}`-выражений в пропах. */
function openTagEnd(source: string, start: number): number {
  let braces = 0;
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    if (c === "{") braces += 1;
    else if (c === "}") braces -= 1;
    else if (c === ">" && braces === 0) return i;
  }
  return source.length - 1;
}

const SELECT_OPEN = /<Select(\s|>)/;

/** Тело `<Select>…</Select>` с учётом вложенных `<Select>`. */
function selectBody(source: string, afterOpenTag: number): string {
  let depth = 1;
  let cursor = afterOpenTag;
  while (cursor < source.length) {
    const rest = source.slice(cursor);
    const nextOpen = rest.search(SELECT_OPEN);
    const nextClose = rest.indexOf("</Select>");
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      cursor += nextOpen + "<Select".length;
      continue;
    }
    depth -= 1;
    if (depth === 0) return source.slice(afterOpenTag, cursor + nextClose);
    cursor += nextClose + "</Select>".length;
  }
  return source.slice(afterOpenTag);
}

/**
 * Классифицирует каждый `<Select>` в исходнике. Дефект = закрытый триггер напечатает сырой ключ.
 */
export function classifySelectSurfaces(source: string): Surface[] {
  const out: Surface[] = [];
  const re = /<Select(\s|>)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const start = match.index;
    const tagEnd = openTagEnd(source, start);
    const openTag = source.slice(start, tagEnd + 1);
    const body = selectBody(source, tagEnd + 1);
    const line = source.slice(0, start).split("\n").length;

    // Явные механизмы подписи — побеждают всё остальное.
    if (/\bitems\s*=/.test(openTag)) { out.push({ line, safeBy: "items= on Select" }); continue; }
    if (/\bitemToStringLabel\s*=/.test(openTag)) { out.push({ line, safeBy: "itemToStringLabel=" }); continue; }
    if (/<SelectTrigger[^>]*\bdisplayLabel\s*=/s.test(body)) { out.push({ line, safeBy: "displayLabel=" }); continue; }
    // `<SelectValue>…</SelectValue>` с непустыми детьми.
    if (/<SelectValue(?:\s[^>]*?)?>\s*[^<\s]/s.test(body)) { out.push({ line, safeBy: "SelectValue children" }); continue; }
    // Триггер без `<SelectValue>` вообще — подпись рисует сам вызов.
    if (!/<SelectValue/.test(body)) { out.push({ line, safeBy: "no SelectValue" }); continue; }

    // Остаётся голый `<SelectValue />` — подпись даёт авто-сбор из обёртки, а он видит
    // только ЛИТЕРАЛЬНЫЕ `<SelectItem value=…>` в дереве children этого же `<Select>`.
    const hasLiteralItems = /<SelectItem[^>]*\bvalue\s*=/s.test(body);
    out.push({ line, safeBy: hasLiteralItems ? "auto-collected <SelectItem>" : null });
  }
  return out;
}

describe("детектор классификации select-поверхностей", () => {
  it("ловит голый <SelectValue /> без литеральных <SelectItem>", () => {
    const broken = `
      <Select value={v} onValueChange={setV}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent><OptionsFromSomewhereElse /></SelectContent>
      </Select>`;
    expect(classifySelectSurfaces(broken).map((s) => s.safeBy)).toEqual([null]);
  });

  it("считает безопасными все поддержанные формы подписи", () => {
    const cases: Record<string, string> = {
      "auto-collected <SelectItem>": `<Select><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="a">Подпись</SelectItem></SelectContent></Select>`,
      "items= on Select": `<Select items={opts}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{x}</SelectContent></Select>`,
      "itemToStringLabel=": `<Select itemToStringLabel={(v) => v.title}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{x}</SelectContent></Select>`,
      "displayLabel=": `<Select><SelectTrigger displayLabel={lbl}><SelectValue /></SelectTrigger><SelectContent>{x}</SelectContent></Select>`,
      "SelectValue children": `<Select><SelectTrigger><SelectValue>{lbl}</SelectValue></SelectTrigger><SelectContent>{x}</SelectContent></Select>`,
      "no SelectValue": `<Select><SelectTrigger><span>{lbl}</span></SelectTrigger><SelectContent>{x}</SelectContent></Select>`,
    };
    for (const [expected, source] of Object.entries(cases)) {
      expect(classifySelectSurfaces(source).map((s) => s.safeBy), expected).toEqual([expected]);
    }
  });

  it("не путает соседние и вложенные <Select> между собой", () => {
    const two = `
      <Select>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="a">Подпись</SelectItem></SelectContent>
      </Select>
      <Select>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{dynamic}</SelectContent>
      </Select>`;
    expect(classifySelectSurfaces(two).map((s) => s.safeBy)).toEqual([
      "auto-collected <SelectItem>",
      null,
    ]);
  });

  it("разбирает открывающий тег с `{}` в пропах (иначе тело съедет)", () => {
    const tricky = `<Select value={a > b ? "x" : "y"} onValueChange={(v) => set(v)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="x">Подпись</SelectItem></SelectContent>
      </Select>`;
    expect(classifySelectSurfaces(tricky).map((s) => s.safeBy)).toEqual(["auto-collected <SelectItem>"]);
  });
});

describe("перепись select-поверхностей приложения", () => {
  const files = collectTsx(SRC);
  const withSelect = files.filter((rel) => /\.tsx$/.test(rel) && readFileSync(new URL(rel, SRC), "utf8").includes("<SelectTrigger"));

  it("ни один закрытый select не печатает сырой ключ", () => {
    const offenders: string[] = [];
    let total = 0;
    for (const rel of withSelect) {
      for (const surface of classifySelectSurfaces(readFileSync(new URL(rel, SRC), "utf8"))) {
        total += 1;
        if (surface.safeBy === null) offenders.push(`${rel}:${surface.line}`);
      }
    }
    // Перепись не должна тихо схлопнуться в ноль, если сломается обход файлов.
    expect(total).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  });

  it("Base UI select берут только через канонический примитив", () => {
    const direct = files.filter(
      (rel) => rel !== CANONICAL_PRIMITIVE && /from\s+["']@base-ui\/react\/select["']/.test(readFileSync(new URL(rel, SRC), "utf8")),
    );
    expect(direct).toEqual([]);
  });

  it("копии примитива реэкспортируют канон, а не дублируют его", () => {
    for (const rel of ["components/ui/select.tsx", "shared/ui/patient/primitives/select.tsx", "shared/ui/doctor/primitives/select.tsx"]) {
      const source = readFileSync(new URL(rel, SRC), "utf8");
      expect(source, rel).toContain("@/shared/ui/primitives/select");
      // Собственного `SelectValue`/`Select` в копии быть не должно — иначе починка канона до неё не дойдёт.
      expect(source, rel).not.toMatch(/function SelectValue\b/);
      expect(source, rel).not.toMatch(/const Select\s*=\s*SelectPrimitive\.Root/);
    }
  });

  it("канонический примитив собирает подписи сам, а не полагается на вызовы", () => {
    const source = readFileSync(new URL(CANONICAL_PRIMITIVE, SRC), "utf8");
    expect(source).toContain("collectItemLabels");
    expect(source).toMatch(/items=\{derivedItems\}/);
  });
});
