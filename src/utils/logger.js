




const LOG_LEVEL = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};


const CURRENT_LOG_LEVEL = process.env.LOG_LEVEL ?
parseInt(process.env.LOG_LEVEL) : LOG_LEVEL.INFO;






const log = (message, level = LOG_LEVEL.INFO) => {
  if (level <= CURRENT_LOG_LEVEL) {
    const prefix = level === LOG_LEVEL.ERROR ? '[ERROR] ' :
    level === LOG_LEVEL.WARN ? '[WARN] ' :
    level === LOG_LEVEL.INFO ? '[INFO] ' :
    '[DEBUG] ';
    console.log(`${prefix}${message}`);
  }
};


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