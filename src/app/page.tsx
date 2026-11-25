"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AudioLessons from "./AudioLessons";

type Word = { id: string; sheetRow: number; word: string; meaning: string; sentence: string; pos: string; done: boolean };
type SheetCell = { v?: unknown; f?: string } | null;
type SheetResponse = { status?: string; errors?: { detailed_message?: string }[]; table?: { cols: { label?: string }[]; rows: { c?: SheetCell[] }[] } };
const PROGRESS_KEY = "wordwise-progress-v2";
const OVERRIDES_KEY = "wordwise-overrides-v1";
const THEME_KEY = "wordwise-theme-v1";
const SHEET_ID = "1AhrQTkYpjUI2ocBYp6roKPzb6mXW5R43kzHdCegcZpI";
const SHEET_GID = "335883043";

function sheetRows(result: SheetResponse): Word[] {
  if (result.status === "error") throw new Error(result.errors?.[0]?.detailed_message || "Google Sheets could not read this tab.");
  const table = result.table;
  if (!table) throw new Error("No data was returned from Google Sheets.");
  const value = (cell?: SheetCell) => cell?.f ?? (cell?.v == null ? "" : String(cell.v));
  const firstRow = table.rows[0]?.c?.map(value) ?? [];
  const labels = table.cols.map((column, index) => column.label?.trim() || firstRow[index] || "");
  const wordHeader = /^(word|word \/ phrase|vocabulary|term)$/i;
  let wordCol = labels.findIndex((label) => wordHeader.test(label.trim()));
  let header = false;
  if (wordCol < 0) { wordCol = firstRow.findIndex((label) => wordHeader.test(label.trim())); header = wordCol >= 0; }
  else header = wordHeader.test(firstRow[wordCol]?.trim() || "");
  if (wordCol < 0) wordCol = 0;
  const meaningPattern = /^meaning( \(simple\))?$/i;
  let meaningCol = labels.findIndex((label) => meaningPattern.test(label.trim()));
  if (meaningCol < 0 && header) meaningCol = firstRow.findIndex((label) => meaningPattern.test(label.trim()));
  if (meaningCol < 0) meaningCol = 1;
  const phrasePattern = /^(phrase|example|sentence)(\s*\d+)?/i;
  let phraseCols = labels.map((label, index) => phrasePattern.test(label.trim()) ? index : -1).filter((index) => index >= 0);
  if (!phraseCols.length && header) phraseCols = firstRow.map((label, index) => phrasePattern.test(label.trim()) ? index : -1).filter((index) => index >= 0);
  if (!phraseCols.length) phraseCols = [2, 3, 4, 5, 6];
  let statusCol = labels.findIndex((label) => /^status$/i.test(label.trim()));
  if (statusCol < 0 && header) statusCol = firstRow.findIndex((label) => /^status$/i.test(label.trim()));
  return (header ? table.rows.slice(1) : table.rows).map((row, index) => {
    const cells = row.c ?? [];
    const word = value(cells[wordCol]).trim();
    if (!word || wordHeader.test(word)) return null;
    return { id: `sheet-${index + 2}`, sheetRow: index + 2, word, meaning: value(cells[meaningCol]).trim(), sentence: phraseCols.map((col) => value(cells[col]).trim()).filter(Boolean).join("\n"), pos: "", done: statusCol >= 0 && /^done$/i.test(value(cells[statusCol]).trim()) };
  }).filter((word): word is NonNullable<typeof word> => word !== null);
}

