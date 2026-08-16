function validateProductQuery(query) {
  if (!query || typeof query !== "object") {
    throw Object.assign(new Error("Invalid product query"), { status: 400 });
  }
}

module.exports = {
  validateProductQuery
};