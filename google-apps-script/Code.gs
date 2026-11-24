// Paste into Extensions → Apps Script in the vocabulary Google Sheet.
// Replace API_TOKEN with a long random value, then deploy as a Web app that
// executes as you. Keep the deployment URL and token in server-side env vars.
const SPREADSHEET_ID = "1AhrQTkYpjUI2ocBYp6roKPzb6mXW5R43kzHdCegcZpI";
const SHEET_GID = 335883043;
const API_TOKEN = "REPLACE_WITH_A_LONG_RANDOM_SECRET";

function doPost(e) {
  try {
    const request = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (request.token !== API_TOKEN) return json({ error: "Unauthorized" });
    if (!Array.isArray(request.updates)) return json({ error: "Missing updates" });
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets().find((tab) => tab.getSheetId() === SHEET_GID);
    if (!sheet) return json({ error: "Vocabulary tab not found" });
    const statusColumn = 8;
    if (sheet.getRange(1, statusColumn).getValue() !== "Status") sheet.getRange(1, statusColumn).setValue("Status");
    request.updates.forEach((update) => {
      const row = Number(update.rowNumber);
      if (!Number.isInteger(row) || row < 2 || row > sheet.getLastRow()) throw new Error("Invalid row number");
      const existing = sheet.getRange(row, 2, 1, 7).getValues()[0]; // B:H: meaning, five examples, status
      const phrases = Array.isArray(update.sentences) ? update.sentences.slice(0, 5) : existing.slice(1, 6);
      sheet.getRange(row, 2, 1, 7).setValues([[
        update.meaning == null ? existing[0] : String(update.meaning),
        ...Array.from({ length: 5 }, (_, i) => phrases[i] || ""),
        update.done == null ? existing[6] : (update.done ? "Done" : "Learning"),
      ]]);
    });
    return json({ ok: true, updated: request.updates.length });
  } catch (error) {
    return json({ error: error && error.message ? error.message : String(error) });
  }
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
