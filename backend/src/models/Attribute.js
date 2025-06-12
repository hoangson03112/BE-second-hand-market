const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const AttributeSchema = new Schema({
    key: {
        type: String,
        required: [true, "Attribute key is required"],
        trim: true,
        validate: {
            validator: function (v) {
                return /^[a-zA-Z0-9\s_-]+$/.test(v); // Ensure key is alphanumeric, spaces, underscores, or hyphens
            },
            message: "Attribute key must be alphanumeric with spaces, underscores, or hyphens",
        },
    },
    value: {
        type: Schema.Types.Mixed, // Allow strings, numbers, or arrays for flexibility
        required: [true, "Attribute value is required"],
        validate: {
            validator: function (v) {
                // Allow strings, numbers, or arrays of strings/numbers
                return (
                    typeof v === "string" ||
                    typeof v === "number" ||
                    (Array.isArray(v) && v.every(item => typeof item === "string" || typeof item === "number"))
                );
            },
            message: "Attribute value must be a string, number, or array of strings/numbers",
        },
    },
    normalizedValue: { type: String, select: false }, // For text search
});

module.exports = mongoose.model("Attribute", AttributeSchema);