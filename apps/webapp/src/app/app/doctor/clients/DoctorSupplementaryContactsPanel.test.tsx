/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DoctorSupplementaryContactsPanel } from "./DoctorSupplementaryContactsPanel";

describe("DoctorSupplementaryContactsPanel", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/supplementary-contacts") && init?.method === "POST") {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (url.includes("/supplementary-contacts/") && init?.method === "DELETE") {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            ok: true,
            contacts: [
              {
                id: "c-doctor",
                contactType: "phone",
                value: "+79004445566",
                source: "doctor",
              },
              {
                id: "c-booking",
                contactType: "email",
                value: "auto@example.com",
                source: "booking",
              },
            ],
          }),
          { status: 200 },
        );
      }),
    );
  });

  it("shows delete only for doctor/admin contacts and submits add form", async () => {
    render(
      <DoctorSupplementaryContactsPanel
        userId="a0000000-0000-4000-8000-000000000001"
        initialContacts={[
          { id: "c-doctor", contactType: "phone", value: "+79004445566", source: "doctor" },
          { id: "c-booking", contactType: "email", value: "auto@example.com", source: "booking" },
        ]}
      />,
    );

    expect(screen.getByText("+79004445566")).toBeTruthy();
    expect(screen.getByText("auto@example.com")).toBeTruthy();
    expect(screen.getAllByLabelText("Удалить контакт")).toHaveLength(1);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "alt@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/supplementary-contacts"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
