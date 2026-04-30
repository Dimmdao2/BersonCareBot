/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ResolvedUsefulPostCard } from "@/modules/patient-home/patientHomeResolvers";
import { PatientHomeUsefulPostCard } from "./PatientHomeUsefulPostCard";

const basePost = (): ResolvedUsefulPostCard => ({
  itemId: "i1",
  slug: "fixture-post",
  title: "Полезная статья",
  showTitle: true,
  imageUrl: "/api/media/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  badgeLabel: null,
  href: "/app/patient/content/fixture-post",
});

describe("PatientHomeUsefulPostCard", () => {
  it("renders title and link without badge by default", () => {
    render(<PatientHomeUsefulPostCard post={basePost()} />);
    const link = screen.getByRole("link", { name: /Полезная статья/i });
    expect(link.getAttribute("href")).toBe("/app/patient/content/fixture-post");
    expect(screen.queryByText("Новый пост")).toBeNull();
  });

  it("renders optional badge label", () => {
    render(<PatientHomeUsefulPostCard post={{ ...basePost(), badgeLabel: "Новый пост" }} />);
    expect(screen.getByText("Новый пост")).toBeInTheDocument();
  });

  it("keeps link accessible when visible title is disabled", () => {
    render(<PatientHomeUsefulPostCard post={{ ...basePost(), showTitle: false }} />);
    const link = screen.getByRole("link", { name: /Полезная статья/i });
    expect(link.getAttribute("href")).toBe("/app/patient/content/fixture-post");
    expect(screen.getByRole("heading", { name: /Полезная статья/i })).toHaveClass("sr-only");
  });
});
