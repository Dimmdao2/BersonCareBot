/** @vitest-environment jsdom */
import { useContext } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const isMessengerMiniAppHostMock = vi.hoisted(() => vi.fn(() => false));
const mockRefresh = vi.hoisted(() => vi.fn());

vi.mock("@/shared/lib/messengerMiniApp", () => ({
  isMessengerMiniAppHost: () => isMessengerMiniAppHostMock(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

import { PlatformContext, PlatformProvider } from "./PlatformProvider";

const ReadMode = () => {
  const mode = useContext(PlatformContext);
  return <span data-testid="mode">{mode}</span>;
};

describe("PlatformProvider serverHint=bot", () => {
  beforeEach(() => {
    mockRefresh.mockClear();
    isMessengerMiniAppHostMock.mockReturnValue(false);
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  it("сохраняет режим bot при serverHint=bot даже если хост ещё не распознан как miniapp", async () => {
    render(
      <PlatformProvider serverHint="bot">
        <ReadMode />
      </PlatformProvider>,
    );

    expect(await screen.findByTestId("mode")).toHaveTextContent("bot");
  });
});
