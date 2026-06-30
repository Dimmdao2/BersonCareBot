import { describe, expect, it } from "vitest";
import type { OnlineIntakeService } from "@/modules/online-intake/ports";
import {
  loadDoctorCommunicationsBadges,
  type DoctorCommunicationsBadgesDeps,
} from "./loadDoctorCommunicationsBadges";

function deps(unread: () => Promise<number>): DoctorCommunicationsBadgesDeps {
  return { messaging: { doctorSupport: { unreadFromUsers: unread } } };
}

function intake(total: () => Promise<number>): Pick<OnlineIntakeService, "listForDoctor"> {
  return {
    listForDoctor: async (query) => {
      expect(query).toMatchObject({ status: "new" });
      return { items: [], total: await total() };
    },
  };
}

describe("loadDoctorCommunicationsBadges", () => {
  it("returns chats + intake counts when both are positive", async () => {
    const badges = await loadDoctorCommunicationsBadges(
      deps(async () => 4),
      intake(async () => 2),
    );
    expect(badges).toEqual({ chats: 4, intake: 2 });
  });

  it("omits zero counts so no badge is rendered", async () => {
    const badges = await loadDoctorCommunicationsBadges(
      deps(async () => 0),
      intake(async () => 0),
    );
    expect(badges).toEqual({});
  });

  it("includes only the non-zero source", async () => {
    expect(
      await loadDoctorCommunicationsBadges(
        deps(async () => 3),
        intake(async () => 0),
      ),
    ).toEqual({ chats: 3 });
    expect(
      await loadDoctorCommunicationsBadges(
        deps(async () => 0),
        intake(async () => 5),
      ),
    ).toEqual({ intake: 5 });
  });

  it("is resilient: a failing source counts as 0, the other still resolves", async () => {
    const badges = await loadDoctorCommunicationsBadges(
      deps(async () => {
        throw new Error("messaging down");
      }),
      intake(async () => 7),
    );
    expect(badges).toEqual({ intake: 7 });
  });
});
