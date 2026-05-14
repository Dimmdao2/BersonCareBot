/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Exercise } from "@/modules/lfk-exercises/types";
import type { MediaListItem } from "@/shared/ui/media/MediaPickerList";
import { MediaPickerList } from "@/shared/ui/media/MediaPickerList";
import { ExerciseTileCard } from "@/app/app/doctor/exercises/ExerciseTileCard";

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      media: "",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const sampleMediaId = "11111111-1111-4111-8111-111111111111";

const imageItemReady = (overrides: Partial<MediaListItem> = {}): MediaListItem => ({
  id: sampleMediaId,
  kind: "image",
  filename: "pic.png",
  mimeType: "image/png",
  size: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  url: `/api/media/${sampleMediaId}`,
  previewStatus: "ready",
  previewSmUrl: `/api/media/${sampleMediaId}/preview/sm`,
  previewMdUrl: `/api/media/${sampleMediaId}/preview/md`,
  ...overrides,
});

describe("MediaPickerList quick preview", () => {
  it("opens dialog on thumbnail click when enableQuickPreview; Выбрать selects separately", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <MediaPickerList
        items={[imageItemReady()]}
        loading={false}
        error={null}
        onSelect={onSelect}
        enableQuickPreview
      />,
    );

    await user.click(screen.getByRole("button", { name: /Предпросмотр/i }));
    const dialog = screen.getByRole("dialog");
    const dialogImg = dialog.querySelector("img");
    expect(dialogImg).not.toBeNull();
    expect(dialogImg).toHaveAttribute("src", `/api/media/${sampleMediaId}/preview/md`);

    await user.click(screen.getByRole("button", { name: /close/i }));

    await user.click(screen.getByRole("button", { name: "Выбрать" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe(sampleMediaId);
  });

  it("does not render thumbnail preview trigger when enableQuickPreview is false", () => {
    render(
      <MediaPickerList
        items={[imageItemReady()]}
        loading={false}
        error={null}
        onSelect={vi.fn()}
        enableQuickPreview={false}
      />,
    );

    expect(screen.queryByRole("button", { name: /Предпросмотр/i })).toBeNull();
  });
});

describe("Exercise catalog tile (selection zone)", () => {
  it("does not open a dialog when clicking the tile; onSelect runs", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    const exercise: Exercise = {
      id: "ex-1",
      title: "Squat",
      description: null,
      regionRefId: null,
      regionRefIds: [],
      loadType: null,
      difficulty1_10: null,
      contraindications: null,
      tags: null,
      isArchived: false,
      createdBy: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      media: [
        {
          id: "em-1",
          exerciseId: "ex-1",
          mediaUrl: `/api/media/${sampleMediaId}`,
          mediaType: "image",
          sortOrder: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          previewStatus: "ready",
          previewSmUrl: `/api/media/${sampleMediaId}/preview/sm`,
        },
      ],
    };

    render(<ExerciseTileCard exercise={exercise} onSelect={onSelect} />);

    await user.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledWith("ex-1");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
