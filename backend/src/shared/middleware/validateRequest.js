/**
 * Request Validation Middleware
 * Validates request body, params, query against Joi schemas
 */

const AppError = require("../errors/AppError");

/**
 * Validate request data
 * @param {Object} schema - Joi schema object { body, params, query }
 */
const validateRequest = (schema) => {
  return (req, res, next) => {
    const validationErrors = {};

    // Validate body
    if (schema.body) {
      const { error, value } = schema.body.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        validationErrors.body = error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
        }));
      } else {
        req.body = value; // Use validated & sanitized value
      }
    }

    // Validate params
    if (schema.params) {
      const { error, value } = schema.params.validate(req.params, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        validationErrors.params = error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
        }));
      } else {
        req.params = value;
      }
    }

    // Validate query
    if (schema.query) {
      const { error, value } = schema.query.validate(req.query, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        validationErrors.query = error.details.map((detail) => ({
          field: detail.path.join("."),
          message: detail.message,
        }));
      } else {
        req.query = value;
      }
    }

    // If any validation errors, throw
    if (Object.keys(validationErrors).length > 0) {
      return next(
        new AppError("Validation failed", 400, { errors: validationErrors })
      );
    }

    next();
  };
};

module.exports = validateRequest;
