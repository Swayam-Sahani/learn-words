"use client";

import lessons from "./audio-lessons.json";
import { useEffect, useMemo, useState } from "react";

type Lesson = (typeof lessons)[number];
const START_KEY = "wordwise-audio-start-v1";
const DONE_KEY = "wordwise-audio-done-v1";

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayNumber(start: string, now: Date) {
  const [year, month, day] = start.split("-").map(Number);
  const startUtc = Date.UTC(year, month - 1, day);
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(1, Math.floor((todayUtc - startUtc) / 86_400_000) + 1);
}

export default function AudioLessons() {
  const [unlockedDay, setUnlockedDay] = useState(1);
  const [selected, setSelected] = useState(1);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState<number[]>([]);
  const [startDate, setStartDate] = useState("");
  const [dateChoice, setDateChoice] = useState("");
  const [todayDate, setTodayDate] = useState("");
  const lesson = useMemo(() => lessons[selected - 1] as Lesson, [selected]);

  useEffect(() => {
    const today = dateKey(new Date());
    setTodayDate(today);
    const savedStart = localStorage.getItem(START_KEY);
    const start = savedStart && savedStart <= today ? savedStart : today;
    if (start !== savedStart) localStorage.setItem(START_KEY, start);
    setStartDate(start);
    setDateChoice(start);
    const available = Math.min(lessons.length, dayNumber(start, new Date()));
    setUnlockedDay(available);
    setSelected(available);
    try { setDone(JSON.parse(localStorage.getItem(DONE_KEY) || "[]")); } catch { setDone([]); }
    setReady(true);
  }, []);

  function markDone(day: number) {
    const updated = Array.from(new Set([...done, day]));
    setDone(updated);
    localStorage.setItem(DONE_KEY, JSON.stringify(updated));
  }

  function applyStartDate() {
    if (!dateChoice || dateChoice > dateKey(new Date())) return;
    localStorage.setItem(START_KEY, dateChoice);
    setStartDate(dateChoice);
    const available = Math.min(lessons.length, dayNumber(dateChoice, new Date()));
    setUnlockedDay(available);
    setSelected(available);
  }

  return <section className="audio-course" aria-labelledby="audio-title">
    <div className="audio-heading">
      <div><div className="eyebrow">Listen and learn</div><h2 id="audio-title">Daily audio lessons</h2><p>One new lesson unlocks each day. Listen while you walk, then review the words below.</p></div>
      <div className="audio-schedule"><div className="unlock-badge"><span className="unlock-dot" />{ready ? `Day ${unlockedDay} unlocked` : "Getting your lessons ready"}</div><label className="start-date-label" htmlFor="lessonStartDate">Choose your start date</label><div className="start-date-controls"><input id="lessonStartDate" aria-label="Choose your lesson start date" type="date" value={dateChoice} max={todayDate} disabled={!ready} onChange={(event) => setDateChoice(event.target.value)} /><button className="start-date-button" disabled={!ready || !dateChoice} onClick={applyStartDate}>Start learning</button></div></div>
    </div>
    <div className="audio-layout">
      <nav className="audio-days" aria-label="Audio lessons">
        {lessons.map((item) => {
          const open = item.day <= unlockedDay;
          return <button key={item.day} className={`audio-day ${item.day === selected ? "selected" : ""} ${!open ? "locked" : ""}`} disabled={!open || !ready} onClick={() => setSelected(item.day)}>
            <span className="audio-day-num">{open ? (done.includes(item.day) ? "✓" : String(item.day).padStart(2, "0")) : "🔒"}</span><span className="audio-day-info"><b>Day {item.day}</b><small>{item.words.length} words</small></span><span className="audio-day-arrow">{item.day === selected ? "●" : ""}</span>
          </button>;
        })}
      </nav>
      <div className="lesson-panel">
        <div className="lesson-panel-head"><div><span className="lesson-kicker">LESSON {String(lesson.day).padStart(2, "0")}</span><h3>Words {lesson.words[0]?.number}–{lesson.words.at(-1)?.number}</h3></div><span className="lesson-count">{lesson.words.length} words</span></div>
        <audio key={lesson.audio} className="lesson-player" controls preload="metadata" src={`/vocabulary/${lesson.audio}`} aria-label={`Day ${lesson.day} vocabulary audio`} onEnded={() => markDone(lesson.day)}>
          Your browser does not support audio playback.
        </audio>
        <div className="player-note"><span aria-hidden="true">♫</span> Audio keeps playing while this page stays open. Use your device’s media controls to pause or resume.</div>
        <div className="transcript-head"><h4>Lesson transcript</h4><span>Read along or review after listening</span></div>
        <div className="transcript-list">{lesson.words.map((word) => <article className="transcript-word" key={word.number}><div className="transcript-number">{String(word.number).padStart(3, "0")}</div><div><h5>{word.word}</h5><p>{word.meaning}</p>{word.examples.length > 0 && <ul>{word.examples.map((example, index) => <li key={index}>{example}</li>)}</ul>}</div></article>)}</div>
        <div className="lesson-end"><span>{done.includes(lesson.day) ? "Lesson completed" : "Listen to the full recording to mark this lesson complete"}</span><button className="lesson-done" disabled={done.includes(lesson.day)} onClick={() => markDone(lesson.day)}>{done.includes(lesson.day) ? "✓ Completed" : "Mark reviewed"}</button></div>
      </div>
    </div>
    {unlockedDay < lessons.length && <p className="unlock-note">Next lesson unlocks tomorrow. Your schedule started {ready && startDate ? new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" }).format(new Date(`${startDate}T12:00:00`)) : "today"}.</p>}
  </section>;
}
