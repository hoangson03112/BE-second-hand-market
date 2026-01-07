const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const AttributeSchema = new Schema({
  key: {
    type: String,
    required: [true, "Attribute key is required"],
    trim: true,
    validate: {
      validator: function (v) {
        return /^[\p{L}\p{N}\s_-]+$/u.test(v);
      },
      message:
        "Attribute key must contain only letters, numbers, spaces, underscores, or hyphens",
    },
  },
  value: {
    type: Schema.Types.Mixed, 
    required: [true, "Attribute value is required"],
    validate: {
      validator: function (v) {
        return (
          typeof v === "string" ||
          typeof v === "number" ||
          (Array.isArray(v) &&
            v.every(
              (item) => typeof item === "string" || typeof item === "number"
            ))
        );
      },
      message:
        "Attribute value must be a string, number, or array of strings/numbers",
    },
  },
  normalizedValue: { type: String, select: false }, 
});

module.exports = mongoose.model("Attribute", AttributeSchema);
