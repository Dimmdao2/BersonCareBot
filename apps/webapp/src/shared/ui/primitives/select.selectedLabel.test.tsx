/** @vitest-environment jsdom */
/**
 * Закрытый селект обязан показывать ПОДПИСЬ выбранного значения, а не ключ.
 *
 * Base UI резолвит подпись только через `items` на `Select.Root`; при промахе печатает сырой
 * `value`. Обёртка `Select` собирает `items` из детей — этот тест проверяет РЕЗУЛЬТАТ рендера,
 * а не наличие пропа, поэтому он краснеет от любой регрессии в самой обёртке.
 */
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

afterEach(cleanup);

function triggerText() {
  return screen.getByTestId("trigger").textContent ?? "";
}

describe("Select — подпись выбранного значения в закрытом триггере", () => {
  it("литеральные дети: показывает подпись, а не ключ", () => {
    render(
      <Select defaultValue="article">
        <SelectTrigger data-testid="trigger">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="article">Статьи (общий каталог)</SelectItem>
          <SelectItem value="sos">SOS</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(triggerText()).toContain("Статьи (общий каталог)");
    expect(triggerText()).not.toContain("article");
  });

  it("динамический список через .map(): показывает подпись, а не uuid", () => {
    const options = [
      { id: "3f2b0c11-0000-4000-8000-000000000001", title: "Поясничный отдел" },
      { id: "3f2b0c11-0000-4000-8000-000000000002", title: "Шейный отдел" },
    ];
    render(
      <Select defaultValue={options[1].id}>
        <SelectTrigger data-testid="trigger">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>,
    );
    expect(triggerText()).toContain("Шейный отдел");
    expect(triggerText()).not.toContain("3f2b0c11");
  });

  it("условная ветка (? :) внутри списка тоже собирается", () => {
    render(
      <Select defaultValue="system_root">
        <SelectTrigger data-testid="trigger">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="article">Статьи</SelectItem>
          {true ? <SelectItem value="system_root">Встроенный (корень)</SelectItem> : null}
        </SelectContent>
      </Select>,
    );
    expect(triggerText()).toContain("Встроенный (корень)");
    expect(triggerText()).not.toContain("system_root");
  });

  it("placeholder остаётся, пока значение не выбрано", () => {
    render(
      <Select>
        <SelectTrigger data-testid="trigger">
          <SelectValue placeholder="Выберите…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="article">Статьи</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(triggerText()).toContain("Выберите…");
  });

  it("явный `items` на Select побеждает авто-сбор", () => {
    render(
      <Select defaultValue="a" items={[{ value: "a", label: "Из items" }]}>
        <SelectTrigger data-testid="trigger">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Из детей</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(triggerText()).toContain("Из items");
  });

  it("явные дети SelectValue побеждают авто-сбор", () => {
    render(
      <Select defaultValue="a">
        <SelectTrigger data-testid="trigger">
          <SelectValue>Своя подпись</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Из детей</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(triggerText()).toContain("Своя подпись");
  });
});
