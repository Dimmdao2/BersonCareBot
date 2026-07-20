import { describe, expect, it, vi } from "vitest";
import { platformUsers, userPhoneHistory } from "../../../db/schema/schema";
import {
  DoctorClientIdentityError,
  resolveOrCreateDoctorClientByPhoneInTransaction,
} from "./pgDoctorClientCreate";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const input = {
  phoneNormalized: "+79991234567",
  lastName: "новый",
  firstName: "пациент",
  patronymic: null,
  emailRaw: null,
  emailNormalized: null,
};

function selectQueue(rows: unknown[][]) {
  return vi.fn(() => ({
    from: () => ({
      where: () => ({
        limit: vi.fn(async () => rows.shift() ?? []),
      }),
    }),
  }));
}

describe("resolveOrCreateDoctorClientByPhoneInTransaction", () => {
  it("reuses an existing canonical client without a second writer", async () => {
    const insert = vi.fn();
    const tx = {
      select: selectQueue([
        [
          {
            id: "existing-user",
            role: "client",
            displayName: "Существующий",
            lastName: "Существующий",
            firstName: "Пациент",
            patronymic: null,
            phoneNormalized: input.phoneNormalized,
          },
        ],
      ]),
      insert,
    };

    await expect(
      resolveOrCreateDoctorClientByPhoneInTransaction(tx as never, ORG_ID, input),
    ).resolves.toEqual({
      userId: "existing-user",
      displayName: "Существующий",
      lastName: "Существующий",
      firstName: "Пациент",
      patronymic: null,
      phoneNormalized: input.phoneNormalized,
      created: false,
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("fails on an email owned by another canonical identity", async () => {
    const tx = {
      select: selectQueue([[], [{ id: "other-user" }]]),
      insert: vi.fn(),
    };
    await expect(
      resolveOrCreateDoctorClientByPhoneInTransaction(tx as never, ORG_ID, {
        ...input,
        emailRaw: "taken@example.com",
        emailNormalized: "taken@example.com",
      }),
    ).rejects.toEqual(new DoctorClientIdentityError("email_conflict"));
  });

  it("creates identity and organization-attributed phone history through one tx executor", async () => {
    const insertedValues: unknown[] = [];
    const insert = vi.fn((table: unknown) => ({
      values: vi.fn((values: unknown) => {
        insertedValues.push(values);
        if (table === platformUsers) {
          return {
            onConflictDoNothing: () => ({
              returning: async () => [
                {
                  id: "new-user",
                  displayName: "Новый Пациент",
                  lastName: "Новый",
                  firstName: "Пациент",
                  patronymic: null,
                },
              ],
            }),
          };
        }
        expect(table).toBe(userPhoneHistory);
        return Promise.resolve();
      }),
    }));
    const tx = { select: selectQueue([[]]), insert };

    await expect(
      resolveOrCreateDoctorClientByPhoneInTransaction(tx as never, ORG_ID, input),
    ).resolves.toMatchObject({ userId: "new-user", created: true });
    expect(insertedValues).toEqual([
      expect.objectContaining({
        phoneNormalized: input.phoneNormalized,
        role: "client",
        displayName: "Новый Пациент",
        lastName: "Новый",
        firstName: "Пациент",
        patronymic: null,
      }),
      expect.objectContaining({
        platformUserId: "new-user",
        organizationId: ORG_ID,
        phoneNormalized: input.phoneNormalized,
        source: "admin",
      }),
    ]);
  });

  it("converges on the concurrently inserted canonical client without duplicate history", async () => {
    const select = selectQueue([
      [],
      [
        {
          id: "concurrent-user",
          role: "client",
          displayName: "Уже создан",
          lastName: "Уже",
          firstName: "Создан",
          patronymic: null,
          phoneNormalized: input.phoneNormalized,
        },
      ],
    ]);
    const insert = vi.fn((table: unknown) => {
      expect(table).toBe(platformUsers);
      return {
        values: () => ({
          onConflictDoNothing: () => ({ returning: async () => [] }),
        }),
      };
    });

    await expect(
      resolveOrCreateDoctorClientByPhoneInTransaction(
        { select, insert } as never,
        ORG_ID,
        input,
      ),
    ).resolves.toMatchObject({ userId: "concurrent-user", created: false });
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
