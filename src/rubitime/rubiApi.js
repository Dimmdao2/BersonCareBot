const RUBI_BASE = "https://rubitime.ru/api2";

/**
 * Rubitime API: POST https://rubitime.ru/api2/{method} JSON { rk: '...', ... }
 */
async function rubitime(method, rk, payload) {
  const res = await fetch(`${RUBI_BASE}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rk, ...payload }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    console.log("Rubitime HTTP error", res.status, data);
    return { ok: false, data: null };
  }

  return { ok: true, data };
}

module.exports = { rubitime };
