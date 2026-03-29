/**
 * In-Memory Rate Limiter
 * ======================
 * Einfacher Token-Bucket-basierter Rate Limiter für API-Routes.
 * Kein externer Service nötig — funktioniert in serverless/Edge.
 *
 * Hinweis: In einer Multi-Instance-Umgebung (mehrere Pods/Container)
 * sollte auf Redis-basiertes Rate Limiting umgestellt werden.
 */

interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

interface RateLimitConfig {
  /** Max. Anfragen im Zeitfenster */
  maxRequests: number;
  /** Zeitfenster in Millisekunden */
  windowMs: number;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

/**
 * Erstellt einen Rate Limiter mit eigener Konfiguration.
 *
 * Verwendung:
 *   const limiter = createRateLimiter({ maxRequests: 20, windowMs: 60_000 });
 *   const result = limiter.check(userId);
 *   if (!result.allowed) return NextResponse.json({ error: "Zu viele Anfragen" }, { status: 429 });
 */
export function createRateLimiter(config: RateLimitConfig) {
  const storeKey = `${config.maxRequests}-${config.windowMs}`;
  if (!stores.has(storeKey)) {
    stores.set(storeKey, new Map());
  }
  const store = stores.get(storeKey)!;

  // Cleanup: Alte Einträge alle 5 Minuten entfernen
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now - entry.lastRefill > config.windowMs * 2) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref?.();

  return {
    check(identifier: string): { allowed: boolean; remaining: number; resetIn: number } {
      const now = Date.now();
      const entry = store.get(identifier);

      if (!entry) {
        // Erster Request — volle Tokens minus 1
        store.set(identifier, { tokens: config.maxRequests - 1, lastRefill: now });
        return { allowed: true, remaining: config.maxRequests - 1, resetIn: config.windowMs };
      }

      // Tokens auffrischen basierend auf vergangener Zeit
      const elapsed = now - entry.lastRefill;
      const refillRate = config.maxRequests / config.windowMs;
      const newTokens = Math.min(config.maxRequests, entry.tokens + elapsed * refillRate);

      if (newTokens < 1) {
        // Kein Token übrig — Rate Limit erreicht
        const resetIn = Math.ceil((1 - newTokens) / refillRate);
        return { allowed: false, remaining: 0, resetIn };
      }

      // Token verbrauchen
      entry.tokens = newTokens - 1;
      entry.lastRefill = now;
      return { allowed: true, remaining: Math.floor(entry.tokens), resetIn: config.windowMs };
    },
  };
}

// ── Vorkonfigurierte Limiter ──────────────────────────────

/** Chat-Endpunkt: 20 Requests pro Minute pro User */
export const chatLimiter = createRateLimiter({ maxRequests: 20, windowMs: 60_000 });

/** Credentials: 10 Requests pro Minute pro User */
export const credentialsLimiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });

/** Admin Create-User: 5 Requests pro Minute pro Admin */
export const adminLimiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 });

/** Allgemeines API-Limit: 60 Requests pro Minute */
export const generalLimiter = createRateLimiter({ maxRequests: 60, windowMs: 60_000 });
