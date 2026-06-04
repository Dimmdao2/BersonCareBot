/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MaterialRatingBlock } from "./MaterialRatingBlock";

const TARGET_ID = "550e8400-e29b-41d4-a716-446655440099";

describe("MaterialRatingBlock onLowRatingSaved", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/api/patient/material-ratings") && (!init || init.method === "GET")) {
          return {
            ok: true,
            json: async () => ({ ok: true, avg: 3, count: 1, myStars: null }),
          } as Response;
        }
        if (init?.method === "PUT") {
          const body = JSON.parse(String(init.body)) as { stars: number };
          return {
            ok: true,
            json: async () => ({ ok: true, avg: body.stars, count: 1, myStars: body.stars }),
          } as Response;
        }
        throw new Error(`unexpected fetch ${url}`);
      }) as unknown as typeof fetch,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls onLowRatingSaved for stars 1-3", async () => {
    const onLowRatingSaved = vi.fn();
    render(
      <MaterialRatingBlock
        targetKind="content_page"
        targetId={TARGET_ID}
        onLowRatingSaved={onLowRatingSaved}
      />,
    );
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
    const user = userEvent.setup();
    const buttons = screen.getAllByRole("radio");
    await user.click(buttons[1]!);
    await waitFor(
      () => {
        expect(onLowRatingSaved).toHaveBeenCalledWith(2);
      },
      { timeout: 2000 },
    );
  });

  it("does not call onLowRatingSaved for 4-5 stars", async () => {
    const onLowRatingSaved = vi.fn();
    render(
      <MaterialRatingBlock
        targetKind="content_page"
        targetId={TARGET_ID}
        onLowRatingSaved={onLowRatingSaved}
      />,
    );
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
    const user = userEvent.setup();
    const buttons = screen.getAllByRole("radio");
    await user.click(buttons[3]!);
    await waitFor(
      () => {
        expect(fetch).toHaveBeenCalledTimes(2);
      },
      { timeout: 2000 },
    );
    expect(onLowRatingSaved).not.toHaveBeenCalled();
  });
});
