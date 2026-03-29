import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "@/lib/supabase-server";
import { decrypt } from "@/lib/encryption";
import * as pw from "@/lib/playwright-client";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/chat");

/** Kürzt ein Objekt sicher auf maxLen Zeichen als gültiges JSON */
function truncateJson(obj: unknown, maxLen: number): string {
  const full = JSON.stringify(obj);
  if (full.length <= maxLen) return full;

  // Bei zu großen Ergebnissen: Tabellen/Text kürzen
  if (typeof obj === "object" && obj !== null) {
    const slim = { ...obj as Record<string, unknown> };
    if (typeof slim.text === "string") slim.text = (slim.text as string).substring(0, 2000) + "...";
    if (Array.isArray(slim.tables)) slim.tables = (slim.tables as unknown[]).slice(0, 5);
    if (Array.isArray(slim.results)) slim.results = (slim.results as unknown[]).slice(0, 10);
    const slimStr = JSON.stringify(slim);
    if (slimStr.length <= maxLen) return slimStr;
    return slimStr.substring(0, maxLen - 20) + ',"truncated":true}';
  }
  return full.substring(0, maxLen);
}

const CRM_SYSTEM_PROMPT = `Du bist ein CRM-Assistent für crm.job-step.com (Jobstep IT Solutions).
Du hilfst dem User, Aktionen im CRM auszuführen.

VERFÜGBARE CRM-MODULE (Kurzname für Tool-Aufrufe):
dashboard, nachrichten, kandidaten, sales, sales_neu, sales_aktiv,
companies, auftraege, finanzen, tasks, tasks_alle, mitarbeiter,
kampagnen, dipl, dak, partner, dvag, positionen, teams, logs,
tickets, statistiken, taskforce, casting, dashboard_auftraege,
abgaenge, finanzprojektion, bewerbungen, reports, provisionen,
links, gruppen, schulen, providers, tutorial, faq

VERFÜGBARE AKTIONEN:
- navigate: CRM-Modul öffnen und Inhalt lesen
- search: In einem Modul suchen
- click: Button klicken
- screenshot: Screenshot der aktuellen Seite

REGELN:
- Antworte auf Deutsch, kurz und präzise
- Nutze die Tools um CRM-Daten zu lesen und Aktionen auszuführen
- Gib die Ergebnisse übersichtlich formatiert zurück
- Bei Unklarheiten frag nach welches Modul gemeint ist`;

