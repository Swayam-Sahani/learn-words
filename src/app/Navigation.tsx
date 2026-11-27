"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type NavigationProps = {
  current: "/" | "/focus" | "/budget" | "/reminders";
  theme: "light" | "dark";
  onToggleTheme: () => void;
  className?: string;
};

const links = [
  { href: "/" as const, label: "Vocabulary" },
  { href: "/focus" as const, label: "Focus" },
  { href: "/budget" as const, label: "Budget" },
  { href: "/reminders" as const, label: "Reminders" },
];

export default function Navigation({ current, theme, onToggleTheme, className = "" }: NavigationProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <nav ref={root} className={`site-navigation top-right ${className}`} aria-label="Main navigation">
      <button className={`site-navigation-toggle ${open ? "is-open" : ""}`} type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="site-navigation-menu" onClick={() => setOpen((value) => !value)}>
        <span /><span /><span />
      </button>
      <div id="site-navigation-menu" className={`site-navigation-menu ${open ? "is-open" : ""}`}>
        {links.map(({ href, label }) => <Link key={href} className={`site-nav-link ${current === href ? "active" : ""}`} href={href} aria-current={current === href ? "page" : undefined} onClick={() => setOpen(false)}>{label}</Link>)}
        <button className="theme-toggle" type="button" onClick={() => { onToggleTheme(); setOpen(false); }} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`} aria-pressed={theme === "dark"}>{theme === "light" ? "☾ Dark mode" : "☀ Light mode"}</button>
      </div>
    </nav>
  );
}
