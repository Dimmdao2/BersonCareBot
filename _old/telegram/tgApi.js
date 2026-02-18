const TG_API = "https://api.telegram.org";

async function tg(method, token, payload) {
  const res = await fetch(`${TG_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) console.log("Telegram HTTP error", res.status, data);
  else if (data && data.ok === false) console.log("Telegram API error", data);

  return data;
}

module.exports = { tg };