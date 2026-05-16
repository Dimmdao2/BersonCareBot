/** @vitest-environment jsdom */

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

vi.mock("@/shared/ui/media/PatientMediaPlaybackVideo", () => ({
  PatientMediaPlaybackVideo: () => <div data-testid="mock-patient-video" />,
}));

import { MarkdownContent } from "./MarkdownContent";

describe("MarkdownContent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders markdown headings without executing script tags in source", () => {
    const malicious = "# Hi\n\n<script>alert(1)</script>\n\n[xss](javascript:alert(1))";
    render(<MarkdownContent text={malicious} bodyFormat="markdown" />);
    expect(document.querySelector("script")).toBeNull();
    const link = document.querySelector("a");
    expect(link?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
  });

  it("strips script from legacy HTML", () => {
    const html = '<p>OK</p><script>alert(1)</script>';
    const { container } = render(<MarkdownContent text={html} bodyFormat="legacy-html" />);
    expect(container.textContent).toContain("OK");
    expect(document.querySelector("script")).toBeNull();
  });

  it("renders markdown", () => {
    render(<MarkdownContent text={"- a\n- b"} bodyFormat="markdown" />);
    expect(document.body.textContent).toContain("a");
    expect(document.body.textContent).toContain("b");
  });

  it("renders youtube watch links as iframe embed", () => {
    render(<MarkdownContent text="[v](https://www.youtube.com/watch?v=testVid)" bodyFormat="markdown" />);
    const iframe = document.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toContain("youtube.com/embed/testVid");
  });

  it("renders rutube video links as iframe embed", () => {
    render(<MarkdownContent text="[r](https://rutube.ru/video/rutubeClip/)" bodyFormat="markdown" />);
    const iframe = document.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toContain("rutube.ru/play/embed/rutubeClip");
  });

  it("fetches playback for library video markdown link", async () => {
    const SAMPLE_ID = "550e8400-e29b-41d4-a716-446655440000";
    const payload = {
      mediaId: SAMPLE_ID,
      delivery: "mp4" as const,
      mimeType: "video/mp4",
      durationSeconds: null,
      posterUrl: null,
      hls: null,
      mp4: { url: `/api/media/${SAMPLE_ID}` },
      fallbackUsed: false,
      expiresInSeconds: 3600,
    };
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(payload),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<MarkdownContent text={`[m](/api/media/${SAMPLE_ID})`} bodyFormat="markdown" />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/media/${SAMPLE_ID}/playback`,
        expect.objectContaining({ credentials: "same-origin" }),
      );
    });

    await waitFor(() => {
      expect(document.querySelector('[data-testid="mock-patient-video"]')).not.toBeNull();
    });
  });
});
