/**
 * Client für den Playwright CRM Microservice
 */

const PLAYWRIGHT_URL = process.env.PLAYWRIGHT_SERVICE_URL || "http://playwright:3001";

interface PlaywrightResponse {
  success?: boolean;
  url?: string;
  title?: string;
  text?: string;
  tables?: string[][];
  results?: string[][];
  resultCount?: number;
  screenshot?: string;
  error?: string;
  duration_ms?: number;
}

async function callService(endpoint: string, body: Record<string, unknown>): Promise<PlaywrightResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000); // 60s Timeout

  try {
    const res = await fetch(`${PLAYWRIGHT_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    let data: PlaywrightResponse;
    try {
      data = await res.json();
    } catch {
      throw new Error(`Service-Antwort ungültiges JSON (Status: ${res.status})`);
    }

    if (!res.ok) throw new Error(data.error || `Service-Fehler: ${res.status}`);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export async function crmLogin(userId: string, username: string, password: string) {
  return callService("/login", { userId, username, password });
}

export async function crmValidate(userId: string, username: string, password: string) {
  return callService("/validate", { userId, username, password });
}

export async function crmNavigate(userId: string, module: string) {
  return callService("/navigate", { userId, module });
}

export async function crmSearch(userId: string, module: string, query: string) {
  return callService("/search", { userId, module, query });
}

export async function crmClick(userId: string, selector: string) {
  return callService("/click", { userId, selector });
}

export async function crmExecute(userId: string, action: string, module: string, params?: Record<string, unknown>) {
  return callService("/execute", { userId, action, module, params });
}

export async function crmScreenshot(userId: string) {
  return callService("/screenshot", { userId });
}

export async function crmLogout(userId: string) {
  return callService("/logout", { userId });
}

export async function crmHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${PLAYWRIGHT_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
