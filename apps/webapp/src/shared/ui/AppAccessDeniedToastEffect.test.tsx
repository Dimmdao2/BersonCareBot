/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import toast from "react-hot-toast";
import { AppAccessDeniedToastEffect } from "./AppAccessDeniedToastEffect";
import {
  APP_ACCESS_DENIED_QUERY_KEY,
  APP_ACCESS_DENIED_QUERY_VALUE,
  APP_ACCESS_DENIED_TOAST_MESSAGE,
} from "@/shared/lib/appAccessDeniedToast";

const replaceMock = vi.fn();
const searchParamsRef = vi.hoisted(() => ({
  value: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/patient",
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => searchParamsRef.value,
}));

vi.mock("react-hot-toast", () => ({
  default: vi.fn(),
}));

describe("AppAccessDeniedToastEffect", () => {
  beforeEach(() => {
    replaceMock.mockClear();
    vi.mocked(toast).mockClear();
    searchParamsRef.value = new URLSearchParams();
  });

  it("shows toast and strips access-denied query", async () => {
    searchParamsRef.value = new URLSearchParams({
      [APP_ACCESS_DENIED_QUERY_KEY]: APP_ACCESS_DENIED_QUERY_VALUE,
    });

    render(<AppAccessDeniedToastEffect />);

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(APP_ACCESS_DENIED_TOAST_MESSAGE);
      expect(replaceMock).toHaveBeenCalledWith("/app/patient");
    });
  });

  it("does nothing without access-denied flag", async () => {
    searchParamsRef.value = new URLSearchParams({ tab: "symptoms" });

    render(<AppAccessDeniedToastEffect />);

    await waitFor(() => {
      expect(toast).not.toHaveBeenCalled();
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  it("preserves other query params when stripping flag", async () => {
    searchParamsRef.value = new URLSearchParams({
      [APP_ACCESS_DENIED_QUERY_KEY]: APP_ACCESS_DENIED_QUERY_VALUE,
      tab: "symptoms",
    });

    render(<AppAccessDeniedToastEffect />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/app/patient?tab=symptoms");
    });
  });
});