// Tool-Definitionen für Claude
const TOOLS: Anthropic.Tool[] = [
  {
    name: "crm_navigate",
    description: "Öffnet ein CRM-Modul und liest den Inhalt (Tabellen, Text). Module: dashboard, kandidaten, sales, companies, auftraege, finanzen, tasks, mitarbeiter, kampagnen, dipl, dak, partner, dvag, tickets, statistiken, taskforce, casting, provisionen, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        module: { type: "string", description: "CRM-Modul-Kurzname (z.B. 'kandidaten', 'sales', 'finanzen')" },
      },
      required: ["module"],
    },
  },
  {
    name: "crm_search",
    description: "Sucht in einem CRM-Modul nach einem Begriff. Gibt Tabellenzeilen zurück.",
    input_schema: {
      type: "object" as const,
      properties: {
        module: { type: "string", description: "CRM-Modul-Kurzname" },
        query: { type: "string", description: "Suchbegriff" },
      },
      required: ["module", "query"],
    },
  },
  {
    name: "crm_click",
    description: "Klickt einen Button im CRM. Verwende den kroatischen Button-Text oder CSS-Selector.",
    input_schema: {
      type: "object" as const,
      properties: {
        selector: { type: "string", description: "Button-Text (z.B. 'TRAŽI', 'Dodaj', 'Export') oder CSS-Selector" },
      },
      required: ["selector"],
    },
  },
  {
    name: "crm_screenshot",
    description: "Macht einen Screenshot der aktuellen CRM-Seite.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabase();

    // Auth prüfen
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
    }

    const userId = session.user.id;
    const { message } = await request.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: "Nachricht darf nicht leer sein" }, { status: 400 });
    }
    if (message.length > 5000) {
      return NextResponse.json({ error: "Nachricht zu lang (max 5000 Zeichen)" }, { status: 400 });
    }

    // CRM-Credentials + Anthropic Key + Modell laden
    const { data: creds } = await supabase
      .from("crm_credentials")
      .select("crm_username, crm_password_encrypted, anthropic_api_key_encrypted, preferred_model")
      .eq("user_id", userId)
      .single();

    // Letzte Chat-Nachrichten für Kontext
    const { data: history } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    const contextMessages = (history || []).reverse().map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Prüfe ob Playwright-Service erreichbar
    const playwrightAvailable = await pw.crmHealth();

    // Anthropic API Key: User-eigener Key hat Vorrang, dann Fallback auf System-Key
    let anthropicApiKey: string | undefined;

    if (creds?.anthropic_api_key_encrypted) {
      try {
        anthropicApiKey = decrypt(creds.anthropic_api_key_encrypted);
      } catch (err: unknown) {
        log.warn("User Anthropic Key entschlüsseln fehlgeschlagen", {
          userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!anthropicApiKey) {
      anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    }

    if (!anthropicApiKey) {
      return NextResponse.json(
        { error: "Kein API Key konfiguriert. Bitte Anthropic API Key in den Einstellungen hinterlegen." },
        { status: 503 }
      );
    }

    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    // Modell: User-Wahl oder Fallback auf Sonnet
    const allowedModels = ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-haiku-4-5-20251001"];
    const selectedModel = (creds?.preferred_model && allowedModels.includes(creds.preferred_model))
      ? creds.preferred_model
      : "claude-haiku-4-5-20251001";

    let messages: Anthropic.MessageParam[] = [
      ...contextMessages,
      { role: "user", content: message },
    ];

    let finalResponse = "";
    let module: string | null = null;
    let action: string | null = null;

    // Tool-Use Loop (max 5 Iterationen)
    for (let i = 0; i < 5; i++) {
      const completion = await anthropic.messages.create({
        model: selectedModel,
        max_tokens: 2048,
        system: CRM_SYSTEM_PROMPT + (playwrightAvailable
          ? "\n\nDer CRM-Service ist AKTIV. Du kannst die Tools nutzen um echte CRM-Daten zu lesen."
          : "\n\nDer CRM-Service ist NICHT erreichbar. Erkläre dem User was du tun würdest und welche Schritte nötig wären."),
        tools: playwrightAvailable ? TOOLS : [],
        messages,
      });

      // Prüfe ob Tool-Aufrufe dabei sind
      const toolUses = completion.content.filter((c) => c.type === "tool_use");
      const textBlocks = completion.content.filter((c) => c.type === "text");

      if (textBlocks.length > 0) {
        finalResponse = textBlocks.map((t) => "text" in t ? t.text : "").join("\n");
      }

      // Keine Tool-Aufrufe → fertig
      if (toolUses.length === 0 || completion.stop_reason === "end_turn") {
        break;
      }

      // Tool-Aufrufe verarbeiten
      const toolResults: Anthropic.MessageParam = {
        role: "user",
        content: [],
      };

      for (const toolUse of toolUses) {
        if (toolUse.type !== "tool_use") continue;

        const input = toolUse.input as Record<string, string>;
        let result: unknown = {};

        try {
          // Auto-Login wenn Credentials vorhanden
          if (creds?.crm_password_encrypted) {
            try {
              const password = decrypt(creds.crm_password_encrypted);
              await pw.crmLogin(userId, creds.crm_username, password);
            } catch (loginErr: unknown) {
              log.warn("Auto-Login fehlgeschlagen", {
                userId,
                error: loginErr instanceof Error ? loginErr.message : String(loginErr),
              });
            }
          }

          switch (toolUse.name) {
            case "crm_navigate":
              module = input.module;
              action = `Modul ${input.module} geöffnet`;
              result = await pw.crmNavigate(userId, input.module);
              break;
            case "crm_search":
              module = input.module;
              action = `Suche in ${input.module}: "${input.query}"`;
              result = await pw.crmSearch(userId, input.module, input.query);
              break;
            case "crm_click":
              action = `Button geklickt: ${input.selector}`;
              result = await pw.crmClick(userId, input.selector);
              break;
            case "crm_screenshot":
              action = "Screenshot erstellt";
              result = await pw.crmScreenshot(userId);
              break;
          }
        } catch (err: unknown) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }

        (toolResults.content as Anthropic.ToolResultBlockParam[]).push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: truncateJson(result, 4000),
        });
      }

      // Tool-Ergebnisse an Konversation anhängen
      messages = [
        ...messages,
        { role: "assistant", content: completion.content },
        toolResults,
      ];
    }

    // Nachrichten speichern
    await supabase.from("chat_messages").insert({
      user_id: userId,
      role: "user",
      content: message,
      metadata: {},
    });

    await supabase.from("chat_messages").insert({
      user_id: userId,
      role: "assistant",
      content: finalResponse,
      metadata: { module, action },
    });

    // Activity loggen
    if (module || action) {
      await supabase.from("activities").insert({
        user_id: userId,
        action: action || `Chat: ${message.substring(0, 100)}`,
        module: module || "Chat",
        details: { message: message.substring(0, 200) },
        status: "success",
      });
    }

    return NextResponse.json({
      content: finalResponse,
      metadata: { module, action },
    });
  } catch (err: unknown) {
    log.error("Chat-Fehler", log.fromError(err));
    const message = err instanceof Error ? err.message : "Interner Fehler";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
