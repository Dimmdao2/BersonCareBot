/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PatientHomeNewsSection } from "./PatientHomeNewsSection";

describe("PatientHomeNewsSection", () => {
  it("renders DB news with priority over banner", () => {
    render(
      <PatientHomeNewsSection
        news={{ id: "n1", title: "Новость дня", bodyMd: "Текст" }}
        banner={{ title: "Баннер", key: "k", variant: "info" }}
      />,
    );
    expect(screen.getByText("Новости")).toBeInTheDocument();
    expect(screen.getByText("Новость дня")).toBeInTheDocument();
    expect(screen.queryByText("Баннер")).toBeNull();
  });

  it("renders banner fallback when news is absent", () => {
    render(<PatientHomeNewsSection news={null} banner={{ title: "Важный баннер", key: "important", variant: "important" }} />);
    expect(screen.getByText("Важный баннер")).toBeInTheDocument();
  });
});
