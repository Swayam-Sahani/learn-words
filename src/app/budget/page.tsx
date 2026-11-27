"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Allocation = { id: string; name: string; amount: number };
type BudgetPlan = { salary: number; currency: string; expenses: Allocation[]; investments: Allocation[] };

const STORAGE_KEY = "wordwise-monthly-budget-v1";
const THEME_KEY = "wordwise-theme-v1";
const CURRENCIES = ["INR", "USD", "EUR", "GBP", "CAD", "AUD"];
const starterPlan: BudgetPlan = {
  salary: 0,
  currency: "INR",
  expenses: ["Housing", "Groceries", "Bills", "Transport", "Health", "Eating out"].map((name, i) => ({ id: `expense-${i}`, name, amount: 0 })),
  investments: ["Emergency fund", "Investments", "Retirement / PF"].map((name, i) => ({ id: `investment-${i}`, name, amount: 0 })),
};

function monthStamp(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function newId() { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

export default function BudgetPage() {
  const [month, setMonth] = useState(() => monthStamp());
  const [plans, setPlans] = useState<Record<string, BudgetPlan>>({});
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Record<string, BudgetPlan>;
      if (stored && typeof stored === "object") setPlans(stored);
    } catch { /* Start with an empty budget if saved browser data is invalid. */ }
    const savedTheme = localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
    setTheme(savedTheme);
    document.documentElement.dataset.theme = savedTheme;
    setReady(true);
  }, []);

  const plan = plans[month] ?? starterPlan;
  const expensesTotal = useMemo(() => plan.expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0), [plan.expenses]);
  const investmentsTotal = useMemo(() => plan.investments.reduce((sum, item) => sum + (Number(item.amount) || 0), 0), [plan.investments]);
  const salary = Number(plan.salary) || 0;
  const allocated = expensesTotal + investmentsTotal;
  const remaining = salary - allocated;
  const formatter = useMemo(() => new Intl.NumberFormat(undefined, { style: "currency", currency: plan.currency, maximumFractionDigits: 0 }), [plan.currency]);
  const monthName = useMemo(() => {
    const [year, monthNumber] = month.split("-").map(Number);
    return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(year, monthNumber - 1, 1));
  }, [month]);

  function updatePlan(update: Partial<BudgetPlan>) {
    setPlans((current) => {
      const next = { ...current, [month]: { ...(current[month] ?? starterPlan), ...update } };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* Keep the current session usable if storage is unavailable. */ }
      return next;
    });
  }

  function updateItem(section: "expenses" | "investments", id: string, update: Partial<Allocation>) {
    updatePlan({ [section]: plan[section].map((item) => item.id === id ? { ...item, ...update } : item) });
  }

  function addItem(section: "expenses" | "investments") {
    const label = section === "expenses" ? "New expense" : "New investment";
    updatePlan({ [section]: [...plan[section], { id: newId(), name: label, amount: 0 }] });
  }

  function removeItem(section: "expenses" | "investments", id: string) {
    updatePlan({ [section]: plan[section].filter((item) => item.id !== id) });
  }

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
    document.documentElement.dataset.theme = next;
  }

  const allocationPercent = salary > 0 ? Math.min(100, (allocated / salary) * 100) : 0;
  const expenseShare = allocated > 0 ? Math.round(expensesTotal / allocated * 100) : 0;
  const investmentShare = allocated > 0 ? Math.round(investmentsTotal / allocated * 100) : 0;

  return (
    <main className="budget-page">
      <div className="budget-shell">
        <header className="topbar budget-topbar">
          <Link className="brand" href="/" aria-label="Wordwise home"><span className="brand-icon"><img className="brand-image" src="/wordwise-mark.svg" alt="" width="40" height="40" /></span><span>wordwise</span></Link>
          <nav className="top-right budget-nav" aria-label="Main navigation">
            <Link className="site-nav-link" href="/">Vocabulary</Link>
            <Link className="site-nav-link" href="/focus">Focus timer</Link>
            <Link className="site-nav-link active" href="/budget" aria-current="page">Budget</Link>
            <Link className="site-nav-link" href="/reminders">Reminders</Link>
            <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>{theme === "light" ? "☾ Dark mode" : "☀ Light mode"}</button>
          </nav>
        </header>

        <section className="budget-hero">
          <div>
            <span className="budget-eyebrow"><span /> MONTHLY MONEY PLAN</span>
            <h1>Give every rupee <em>a purpose.</em></h1>
            <p>Plan your monthly expenses and investments in one simple place.</p>
          </div>
          <div className="budget-month-picker"><label htmlFor="budget-month">Planning month</label><input id="budget-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></div>
        </section>

        <section className="budget-summary" aria-label="Monthly budget summary">
          <div className="budget-income-card">
            <span className="budget-card-label">MONTHLY TAKE-HOME SALARY</span>
            <div className="budget-income-input"><span>{plan.currency}</span><input aria-label="Monthly take-home salary" inputMode="decimal" type="number" min="0" step="100" placeholder="0" value={plan.salary || ""} onChange={(event) => updatePlan({ salary: Math.max(0, Number(event.target.value) || 0) })} /></div>
            <label className="budget-currency-select">Currency <select aria-label="Currency" value={plan.currency} onChange={(event) => updatePlan({ currency: event.target.value })}>{CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
            <span className="budget-income-spark" aria-hidden="true">↗</span>
          </div>
          <div className="budget-balance-card"><span className="budget-card-label">LEFT TO ALLOCATE</span><strong className={remaining < 0 ? "balance-value overspent" : "balance-value"}>{formatter.format(remaining)}</strong><span className={remaining < 0 ? "balance-note overspent" : "balance-note"}>{remaining < 0 ? "Your plan is over salary" : "After listed expenses and investments"}</span><div className="budget-meter"><span style={{ width: `${allocationPercent}%` }} /></div><div className="budget-meter-labels"><span>{Math.round(allocationPercent)}% allocated</span><span>{formatter.format(allocated)} planned</span></div></div>
          <div className="budget-split-card"><span className="budget-card-label">YOUR ALLOCATION MIX</span><div className="budget-donut" style={{ background: `conic-gradient(#6c8b6a 0 ${expenseShare}%, #d4a26b ${expenseShare}% ${expenseShare + investmentShare}%, var(--budget-donut-rest) ${expenseShare + investmentShare}% 100%)` }}><div><strong>{Math.round(allocationPercent)}%</strong><small>planned</small></div></div><div className="budget-legend"><span><i className="legend-expense" /> Expenses <b>{expenseShare}%</b></span><span><i className="legend-invest" /> Investments <b>{investmentShare}%</b></span></div></div>
        </section>

        <div className="budget-section-heading"><div><span className="budget-eyebrow">YOUR PLAN</span><h2>{monthName} allocations</h2></div><span className="budget-save-note"><i /> {ready ? "Saved on this device" : "Loading your plan"}</span></div>

        <section className="budget-columns" aria-label="Budget allocations">
          <AllocationSection title="Monthly expenses" subtitle="Everyday costs and regular bills" icon="↘" total={expensesTotal} currency={formatter} items={plan.expenses} onAdd={() => addItem("expenses")} onUpdate={(id, update) => updateItem("expenses", id, update)} onRemove={(id) => removeItem("expenses", id)} variant="expense" />
          <AllocationSection title="Investments & savings" subtitle="What you choose to set aside" icon="↗" total={investmentsTotal} currency={formatter} items={plan.investments} onAdd={() => addItem("investments")} onUpdate={(id, update) => updateItem("investments", id, update)} onRemove={(id) => removeItem("investments", id)} variant="investment" />
        </section>
        <footer className="budget-footer"><span>Your monthly plans are saved in this browser.</span><span>Change the month to plan another one.</span></footer>
      </div>
    </main>
  );
}

