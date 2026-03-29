/**
 * popup-handler.js
 * JavaScript-Port des TypeScript popup-handler.ts
 * Behandelt JavaScript-Dialoge (alert/confirm/prompt) via Playwright.
 */

"use strict";

// Standard-Regeln für crm.job-step.com
const DEFAULT_RULES = [
  { pattern: /löschen|delete|entfernen|remove/i, action: "dismiss" },
  { pattern: /speichern|save|gespeichert|erfolgreich|success|ok\b/i, action: "accept" },
  { pattern: /abbrechen|cancel|verwerfen|discard/i, action: "dismiss" },
  { pattern: /session|timeout|sitzung/i, action: "accept" },
];

class PopupHandler {
  constructor() {
    this.rules = [...DEFAULT_RULES];
    this.log = [];
    this.maxLogEntries = 500;
    this.defaultAction = "accept";
    this._dialogHandlers = new Map(); // page → handler
  }

  /**
   * Playwright-Page mit Auto-Dialog-Behandlung registrieren.
   */
  attachToPage(page) {
    if (this._dialogHandlers.has(page)) return; // already attached

    const handler = async (dialog) => {
      const { action, promptText } = this._resolveAction(dialog.message(), dialog.type());
      try {
        if (action === "accept") {
          await dialog.accept(promptText);
        } else {
          await dialog.dismiss();
        }
        this._addLog({ type: dialog.type(), message: dialog.message(), action });
      } catch (e) {
        // Dialog already handled or page closed
      }
    };

    page.on("dialog", handler);
    this._dialogHandlers.set(page, handler);
  }

  /**
   * Listener von Page entfernen.
   */
  detachFromPage(page) {
    const handler = this._dialogHandlers.get(page);
    if (handler) {
      page.off("dialog", handler);
      this._dialogHandlers.delete(page);
    }
  }

  /**
   * Versucht HTML-<dialog>-Elemente auf der Seite zu schließen.
   */
  async closeHtmlDialogs(page, preferAction = "accept") {
    try {
      const count = await page.evaluate((action) => {
        const dialogs = Array.from(document.querySelectorAll("dialog[open]"));
        let closed = 0;
        dialogs.forEach((dialog) => {
          const acceptSel = ["button.btn-primary", "button[type=submit]", "button.confirm", "button.ok"];
          const dismissSel = ["button.btn-secondary", "button.cancel", "button.close"];
          const selectors = action === "accept" ? acceptSel : dismissSel;
          const fallback  = action === "accept" ? dismissSel : acceptSel;

          let btn = null;
          for (const sel of [...selectors, ...fallback]) {
            btn = dialog.querySelector(sel);
            if (btn) break;
          }
          if (!btn) btn = dialog.querySelector("button");

          if (btn) { btn.click(); }
          else { dialog.close(); }
          closed++;
        });
        return closed;
      }, preferAction);

      if (count > 0) {
        this._addLog({ type: "html-dialog", message: `${count} dialog(s) closed`, action: preferAction });
      }
      return count;
    } catch {
      return 0;
    }
  }

  getLog() { return [...this.log]; }
  clearLog() { this.log = []; }

  addRule(pattern, action, promptText) {
    this.rules.unshift({ pattern, action, promptText });
  }

  _resolveAction(message, type) {
    if (type === "alert") return { action: "accept" };
    if (type === "beforeunload") return { action: "dismiss" };
    for (const rule of this.rules) {
      if (rule.pattern.test(message)) {
        return { action: rule.action, promptText: rule.promptText };
      }
    }
    return { action: this.defaultAction };
  }

  _addLog(entry) {
    this.log.push({ ...entry, timestamp: new Date().toISOString() });
    if (this.log.length > this.maxLogEntries) {
      this.log.splice(0, this.log.length - this.maxLogEntries);
    }
  }
}

const popupHandler = new PopupHandler();

module.exports = { PopupHandler, popupHandler };
