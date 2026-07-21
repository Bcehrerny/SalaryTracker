import React, { useState, useEffect, useMemo } from "react";
import {
  Home, Clock, Coins, BarChart3, TrendingUp, Settings as SettingsIcon,
  Plus, X, Trash2, ChevronLeft, ChevronRight, Target, CalendarDays, Flame,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const STORAGE_KEY = "wage-tracker-data-v1";

const DEFAULT_SETTINGS = {
  // Rate history: list of { date, rate }. The rate that applies to a shift
  // is the most recent entry whose date is on or before the shift's date.
  rateHistory: [
    { date: "2026-01-01", rate: 14.71 },
    { date: "2026-07-01", rate: 14.99 },
  ],
  vakantieurenPct: 10.64,
  vakantiegeldPct: 8,
  pensionBasisPct: 55.91,
  ouderdomspensioenPct: 8.4,
  nabestaandenpensioenPct: 0.17,
  wgaPct: 0.44,
  premieHopPct: 0.1,
  monthlyGoal: 1000,

  // Dutch income tax (loonheffing) estimate, calibrated to 2026 rules.
  incomeTaxEnabled: true,
  incomeTaxRatePct: 35.75, // combined box-1 rate, first bracket
  gtcMaxAnnual: 3115, // algemene heffingskorting, max
  gtcPhaseoutThresholdAnnual: 29736,
  gtcPhaseoutRatePct: 6.398,
  akRate1Pct: 8.3902, // arbeidskorting build-up, segment 1
  akThreshold1Annual: 12022,
  akRate2Pct: 31.433, // arbeidskorting build-up, segment 2
  akThreshold2Annual: 26895, // where it reaches the max
  akMaxAnnual: 5685,
  akAfbouwThresholdAnnual: 45592,
  akAfbouwRatePct: 6.51,

  // Vakantiegeld/vakantieuren are "bijzondere beloningen" (special payments)
  // and are taxed at a separate flat rate based on last year's wage, not
  // through the same progressive monthly table as regular wages.
  specialBeloningenRatePct: 4.74,
};

// Splits a set of shifts into the "regular wage" portion (taxed via the
// normal progressive monthly table) and the "special payments" portion
// (vakantieuren + vakantiegeld, taxed at a flat rate) — both after the
// pension deduction has been applied proportionally.
function splitTaxComponents(days, settings) {
  let baseSum = 0;
  let grossSum = 0;
  let netSum = 0;
  const specialFraction = (settings.vakantieurenPct + settings.vakantiegeldPct) / 100;
  days.forEach((d) => {
    const rate = d.rate ?? (d.hours ? d.gross / (1 + specialFraction) / d.hours : 0);
    baseSum += (d.hours || 0) * rate;
    grossSum += d.gross || 0;
    netSum += d.net || 0;
  });
  const specialGross = Math.max(0, grossSum - baseSum);
  const reduction = grossSum > 0 ? netSum / grossSum : 1;
  return { regularNet: baseSum * reduction, specialNet: specialGross * reduction };
}

function calcRegularIncomeTax(monthlyRegularIncome, settings) {
  if (monthlyRegularIncome <= 0) return 0;
  const annual = monthlyRegularIncome * 12;

  // Arbeidskorting (labour tax credit): build-up in two segments, a plateau
  // at the max, then a phase-out at higher incomes.
  let ltc;
  if (annual <= settings.akThreshold1Annual) {
    ltc = annual * (settings.akRate1Pct / 100);
  } else if (annual <= settings.akThreshold2Annual) {
    ltc =
      settings.akThreshold1Annual * (settings.akRate1Pct / 100) +
      (annual - settings.akThreshold1Annual) * (settings.akRate2Pct / 100);
  } else if (annual <= settings.akAfbouwThresholdAnnual) {
    ltc = settings.akMaxAnnual;
  } else {
    ltc = Math.max(0, settings.akMaxAnnual - (annual - settings.akAfbouwThresholdAnnual) * (settings.akAfbouwRatePct / 100));
  }

  // Algemene heffingskorting (general tax credit): flat, then phases out.
  let gtc = settings.gtcMaxAnnual;
  if (annual > settings.gtcPhaseoutThresholdAnnual) {
    gtc = Math.max(0, settings.gtcMaxAnnual - (annual - settings.gtcPhaseoutThresholdAnnual) * (settings.gtcPhaseoutRatePct / 100));
  }

  const taxAnnual = Math.max(0, annual * (settings.incomeTaxRatePct / 100) - gtc - ltc);
  return taxAnnual / 12;
}

// Computes total monthly income tax for a set of shifts (real, hypothetical,
// or a mix), correctly splitting regular wage from special payments.
function calcMonthlyIncomeTax(days, settings) {
  if (!settings.incomeTaxEnabled) return { regularTax: 0, specialTax: 0, total: 0 };
  const { regularNet, specialNet } = splitTaxComponents(days, settings);
  const regularTax = calcRegularIncomeTax(regularNet, settings);
  const specialTax = Math.max(0, specialNet) * (settings.specialBeloningenRatePct / 100);
  return { regularTax, specialTax, total: regularTax + specialTax };
}

function getRateForDate(rateHistory, dateStr) {
  const list = (rateHistory && rateHistory.length ? rateHistory : DEFAULT_SETTINGS.rateHistory)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  let applicable = list[0].rate;
  for (const r of list) {
    if (r.date <= dateStr) applicable = r.rate;
    else break;
  }
  return applicable;
}

// Migrates old settings shape (single hourlyRate number) to rateHistory.
function migrateSettings(raw) {
  const merged = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  if (!merged.rateHistory || !merged.rateHistory.length) {
    if (raw && typeof raw.hourlyRate === "number") {
      merged.rateHistory = [{ date: "2020-01-01", rate: raw.hourlyRate }];
    } else {
      merged.rateHistory = DEFAULT_SETTINGS.rateHistory;
    }
  }
  delete merged.hourlyRate;
  delete merged.pensionPct;
  return merged;
}

// ---------- helpers ----------
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function calcHoursDecimal(start, end, breakMin) {
  let s = timeToMinutes(start);
  let e = timeToMinutes(end);
  let diff = e - s;
  if (diff <= 0) diff += 24 * 60;
  diff -= Number(breakMin) || 0;
  return Math.max(diff, 0) / 60;
}
function formatHM(hoursDecimal) {
  const totalMin = Math.round((hoursDecimal || 0) * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h${m.toString().padStart(2, "0")}m`;
}
function calcPay(hours, rate, settings) {
  const base = hours * rate;
  const vakantieurenAmt = base * (settings.vakantieurenPct / 100);
  const vakantiegeldAmt = base * (settings.vakantiegeldPct / 100);
  const gross = base + vakantieurenAmt + vakantiegeldAmt;

  const pensionBasis = gross * (settings.pensionBasisPct / 100);
  const deductionPctSum =
    settings.ouderdomspensioenPct + settings.nabestaandenpensioenPct + settings.wgaPct + settings.premieHopPct;
  const deductions = pensionBasis * (deductionPctSum / 100);

  const net = gross - deductions;
  return { base, vakantieurenAmt, vakantiegeldAmt, gross, pensionBasis, deductions, net };
}
function fmtEuro(n) {
  const v = Math.round((n || 0) * 100) / 100;
  return "€" + v.toFixed(2);
}
function monthKey(dateStr) {
  return (dateStr || "").slice(0, 7);
}
function monthLabel(key) {
  if (!key) return "";
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function shiftDayLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function weekdayIdx(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return (d.getDay() + 6) % 7; // 0=Mon .. 6=Sun
}
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthDays(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
function monthFirstWeekday(key) {
  const [y, m] = key.split("-").map(Number);
  return (new Date(y, m - 1, 1).getDay() + 6) % 7; // 0=Mon
}

// ---------- small UI atoms ----------
function Card({ children, className = "" }) {
  return (
    <div className={`bg-zinc-900 border border-zinc-800 rounded-2xl p-4 ${className}`}>
      {children}
    </div>
  );
}
function StatBlock({ label, value, accent = "text-zinc-50", sub }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-zinc-500">{label}</span>
      <span className={`font-mono text-xl tabular-nums font-semibold ${accent}`}>{value}</span>
      {sub && <span className="text-xs text-zinc-500">{sub}</span>}
    </div>
  );
}
function ProgressBar({ pct, colorClass = "bg-emerald-400" }) {
  const clamped = Math.max(0, Math.min(1, pct || 0));
  return (
    <div className="w-full h-3 rounded-full bg-zinc-800 overflow-hidden">
      <div
        className={`h-full ${colorClass} transition-all duration-500 rounded-full`}
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}
function ProgressRing({ pct, size = 176, strokeWidth = 14 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, pct || 0));
  const offset = circumference * (1 - clamped);
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} className="stroke-zinc-800" fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="stroke-emerald-400"
        fill="none"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}
function MonthNav({ months, selected, onChange }) {
  const idx = months.indexOf(selected);
  return (
    <div className="flex items-center justify-center gap-3 mb-4">
      <button
        disabled={idx <= 0}
        onClick={() => onChange(months[idx - 1])}
        className="p-1.5 rounded-full bg-zinc-900 border border-zinc-800 disabled:opacity-30"
      >
        <ChevronLeft size={16} className="text-zinc-300" />
      </button>
      <span className="text-sm font-medium text-zinc-200 w-40 text-center">{monthLabel(selected)}</span>
      <button
        disabled={idx >= months.length - 1}
        onClick={() => onChange(months[idx + 1])}
        className="p-1.5 rounded-full bg-zinc-900 border border-zinc-800 disabled:opacity-30"
      >
        <ChevronRight size={16} className="text-zinc-300" />
      </button>
    </div>
  );
}
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl w-full sm:w-96 p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-zinc-50 font-semibold text-lg">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-full bg-zinc-800">
            <X size={16} className="text-zinc-400" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="block text-xs text-zinc-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
const inputClass =
  "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-zinc-50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/60";

// ---------- main app ----------
export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [workDays, setWorkDays] = useState([]);
  const [tips, setTips] = useState([]);
  const [futureShifts, setFutureShifts] = useState([]);
  const [tab, setTab] = useState("dashboard");
  const [showAddWork, setShowAddWork] = useState(false);
  const [showAddTip, setShowAddTip] = useState(false);
  const [statsSub, setStatsSub] = useState("overview");
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          setSettings(migrateSettings(parsed.settings));
          setWorkDays(parsed.workDays || []);
          setTips(parsed.tips || []);
          setFutureShifts(parsed.futureShifts || []);
        }
      } catch (e) {
        // no existing data yet
      }
      setLoaded(true);
    })();
  }, []);

  async function persist(next) {
    try {
      const payload = {
        settings: next.settings ?? settings,
        workDays: next.workDays ?? workDays,
        tips: next.tips ?? tips,
        futureShifts: next.futureShifts ?? futureShifts,
      };
      const result = await window.storage.set(STORAGE_KEY, JSON.stringify(payload), false);
      if (!result) setSaveError(true);
      else setSaveError(false);
    } catch (e) {
      setSaveError(true);
    }
  }

  function addWorkDay(entry) {
    const hours = calcHoursDecimal(entry.date && entry.start, entry.end, entry.breakMin);
    const rate = getRateForDate(settings.rateHistory, entry.date);
    const { gross, net } = calcPay(hours, rate, settings);
    const row = { id: uid(), date: entry.date, start: entry.start, end: entry.end, breakMin: Number(entry.breakMin) || 0, hours, rate, gross, net };
    const next = [...workDays, row].sort((a, b) => a.date.localeCompare(b.date));
    setWorkDays(next);
    persist({ workDays: next });
  }
  function deleteWorkDay(id) {
    const next = workDays.filter((w) => w.id !== id);
    setWorkDays(next);
    persist({ workDays: next });
  }
  function addTip(entry) {
    const row = { id: uid(), date: entry.date, amount: Number(entry.amount) || 0 };
    const next = [...tips, row].sort((a, b) => a.date.localeCompare(b.date));
    setTips(next);
    persist({ tips: next });
  }
  function deleteTip(id) {
    const next = tips.filter((t) => t.id !== id);
    setTips(next);
    persist({ tips: next });
  }
  function saveSettings(next) {
    setSettings(next);
    persist({ settings: next });
  }
  function addFutureShift(entry) {
    const row = { id: uid(), date: entry.date, start: entry.start, end: entry.end };
    const next = [...futureShifts, row].sort((a, b) => a.date.localeCompare(b.date));
    setFutureShifts(next);
    persist({ futureShifts: next });
  }
  function removeFutureShift(id) {
    const next = futureShifts.filter((f) => f.id !== id);
    setFutureShifts(next);
    persist({ futureShifts: next });
  }

  // months present in data (+ current month always included)
  const months = useMemo(() => {
    const set = new Set([todayStr().slice(0, 7)]);
    workDays.forEach((w) => set.add(monthKey(w.date)));
    tips.forEach((t) => set.add(monthKey(t.date)));
    return Array.from(set).sort();
  }, [workDays, tips]);

  const [selectedMonth, setSelectedMonth] = useState(todayStr().slice(0, 7));
  useEffect(() => {
    if (!months.includes(selectedMonth) && months.length) setSelectedMonth(months[months.length - 1]);
  }, [months]); // eslint-disable-line

  const monthWorkDays = useMemo(() => workDays.filter((w) => monthKey(w.date) === selectedMonth), [workDays, selectedMonth]);
  const monthTips = useMemo(() => tips.filter((t) => monthKey(t.date) === selectedMonth), [tips, selectedMonth]);

  const summary = useMemo(() => {
    const totalHours = monthWorkDays.reduce((s, d) => s + d.hours, 0);
    const gross = monthWorkDays.reduce((s, d) => s + d.gross, 0);
    const net = monthWorkDays.reduce((s, d) => s + d.net, 0); // after pension, before income tax
    const tipsSum = monthTips.reduce((s, t) => s + t.amount, 0);
    const incomeTax = calcMonthlyIncomeTax(monthWorkDays, settings).total;
    const netAfterTax = net - incomeTax;
    return { totalHours, gross, net, incomeTax, netAfterTax, tipsSum, total: netAfterTax + tipsSum };
  }, [monthWorkDays, monthTips, settings]);

  const avgIncomePerHour =
    summary.totalHours > 0
      ? summary.total / summary.totalHours
      : calcPay(1, getRateForDate(settings.rateHistory, todayStr()), settings).net;

  if (!loaded) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <span className="text-zinc-500 text-sm">Loading…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans pb-24">
      <div className="max-w-md mx-auto px-4 pt-6">
        <TopBar tab={tab} />
        {saveError && (
          <div className="mb-3 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-xl px-3 py-2">
            Couldn't save your data. Changes may not persist.
          </div>
        )}

        {tab === "dashboard" && (
          <Dashboard
            months={months}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            summary={summary}
            settings={settings}
            monthWorkDays={monthWorkDays}
            monthTips={monthTips}
            avgIncomePerHour={avgIncomePerHour}
            onAddWork={() => setShowAddWork(true)}
            onAddTip={() => setShowAddTip(true)}
            onDeleteWork={deleteWorkDay}
            onDeleteTip={deleteTip}
          />
        )}

        {tab === "worklog" && (
          <WorkLog
            months={months}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            monthWorkDays={monthWorkDays}
            onAdd={() => setShowAddWork(true)}
            onDelete={deleteWorkDay}
          />
        )}

        {tab === "tips" && (
          <TipsPage
            months={months}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            monthTips={monthTips}
            onAdd={() => setShowAddTip(true)}
            onDelete={deleteTip}
          />
        )}

        {tab === "stats" && (
          <StatsPage
            statsSub={statsSub}
            setStatsSub={setStatsSub}
            months={months}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            workDays={workDays}
            tips={tips}
            settings={settings}
          />
        )}

        {tab === "prediction" && (
          <PredictionPage
            settings={settings}
            summary={summary}
            monthWorkDays={monthWorkDays}
            selectedMonth={selectedMonth}
            futureShifts={futureShifts}
            onAdd={addFutureShift}
            onRemove={removeFutureShift}
            avgIncomePerHour={avgIncomePerHour}
          />
        )}

        {tab === "settings" && <SettingsPage settings={settings} onSave={saveSettings} />}
      </div>

      <BottomNav tab={tab} setTab={setTab} />

      {showAddWork && (
        <AddWorkModal
          settings={settings}
          onClose={() => setShowAddWork(false)}
          onSave={(entry) => {
            addWorkDay(entry);
            setShowAddWork(false);
          }}
        />
      )}
      {showAddTip && (
        <AddTipModal
          onClose={() => setShowAddTip(false)}
          onSave={(entry) => {
            addTip(entry);
            setShowAddTip(false);
          }}
        />
      )}
    </div>
  );
}

function TopBar({ tab }) {
  const titles = {
    dashboard: "Dashboard",
    worklog: "Work Log",
    tips: "Tips",
    stats: "Monthly Statistics",
    prediction: "Salary Prediction",
    settings: "Settings",
  };
  return (
    <div className="mb-4">
      <h1 className="text-2xl font-bold tracking-tight text-zinc-50">{titles[tab]}</h1>
    </div>
  );
}

function BottomNav({ tab, setTab }) {
  const items = [
    { id: "dashboard", icon: Home, label: "Home" },
    { id: "worklog", icon: Clock, label: "Log" },
    { id: "tips", icon: Coins, label: "Tips" },
    { id: "stats", icon: BarChart3, label: "Stats" },
    { id: "prediction", icon: TrendingUp, label: "Predict" },
    { id: "settings", icon: SettingsIcon, label: "Settings" },
  ];
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur border-t border-zinc-800">
      <div className="max-w-md mx-auto grid grid-cols-6">
        {items.map((it) => {
          const Icon = it.icon;
          const active = tab === it.id;
          return (
            <button
              key={it.id}
              onClick={() => setTab(it.id)}
              className="flex flex-col items-center gap-0.5 py-2.5"
            >
              <Icon size={20} className={active ? "text-emerald-400" : "text-zinc-500"} />
              <span className={`text-[10px] ${active ? "text-emerald-400" : "text-zinc-500"}`}>{it.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Dashboard ----------
function Dashboard({
  months, selectedMonth, setSelectedMonth, summary, settings,
  monthWorkDays, monthTips, avgIncomePerHour, onAddWork, onAddTip, onDeleteWork, onDeleteTip,
}) {
  const goal = settings.monthlyGoal;
  const pct = goal > 0 ? summary.total / goal : 0;
  const remaining = Math.max(goal - summary.total, 0);
  const hoursNeeded = avgIncomePerHour > 0 ? remaining / avgIncomePerHour : 0;

  const recent = useMemo(() => {
    const workRows = monthWorkDays.map((w) => ({ type: "work", ...w }));
    const tipRows = monthTips.map((t) => ({ type: "tip", ...t }));
    return [...workRows, ...tipRows].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  }, [monthWorkDays, monthTips]);

  return (
    <div>
      <MonthNav months={months} selected={selectedMonth} onChange={setSelectedMonth} />

      <div className="flex flex-col items-center mb-5">
        <div className="relative">
          <ProgressRing pct={pct} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs text-zinc-500 uppercase tracking-wide">Total Earned</span>
            <span className="font-mono text-2xl font-bold tabular-nums text-zinc-50">{fmtEuro(summary.total)}</span>
            <span className="text-xs text-zinc-500 mt-1">of {fmtEuro(goal)} goal</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card><StatBlock label="Worked Hours" value={formatHM(summary.totalHours)} /></Card>
        <Card><StatBlock label="Gross Salary" value={fmtEuro(summary.gross)} accent="text-sky-400" /></Card>
        <Card><StatBlock label="Net (before tax)" value={fmtEuro(summary.net)} accent="text-emerald-400" /></Card>
        <Card><StatBlock label="Income Tax" value={"-" + fmtEuro(summary.incomeTax)} accent="text-red-400" /></Card>
        <Card><StatBlock label="Net after Tax" value={fmtEuro(summary.netAfterTax)} accent="text-emerald-400" /></Card>
        <Card><StatBlock label="Tips" value={fmtEuro(summary.tipsSum)} accent="text-amber-400" /></Card>
      </div>

      <Card className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Target size={16} className="text-emerald-400" />
          <span className="text-sm font-medium text-zinc-200">Goal {fmtEuro(goal)}</span>
        </div>
        <ProgressBar pct={pct} />
        <div className="flex justify-between mt-2 text-xs text-zinc-500">
          <span>{fmtEuro(summary.total)} / {fmtEuro(goal)}</span>
          <span>{Math.round(pct * 100)}%</span>
        </div>
        {remaining > 0 ? (
          <p className="text-xs text-zinc-400 mt-2">
            Need <span className="text-zinc-100 font-medium">{formatHM(hoursNeeded)}</span> more to reach the goal
          </p>
        ) : (
          <p className="text-xs text-emerald-400 mt-2">Goal reached 🎉</p>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <button
          onClick={onAddWork}
          className="flex items-center justify-center gap-2 bg-emerald-400 text-zinc-950 font-medium rounded-2xl py-3"
        >
          <Plus size={18} /> Work Day
        </button>
        <button
          onClick={onAddTip}
          className="flex items-center justify-center gap-2 bg-amber-400 text-zinc-950 font-medium rounded-2xl py-3"
        >
          <Coins size={18} /> Add Tip
        </button>
      </div>

      <h3 className="text-sm font-semibold text-zinc-300 mb-2">Recent</h3>
      <div className="flex flex-col gap-2">
        {recent.length === 0 && <p className="text-sm text-zinc-500">Nothing logged yet this month.</p>}
        {recent.map((r) =>
          r.type === "work" ? (
            <WorkRow key={r.id} row={r} onDelete={onDeleteWork} />
          ) : (
            <TipRow key={r.id} row={r} onDelete={onDeleteTip} />
          )
        )}
      </div>
    </div>
  );
}

function WorkRow({ row, onDelete }) {
  return (
    <Card className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-zinc-100">{shiftDayLabel(row.date)}</p>
        <p className="text-xs text-zinc-500">{row.start}–{row.end} · {formatHM(row.hours)}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-emerald-400 text-sm tabular-nums">{fmtEuro(row.net)}</span>
        <button onClick={() => onDelete(row.id)}>
          <Trash2 size={15} className="text-zinc-600" />
        </button>
      </div>
    </Card>
  );
}
function TipRow({ row, onDelete }) {
  return (
    <Card className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-zinc-100">{shiftDayLabel(row.date)}</p>
        <p className="text-xs text-amber-400">Tip</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-amber-400 text-sm tabular-nums">+{fmtEuro(row.amount)}</span>
        <button onClick={() => onDelete(row.id)}>
          <Trash2 size={15} className="text-zinc-600" />
        </button>
      </div>
    </Card>
  );
}

// ---------- Work Log ----------
function WorkLog({ months, selectedMonth, setSelectedMonth, monthWorkDays, onAdd, onDelete }) {
  const sorted = [...monthWorkDays].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div>
      <MonthNav months={months} selected={selectedMonth} onChange={setSelectedMonth} />
      <button
        onClick={onAdd}
        className="w-full flex items-center justify-center gap-2 bg-emerald-400 text-zinc-950 font-medium rounded-2xl py-3 mb-4"
      >
        <Plus size={18} /> Add Work Day
      </button>
      <div className="flex flex-col gap-2">
        {sorted.length === 0 && <p className="text-sm text-zinc-500 text-center mt-6">No shifts logged this month.</p>}
        {sorted.map((r) => (
          <WorkRow key={r.id} row={r} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

// ---------- Tips ----------
function TipsPage({ months, selectedMonth, setSelectedMonth, monthTips, onAdd, onDelete }) {
  const sorted = [...monthTips].sort((a, b) => b.date.localeCompare(a.date));
  const total = monthTips.reduce((s, t) => s + t.amount, 0);
  return (
    <div>
      <MonthNav months={months} selected={selectedMonth} onChange={setSelectedMonth} />
      <Card className="mb-4">
        <StatBlock label="Tips this month" value={fmtEuro(total)} accent="text-amber-400" />
      </Card>
      <button
        onClick={onAdd}
        className="w-full flex items-center justify-center gap-2 bg-amber-400 text-zinc-950 font-medium rounded-2xl py-3 mb-4"
      >
        <Coins size={18} /> Add Tip
      </button>
      <div className="flex flex-col gap-2">
        {sorted.length === 0 && <p className="text-sm text-zinc-500 text-center mt-6">No tips logged this month.</p>}
        {sorted.map((r) => (
          <TipRow key={r.id} row={r} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

// ---------- Stats ----------
function StatsPage({ statsSub, setStatsSub, months, selectedMonth, setSelectedMonth, workDays, tips, settings }) {
  const monthWorkDays = workDays.filter((w) => monthKey(w.date) === selectedMonth);
  const monthTips = tips.filter((t) => monthKey(t.date) === selectedMonth);

  const totalHours = monthWorkDays.reduce((s, d) => s + d.hours, 0);
  const gross = monthWorkDays.reduce((s, d) => s + d.gross, 0);
  const net = monthWorkDays.reduce((s, d) => s + d.net, 0);
  const tipsSum = monthTips.reduce((s, t) => s + t.amount, 0);
  const incomeTax = calcMonthlyIncomeTax(monthWorkDays, settings).total;
  const netAfterTax = net - incomeTax;
  const total = netAfterTax + tipsSum;

  const workedDaysCount = new Set(monthWorkDays.map((d) => d.date)).size;
  const avgHoursPerShift = monthWorkDays.length ? totalHours / monthWorkDays.length : 0;
  const weeksInMonth = Math.max(1, monthDays(selectedMonth) / 7);
  const avgHoursPerWeek = totalHours / weeksInMonth;

  const avgNetPerHour = totalHours ? netAfterTax / totalHours : 0;
  const avgTipPerHour = totalHours ? tipsSum / totalHours : 0;
  const avgIncomePerHour = avgNetPerHour + avgTipPerHour;

  const shiftLengths = monthWorkDays.map((d) => d.hours);
  const longest = shiftLengths.length ? Math.max(...shiftLengths) : 0;
  const shortest = shiftLengths.length ? Math.min(...shiftLengths) : 0;
  const longestDay = monthWorkDays.find((d) => d.hours === longest);
  const shortestDay = monthWorkDays.find((d) => d.hours === shortest);

  const highestTip = monthTips.length ? Math.max(...monthTips.map((t) => t.amount)) : 0;
  const avgTipPerShift = monthTips.length ? tipsSum / monthTips.length : 0;

  const goal = settings.monthlyGoal;
  const pct = goal > 0 ? total / goal : 0;
  const remaining = Math.max(goal - total, 0);
  const hoursNeeded = avgIncomePerHour > 0 ? remaining / avgIncomePerHour : 0;

  // charts
  const hoursByWeekday = WEEKDAYS.map((label, idx) => {
    const h = monthWorkDays.filter((d) => weekdayIdx(d.date) === idx).reduce((s, d) => s + d.hours, 0);
    return { day: label, hours: Math.round(h * 100) / 100 };
  });
  const incomeByWeek = useMemo(() => {
    const buckets = {};
    monthWorkDays.forEach((d) => {
      const day = Number(d.date.slice(8, 10));
      const w = Math.floor((day - 1) / 7) + 1;
      buckets[w] = (buckets[w] || 0) + d.net;
    });
    monthTips.forEach((t) => {
      const day = Number(t.date.slice(8, 10));
      const w = Math.floor((day - 1) / 7) + 1;
      buckets[w] = (buckets[w] || 0) + t.amount;
    });
    return Object.keys(buckets).sort().map((w) => ({ week: `Week ${w}`, income: Math.round(buckets[w] * 100) / 100 }));
  }, [monthWorkDays, monthTips]);
  const tipTrend = [...monthTips].sort((a, b) => a.date.localeCompare(b.date)).map((t) => ({
    date: shiftDayLabel(t.date),
    tip: t.amount,
  }));

  // calendar
  const firstWeekday = monthFirstWeekday(selectedMonth);
  const daysCount = monthDays(selectedMonth);
  const today = todayStr();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysCount; d++) {
    const dateStr = `${selectedMonth}-${String(d).padStart(2, "0")}`;
    const hrs = monthWorkDays.filter((w) => w.date === dateStr).reduce((s, w) => s + w.hours, 0);
    const netDay = monthWorkDays.filter((w) => w.date === dateStr).reduce((s, w) => s + w.net, 0);
    let color = "bg-zinc-800 text-zinc-500";
    if (hrs >= 6) color = "bg-emerald-400/20 text-emerald-300 border border-emerald-400/40";
    else if (hrs > 0) color = "bg-amber-400/20 text-amber-300 border border-amber-400/40";
    else if (dateStr <= today) color = "bg-red-500/10 text-red-400/70 border border-red-500/20";
    cells.push({ day: d, hrs, netDay, color });
  }

  // history: all months
  const allMonths = Array.from(new Set([...workDays.map((w) => monthKey(w.date)), ...tips.map((t) => monthKey(t.date))])).sort();
  const yearOf = selectedMonth.slice(0, 4);
  const yearMonths = allMonths.filter((m) => m.startsWith(yearOf));
  const yearHours = workDays.filter((w) => yearMonths.includes(monthKey(w.date))).reduce((s, w) => s + w.hours, 0);
  const yearNet = yearMonths.reduce((s, m) => {
    const mDays = workDays.filter((w) => monthKey(w.date) === m);
    const mn = mDays.reduce((sum, w) => sum + w.net, 0);
    return s + (mn - calcMonthlyIncomeTax(mDays, settings).total);
  }, 0);
  const yearTips = tips.filter((t) => yearMonths.includes(monthKey(t.date))).reduce((s, t) => s + t.amount, 0);

  const subTabs = [
    { id: "overview", label: "Overview" },
    { id: "calendar", label: "Calendar" },
    { id: "charts", label: "Charts" },
    { id: "history", label: "History" },
  ];

  return (
    <div>
      <MonthNav months={months} selected={selectedMonth} onChange={setSelectedMonth} />
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {subTabs.map((s) => (
          <button
            key={s.id}
            onClick={() => setStatsSub(s.id)}
            className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border ${
              statsSub === s.id ? "bg-emerald-400 text-zinc-950 border-emerald-400" : "bg-zinc-900 text-zinc-400 border-zinc-800"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {statsSub === "overview" && (
        <div className="flex flex-col gap-3">
          <Card>
            <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Salary Overview</p>
            <div className="grid grid-cols-2 gap-3">
              <StatBlock label="Gross Salary" value={fmtEuro(gross)} accent="text-sky-400" />
              <StatBlock label="Net (before tax)" value={fmtEuro(net)} accent="text-emerald-400" />
              <StatBlock label="Income Tax" value={"-" + fmtEuro(incomeTax)} accent="text-red-400" />
              <StatBlock label="Net after Tax" value={fmtEuro(netAfterTax)} accent="text-emerald-400" />
              <StatBlock label="Tips" value={fmtEuro(tipsSum)} accent="text-amber-400" />
              <StatBlock label="Total Income" value={fmtEuro(total)} />
            </div>
          </Card>

          <Card>
            <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Working Hours</p>
            <div className="grid grid-cols-2 gap-3">
              <StatBlock label="Total Hours" value={formatHM(totalHours)} />
              <StatBlock label="Worked Days" value={String(workedDaysCount)} />
              <StatBlock label="Avg / Shift" value={formatHM(avgHoursPerShift)} />
              <StatBlock label="Avg / Week" value={formatHM(avgHoursPerWeek)} />
            </div>
          </Card>

          <Card>
            <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Earnings per Hour</p>
            <div className="grid grid-cols-2 gap-3">
              <StatBlock label="Hourly Wage" value={fmtEuro(getRateForDate(settings.rateHistory, selectedMonth + "-01"))} />
              <StatBlock label="Avg Net / Hour" value={fmtEuro(avgNetPerHour)} accent="text-emerald-400" />
              <StatBlock label="Avg Tip / Hour" value={fmtEuro(avgTipPerHour)} accent="text-amber-400" />
              <StatBlock label="Avg Income / Hour" value={fmtEuro(avgIncomePerHour)} />
            </div>
            <p className="text-xs text-zinc-500 mt-2">What you actually take home per hour worked, wage + tips combined.</p>
          </Card>

          <Card>
            <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Shift Statistics</p>
            <div className="grid grid-cols-2 gap-3">
              <StatBlock label="Longest Shift" value={formatHM(longest)} sub={longestDay ? shiftDayLabel(longestDay.date) : "—"} />
              <StatBlock label="Shortest Shift" value={formatHM(shortest)} sub={shortestDay ? shiftDayLabel(shortestDay.date) : "—"} />
              <StatBlock label="Average Shift" value={formatHM(avgHoursPerShift)} />
            </div>
          </Card>

          <Card>
            <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Tips</p>
            <div className="grid grid-cols-2 gap-3">
              <StatBlock label="Total Tips" value={fmtEuro(tipsSum)} accent="text-amber-400" />
              <StatBlock label="Highest Tip" value={fmtEuro(highestTip)} accent="text-amber-400" />
              <StatBlock label="Avg / Shift" value={fmtEuro(avgTipPerShift)} />
              <StatBlock label="Avg / Hour" value={fmtEuro(avgTipPerHour)} />
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-2">
              <Target size={16} className="text-emerald-400" />
              <span className="text-sm font-medium text-zinc-200">Monthly Goal {fmtEuro(goal)}</span>
            </div>
            <ProgressBar pct={pct} />
            <p className="text-xs text-zinc-500 mt-2">{Math.round(pct * 100)}%</p>
            {remaining > 0 ? (
              <p className="text-xs text-zinc-400 mt-1">
                Remaining <span className="text-zinc-100">{fmtEuro(remaining)}</span> · Need{" "}
                <span className="text-zinc-100">{formatHM(hoursNeeded)}</span>
              </p>
            ) : (
              <p className="text-xs text-emerald-400 mt-1">Goal reached 🎉</p>
            )}
          </Card>
        </div>
      )}

      {statsSub === "calendar" && (
        <Card>
          <div className="grid grid-cols-7 gap-1 mb-2 text-center">
            {WEEKDAYS.map((w) => (
              <span key={w} className="text-[10px] text-zinc-500">{w[0]}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((c, i) =>
              c ? (
                <div key={i} className={`rounded-lg py-1.5 flex flex-col items-center ${c.color}`}>
                  <span className="text-xs font-medium">{c.day}</span>
                  {c.hrs > 0 && <span className="text-[9px] font-mono">{fmtEuro(c.netDay)}</span>}
                </div>
              ) : (
                <div key={i} />
              )
            )}
          </div>
          <div className="flex gap-3 mt-3 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400/40 inline-block" /> Long shift</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400/40 inline-block" /> Normal</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500/20 inline-block" /> No work</span>
          </div>
        </Card>
      )}

      {statsSub === "charts" && (
        <div className="flex flex-col gap-4">
          <Card>
            <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Hours by Weekday</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={hoursByWeekday}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }} labelStyle={{ color: "#e4e4e7" }} />
                <Bar dataKey="hours" fill="#34d399" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Income by Week</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={incomeByWeek}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="week" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }} labelStyle={{ color: "#e4e4e7" }} />
                <Bar dataKey="income" fill="#38bdf8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Tip Trend</p>
            {tipTrend.length ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={tipTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }} labelStyle={{ color: "#e4e4e7" }} />
                  <Line type="monotone" dataKey="tip" stroke="#fbbf24" strokeWidth={2} dot={{ r: 3, fill: "#fbbf24" }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-zinc-500">No tips logged this month.</p>
            )}
          </Card>
        </div>
      )}

      {statsSub === "history" && (
        <div className="flex flex-col gap-2">
          {allMonths.length === 0 && <p className="text-sm text-zinc-500 text-center mt-6">No history yet.</p>}
          {allMonths.slice().reverse().map((m) => {
            const mDays = workDays.filter((w) => monthKey(w.date) === m);
            const mh = mDays.reduce((s, w) => s + w.hours, 0);
            const mn = mDays.reduce((s, w) => s + w.net, 0);
            const mTax = calcMonthlyIncomeTax(mDays, settings).total;
            const mnAfterTax = mn - mTax;
            return (
              <Card key={m} className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-200">{monthLabel(m)}</span>
                <div className="flex gap-4 text-right">
                  <StatBlock label="Hours" value={formatHM(mh)} />
                  <StatBlock label="Net" value={fmtEuro(mnAfterTax)} accent="text-emerald-400" />
                </div>
              </Card>
            );
          })}
          <Card className="mt-2">
            <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">{yearOf} Total</p>
            <div className="grid grid-cols-2 gap-3">
              <StatBlock label="Hours" value={formatHM(yearHours)} />
              <StatBlock label="Net Salary" value={fmtEuro(yearNet)} accent="text-emerald-400" />
              <StatBlock label="Tips" value={fmtEuro(yearTips)} accent="text-amber-400" />
              <StatBlock label="Grand Total" value={fmtEuro(yearNet + yearTips)} />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ---------- Prediction ----------
function PredictionPage({ settings, summary, monthWorkDays, selectedMonth, futureShifts, onAdd, onRemove, avgIncomePerHour }) {
  const [date, setDate] = useState(todayStr());
  const [start, setStart] = useState("17:00");
  const [end, setEnd] = useState("22:00");

  const futureAsDays = futureShifts.map((f) => {
    const h = calcHoursDecimal(f.start, f.end, 0);
    const rate = getRateForDate(settings.rateHistory, f.date);
    const { gross, net } = calcPay(h, rate, settings);
    return { hours: h, rate, gross, net };
  });
  const addedHours = futureAsDays.reduce((s, d) => s + d.hours, 0);
  const addedNet = futureAsDays.reduce((s, d) => s + d.net, 0);
  const tipRatePerHour = summary.totalHours > 0 ? summary.tipsSum / summary.totalHours : 0;
  const estimatedTips = tipRatePerHour * addedHours;

  const projHours = summary.totalHours + addedHours;
  const projNetBeforeTax = summary.net + addedNet;
  const projIncomeTax = calcMonthlyIncomeTax([...monthWorkDays, ...futureAsDays], settings).total;
  const projNet = projNetBeforeTax - projIncomeTax;
  const projTips = summary.tipsSum + estimatedTips;
  const projTotal = projNet + projTips;

  return (
    <div>
      <Card className="mb-4">
        <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">Current — {monthLabel(selectedMonth)}</p>
        <div className="grid grid-cols-2 gap-3">
          <StatBlock label="Net after Tax" value={fmtEuro(summary.netAfterTax)} accent="text-emerald-400" />
          <StatBlock label="Hours" value={summary.totalHours.toFixed(2)} />
        </div>
      </Card>

      <Card className="mb-4">
        <p className="text-sm font-medium text-zinc-200 mb-3">Add a Future Shift</p>
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Start">
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
          </Field>
          <Field label="End">
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <button
          onClick={() => onAdd({ date, start, end })}
          className="w-full mt-1 flex items-center justify-center gap-2 bg-sky-400 text-zinc-950 font-medium rounded-xl py-2.5"
        >
          <Plus size={16} /> Add Shift
        </button>
      </Card>

      {futureShifts.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {futureShifts.map((f) => (
            <Card key={f.id} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-100">{shiftDayLabel(f.date)}</p>
                <p className="text-xs text-zinc-500">{f.start}–{f.end} · {formatHM(calcHoursDecimal(f.start, f.end, 0))}</p>
              </div>
              <button onClick={() => onRemove(f.id)}>
                <Trash2 size={15} className="text-zinc-600" />
              </button>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <p className="text-xs uppercase tracking-wide text-zinc-500 mb-2">End of {monthLabel(selectedMonth).split(" ")[0]}, Projected</p>
        <div className="grid grid-cols-2 gap-3">
          <StatBlock label="Hours" value={projHours.toFixed(1)} />
          <StatBlock label="Income Tax" value={"-" + fmtEuro(projIncomeTax)} accent="text-red-400" />
          <StatBlock label="Net after Tax" value={fmtEuro(projNet)} accent="text-emerald-400" />
          <StatBlock label="Tips (estimated)" value={fmtEuro(projTips)} accent="text-amber-400" />
          <StatBlock label="Total" value={fmtEuro(projTotal)} />
        </div>
        <p className="text-xs text-zinc-500 mt-2">
          Tips are estimated from your average tip rate of {fmtEuro(tipRatePerHour)}/hour so far this month.
        </p>
      </Card>
    </div>
  );
}

// ---------- Settings ----------
function SettingsPage({ settings, onSave }) {
  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [newRateDate, setNewRateDate] = useState(todayStr());
  const [newRateValue, setNewRateValue] = useState("");

  function update(key, value) {
    setForm({ ...form, [key]: value });
    setSaved(false);
  }

  const sortedRates = [...form.rateHistory].sort((a, b) => b.date.localeCompare(a.date));

  function addRate() {
    if (!newRateValue || !newRateDate) return;
    const rest = form.rateHistory.filter((r) => r.date !== newRateDate);
    const next = [...rest, { date: newRateDate, rate: Number(newRateValue) }];
    update("rateHistory", next);
    setNewRateValue("");
  }
  function removeRate(date) {
    if (form.rateHistory.length <= 1) return; // always keep at least one
    update("rateHistory", form.rateHistory.filter((r) => r.date !== date));
  }

  return (
    <div>
      <Card className="mb-4">
        <p className="text-sm font-medium text-zinc-200 mb-1">Pay Rates</p>
        <p className="text-xs text-zinc-500 mb-3">
          Add a new row whenever your hourly rate changes. Each shift uses whichever rate was
          effective on its own date.
        </p>

        <div className="flex flex-col gap-2 mb-3">
          {sortedRates.map((r) => (
            <div key={r.date} className="flex items-center justify-between bg-zinc-800/60 rounded-xl px-3 py-2">
              <div>
                <p className="text-sm text-zinc-100 font-mono">{fmtEuro(r.rate)}/h</p>
                <p className="text-[11px] text-zinc-500">from {r.date}</p>
              </div>
              <button onClick={() => removeRate(r.date)} disabled={form.rateHistory.length <= 1}>
                <Trash2 size={15} className={form.rateHistory.length <= 1 ? "text-zinc-700" : "text-zinc-500"} />
              </button>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 mb-2">
          <Field label="Effective from">
            <input type="date" value={newRateDate} onChange={(e) => setNewRateDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="New rate (€/h)">
            <input
              type="number"
              step="0.01"
              value={newRateValue}
              onChange={(e) => setNewRateValue(e.target.value)}
              placeholder="14.99"
              className={inputClass}
            />
          </Field>
        </div>
        <button onClick={addRate} className="w-full flex items-center justify-center gap-2 bg-sky-400 text-zinc-950 font-medium rounded-xl py-2">
          <Plus size={16} /> Add Rate Change
        </button>
      </Card>

      <Card className="mb-4">
        <p className="text-sm font-medium text-zinc-200 mb-3">Pay Rules</p>
        <Field label="Vakantieuren (%)">
          <input type="number" step="0.01" value={form.vakantieurenPct} onChange={(e) => update("vakantieurenPct", Number(e.target.value))} className={inputClass} />
        </Field>
        <Field label="Vakantiegeld (%)">
          <input type="number" step="0.01" value={form.vakantiegeldPct} onChange={(e) => update("vakantiegeldPct", Number(e.target.value))} className={inputClass} />
        </Field>
      </Card>

      <Card className="mb-4">
        <p className="text-sm font-medium text-zinc-200 mb-1">Pension &amp; Deductions</p>
        <p className="text-xs text-zinc-500 mb-3">
          The four rates below are applied to the pension basis, not directly to gross pay.
        </p>
        <Field label="Pension basis (% of gross)">
          <input type="number" step="0.01" value={form.pensionBasisPct} onChange={(e) => update("pensionBasisPct", Number(e.target.value))} className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Ouderdomspensioen (%)">
            <input type="number" step="0.01" value={form.ouderdomspensioenPct} onChange={(e) => update("ouderdomspensioenPct", Number(e.target.value))} className={inputClass} />
          </Field>
          <Field label="Nabestaandenpensioen (%)">
            <input type="number" step="0.01" value={form.nabestaandenpensioenPct} onChange={(e) => update("nabestaandenpensioenPct", Number(e.target.value))} className={inputClass} />
          </Field>
          <Field label="W.G.A. (%)">
            <input type="number" step="0.01" value={form.wgaPct} onChange={(e) => update("wgaPct", Number(e.target.value))} className={inputClass} />
          </Field>
          <Field label="Premie HOP (%)">
            <input type="number" step="0.01" value={form.premieHopPct} onChange={(e) => update("premieHopPct", Number(e.target.value))} className={inputClass} />
          </Field>
        </div>
      </Card>

      <Card className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-medium text-zinc-200">Income Tax (NL 2026 estimate)</p>
          <button
            onClick={() => update("incomeTaxEnabled", !form.incomeTaxEnabled)}
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              form.incomeTaxEnabled ? "bg-emerald-400 text-zinc-950" : "bg-zinc-800 text-zinc-400"
            }`}
          >
            {form.incomeTaxEnabled ? "On" : "Off"}
          </button>
        </div>
        <p className="text-xs text-zinc-500 mb-3">
          Applied once per month to your total net-before-tax pay (not per shift), matching how
          Dutch payroll withholding actually works.
        </p>
        {form.incomeTaxEnabled && (
          <>
            <Field label="Combined tax rate (%)">
              <input type="number" step="0.01" value={form.incomeTaxRatePct} onChange={(e) => update("incomeTaxRatePct", Number(e.target.value))} className={inputClass} />
            </Field>
            <Field label="Vakantiegeld/vakantieuren tax rate (%)">
              <input type="number" step="0.01" value={form.specialBeloningenRatePct} onChange={(e) => update("specialBeloningenRatePct", Number(e.target.value))} className={inputClass} />
            </Field>
            <p className="text-[11px] text-zinc-500 -mt-2 mb-3">
              Dutch payroll taxes vakantiegeld/vakantieuren ("bijzondere beloningen") at this flat
              rate instead of the regular progressive table.
            </p>
            <p className="text-xs text-zinc-500 mb-1 mt-1">Algemene heffingskorting</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <Field label="Max (€/yr)">
                <input type="number" step="1" value={form.gtcMaxAnnual} onChange={(e) => update("gtcMaxAnnual", Number(e.target.value))} className={inputClass} />
              </Field>
              <Field label="Phase-out from (€/yr)">
                <input type="number" step="1" value={form.gtcPhaseoutThresholdAnnual} onChange={(e) => update("gtcPhaseoutThresholdAnnual", Number(e.target.value))} className={inputClass} />
              </Field>
              <Field label="Phase-out rate (%)">
                <input type="number" step="0.01" value={form.gtcPhaseoutRatePct} onChange={(e) => update("gtcPhaseoutRatePct", Number(e.target.value))} className={inputClass} />
              </Field>
            </div>
            <p className="text-xs text-zinc-500 mb-1">Arbeidskorting</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Rate 1 (%)">
                <input type="number" step="0.0001" value={form.akRate1Pct} onChange={(e) => update("akRate1Pct", Number(e.target.value))} className={inputClass} />
              </Field>
              <Field label="Threshold 1 (€/yr)">
                <input type="number" step="1" value={form.akThreshold1Annual} onChange={(e) => update("akThreshold1Annual", Number(e.target.value))} className={inputClass} />
              </Field>
              <Field label="Rate 2 (%)">
                <input type="number" step="0.001" value={form.akRate2Pct} onChange={(e) => update("akRate2Pct", Number(e.target.value))} className={inputClass} />
              </Field>
              <Field label="Threshold 2 (€/yr)">
                <input type="number" step="1" value={form.akThreshold2Annual} onChange={(e) => update("akThreshold2Annual", Number(e.target.value))} className={inputClass} />
              </Field>
              <Field label="Max (€/yr)">
                <input type="number" step="1" value={form.akMaxAnnual} onChange={(e) => update("akMaxAnnual", Number(e.target.value))} className={inputClass} />
              </Field>
              <Field label="Phase-out from (€/yr)">
                <input type="number" step="1" value={form.akAfbouwThresholdAnnual} onChange={(e) => update("akAfbouwThresholdAnnual", Number(e.target.value))} className={inputClass} />
              </Field>
              <Field label="Phase-out rate (%)">
                <input type="number" step="0.01" value={form.akAfbouwRatePct} onChange={(e) => update("akAfbouwRatePct", Number(e.target.value))} className={inputClass} />
              </Field>
            </div>
          </>
        )}
      </Card>

      <Card className="mb-4">
        <p className="text-sm font-medium text-zinc-200 mb-3">Goal</p>
        <Field label="Monthly goal (€)">
          <input type="number" step="1" value={form.monthlyGoal} onChange={(e) => update("monthlyGoal", Number(e.target.value))} className={inputClass} />
        </Field>
      </Card>

      <button
        onClick={() => {
          onSave(form);
          setSaved(true);
        }}
        className="w-full bg-emerald-400 text-zinc-950 font-medium rounded-2xl py-3"
      >
        {saved ? "Saved ✓" : "Save Settings"}
      </button>

      <p className="text-xs text-zinc-500 mt-4 leading-relaxed">
        Gross pay = hours × the rate effective on that date, plus vakantieuren and vakantiegeld
        (both calculated on the base wage). The pension basis is a percentage of that gross, and
        Ouderdomspensioen, Nabestaandenpensioen, W.G.A. and Premie HOP are each deducted from that
        basis. Income tax (loonheffing) is then estimated once per month on the resulting net pay.
        Tips are added on top of everything and are never taxed.
      </p>
    </div>
  );
}

