const logger = require("../utils/logger");
const { AppError } = require("../constants/errors");





const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;


  logger.error(`Error: ${err.message}`, {
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip
  });


  if (err.name === "CastError") {
    const message = "Resource not found";
    error = new AppError(message, 404);
  }


  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    const message = `${field} already exists`;
    error = new AppError(message, 409);
  }


  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((val) => val.message);
    const message = messages.join(", ");
    error = new AppError(message, 400);
  }


  if (err.name === "JsonWebTokenError") {
    const message = "Invalid token";
    error = new AppError(message, 401);
  }

  if (err.name === "TokenExpiredError") {
    const message = "Token expired";
    error = new AppError(message, 401);
  }


  const rawStatus = error.statusCode ?? error.status;
  const statusCode =
  typeof rawStatus === "number" && rawStatus >= 100 && rawStatus < 600 ?
  rawStatus :
  500;
  const message = error.message || "Internal server error";


  res.status(statusCode).json({
    success: false,

    message,
    error: {
      message,
      ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
      ...(error.details && { details: error.details })
    }
  });
};




const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  errorHandler,
  asyncHandler
};