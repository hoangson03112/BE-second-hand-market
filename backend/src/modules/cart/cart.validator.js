function validateCartPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid cart payload");
  }
}

module.exports = {
  validateCartPayload
};