// ---------- Modals ----------
function AddWorkModal({ settings, onClose, onSave }) {
  const [date, setDate] = useState(todayStr());
  const [start, setStart] = useState("17:00");
  const [end, setEnd] = useState("22:00");
  const [breakMin, setBreakMin] = useState(0);

  const hours = calcHoursDecimal(start, end, breakMin);
  const rate = getRateForDate(settings.rateHistory, date);
  const { gross, net } = calcPay(hours, rate, settings);

  return (
    <Modal title="Add Work Day" onClose={onClose}>
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Start">
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
        </Field>
        <Field label="End">
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
        </Field>
      </div>
      <Field label="Break (minutes)">
        <input type="number" value={breakMin} onChange={(e) => setBreakMin(e.target.value)} className={inputClass} />
      </Field>

      <div className="bg-zinc-800/60 rounded-xl p-3 my-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] text-zinc-500">Hours</p>
          <p className="font-mono text-sm text-zinc-100">{formatHM(hours)}</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-500">Gross</p>
          <p className="font-mono text-sm text-sky-400">{fmtEuro(gross)}</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-500">Net</p>
          <p className="font-mono text-sm text-emerald-400">{fmtEuro(net)}</p>
        </div>
      </div>
      <p className="text-[11px] text-zinc-500 -mt-2 mb-3">Using rate {fmtEuro(rate)}/h for this date.</p>

      <button
        onClick={() => onSave({ date, start, end, breakMin })}
        className="w-full bg-emerald-400 text-zinc-950 font-medium rounded-xl py-2.5"
      >
        Save
      </button>
    </Modal>
  );
}

function AddTipModal({ onClose, onSave }) {
  const [date, setDate] = useState(todayStr());
  const [amount, setAmount] = useState("");

  return (
    <Modal title="Add Tip" onClose={onClose}>
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Amount (€)">
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} placeholder="0.00" />
      </Field>
      <button
        onClick={() => onSave({ date, amount })}
        disabled={!amount}
        className="w-full bg-amber-400 text-zinc-950 font-medium rounded-xl py-2.5 disabled:opacity-40"
      >
        Save
      </button>
    </Modal>
  );
}
