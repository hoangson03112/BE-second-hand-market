/**
 * Logger utility for consistent logging across the application
 */

// Log levels
const LOG_LEVEL = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// Set current log level - change to lower value to reduce logs
const CURRENT_LOG_LEVEL = process.env.LOG_LEVEL ? 
  parseInt(process.env.LOG_LEVEL) : LOG_LEVEL.INFO;

/**
 * Log a message with a specific level
 * @param {string} message - The message to log
 * @param {number} level - The log level from LOG_LEVEL enum
 */
const log = (message, level = LOG_LEVEL.INFO) => {
  if (level <= CURRENT_LOG_LEVEL) {
    const prefix = level === LOG_LEVEL.ERROR ? '[ERROR] ' : 
                  level === LOG_LEVEL.WARN ? '[WARN] ' : 
                  level === LOG_LEVEL.INFO ? '[INFO] ' : 
                  '[DEBUG] ';
    console.log(`${prefix}${message}`);
  }
};

// Convenience methods for different log levels
const error = (message) => log(message, LOG_LEVEL.ERROR);
const warn = (message) => log(message, LOG_LEVEL.WARN);
const info = (message) => log(message, LOG_LEVEL.INFO);
const debug = (message) => log(message, LOG_LEVEL.DEBUG);

module.exports = {
  LOG_LEVEL,
  log,
  error,
  warn,
  info,
  debug
}; 