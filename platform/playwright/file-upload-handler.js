/**
 * file-upload-handler.js
 * Hilfsfunktionen für Datei-Upload im CRM via Playwright.
 * JavaScript-Port basierend auf file-upload.ts aus src/.
 */

"use strict";

const path = require("path");
const fs   = require("fs/promises");

/**
 * Datei in ein Datei-Input-Feld hochladen.
 *
 * @param {import('playwright').Page} page - Aktive Playwright-Seite
 * @param {string} selector - CSS-Selektor des <input type="file"> Elements
 * @param {string} filePath - Absoluter Pfad zur hochzuladenden Datei
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function uploadFile(page, selector, filePath) {
  try {
    // Datei existenz prüfen
    await fs.access(filePath);

    const input = page.locator(selector).first();
    await input.setInputFiles(filePath);

    return { success: true, file: path.basename(filePath) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Base64-kodierten Inhalt als temporäre Datei speichern und hochladen.
 *
 * @param {import('playwright').Page} page
 * @param {string} selector
 * @param {string} base64Content - Base64-kodierter Dateiinhalt
 * @param {string} filename - Dateiname
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function uploadBase64File(page, selector, base64Content, filename) {
  const tmpDir  = path.join(__dirname, "data", "uploads");
  const tmpPath = path.join(tmpDir, `upload_${Date.now()}_${filename}`);

  try {
    await fs.mkdir(tmpDir, { recursive: true });
    const buffer = Buffer.from(base64Content, "base64");
    await fs.writeFile(tmpPath, buffer);

    const result = await uploadFile(page, selector, tmpPath);
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    // Temp-Datei aufräumen
    fs.unlink(tmpPath).catch(() => {});
  }
}

/**
 * Wartet auf einen Datei-Download und gibt den Pfad zurück.
 *
 * @param {import('playwright').Page} page
 * @param {Function} triggerFn - Funktion die den Download auslöst
 * @param {string} saveDir - Verzeichnis zum Speichern
 * @returns {Promise<{success: boolean, filePath?: string, filename?: string, error?: string}>}
 */
async function waitForDownload(page, triggerFn, saveDir) {
  try {
    const downloadDir = saveDir || path.join(__dirname, "data", "downloads");
    await fs.mkdir(downloadDir, { recursive: true });

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      triggerFn(),
    ]);

    const filename    = download.suggestedFilename();
    const savePath    = path.join(downloadDir, `${Date.now()}_${filename}`);
    await download.saveAs(savePath);

    return { success: true, filePath: savePath, filename };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { uploadFile, uploadBase64File, waitForDownload };
