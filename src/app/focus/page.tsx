"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Mode = "focus" | "short" | "long";
const DURATIONS: Record<Mode, number> = { focus: 25, short: 5, long: 15 };
const THEME_KEY = "wordwise-theme-v1";

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export default function FocusPage() {
  const [mode, setMode] = useState<Mode>("focus");
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [remaining, setRemaining] = useState(DURATIONS.focus * 60);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const [sound, setSound] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [message, setMessage] = useState("One focused session at a time.");
  const [finished, setFinished] = useState(0);
  const endAt = useRef(0);
  const completionHandled = useRef(false);
  const handledFinish = useRef(0);

  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
    setTheme(savedTheme);
    document.documentElement.dataset.theme = savedTheme;
  }, []);

  const playChime = useCallback(() => {
    if (!sound || typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const now = context.currentTime;
    [659.25, 783.99, 987.77].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + index * 0.22;
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.65);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.68);
    });
    window.setTimeout(() => void context.close(), 1400);
  }, [sound]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0 && !completionHandled.current) {
        completionHandled.current = true;
        setRunning(false);
        setFinished((count) => count + 1);
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!finished || handledFinish.current === finished) return;
    handledFinish.current = finished;
    playChime();
    if (mode === "focus") {
      const nextCount = sessions + 1;
      setSessions(nextCount);
      const nextMode: Mode = nextCount % 4 === 0 ? "long" : "short";
      setMode(nextMode);
      setRemaining(DURATIONS[nextMode] * 60);
      setMessage(nextMode === "long" ? "Four sessions complete. Take a longer rest." : "Focus session complete. Take a short break.");
    } else {
      setMode("focus");
      setRemaining(focusMinutes * 60);
      setMessage("Break complete. Ready for another focus session?");
    }
  }, [finished, focusMinutes, mode, playChime, sessions]);

  function selectMode(nextMode: Mode) {
    setRunning(false);
    setMode(nextMode);
    setRemaining(nextMode === "focus" ? focusMinutes * 60 : DURATIONS[nextMode] * 60);
    setMessage(nextMode === "focus" ? "One focused session at a time." : "Rest your eyes and reset.");
  }

  function toggleTimer() {
    if (running) {
      setRemaining(Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000)));
      setRunning(false);
      setMessage("Timer paused. Pick up when you’re ready.");
    } else {
      if (remaining <= 0) setRemaining((mode === "focus" ? focusMinutes : DURATIONS[mode]) * 60);
      endAt.current = Date.now() + Math.max(1, remaining) * 1000;
      completionHandled.current = false;
      setRunning(true);
      setMessage(mode === "focus" ? "You’re in a focus session. You’ve got this." : "Enjoy a little breathing room.");
    }
  }

  function resetTimer() {
    setRunning(false);
    setRemaining((mode === "focus" ? focusMinutes : DURATIONS[mode]) * 60);
    setMessage("Timer reset. Start whenever you’re ready.");
  }

  function changeFocusDuration(minutes: number) {
    setFocusMinutes(minutes);
    if (mode === "focus") {
      setRunning(false);
      setRemaining(minutes * 60);
    }
  }

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
    document.documentElement.dataset.theme = next;
  }

  const totalSeconds = (mode === "focus" ? focusMinutes : DURATIONS[mode]) * 60;
  const progress = 1 - remaining / totalSeconds;
  const circumference = 2 * Math.PI * 99;
  const modeLabel = mode === "focus" ? "Focus session" : mode === "short" ? "Short break" : "Long break";

  return (
    <main className="focus-page">
      <div className="focus-shell">
        <header className="topbar focus-topbar">
          <Link className="brand" href="/" aria-label="Wordwise home"><span className="brand-icon"><img className="brand-image" src="/wordwise-mark.svg" alt="" width="40" height="40" /></span><span>wordwise</span></Link>
          <nav className="top-right focus-nav" aria-label="Main navigation">
            <Link className="site-nav-link" href="/">Vocabulary</Link>
            <Link className="site-nav-link active" href="/focus" aria-current="page">Focus timer</Link>
            <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>{theme === "light" ? "☾ Dark mode" : "☀ Light mode"}</button>
          </nav>
        </header>

        <section className="focus-hero">
          <div className="focus-copy">
            <span className="focus-eyebrow"><span className="focus-eyebrow-dot" /> YOUR QUIET SPACE TO GET THINGS DONE</span>
            <h1>Make room for <em>deep focus.</em></h1>
            <p>Choose one thing. Give it your attention. Let the timer take care of the rest.</p>
          </div>
          <div className="focus-session-count"><span className="session-count-number">{sessions}</span><span>sessions<br />completed</span><span className="session-count-icon">✳</span></div>
        </section>

        <section className="focus-layout" aria-label="Pomodoro timer">
          <div className="focus-timer-card">
            <div className="focus-mode-tabs" role="tablist" aria-label="Timer mode">
              {(["focus", "short", "long"] as Mode[]).map((option) => <button key={option} role="tab" aria-selected={mode === option} className={mode === option ? "focus-mode-tab selected" : "focus-mode-tab"} onClick={() => selectMode(option)}>{option === "focus" ? "Focus" : option === "short" ? "Short break" : "Long break"}</button>)}
            </div>

            <div className={`focus-clock-wrap tomato-timer ${running ? "is-running" : ""}`} aria-live="polite">
              <svg className="tomato-art" viewBox="0 0 320 300" aria-hidden="true">
                <defs>
                  <linearGradient id="tomato-skin" x1=".18" y1=".08" x2=".82" y2=".94"><stop offset="0" stopColor="#ff8466"/><stop offset=".48" stopColor="#ed503d"/><stop offset="1" stopColor="#c9322d"/></linearGradient>
                  <linearGradient id="tomato-leaf" x1=".15" y1="0" x2=".85" y2="1"><stop offset="0" stopColor="#7f9d59"/><stop offset="1" stopColor="#416444"/></linearGradient>
                  <radialGradient id="tomato-glow" cx=".28" cy=".22" r=".74"><stop offset="0" stopColor="#fff" stopOpacity=".28"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></radialGradient>
                </defs>
                <path className="tomato-body-shadow" d="M160 71c-19-17-44-13-53 8-27-13-56 2-61 31-24 13-30 43-15 65-5 32 18 62 49 68 20 27 48 31 80 16 31 15 60 11 80-16 31-6 54-36 49-68 15-22 9-52-15-65-5-29-34-44-61-31-9-21-34-25-53-8z"/>
                <path className="tomato-body" d="M160 64c-19-17-44-13-53 8-27-13-56 2-61 31-24 13-30 43-15 65-5 32 18 62 49 68 20 27 48 31 80 16 31 15 60 11 80-16 31-6 54-36 49-68 15-22 9-52-15-65-5-29-34-44-61-31-9-21-34-25-53-8z" fill="url(#tomato-skin)"/>
                <path className="tomato-sheen" d="M71 113c12-28 40-37 60-24-24-1-38 14-44 37-7 25-1 52 11 72-28-17-39-54-27-85z" fill="url(#tomato-glow)"/>
                <path className="tomato-stem" d="M159 73c0-14 6-28 17-41"/>
                <path className="tomato-calyx" d="M160 79c-17-18-39-29-62-23 8 19 25 32 48 35-23-1-43 8-53 26 25 4 48-4 66-23 15 21 39 30 63 24-8-19-25-30-49-32 23-3 39-16 46-35-23-4-44 5-59 28z" fill="url(#tomato-leaf)"/>
                <path className="tomato-vein" d="M159 82c-17-10-34-17-51-20m53 21c16-11 31-17 48-19m-50 22c-16 3-29 10-39 21m42-18c15 3 27 10 38 20"/>
              </svg>
              <svg className="focus-clock-ring" viewBox="0 0 320 300" aria-hidden="true">
                <circle className="focus-ring-track" cx="160" cy="168" r="99" />
                <circle className="focus-ring-progress" cx="160" cy="168" r="99" transform="rotate(-90 160 168)" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} />
              </svg>
              <div className="focus-clock-face"><span className="focus-mode-label">{modeLabel}</span><strong>{formatTime(remaining)}</strong><span className="focus-message">{message}</span></div>
            </div>

            <div className="focus-controls">
              <button className="focus-main-button" onClick={toggleTimer}><span aria-hidden="true">{running ? "Ⅱ" : "▶"}</span>{running ? "Pause session" : remaining === totalSeconds ? "Start focusing" : "Resume session"}</button>
              <button className="focus-reset-button" onClick={resetTimer} aria-label="Reset timer" title="Reset timer">↺</button>
            </div>
            <div className="focus-duration-row"><span>Focus length</span><div className="focus-duration-options" aria-label="Choose focus duration">{[15, 25, 45, 60].map((minutes) => <button key={minutes} className={focusMinutes === minutes ? "duration-chip selected" : "duration-chip"} onClick={() => changeFocusDuration(minutes)}>{minutes}<small>m</small></button>)}</div></div>
          </div>

          <aside className="focus-side">
            <div className="focus-side-card focus-next-card"><span className="focus-card-kicker">YOUR RHYTHM</span><h2>A little structure goes a long way.</h2><p>Work in focused bursts, then take a real pause. After four sessions, earn a longer break.</p>
              <div className="focus-cycle" aria-label={`${sessions % 4} of 4 focus sessions in this cycle`}>{[0, 1, 2, 3].map((n) => <span key={n} className={n < sessions % 4 ? "cycle-dot complete" : "cycle-dot"} />)}<span className="cycle-label">{sessions % 4} of 4 sessions</span></div>
            </div>
            <div className="focus-side-card focus-sound-card"><div className="sound-icon" aria-hidden="true">♫</div><div className="sound-copy"><h3>Gentle chime</h3><p>Plays when a session ends</p></div><button className={sound ? "sound-toggle on" : "sound-toggle"} type="button" role="switch" aria-checked={sound} aria-label="Toggle session end chime" onClick={() => setSound((value) => !value)}><span /></button></div>
            <div className="focus-tip"><span aria-hidden="true">✦</span><p><strong>A small tip</strong><br />Before you start, write down the one thing you want to finish.</p></div>
          </aside>
        </section>
        <footer className="focus-footer"><span>Take a breath. Begin again.</span><span>Sound is generated in your browser · no audio files needed</span></footer>
      </div>
    </main>
  );
}
