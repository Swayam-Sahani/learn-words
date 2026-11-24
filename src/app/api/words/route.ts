import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const SHEET_ID = process.env.GOOGLE_SHEETS_ID || "1AhrQTkYpjUI2ocBYp6roKPzb6mXW5R43kzHdCegcZpI";
const SHEET_GID = process.env.GOOGLE_SHEETS_GID || "335883043";

type Cell = { v?: string | number | boolean | null; f?: string } | null;
type GvizTable = { cols: { label?: string; id?: string }[]; rows: { c?: Cell[] }[] };
type GvizResponse = { status?: string; errors?: { detailed_message?: string }[]; table?: GvizTable };
const cellText = (cell?: Cell) => cell?.f ?? (cell?.v == null ? "" : String(cell.v));

function parseGviz(body: string): GvizResponse {
  const start = body.indexOf("(");
  const end = body.lastIndexOf(")");
  if (start < 0 || end <= start) throw new Error("Google Sheets returned an unreadable response.");
  return JSON.parse(body.slice(start + 1, end)) as GvizResponse;
}

export async function GET() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${encodeURIComponent(SHEET_GID)}&tqx=out:json`;
    const response = await fetch(url, { cache: "no-store", headers: { Accept: "text/plain" } });
    if (!response.ok) return NextResponse.json({ error: `Google Sheets responded with ${response.status}. Confirm link sharing is set to Viewer.` }, { status: 502 });
    const result = parseGviz(await response.text());
    if (result.status === "error") return NextResponse.json({ error: result.errors?.[0]?.detailed_message || "Google Sheets could not read this tab." }, { status: 502 });
    const table = result.table;
    if (!table) return NextResponse.json({ error: "The selected Google Sheets tab is empty." }, { status: 502 });

    const firstRow = table.rows[0]?.c?.map(cellText) ?? [];
    const labels = table.cols.map((column, index) => column.label?.trim() || firstRow[index] || "");
    const headerPattern = /^(word|word \/ phrase|vocabulary|term)$/i;
    let wordCol = labels.findIndex((label) => headerPattern.test(label.trim()));
    let hasHeaderRow = false;
    if (wordCol < 0) {
      wordCol = firstRow.findIndex((label) => headerPattern.test(label.trim()));
      hasHeaderRow = wordCol >= 0;
    } else if (headerPattern.test(firstRow[wordCol]?.trim() || "")) hasHeaderRow = true;
    if (wordCol < 0) wordCol = 0;
    const meaningPattern = /^meaning( \(simple\))?$/i;
    let meaningCol = labels.findIndex((label) => meaningPattern.test(label.trim()));
    if (meaningCol < 0 && hasHeaderRow) meaningCol = firstRow.findIndex((label) => meaningPattern.test(label.trim()));
    if (meaningCol < 0) meaningCol = 1;
    const phrasePattern = /^(phrase|example|sentence)(\s*\d+)?/i;
    let phraseColumns = labels.map((label, index) => phrasePattern.test(label.trim()) ? index : -1).filter((index) => index >= 0);
    if (!phraseColumns.length && hasHeaderRow) phraseColumns = firstRow.map((label, index) => phrasePattern.test(label.trim()) ? index : -1).filter((index) => index >= 0);
    if (!phraseColumns.length) phraseColumns = [2, 3, 4, 5, 6];
    let statusCol = labels.findIndex((label) => /^status$/i.test(label.trim()));
    if (statusCol < 0 && hasHeaderRow) statusCol = firstRow.findIndex((label) => /^status$/i.test(label.trim()));
    const rows = hasHeaderRow ? table.rows.slice(1) : table.rows;
    const words = rows.map((row, index) => {
      const cells = row.c ?? [];
      const word = cellText(cells[wordCol]).trim();
      if (!word || headerPattern.test(word)) return null;
      return { id: `sheet-${index + 2}`, sheetRow: index + 2, word, meaning: cellText(cells[meaningCol]).trim(), sentence: phraseColumns.map((column) => cellText(cells[column]).trim()).filter(Boolean).join("\n"), pos: "", done: statusCol >= 0 && /^done$/i.test(cellText(cells[statusCol]).trim()) };
    }).filter((word): word is NonNullable<typeof word> => word !== null);
    return NextResponse.json({ words, source: "google-sheets", count: words.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not connect to Google Sheets." }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const endpoint = process.env.GOOGLE_APPS_SCRIPT_URL;
  const token = process.env.GOOGLE_APPS_SCRIPT_TOKEN;
  if (!endpoint || !token) return NextResponse.json({ error: "Google Sheets is connected for reading. To save changes back, deploy the Apps Script bridge and set GOOGLE_APPS_SCRIPT_URL and GOOGLE_APPS_SCRIPT_TOKEN." }, { status: 503 });
  try {
    const body = await request.json() as { updates?: { rowNumber: number; meaning?: string; sentences?: string[]; done?: boolean }[] };
    if (!Array.isArray(body.updates) || body.updates.some((item) => !Number.isInteger(item.rowNumber) || item.rowNumber < 2)) return NextResponse.json({ error: "Invalid Google Sheets row update." }, { status: 400 });
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, updates: body.updates }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) return NextResponse.json({ error: result.error || "The Apps Script bridge could not update the sheet." }, { status: 502 });
    return NextResponse.json({ ok: true, updated: result.updated ?? body.updates.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update Google Sheets." }, { status: 502 });
  }
}
