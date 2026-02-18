function reply(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "text/plain; charset=utf-8" },
    body,
  };
}

function jsonReply(statusCode, obj) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj),
  };
}

module.exports = { reply, jsonReply };
