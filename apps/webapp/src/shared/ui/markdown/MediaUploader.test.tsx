/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MediaUploader } from "./MediaUploader";

describe("MediaUploader", () => {
  it("calls onUploaded on success", async () => {
    const user = userEvent.setup();
    const onUploaded = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, url: "/api/media/x", mediaId: "x" }),
    }) as unknown as typeof fetch;

    render(<MediaUploader onUploaded={onUploaded} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1])], "pic.png", { type: "image/png" });
    await user.upload(input, file);
    expect(onUploaded).toHaveBeenCalledWith("/api/media/x", "pic.png");
  });

  it("shows error when API returns not ok", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "file_too_large" }),
    }) as unknown as typeof fetch;

    render(<MediaUploader onUploaded={() => {}} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Файл больше 50 МБ");
  });
});
