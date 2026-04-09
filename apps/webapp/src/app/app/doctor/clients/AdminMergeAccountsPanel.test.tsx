/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminMergeAccountsPanel } from "./AdminMergeAccountsPanel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const T1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const T2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("AdminMergeAccountsPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when disabled", () => {
    const { container } = render(<AdminMergeAccountsPanel anchorUserId={T1} enabled={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows hard blockers and disables merge when mergeAllowed is false", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/merge-candidates")) {
        return new Response(
          JSON.stringify({
            ok: true,
            candidates: [
              {
                id: T2,
                displayName: "B",
                phoneNormalized: "+7900",
                email: null,
                integratorUserId: null,
                createdAt: new Date().toISOString(),
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/merge-preview")) {
        return new Response(
          JSON.stringify({
            ok: true,
            targetId: T1,
            duplicateId: T2,
            target: {
              id: T1,
              phoneNormalized: null,
              integratorUserId: "1",
              displayName: "A",
              firstName: null,
              lastName: null,
              email: null,
              createdAt: new Date().toISOString(),
            },
            duplicate: {
              id: T2,
              phoneNormalized: null,
              integratorUserId: "2",
              displayName: "B",
              firstName: null,
              lastName: null,
              email: null,
              createdAt: new Date().toISOString(),
            },
            targetBindings: [],
            duplicateBindings: [],
            dependentCounts: {
              target: {
                patientBookings: 0,
                reminderRules: 0,
                supportConversations: 0,
                symptomTrackings: 0,
                lfkComplexes: 0,
                mediaFilesUploadedBy: 0,
                onlineIntakeRequests: 0,
              },
              duplicate: {
                patientBookings: 0,
                reminderRules: 0,
                supportConversations: 0,
                symptomTrackings: 0,
                lfkComplexes: 0,
                mediaFilesUploadedBy: 0,
                onlineIntakeRequests: 0,
              },
            },
            scalarConflicts: [],
            channelConflicts: [],
            oauthConflicts: [],
            autoMergeScalars: [],
            recommendation: {
              suggestedTargetId: T1,
              suggestedDuplicateId: T2,
              basis: "pick_merge_target_heuristic",
              defaultWinnerBias: "older_created_at",
            },
            mergeAllowed: false,
            v1MergeEngineCallable: false,
            hardBlockers: [
              {
                code: "different_non_null_integrator_user_id",
                message: "blocked",
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    render(<AdminMergeAccountsPanel anchorUserId={T1} enabled />);
    await user.click(screen.getByRole("button", { name: /развернуть/i }));

    const select = screen.getByLabelText(/вторая запись/i);
    await user.selectOptions(select, T2);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/жёсткие блокировки/i)).toBeInTheDocument();

    const mergeBtn = screen.getByRole("button", { name: /выполнить merge/i });
    expect(mergeBtn).toBeDisabled();
  });

  it("does not offer the auto/both option for a real channel conflict", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/merge-candidates")) {
        return new Response(
          JSON.stringify({
            ok: true,
            candidates: [
              {
                id: T2,
                displayName: "B",
                phoneNormalized: "+7900",
                email: null,
                integratorUserId: null,
                createdAt: new Date().toISOString(),
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/merge-preview")) {
        return new Response(
          JSON.stringify({
            ok: true,
            targetId: T1,
            duplicateId: T2,
            target: {
              id: T1,
              phoneNormalized: null,
              integratorUserId: null,
              displayName: "A",
              firstName: null,
              lastName: null,
              email: null,
              createdAt: new Date().toISOString(),
            },
            duplicate: {
              id: T2,
              phoneNormalized: null,
              integratorUserId: null,
              displayName: "B",
              firstName: null,
              lastName: null,
              email: null,
              createdAt: new Date().toISOString(),
            },
            targetBindings: [{ channelCode: "telegram", externalId: "tg-target", createdAt: new Date().toISOString() }],
            duplicateBindings: [{ channelCode: "telegram", externalId: "tg-dup", createdAt: new Date().toISOString() }],
            dependentCounts: {
              target: {
                patientBookings: 0,
                reminderRules: 0,
                supportConversations: 0,
                symptomTrackings: 0,
                lfkComplexes: 0,
                mediaFilesUploadedBy: 0,
                onlineIntakeRequests: 0,
              },
              duplicate: {
                patientBookings: 0,
                reminderRules: 0,
                supportConversations: 0,
                symptomTrackings: 0,
                lfkComplexes: 0,
                mediaFilesUploadedBy: 0,
                onlineIntakeRequests: 0,
              },
            },
            scalarConflicts: [],
            channelConflicts: [
              {
                channelCode: "telegram",
                targetExternalId: "tg-target",
                duplicateExternalId: "tg-dup",
                recommendedWinner: "target",
                reason: "older_created_at_preferred",
              },
            ],
            oauthConflicts: [],
            autoMergeScalars: [],
            recommendation: {
              suggestedTargetId: T1,
              suggestedDuplicateId: T2,
              basis: "pick_merge_target_heuristic",
              defaultWinnerBias: "older_created_at",
            },
            mergeAllowed: true,
            v1MergeEngineCallable: true,
            hardBlockers: [],
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    render(<AdminMergeAccountsPanel anchorUserId={T1} enabled />);
    await user.click(screen.getByRole("button", { name: /развернуть/i }));
    await user.selectOptions(screen.getByLabelText(/вторая запись/i), T2);

    await screen.findByText(/Каналы \(telegram \/ max \/ vk\)/i);
    expect(document.querySelectorAll('input[name="ch-telegram"]')).toHaveLength(2);
  });
});
