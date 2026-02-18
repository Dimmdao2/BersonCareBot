const { tg } = require("../telegram/tgApi");
const { TG_BOT_TOKEN, ADMIN_CHAT_ID, RUBITIME_RK } = require("../config");
const { getChatIdByPhone } = require("../storage/bindingsRepo");
const { rubitime } = require("./rubiApi");

function isRubitimeWebhook(body) {
  return (
    body &&
    typeof body === "object" &&
    typeof body.event === "string" &&
    (body.event === "event-create-record" ||
      body.event === "event-update-record" ||
      body.event === "event-remove-record")
  );
}

function rubitimeEventTitle(evt) {
  if (evt === "event-create-record") return "Создание записи";
  if (evt === "event-update-record") return "Изменение записи";
  if (evt === "event-remove-record") return "Удаление записи";
  return evt;
}

function formatPatientNotification({ evt, recordId, record }) {
  const lines = [];
  lines.push(rubitimeEventTitle(evt));
  if (recordId != null) lines.push(`id: ${recordId}`);

  // Эти поля зависят от фактического payload (после первых логов подправим точно)
  const dt = record?.record || record?.datetime || record?.date || null;
  const service = record?.service || record?.service_name || null;
  const coop = record?.cooperator || record?.cooperator_name || null;
  const branch = record?.branch || record?.branch_name || null;

  if (dt) lines.push(`время: ${dt}`);
  if (service) lines.push(`услуга: ${service}`);
  if (coop) lines.push(`специалист: ${coop}`);
  if (branch) lines.push(`филиал: ${branch}`);

  return lines.join("\n");
}

async function handleRubitime(body) {
  const token = TG_BOT_TOKEN();
  const rk = RUBITIME_RK();

  const evt = body.event;
  const data = body.data && typeof body.data === "object" ? body.data : {};
  const recordId = data.id ?? data.record_id ?? data.appointment_id ?? null;

  // телефон пытаемся взять из webhook; если нет — добираем get-record
  let phone =
    (typeof data.phone === "string" && data.phone) ||
    (typeof data.client_phone === "string" && data.client_phone) ||
    null;

  let record = data;

  if (!phone && recordId != null && rk) {
    const r = await rubitime("get-record", rk, { id: recordId });
    if (r.ok && r.data) {
      record = r.data;
      if (typeof r.data.phone === "string") phone = r.data.phone;
    }
  }

  if (!phone) {
    await tg("sendMessage", token, {
      chat_id: ADMIN_CHAT_ID,
      text: `Rubitime: нет телефона в событии\nevent: ${evt}\nid: ${recordId ?? "-"}`,
    });
    return { statusCode: 200, body: "ok" };
  }

  const chatId = getChatIdByPhone(phone);

  if (chatId) {
    await tg("sendMessage", token, {
      chat_id: chatId,
      text: formatPatientNotification({ evt, recordId, record }),
    });
    return { statusCode: 200, body: "ok" };
  }

  await tg("sendMessage", token, {
    chat_id: ADMIN_CHAT_ID,
    text: `Rubitime: не найден chat_id по телефону\nphone: ${phone}\nevent: ${evt}\nid: ${recordId ?? "-"}`,
  });

  return { statusCode: 200, body: "ok" };
}

module.exports = { isRubitimeWebhook, handleRubitime };