function readSheetInBrowser(): Promise<Word[]> {
  return new Promise((resolve, reject) => {
    const holder = window as Window & { google?: { visualization?: { Query?: { setResponse?: (response: SheetResponse) => void } } } };
    const oldGoogle = holder.google;
    const script = document.createElement("script");
    let timer: number;
    const cleanup = () => { window.clearTimeout(timer); script.remove(); holder.google = oldGoogle; };
    holder.google = { visualization: { Query: { setResponse: (response) => { cleanup(); try { resolve(sheetRows(response)); } catch (error) { reject(error); } } } } };
    script.onerror = () => { cleanup(); reject(new Error("Could not reach the public Google Sheet. Check that link sharing allows viewing.")); };
    timer = window.setTimeout(() => { cleanup(); reject(new Error("Timed out reading Google Sheets.")); }, 20000);
    script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${SHEET_GID}&tqx=out:json;responseHandler=google.visualization.Query.setResponse`;
    document.head.appendChild(script);
  });
}

export default function Home() {
  const [words, setWords] = useState<Word[]>([]);
  const [day, setDay] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [toast, setToast] = useState("");
  const [editing, setEditing] = useState<Word | null>(null);
  const [today, setToday] = useState("");
  const [saving, setSaving] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
    setTheme(savedTheme);
    document.documentElement.dataset.theme = savedTheme;
    setToday(new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date()));
    let savedProgress: Record<string, boolean> = {};
    let savedOverrides: Record<string, Partial<Word>> = {};
    try { savedProgress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}"); savedOverrides = JSON.parse(localStorage.getItem(OVERRIDES_KEY) || "{}"); } catch { /* Ignore invalid browser state. */ }
    fetch("/api/words", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not read the Google Sheet.");
        return result.words as Word[];
      })
      .then((items) => setWords(items.map((item) => { const key = String(item.sheetRow); const override = savedOverrides[key]; return { ...item, ...(override || {}), done: typeof override?.done === "boolean" ? override.done : (savedProgress[key] ?? item.done) }; })))
      .catch(() => readSheetInBrowser()
        .then((items) => setWords(items.map((item) => { const key = String(item.sheetRow); const override = savedOverrides[key]; return { ...item, ...(override || {}), done: typeof override?.done === "boolean" ? override.done : (savedProgress[key] ?? item.done) }; })))
        .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "Could not read the Google Sheet.")))
      .finally(() => setLoading(false));
  }, []);
  function toggleTheme() {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    localStorage.setItem(THEME_KEY, nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 3500); return () => window.clearTimeout(timer); }, [toast]);

  const totalDays = Math.ceil(words.length / 5);
  const selectedDay = Math.min(day, Math.max(totalDays, 1));
  const todaysWords = useMemo(() => words.slice((selectedDay - 1) * 5, selectedDay * 5), [words, selectedDay]);
  const doneCount = words.filter((word) => word.done).length;
  const percent = words.length ? Math.round(doneCount / words.length * 100) : 0;

  async function writeToSheet(row: Word, update: { meaning?: string; sentences?: string[]; done?: boolean }) {
    try {
      const response = await fetch("/api/words", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ updates: [{ rowNumber: row.sheetRow, ...update }] }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The Google Sheet could not be updated.");
      const overrides = JSON.parse(localStorage.getItem(OVERRIDES_KEY) || "{}");
      delete overrides[String(row.sheetRow)];
      localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
      return true;
    } catch (error) {
      setToast(error instanceof Error ? error.message : "The Google Sheet could not be updated.");
      return false;
    }
  }

  async function toggleDone(id: string) {
    const word = words.find((item) => item.id === id);
    if (!word) return;
    const done = !word.done;
    setWords((current) => current.map((item) => item.id === id ? { ...item, done } : item));
    const nextProgress = Object.fromEntries(words.map((item) => [String(item.sheetRow), item.id === id ? done : item.done]));
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(nextProgress));
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(OVERRIDES_KEY) || "{}"), [String(word.sheetRow)]: { done } }));
    const synced = await writeToSheet(word, { done });
    if (synced) setToast(done ? "Marked done and synced to Google Sheets" : "Reopened and synced to Google Sheets");
  }

  async function saveWord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const updated = { ...editing, word: String(form.get("word") || editing.word).trim(), meaning: String(form.get("meaning") || "").trim(), sentence: String(form.get("sentence") || "").trim(), done: form.get("done") === "true" };
    const previous = words.find((item) => item.id === editing.id);
    setWords((current) => current.map((item) => item.id === editing.id ? updated : item));
    const nextProgress = Object.fromEntries(words.map((item) => [String(item.sheetRow), item.id === editing.id ? updated.done : item.done]));
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(nextProgress));
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(OVERRIDES_KEY) || "{}"), [String(updated.sheetRow)]: { meaning: updated.meaning, sentence: updated.sentence, done: updated.done } }));
    setSaving(true);
    const synced = await writeToSheet(updated, { meaning: updated.meaning, sentences: updated.sentence.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 5), done: updated.done });
    setSaving(false);
    setEditing(null);
    if (synced) setToast("Meaning, examples, and status updated in Google Sheets");
    else if (previous) setToast("Changes are saved in this browser. Configure the Google Sheets write bridge to sync them.");
  }

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#" aria-label="Wordwise home"><span className="brand-icon"><img className="brand-image" src="/wordwise-mark.svg" alt="" width="40" height="40" /></span><span>wordwise</span></a><div className="top-right"><Link className="site-nav-link" href="/focus">Focus timer</Link><span>Live from your Google Sheet</span><button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`} aria-pressed={theme === "dark"}>{theme === "light" ? "☾ Dark mode" : "☀ Light mode"}</button><div className="avatar">W</div></div></header>
    <main className="layout">
      <aside className="sidebar"><div className="eyebrow">Your study plan</div><div className="side-title">Learning days <span>{totalDays || ""}</span></div>
        <nav className="day-list" aria-label="Study days">{Array.from({ length: totalDays }, (_, index) => { const number = index + 1; const group = words.slice(index * 5, index * 5 + 5); const complete = group.length > 0 && group.every((item) => item.done); return <button key={number} className={`day-link ${selectedDay === number ? "active" : ""}`} onClick={() => { setDay(number); window.scrollTo({ top: 0, behavior: "smooth" }); }}><span className="day-num">{number}</span><span>Day {number}</span><span className="day-status">{complete ? "✓" : ""}</span></button>; })}</nav>
      </aside>
      <section className="content">
        <AudioLessons />
        <div className="welcome"><div><div className="eyebrow">A little practice goes a long way</div><h1>{loading ? "Connecting to your words…" : words.length ? `Day ${selectedDay}, let's learn` : "Your vocabulary habit"}</h1><p>{loading ? "Reading the linked Google Sheet." : words.length ? "Five useful words, one day at a time." : "Your words will appear here directly from Google Sheets."}</p></div><div className="date-label">{today}</div></div>
        {loading ? <div className="empty-state"><div className="empty-icon" aria-hidden="true">↻</div><h3>Loading your sheet</h3><p>Getting your word list from Google Sheets…</p></div> : loadError ? <div className="empty-state"><div className="empty-icon" aria-hidden="true">!</div><h3>Could not connect to the sheet</h3><p>{loadError}</p><button className="primary-btn" onClick={() => window.location.reload()}>Try again</button></div> : words.length ? <>
          <div className="progress-card"><div className="progress-copy"><div className="eyebrow">Your progress</div><h2>{doneCount} of {words.length} words learned</h2><p>Keep going — small steps add up.</p></div><div className="progress-right"><div className="progress-ring" style={{ "--progress": `${percent}%` } as React.CSSProperties}><span>{percent}%</span></div><div className="progress-stat"><strong>{totalDays}</strong><small>study days</small></div></div></div>
          <div className="section-head"><h2>Today's words</h2><span>{todaysWords.filter((item) => item.done).length} of {todaysWords.length} marked done</span></div>
          <div className="word-list">{todaysWords.map((item, index) => <article className={`word-card ${item.done ? "is-done" : ""}`} key={item.id}><div className="word-top"><div className="word-index">{String((selectedDay - 1) * 5 + index + 1).padStart(2, "0")}</div><div className="word-main"><div className="word-line"><span className="word-name">{item.word}</span>{item.pos && <span className="part-speech">{item.pos}</span>}</div><p className="word-definition">{item.meaning || "Meaning not added yet — tap edit to fill this in."}</p><div className="word-sentence"><b>Say it:</b>{item.sentence ? <span className="sentence-lines">{item.sentence}</span> : <span> No examples yet — tap edit to add a speaking sentence.</span>}</div></div><div className="word-actions"><button className="icon-btn" title="Edit word" aria-label={`Edit ${item.word}`} onClick={() => setEditing(item)}>✎</button><button className={`done-btn ${item.done ? "done" : ""}`} onClick={() => void toggleDone(item.id)}>{item.done ? "✓ Done" : "Mark done"}</button></div></div></article>)}</div>
          <div className="day-footer"><p>{selectedDay < totalDays ? `Next up: Day ${selectedDay + 1}` : "That’s your full list — great work!"}</p><button className="next-btn" disabled={selectedDay >= totalDays} onClick={() => { setDay(selectedDay + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Next day <span aria-hidden="true">→</span></button></div>
        </> : <div className="empty-state"><div className="empty-icon" aria-hidden="true">▤</div><h3>No words found</h3><p>The Google Sheet connection worked, but there were no vocabulary rows to show.</p></div>}
      </section>
    </main>

    {editing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditing(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><h2 id="modal-title">Edit sheet row</h2><button className="close-btn" aria-label="Close" disabled={saving} onClick={() => setEditing(null)}>×</button></div><form onSubmit={(event) => void saveWord(event)}><label className="field-label" htmlFor="editWord">Word</label><input className="field" id="editWord" name="word" defaultValue={editing.word} /><label className="field-label" htmlFor="editMeaning">Simple meaning</label><textarea className="field" id="editMeaning" name="meaning" rows={3} defaultValue={editing.meaning} placeholder="A short, simple definition" /><label className="field-label" htmlFor="editSentence">Speaking examples <span className="optional">(one per line, up to five)</span></label><textarea className="field" id="editSentence" name="sentence" rows={5} defaultValue={editing.sentence} placeholder="I used the word naturally in a sentence today." /><label className="field-label" htmlFor="editDone">Status</label><select className="field" id="editDone" name="done" defaultValue={String(editing.done)}><option value="false">Still learning</option><option value="true">Done</option></select><div className="modal-actions"><button type="button" className="secondary-btn" disabled={saving} onClick={() => setEditing(null)}>Cancel</button><button className="primary-btn" type="submit" disabled={saving}>{saving ? "Saving…" : "Update Google Sheet"}</button></div></form></section></div>}
    <div className={`toast ${toast ? "show" : ""}`} role="status">{toast}</div>
  </div>;
}
