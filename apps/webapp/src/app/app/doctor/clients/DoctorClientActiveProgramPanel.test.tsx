/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { DoctorClientActiveProgramTreeModel } from "@/modules/doctor-client-card/types";
import { DoctorClientActiveProgramPanel } from "./DoctorClientActiveProgramPanel";

const tree: DoctorClientActiveProgramTreeModel = {
  instanceId: "inst-1",
  instanceTitle: "План",
  defaultExpandedStageId: "st-1",
  stages: [
    {
      id: "st-1",
      title: "Этап 1",
      status: "in_progress",
      statusLabel: "В работе",
      groups: [],
      ungroupedItems: [
        {
          id: "item-1",
          title: "Упражнение",
          itemType: "lfk_exercise",
          itemTypeLabel: "Упражнение",
          isNew: false,
        },
      ],
    },
  ],
};

describe("DoctorClientActiveProgramPanel", () => {
  it("renders item titles and editor link with discussionItem", () => {
    render(<DoctorClientActiveProgramPanel userId="u1" profileListScope="appointments" tree={tree} />);
    expect(screen.getAllByText("Упражнение")).toHaveLength(2);
    expect(screen.getByText("В работе")).toBeInTheDocument();
    expect(screen.getByText("Активных: 1")).toBeInTheDocument();
    const itemLink = screen.getByRole("link", { name: /Упражнение/ });
    expect(itemLink.getAttribute("href")).toContain("discussionItem=item-1");
    expect(itemLink.getAttribute("href")).toContain("scope=appointments");
    const openProgram = screen.getByRole("link", { name: "Открыть программу" });
    expect(openProgram.getAttribute("href")).toContain("/app/doctor/clients/u1/treatment-programs/inst-1");
  });
});
