/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BillingSection } from "./BillingSection";

describe("BillingSection", () => {
  it("shows the tariff name, the human commercial-state sentence, and human mechanic labels", () => {
    render(
      <BillingSection
        tariffName="ПОЛНЫЙ ДОСТУП - РАЗРАБОТЧИК"
        commercialStateLabel="Тариф активен."
        mechanics={[
          { mechanic: "payments", label: "Оплата записи", enabled: true },
          { mechanic: "courses", label: "Курсы", enabled: false },
        ]}
      />,
    );

    expect(screen.getByText("ПОЛНЫЙ ДОСТУП - РАЗРАБОТЧИК")).toBeInTheDocument();
    expect(screen.getByText("Тариф активен.")).toBeInTheDocument();
    expect(screen.getByText("Оплата записи")).toBeInTheDocument();
    expect(screen.getByText("Курсы")).toBeInTheDocument();
    // Never the raw mechanic key.
    expect(screen.queryByText("payments")).not.toBeInTheDocument();
    expect(screen.queryByText("courses")).not.toBeInTheDocument();
    expect(screen.getByText("Включено")).toBeInTheDocument();
    expect(screen.getByText("Недоступно")).toBeInTheDocument();
  });

  it("renders an honest empty state instead of a lie when no tariff is assigned", () => {
    render(
      <BillingSection
        tariffName={null}
        commercialStateLabel="Совместимость: коммерческий тариф ещё не подключён администратором платформы, доступ работает в режиме до введения тарифов."
        mechanics={[{ mechanic: "booking", label: "Онлайн-запись", enabled: true }]}
      />,
    );

    expect(screen.getByText("Тариф не назначен")).toBeInTheDocument();
    expect(
      screen.getByText(/коммерческий тариф ещё не подключён администратором платформы/),
    ).toBeInTheDocument();
  });

  it("never mentions connecting a tariff as if none were possible — no hardcoded stub text", () => {
    render(<BillingSection tariffName="Базовый" commercialStateLabel="Тариф активен." mechanics={[]} />);
    expect(
      screen.queryByText("Коммерческие настройки станут доступны после подключения тарифа."),
    ).not.toBeInTheDocument();
  });
});
