import { describe, expect, it } from "vitest";
import { COMMUNICATIONS_TAB_REGISTRY } from "./communicationsTabRegistry";
import { COMMUNICATIONS_TABS } from "./doctorCommunicationsTabs";

/**
 * Закрепляет контракт deep-link ключей. Шелл читает из URL ТОЛЬКО ключи, объявленные
 * в `deepLinkKeys` (readDeepLinksFromSearchParams). Если обёртка-таб пишет ключ через
 * onDeepLinkChange("<key>", …), но реестр его не объявляет — на reload/back значение
 * НЕ восстановится (молчаливая поломка deep-link). typecheck это не ловит (ключ — строка).
 *
 * Эти тесты фиксируют известные ключи на момент TODO#3:
 *   intake → "id", broadcasts → "archive", chats/comments → нет.
 * При добавлении нового deep-link обёртке — обновить и реестр, и этот тест.
 */
describe("communicationsTabRegistry — deep-link keys contract", () => {
  const byId = new Map(COMMUNICATIONS_TAB_REGISTRY.map((e) => [e.id, e]));

  it("registry covers exactly the 4 canonical tabs in the same order", () => {
    expect(COMMUNICATIONS_TAB_REGISTRY.map((e) => e.id)).toEqual(
      COMMUNICATIONS_TABS.map((t) => t.id),
    );
  });

  it("intake declares deep-link key 'id' (used by IntakeTab onDeepLinkChange('id', …))", () => {
    expect(byId.get("intake")?.deepLinkKeys).toContain("id");
  });

  it("broadcasts declares deep-link key 'archive' (used by BroadcastsTab)", () => {
    expect(byId.get("broadcasts")?.deepLinkKeys).toContain("archive");
  });

  it("chats and comments declare no deep-link keys", () => {
    expect(byId.get("chats")?.deepLinkKeys).toEqual([]);
    expect(byId.get("comments")?.deepLinkKeys).toEqual([]);
  });

  it("every entry has a loader", () => {
    for (const entry of COMMUNICATIONS_TAB_REGISTRY) {
      expect(typeof entry.loader).toBe("function");
    }
  });
});
