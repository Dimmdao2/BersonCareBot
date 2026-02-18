const ADMIN_CHAT_ID = 364943522;

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing`);
  return v;
}

function optEnv(name, fallback = "") {
  return process.env[name] || fallback;
}

module.exports = {
  ADMIN_CHAT_ID,
  TG_BOT_TOKEN: () => mustEnv("TG_BOT_TOKEN"),
  TG_WEBHOOK_SECRET: () => optEnv("TG_WEBHOOK_SECRET", ""),
  RUBITIME_RK: () => optEnv("RUBITIME_RK", ""), // rk из Rubitime API
};
