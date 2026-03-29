/**
 * System Logger
 * ==============
 * Zentrales Logging für die gesamte Plattform.
 * Loggt in Supabase (system_logs Tabelle) und in die Console.
 */

import { createClient } from "@supabase/supabase-js";

type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

interface LogEntry {
  level: LogLevel;
  source: string;
  message: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

// Service-Role Client für serverseitiges Logging (ohne Auth-Context)
let _supabase: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      _supabase = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
  }
  return _supabase;
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m",  // grau
  info: "\x1b[36m",   // cyan
  warn: "\x1b[33m",   // gelb
  error: "\x1b[31m",  // rot
  fatal: "\x1b[35m",  // magenta
};
const RESET = "\x1b[0m";

async function log(entry: LogEntry): Promise<void> {
  const timestamp = new Date().toISOString();
  const color = LEVEL_COLORS[entry.level];

  // Console-Output
  const prefix = `${color}[${entry.level.toUpperCase()}]${RESET}`;
  const source = `[${entry.source}]`;
  console.log(`${timestamp} ${prefix} ${source} ${entry.message}`);

  if (entry.metadata && (entry.level === "error" || entry.level === "fatal")) {
    console.error(entry.metadata);
  }

  // In DB schreiben (nur warn/error/fatal, um DB-Last gering zu halten)
  if (entry.level === "debug" || entry.level === "info") return;

  try {
    const supabase = getSupabase();
    if (!supabase) return;

    // Supabase-Client hat keine generierten Typen für system_logs.
    // Type-safe Workaround: über unknown casten statt any.
    const logData = {
      level: entry.level,
      source: entry.source,
      message: entry.message,
      user_id: entry.userId || null,
      metadata: entry.metadata || {},
    };
    const table = supabase.from("system_logs") as unknown as { insert: (data: typeof logData) => Promise<unknown> };
    await table.insert(logData);
  } catch {
    // Fallback: nur Console, kein Endlos-Loop.
    // Bewusst kein console.error um Log-Spam zu vermeiden wenn DB nicht erreichbar.
  }
}

/**
 * Logger-Factory: Erstellt einen Logger für eine bestimmte Source.
 *
 * Verwendung:
 *   const log = createLogger("api/chat");
 *   log.info("Chat gestartet");
 *   log.error("Anthropic API Fehler", { userId, error: err.message, stack: err.stack });
 */
export function createLogger(source: string) {
  return {
    debug(message: string, metadata?: Record<string, unknown>) {
      log({ level: "debug", source, message, metadata });
    },
    info(message: string, metadata?: Record<string, unknown>) {
      log({ level: "info", source, message, metadata });
    },
    warn(message: string, metadata?: Record<string, unknown>, userId?: string) {
      log({ level: "warn", source, message, metadata, userId });
    },
    error(message: string, metadata?: Record<string, unknown>, userId?: string) {
      log({ level: "error", source, message, metadata, userId });
    },
    fatal(message: string, metadata?: Record<string, unknown>, userId?: string) {
      log({ level: "fatal", source, message, metadata, userId });
    },

    /** Hilfsfunktion: Error-Objekt in loggbares Format */
    fromError(err: unknown): Record<string, unknown> {
      if (err instanceof Error) {
        return {
          name: err.name,
          message: err.message,
          stack: err.stack,
        };
      }
      return { raw: String(err) };
    },
  };
}
