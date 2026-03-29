/**
 * Playwright Service Logger
 * ==========================
 * Loggt in JSON-Format auf stdout/stderr.
 * Wird von Docker/pm2 aufgesammelt.
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 };
const envLevel = process.env.LOG_LEVEL || "info";
const MIN_LEVEL = LEVELS[envLevel] !== undefined ? envLevel : "info";

function log(level, source, message, meta = {}) {
  if (LEVELS[level] < LEVELS[MIN_LEVEL]) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    ...meta,
  };

  if (level === "error" || level === "fatal") {
    process.stderr.write(JSON.stringify(entry) + "\n");
  } else {
    process.stdout.write(JSON.stringify(entry) + "\n");
  }
}

function createLogger(source) {
  return {
    debug: (msg, meta) => log("debug", source, msg, meta),
    info: (msg, meta) => log("info", source, msg, meta),
    warn: (msg, meta) => log("warn", source, msg, meta),
    error: (msg, meta) => log("error", source, msg, meta),
    fatal: (msg, meta) => log("fatal", source, msg, meta),
  };
}

module.exports = { createLogger };
