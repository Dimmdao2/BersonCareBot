// ВРЕМЕННО: in-memory. При холодном старте Cloud Functions очищается.
// Следующий шаг: вынести в YDB.
const phoneToChatId = new Map();
const chatIdToPhone = new Map();

function normalizePhone(input) {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s) return null;

  const cleaned = s.replace(/[^\d+]/g, "");

  if (/^8\d{10}$/.test(cleaned)) return `+7${cleaned.slice(1)}`;
  if (/^7\d{10}$/.test(cleaned)) return `+${cleaned}`;
  if (/^\+\d{10,15}$/.test(cleaned)) return cleaned;

  return null;
}

function bindPhoneToChat(chatId, phoneRaw) {
  const p = normalizePhone(phoneRaw);
  if (!p) return { ok: false, phone: null };

  phoneToChatId.set(p, chatId);
  chatIdToPhone.set(chatId, p);

  return { ok: true, phone: p };
}

function getChatIdByPhone(phoneRaw) {
  const p = normalizePhone(phoneRaw);
  if (!p) return null;
  return phoneToChatId.get(p) || null;
}

function getPhoneByChatId(chatId) {
  return chatIdToPhone.get(chatId) || null;
}

module.exports = {
  normalizePhone,
  bindPhoneToChat,
  getChatIdByPhone,
  getPhoneByChatId,
};
