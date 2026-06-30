/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CommentsTab } from "./CommentsTab";

// Перехватываем DoctorCommentsTab, чтобы проверить, какие пропы реально доходят
// после маппинга initialData.
const receivedProps = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../comments/DoctorCommentsTab", () => ({
  DoctorCommentsTab: (props: unknown) => {
    receivedProps.current = props;
    return <div data-testid="comments-tab-inner" />;
  },
}));

function lastProps(): {
  initialItems: unknown;
  initialCursor: unknown;
  hasMoreInitial: unknown;
  initialPatients: unknown;
} {
  return receivedProps.current as {
    initialItems: unknown;
    initialCursor: unknown;
    hasMoreInitial: unknown;
    initialPatients: unknown;
  };
}

describe("CommentsTab (initialData → props mapping)", () => {
  const noop = () => {};

  it("maps v2 shape {feed,patients} → component props", () => {
    const items = [{ patientUserId: "p1" }];
    const cursor = { createdAt: "2026-06-01T00:00:00.000Z", id: "m1" };
    const patients = [{ patientUserId: "p1", displayName: "Иванов", isOnSupport: true, unreadCount: 1 }];

    render(
      <CommentsTab
        deepLinkParams={{}}
        onDeepLinkChange={noop}
        initialData={{
          feed: { items, nextCursor: cursor, hasMore: true },
          patients,
        }}
      />,
    );

    expect(screen.getByTestId("comments-tab-inner")).toBeInTheDocument();
    const p = lastProps();
    expect(p.initialItems).toBe(items);
    expect(p.initialCursor).toBe(cursor);
    expect(p.hasMoreInitial).toBe(true);
    expect(p.initialPatients).toBe(patients);
  });

  it("maps legacy flat shape {items,nextCursor,hasMore} with empty patients", () => {
    const items = [{ patientUserId: "p1" }];
    const cursor = { createdAt: "2026-06-01T00:00:00.000Z", id: "m1" };

    render(
      <CommentsTab
        deepLinkParams={{}}
        onDeepLinkChange={noop}
        initialData={{ items, nextCursor: cursor, hasMore: true }}
      />,
    );

    const p = lastProps();
    expect(p.initialItems).toBe(items);
    expect(p.initialCursor).toBe(cursor);
    expect(p.hasMoreInitial).toBe(true);
    expect(p.initialPatients).toEqual([]);
  });

  it("falls back to empty props when initialData is undefined", () => {
    render(<CommentsTab deepLinkParams={{}} onDeepLinkChange={noop} initialData={undefined} />);
    const p = lastProps();
    expect(p.initialItems).toEqual([]);
    expect(p.initialCursor).toBeNull();
    expect(p.hasMoreInitial).toBe(false);
    expect(p.initialPatients).toEqual([]);
  });

  it("never passes undefined initialItems even for partial/garbage data", () => {
    render(
      <CommentsTab
        deepLinkParams={{}}
        onDeepLinkChange={noop}
        initialData={{ foo: "bar" } as unknown}
      />,
    );
    const p = lastProps();
    expect(Array.isArray(p.initialItems)).toBe(true);
    expect(p.initialItems).toEqual([]);
    expect(p.initialCursor).toBeNull();
    expect(p.hasMoreInitial).toBe(false);
    expect(Array.isArray(p.initialPatients)).toBe(true);
  });

  it("maps v2 shape with empty feed and empty patients", () => {
    render(
      <CommentsTab
        deepLinkParams={{}}
        onDeepLinkChange={noop}
        initialData={{
          feed: { items: [], nextCursor: null, hasMore: false },
          patients: [],
        }}
      />,
    );
    const p = lastProps();
    expect(p.initialItems).toEqual([]);
    expect(p.initialCursor).toBeNull();
    expect(p.hasMoreInitial).toBe(false);
    expect(p.initialPatients).toEqual([]);
  });
});
