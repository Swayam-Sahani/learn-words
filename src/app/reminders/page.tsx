"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import Navigation from "../Navigation";

type Reminder = { id: string; title: string; dueAt: string; completed: boolean; notified: boolean };
type RecognitionResult = { transcript: string };
type RecognitionEvent = { results: ArrayLike<ArrayLike<RecognitionResult>> };
type SpeechRecognitionLike = {
  lang: string; interimResults: boolean; maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
  start: () => void; stop: () => void;
};
type RecognitionWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };

const STORAGE_KEY = "wordwise-reminders-v1";
const THEME_KEY = "wordwise-theme-v1";

function makeId() { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function toLocalDateTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function spokenDateTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function parseVoiceCommand(command: string) {
  let text = command.trim().replace(/^(hey\s+)?(please\s+)?(remind me to|remind me|set (?:a )?reminder(?: to)?|add (?:a )?reminder(?: to)?|create (?:a )?reminder(?: to)?|remember to)\s*/i, "");
  const now = new Date();
  const due = new Date(now);
  due.setSeconds(0, 0);
  let dateFound = false;
  let explicitDate = false;

  const relative = text.match(/\b(day after tomorrow|tomorrow|today)\b/i);
  if (relative) {
    if (/day after/i.test(relative[0])) due.setDate(due.getDate() + 2);
    if (/tomorrow/i.test(relative[0])) due.setDate(due.getDate() + 1);
    text = text.replace(relative[0], " ");
    dateFound = true;
  } else {
    const weekdayMatch = text.match(/\b(?:(next)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
    if (weekdayMatch) {
      const weekday = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(weekdayMatch[2].toLowerCase());
      let days = (weekday - due.getDay() + 7) % 7;
      if (days === 0 && weekdayMatch[1]) days = 7;
      due.setDate(due.getDate() + days);
      text = text.replace(weekdayMatch[0], " ");
      dateFound = true;
    } else {
      const monthMatch = text.match(/\b(?:on\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i);
      if (monthMatch) {
        const monthIndex = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].findIndex((prefix) => monthMatch[1].toLowerCase().startsWith(prefix));
        const year = Number(monthMatch[3] || now.getFullYear());
        due.setFullYear(year, monthIndex, Number(monthMatch[2]));
        if (!monthMatch[3] && due < now) due.setFullYear(year + 1);
        text = text.replace(monthMatch[0], " ");
        dateFound = true;
        explicitDate = true;
      } else {
        const numericDate = text.match(/\b(?:on\s+)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
        if (numericDate) {
          const yearValue = numericDate[3] ? Number(numericDate[3]) : now.getFullYear();
          const year = yearValue < 100 ? 2000 + yearValue : yearValue;
          // Numeric dates are read as day/month, matching the common format in India.
          due.setFullYear(year, Number(numericDate[2]) - 1, Number(numericDate[1]));
          if (!numericDate[3] && due < now) due.setFullYear(year + 1);
          text = text.replace(numericDate[0], " ");
          dateFound = true;
          explicitDate = true;
        }
      }
    }
  }

  const timeMatch = text.match(/\b(?:at|around|by)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/i);
  let timeFound = false;
  if (timeMatch) {
    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2] || 0);
    const meridiem = timeMatch[3]?.toLowerCase().replaceAll(".", "");
    if (minute < 60 && hour <= (meridiem ? 12 : 23)) {
      if (meridiem === "pm" && hour < 12) hour += 12;
      if (meridiem === "am" && hour === 12) hour = 0;
      due.setHours(hour, minute, 0, 0);
      text = text.replace(timeMatch[0], " ");
      timeFound = true;
    }
  }

  const title = text.replace(/\b(on|at|for|please)\b/gi, " ").replace(/[,.!?]+/g, " ").replace(/\s+/g, " ").trim();
  const complete = dateFound && timeFound && due.getTime() > now.getTime();
  return { title, dueAt: complete ? due.toISOString() : "", dateFound, timeFound, explicitDate };
}

export default function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const remindersRef = useRef<Reminder[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftWhen, setDraftWhen] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  function saveReminders(next: Reminder[]) {
    remindersRef.current = next;
    setReminders(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { setError("Could not save reminders in this browser."); }
  }

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as Reminder[];
      if (Array.isArray(stored)) { remindersRef.current = stored; setReminders(stored); }
    } catch { /* Start with an empty list if saved reminder data is invalid. */ }
    const savedTheme = localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
    setTheme(savedTheme);
    document.documentElement.dataset.theme = savedTheme;
    setPermission("Notification" in window ? Notification.permission : "unsupported");
    const speechWindow = window as RecognitionWindow;
    setVoiceSupported(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));
    setReady(true);
  }, []);

  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = navigator.language || "en-US";
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (!ready) return;
    const checkDueReminders = () => {
      const now = Date.now();
      const dueNow = remindersRef.current.filter((reminder) => !reminder.completed && !reminder.notified && new Date(reminder.dueAt).getTime() <= now);
      if (!dueNow.length) return;
      dueNow.forEach((reminder) => {
        if (permission === "granted" && "Notification" in window) {
          const popup = new Notification(reminder.title, { body: "Your Wordwise reminder is due now.", icon: "/icon.svg", tag: `wordwise-${reminder.id}`, requireInteraction: true });
          popup.onclick = () => { window.focus(); popup.close(); };
        }
        speak(`Reminder. ${reminder.title}`);
      });
      const ids = new Set(dueNow.map((reminder) => reminder.id));
      saveReminders(remindersRef.current.map((reminder) => ids.has(reminder.id) ? { ...reminder, notified: true } : reminder));
      setNotice(dueNow.length === 1 ? `Reminder: ${dueNow[0].title}` : `${dueNow.length} reminders are due now.`);
    };
    checkDueReminders();
    const timer = window.setInterval(checkDueReminders, 1000);
    return () => window.clearInterval(timer);
  }, [ready, permission]);

  const sortedReminders = useMemo(() => [...reminders].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()), [reminders]);
  const upcoming = sortedReminders.filter((reminder) => !reminder.completed);
  const completed = sortedReminders.filter((reminder) => reminder.completed);
  const nextReminder = upcoming.find((reminder) => new Date(reminder.dueAt).getTime() > Date.now());

  function addReminder(title: string, dueAt: string) {
    const due = new Date(dueAt);
    if (!title.trim()) { setError("Add a short task name first."); return false; }
    if (!Number.isFinite(due.getTime()) || due.getTime() <= Date.now()) { setError("Choose a date and time in the future."); return false; }
    const next = [...remindersRef.current, { id: makeId(), title: title.trim(), dueAt: due.toISOString(), completed: false, notified: false }];
    saveReminders(next);
    setDraftTitle("");
    setDraftWhen("");
    setError("");
    setNotice(`Reminder set for ${spokenDateTime(due)}.`);
    speak(`Reminder set. ${title.trim()}. ${spokenDateTime(due)}.`);
    return true;
  }

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addReminder(draftTitle, draftWhen);
  }

  async function enableNotifications() {
    if (permission === "denied") {
      setNotice("In Chrome, open the tune or lock icon beside the address, set Notifications to Allow, then reload this page.");
      return;
    }
    if (!("Notification" in window)) { setPermission("unsupported"); return; }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      setNotice(result === "granted" ? "Browser notifications are on. Reminders will appear as popups." : "Notifications were not allowed. You can still see reminders while this page is open.");
    } catch { setNotice("Could not request notification permission in this browser."); }
  }

  function handleVoice() {
    const speechWindow = window as RecognitionWindow;
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) { setVoiceSupported(false); setError("Voice input is not available in this browser. You can type your reminder below."); return; }
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() || "";
      if (!transcript) { setError("I didn’t catch that. Try again or type the reminder."); return; }
      const parsed = parseVoiceCommand(transcript);
      setDraftTitle(parsed.title);
      setError("");
      if (parsed.dueAt) {
        addReminder(parsed.title || transcript, toLocalDateTime(new Date(parsed.dueAt)));
      } else {
        setNotice(parsed.dateFound || parsed.timeFound ? `Heard “${parsed.title || transcript}”. Add the missing date or time, then save.` : `Heard “${parsed.title || transcript}”. Say a date and time, or choose them below.`);
      }
    };
    recognition.onerror = () => { setError("Voice input couldn’t start. Check microphone permission, or type your reminder instead."); setListening(false); };
    recognition.onend = () => setListening(false);
    setNotice("Listening. Try: “Remind me to call Mum tomorrow at 7 PM.”");
    setError("");
    setListening(true);
    try { recognition.start(); } catch { setListening(false); setError("Could not start the microphone. Please try again."); }
  }

  function updateReminder(id: string, update: Partial<Reminder>) {
    saveReminders(remindersRef.current.map((reminder) => reminder.id === id ? { ...reminder, ...update } : reminder));
  }

  function snooze(reminder: Reminder) {
    const newDue = new Date(Date.now() + 10 * 60 * 1000);
    updateReminder(reminder.id, { dueAt: newDue.toISOString(), notified: false });
    setNotice(`Snoozed “${reminder.title}” for 10 minutes.`);
  }

  function removeReminder(id: string) {
    saveReminders(remindersRef.current.filter((reminder) => reminder.id !== id));
  }

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
    document.documentElement.dataset.theme = next;
  }

  return (
    <main className="reminder-page">
      <div className="reminder-shell">
        <header className="topbar reminder-topbar">
          <Link className="brand" href="/" aria-label="Wordwise home"><span className="brand-icon"><img className="brand-image" src="/wordwise-mark.svg" alt="" width="40" height="40" /></span><span>wordwise</span></Link>
          <Navigation current="/reminders" theme={theme} onToggleTheme={toggleTheme} className="reminder-nav" />
        </header>

        <section className="reminder-hero">
          <div className="reminder-heading"><span className="reminder-eyebrow"><i /> YOUR DAY, RIGHT ON TIME</span><h1>Remember the <em>important things.</em></h1><p>Say it or type it. We’ll give you a nudge when it’s time.</p></div>
          <div className="reminder-next-card"><span className="reminder-next-icon">◷</span><div><small>NEXT REMINDER</small><strong>{nextReminder ? spokenDateTime(new Date(nextReminder.dueAt)) : "Nothing scheduled yet"}</strong><span>{nextReminder?.title ?? "Add a task to get started"}</span></div></div>
        </section>

        <section className="notification-banner" aria-live="polite">
          <div className={`notification-status-icon ${permission === "granted" ? "enabled" : ""}`}>{permission === "granted" ? "✓" : "◉"}</div>
          <div className="notification-copy"><strong>{permission === "granted" ? "Browser popups are enabled" : permission === "denied" ? "Browser notifications are blocked" : permission === "unsupported" ? "Notifications unavailable in this browser" : "Turn on browser notifications"}</strong><span>{permission === "granted" ? "We’ll show a popup when a reminder is due while this page is open." : permission === "denied" ? "Change this site’s notification permission in your browser settings." : "Allow notifications so your reminders can pop up over other tabs."}</span></div>
          {permission !== "granted" && permission !== "unsupported" && <button className="notification-enable" type="button" onClick={enableNotifications}>{permission === "denied" ? "How to enable" : "Enable popups"}</button>}
        </section>

        {notice && <div className="reminder-toast" role="status"><span>✦</span>{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice("")}>×</button></div>}

        <section className="reminder-workspace">
          <div className="reminder-create-column">
            <div className="reminder-card voice-card">
              <div className="reminder-card-kicker"><span>01</span> QUICK ADD BY VOICE</div>
              <div className="voice-orb" aria-hidden="true"><span>{listening ? "◉" : "⌁"}</span></div>
              <h2>{listening ? "I’m listening…" : "Just say what you need."}</h2>
              <p>For example, “Remind me to call Mum tomorrow at 7 PM.”</p>
              <button className={listening ? "voice-button listening" : "voice-button"} type="button" onClick={handleVoice} disabled={!voiceSupported && ready}><span aria-hidden="true">{listening ? "■" : "🎙"}</span>{listening ? "Stop listening" : voiceSupported ? "Speak a reminder" : ready ? "Voice not supported" : "Checking microphone…"}</button>
              <span className="voice-language-note">{voiceSupported ? "Uses your browser’s speech recognition" : "Try Chrome, or enter a reminder by typing"}</span>
            </div>

            <form className="reminder-card manual-card" onSubmit={handleManualSubmit}>
              <div className="reminder-card-kicker"><span>02</span> ADD IT BY TYPING</div>
              <h2>Write a reminder</h2>
              <label className="reminder-field"><span>What do you need to do?</span><input type="text" value={draftTitle} maxLength={120} onChange={(event) => setDraftTitle(event.target.value)} placeholder="e.g. Send the project update" required /></label>
              <label className="reminder-field"><span>When should I remind you?</span><input type="datetime-local" value={draftWhen} onChange={(event) => setDraftWhen(event.target.value)} required /></label>
              {error && <div className="reminder-error" role="alert">{error}</div>}
              <button className="reminder-save-button" type="submit">＋ Save reminder</button>
            </form>
          </div>

          <section className="reminder-list-card" aria-label="Your reminders">
            <div className="reminder-list-head"><div><span className="reminder-card-kicker"><span>03</span> YOUR TASKS</span><h2>Coming up</h2></div><span className="reminder-count">{upcoming.length} active</span></div>
            {upcoming.length ? <div className="reminder-list">{upcoming.map((reminder) => {
              const due = new Date(reminder.dueAt);
              const isDue = reminder.notified || due.getTime() <= Date.now();
              return <article key={reminder.id} className={`reminder-item ${isDue ? "due" : ""}`}>
                <button className="reminder-check" type="button" aria-label={`Mark ${reminder.title} as complete`} onClick={() => updateReminder(reminder.id, { completed: true })} />
                <div className="reminder-item-copy"><h3>{reminder.title}</h3><span className={isDue ? "reminder-due-label" : ""}>{isDue ? "Due now" : spokenDateTime(due)}</span></div>
                {isDue && <button className="reminder-snooze" type="button" onClick={() => snooze(reminder)}>Snooze 10m</button>}
                <button className="reminder-delete" type="button" aria-label={`Delete ${reminder.title}`} onClick={() => removeReminder(reminder.id)}>×</button>
              </article>;
            })}</div> : <div className="reminder-empty"><div>◷</div><strong>Your list is clear.</strong><span>Use voice or type a task to add your first reminder.</span></div>}
            {!!completed.length && <details className="reminder-completed"><summary>Completed ({completed.length})</summary>{completed.map((reminder) => <article className="reminder-item completed" key={reminder.id}><button className="reminder-check checked" type="button" aria-label={`Reopen ${reminder.title}`} onClick={() => updateReminder(reminder.id, { completed: false, notified: false })}>✓</button><div className="reminder-item-copy"><h3>{reminder.title}</h3><span>{spokenDateTime(new Date(reminder.dueAt))}</span></div><button className="reminder-delete" type="button" aria-label={`Delete ${reminder.title}`} onClick={() => removeReminder(reminder.id)}>×</button></article>)}</details>}
          </section>
        </section>

        <footer className="reminder-footer"><span>Reminders are saved in this browser on this device.</span><span>Keep this page open in a browser tab for scheduled alerts.</span></footer>
      </div>
    </main>
  );
}