function AllocationSection({ title, subtitle, icon, total, currency, items, onAdd, onUpdate, onRemove, variant }: {
  title: string; subtitle: string; icon: string; total: number; currency: Intl.NumberFormat; items: Allocation[];
  onAdd: () => void; onUpdate: (id: string, update: Partial<Allocation>) => void; onRemove: (id: string) => void; variant: "expense" | "investment";
}) {
  const currencySymbol = currency.formatToParts(0).find((part) => part.type === "currency")?.value ?? "¤";
  return (
    <section className={`allocation-card ${variant}`}>
      <div className="allocation-head"><div className="allocation-icon">{icon}</div><div className="allocation-heading-copy"><h3>{title}</h3><p>{subtitle}</p></div><div className="allocation-total"><span>MONTHLY TOTAL</span><strong>{currency.format(total)}</strong></div></div>
      <div className="allocation-items">
        {items.map((item) => <div className="allocation-row" key={item.id}>
          <label className="allocation-name"><span className="allocation-dot" /><input aria-label={`${item.name} category name`} value={item.name} onChange={(event) => onUpdate(item.id, { name: event.target.value })} /></label>
          <label className="allocation-amount"><span>{currencySymbol}</span><input aria-label={`${item.name} monthly amount`} inputMode="decimal" type="number" min="0" step="50" placeholder="0" value={item.amount || ""} onChange={(event) => onUpdate(item.id, { amount: Math.max(0, Number(event.target.value) || 0) })} /></label>
          <button className="allocation-remove" type="button" onClick={() => onRemove(item.id)} aria-label={`Remove ${item.name}`} title="Remove category">×</button>
        </div>)}
        {items.length === 0 && <p className="allocation-empty">Add a category to start planning.</p>}
      </div>
      <button className="allocation-add" type="button" onClick={onAdd}><span>＋</span> Add {variant === "expense" ? "expense" : "investment"}</button>
    </section>
  );
}
