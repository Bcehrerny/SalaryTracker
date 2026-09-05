import React, { useState, useEffect, useMemo } from "react";
import {
  Home, Clock, Coins, BarChart3, TrendingUp, Settings as SettingsIcon,
  Plus, X, Trash2, ChevronLeft, ChevronRight, ChevronDown, Target, Pencil, Heart, Sparkles, AlertCircle,
  Users,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const STORAGE_KEY = "wage-tracker-data-v1";

/* ============================================================
   THEME — cream base, cherry / bow / gingham cottagecore palette
   ============================================================ */
const C = {
  bg: "#FBF1E2",
  bgStripeA: "#FBF1E2",
  bgStripeB: "#F5E9D6",
  card: "#FFFBF3",
  cardAlt: "#FDF1E9",
  ink: "#5B4238",
  inkSoft: "#A48A7B",
  line: "#EEDDC4",
  pink: "#F3B7C7",
  pinkDeep: "#E0839C",
  pinkText: "#B85C77",
  rose: "#C1495A",
  roseDeep: "#A23649",
  sage: "#9FB37E",
  sageDeep: "#748C57",
  sageText: "#5D7442",
  blue: "#AAD0E3",
  blueDeep: "#6FA6C7",
  blueText: "#4F7F9C",
  lavender: "#DAC8ED",
  lavenderDeep: "#B79AD6",
  honey: "#F0CE83",
  honeyDeep: "#D8A83A",
  honeyText: "#9C7521",
  red: "#DE8686",
  redDeep: "#C05B5B",
  white: "#FFFFFF",
};

// each month gets its own patchwork wallpaper — alternating candy stripes and
// gingham checks in different pastel colorways, echoing the sticker-sheet
// reference (pink cherries / green stripes / blue gingham / lavender bows...)
const WALLPAPERS = [
  { mode: "stripe", color: C.pink },
  { mode: "gingham", color: C.sage },
  { mode: "stripe", color: C.blue },
  { mode: "gingham", color: C.pink },
  { mode: "stripe", color: C.lavender },
  { mode: "gingham", color: C.blue },
  { mode: "stripe", color: C.honey },
  { mode: "gingham", color: C.lavender },
];
function wallpaperForMonth(monthKeyStr) {
  let hash = 0;
  for (let i = 0; i < (monthKeyStr || "").length; i++) hash = (hash * 31 + monthKeyStr.charCodeAt(i)) >>> 0;
  return WALLPAPERS[hash % WALLPAPERS.length];
}
function wallpaperStyle({ mode, color }) {
  if (mode === "gingham") {
    return {
      backgroundColor: C.bg,
      backgroundImage: `repeating-linear-gradient(0deg, ${color}3d 0 16px, transparent 16px 32px), repeating-linear-gradient(90deg, ${color}3d 0 16px, transparent 16px 32px)`,
    };
  }
  return {
    backgroundColor: C.bg,
    backgroundImage: `repeating-linear-gradient(90deg, ${color}40 0 26px, transparent 26px 60px)`,
  };
}

const FONT_DISPLAY = "'Baloo 2', 'Quicksand', sans-serif";
const FONT_BODY = "'Nunito', sans-serif";

function FontLoader() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Nunito:wght@400;600;700;800&display=swap');
      * { box-sizing: border-box; }
      body { font-family: ${FONT_BODY}; }
      input[type="date"]::-webkit-calendar-picker-indicator,
      input[type="time"]::-webkit-calendar-picker-indicator { opacity: 0.6; }
      /* Chrome lays a time input out as a flex row: [datetime-edit][picker icon].
         Pull the icon out of flow and stretch the edit + its fields wrapper to the
         full width, otherwise there is nothing for justify-content to center in. */
      input[type="time"].center-time { position: relative; text-align: center; }
      input[type="time"].center-time::-webkit-calendar-picker-indicator {
        position: absolute; right: 0.35rem; top: 50%; transform: translateY(-50%); margin: 0; padding: 0;
      }
      input[type="time"].center-time::-webkit-datetime-edit {
        flex: 1 1 auto; width: 100%; text-align: center;
      }
      input[type="time"].center-time::-webkit-datetime-edit-fields-wrapper {
        display: flex; width: 100%; justify-content: center;
      }
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-thumb { background: ${C.line}; border-radius: 10px; }
    `}</style>
  );
}

const STORAGE_KEY_ = STORAGE_KEY; // keep name stable

const DEFAULT_SETTINGS = {
  rateHistory: [
    { date: "2026-01-01", rate: 14.71 },
    { date: "2026-07-01", rate: 15.05 },
  ],
  vakantieurenPct: 10.64, // "Res. Vrije Dagen" reservation, paid out monthly
  vakantiegeldPct: 8, // applied to (loon + vrije dagen) => effectively 8.8512% of base
  franchisePerHour: 7.746964, // PH&C 2026: €15,308/yr ÷ 1976 h (horeca); changes every January
  mealNormPerDay: 4.05, // fiscal normbedrag maaltijd 2026, charged per loondag
  fullDayHours: 7.6, // 1 loondag = 7.6 loonuren
  pensionResetMonth: "2026-06", // employer change: cumulative (VCR) pension restarts here
  ouderdomspensioenPct: 8.4,
  nabestaandenpensioenPct: 0.17,
  wgaPct: 0.44,
  premieHopPct: 0.1,
  monthlyGoal: 1000,
};

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

function migrateSettings(raw) {
  const merged = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  if (!merged.rateHistory || !merged.rateHistory.length) {
    if (raw && typeof raw.hourlyRate === "number") {
      merged.rateHistory = [{ date: "2020-01-01", rate: raw.hourlyRate }];
    } else {
      merged.rateHistory = DEFAULT_SETTINGS.rateHistory;
    }
  }
  // The old default July rate (14.99) predates the payslip, which shows 15.05.
  merged.rateHistory = merged.rateHistory.map((r) =>
    r.date === "2026-07-01" && r.rate === 14.99 ? { ...r, rate: 15.05 } : r
  );
  delete merged.hourlyRate;
  delete merged.pensionPct;
  delete merged.pensionBasisPct; // replaced by the franchise model
  return merged;
}

// Work days are stored as raw inputs only; pay is always derived from the
// current settings, so settings changes automatically apply everywhere.
function migrateWorkDay(w) {
  const row = {
    id: w.id || uid(),
    date: w.date,
    start: w.start,
    end: w.end,
    breakMin: Number(w.breakMin) || 0,
  };
  // Legacy rows without start/end keep their stored hours as a fallback.
  if ((!w.start || !w.end) && typeof w.hours === "number") row.hours = w.hours;
  return row;
}

/* ---------- helpers (unchanged business logic) ---------- */
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
function r2(n) {
  return Math.round((n || 0) * 100) / 100;
}
function shiftHours(w) {
  if (w.start && w.end) return calcHoursDecimal(w.start, w.end, w.breakMin);
  return w.hours || 0;
}

/* ---------- pay engine ----------
   Reproduces the payslip exactly. Per month:
     loon          = Σ (shift hours × rate on that date)
     vrijeDagen    = loon × 10.64%                 ("Meeruren 10,64% Res. Vrije Dagen")
     vakantiegeld  = (loon + vrijeDagen) × 8%      (effectively 8.8512% of loon)
     loondagen     = loonuren ÷ 7.6  (rounded to 2 dp)
     maaltijd      = loondagen × €4.05             (added to gross AND deducted from net)
     bruto         = loon + vrijeDagen + vakantiegeld + maaltijd
     verloondeUren = ⌈loonuren × 1.1064⌉           (rounded up to whole hours)
   Ouderdomspensioen uses the PH&C franchise, cumulative (VCR) per employer:
     cumGrondslag  = Σbruto − franchise × ΣverloondeUren
     OP this month = cumGrondslag × 8.4% − OP already paid
   NP = bruto × 0.17%;  HOP = bruto × 0.1%
   heffingsloon = bruto − OP − NP − HOP;  WGA = heffingsloon × 0.44%
   netBeforeTax = bruto − OP − NP − HOP − WGA − maaltijd  (loonheffing not predicted) */
function emptyMonthPay() {
  return {
    loonuren: 0, loon: 0, vrijeDagen: 0, vakantiegeld: 0, loondagen: 0,
    maaltijd: 0, bruto: 0, verloondeUren: 0, op: 0, np: 0, hop: 0,
    heffingsloon: 0, wga: 0, netBeforeTax: 0,
  };
}

function computeMonthlyPay(workDays, settings) {
  const s = settings;
  const byMonthShifts = {};
  for (const w of workDays) {
    const m = monthKey(w.date);
    if (!byMonthShifts[m]) byMonthShifts[m] = [];
    byMonthShifts[m].push(w);
  }
  const monthsSorted = Object.keys(byMonthShifts).sort();
  const byMonth = {};
  const byShift = {};

  const resetMonth = s.pensionResetMonth || "";
  let chain = null;
  let cumBruto = 0, cumUren = 0, cumOP = 0;

  for (const m of monthsSorted) {
    // The cumulative pension chain restarts when you change employer.
    const thisChain = resetMonth && m >= resetMonth ? "current" : "previous";
    if (thisChain !== chain) {
      chain = thisChain;
      cumBruto = 0; cumUren = 0; cumOP = 0;
    }

    let loonuren = 0;
    let loon = 0;
    const bases = [];
    for (const w of byMonthShifts[m]) {
      const h = shiftHours(w);
      const rate = getRateForDate(s.rateHistory, w.date);
      const base = h * rate;
      loonuren += h;
      loon += base;
      bases.push({ id: w.id, base });
    }
    loon = r2(loon);

    const vrijeDagen = r2(loon * s.vakantieurenPct / 100);
    const vakantiegeld = r2((loon + vrijeDagen) * s.vakantiegeldPct / 100);
    const loondagen = r2(loonuren / (s.fullDayHours || 7.6));
    const maaltijd = r2(loondagen * (s.mealNormPerDay || 0));
    const bruto = r2(loon + vrijeDagen + vakantiegeld + maaltijd);
    const verloondeUren = Math.ceil(r2(loonuren * (1 + s.vakantieurenPct / 100)) - 1e-9);

    cumBruto = r2(cumBruto + bruto);
    cumUren += verloondeUren;
    const cumGrondslag = Math.max(0, r2(cumBruto - (s.franchisePerHour || 0) * cumUren));
    const newCumOP = r2(cumGrondslag * s.ouderdomspensioenPct / 100);
    const op = r2(newCumOP - cumOP);
    cumOP = newCumOP;

    const np = r2(bruto * s.nabestaandenpensioenPct / 100);
    const hop = r2(bruto * s.premieHopPct / 100);
    const heffingsloon = r2(bruto - op - np - hop);
    const wga = r2(heffingsloon * s.wgaPct / 100);
    const netBeforeTax = r2(bruto - op - np - hop - wga - maaltijd);

    byMonth[m] = {
      loonuren, loon, vrijeDagen, vakantiegeld, loondagen, maaltijd,
      bruto, verloondeUren, op, np, hop, heffingsloon, wga, netBeforeTax,
    };

    // Allocate month totals back to shifts (proportional to base pay) so
    // per-day views have sensible numbers that sum to the month exactly.
    for (const b of bases) {
      const share = loon > 0 ? b.base / loon : 0;
      byShift[b.id] = { gross: r2(bruto * share), net: r2(netBeforeTax * share) };
    }
  }
  return { byMonth, byShift };
}

// Marginal effect of adding/replacing one shift on its month (used by the
// Add/Edit modals so the preview includes vakantiegeld, meal and pension).
function marginalShiftPay(workDays, settings, candidate, replaceId) {
  const others = replaceId ? workDays.filter((w) => w.id !== replaceId) : workDays;
  const m = monthKey(candidate.date);
  const withNew = computeMonthlyPay([...others, candidate], settings).byMonth[m] || emptyMonthPay();
  const without = computeMonthlyPay(others, settings).byMonth[m] || emptyMonthPay();
  return { gross: r2(withNew.bruto - without.bruto), net: r2(withNew.netBeforeTax - without.netBeforeTax) };
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
  return (d.getDay() + 6) % 7;
}
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthDays(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
function monthFirstWeekday(key) {
  const [y, m] = key.split("-").map(Number);
  return (new Date(y, m - 1, 1).getDay() + 6) % 7;
}

const TIP_PERIODS = [1, 2, 3];
function defaultTipRanges(month) {
  return [
    { start: 1, end: 10 },
    { start: 11, end: 20 },
    { start: 21, end: monthDays(month) },
  ];
}
function getTipRanges(tipPeriodRanges, month) {
  const custom = tipPeriodRanges && tipPeriodRanges[month];
  if (custom && custom.length === 3) return custom;
  return defaultTipRanges(month);
}
function tipRangeLabel(ranges, period) {
  const r = ranges[period - 1];
  return `${r.start}–${r.end}`;
}
function periodForDayInRanges(day, ranges) {
  for (let i = 0; i < ranges.length; i++) {
    if (day >= ranges[i].start && day <= ranges[i].end) return i + 1;
  }
  if (day < ranges[0].start) return 1;
  return ranges.length;
}
function periodForDay(day) {
  if (day <= 10) return 1;
  if (day <= 20) return 2;
  return 3;
}

/* ---------- tip split calculator (before/after 17:00, 50% to kitchen) ---------- */
const TIP_SPLIT_TIME = "17:00";
const KITCHEN_SHARE_PCT = 50;

// the people you might share a shift with — picked from a dropdown so names stay
// consistent across estimates. Anyone left unnamed is grouped as "Others".
const COWORKER_ROSTER = [
  "Keissy", "Zora", "Joe", "Jeyoun", "Ludvig", "Miko", "Jingya", "Tiffany", "Leana",
  "Chiyu", "Jaewoo", "Juae", "Charley", "Binxin", "Abby", "George", "Zhirang", "Woojay",
];
const ME_NAME = "Me";
const OTHERS_NAME = "Others";

// a soft color per person so the same face keeps the same color everywhere
const PERSON_COLORS = [C.pinkText, C.sageText, C.blueText, C.honeyText, C.lavenderDeep, C.roseDeep, C.sageDeep, C.blueDeep];
function colorForName(name) {
  if (name === ME_NAME) return C.pinkText;
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PERSON_COLORS[hash % PERSON_COLORS.length];
}

// how many hours a shift falls before/after the split time
function splitHoursAroundTime(start, end, splitTime) {
  let s = timeToMinutes(start);
  let e = timeToMinutes(end);
  if (e <= s) e += 24 * 60; // overnight shift safety
  const split = timeToMinutes(splitTime);
  const beforeMin = Math.max(0, Math.min(e, split) - s);
  const eveningMin = Math.max(0, e - Math.max(s, split));
  return { beforeH: beforeMin / 60, eveningH: eveningMin / 60 };
}

// splits the day's tips into a before-17:00 pool and an evening pool
// (closing total minus the before-17:00 total), takes the kitchen's cut out
// of each pool, then shares what's left among everyone proportional to the
// hours they worked within that pool
function calcTipSplit({ myShift, colleagues, tipBefore, tipClosing, splitTime = TIP_SPLIT_TIME, kitchenPct = KITCHEN_SHARE_PCT }) {
  const staffFactor = 1 - kitchenPct / 100;
  const before = Number(tipBefore) || 0;
  const closing = Number(tipClosing) || 0;
  const eveningTotal = Math.max(0, closing - before);

  const beforePoolStaff = before * staffFactor;
  const eveningPoolStaff = eveningTotal * staffFactor;

  const all = [
    { id: "me", name: ME_NAME, isMe: true, start: myShift?.start, end: myShift?.end },
    ...(colleagues || []).map((c, i) => ({
      id: c.id || `col-${i}`,
      name: (c.name || "").trim() || OTHERS_NAME,
      isMe: false,
      start: c.start,
      end: c.end,
    })),
  ].filter((p) => p && p.start && p.end);

  const withHours = all.map((p) => ({ ...p, ...splitHoursAroundTime(p.start, p.end, splitTime) }));

  const totalBeforeH = withHours.reduce((s, p) => s + p.beforeH, 0);
  const totalEveningH = withHours.reduce((s, p) => s + p.eveningH, 0);

  // everyone's cut, proportional to the hours they worked inside each pool
  const people = withHours.map((p) => {
    const beforeShare = totalBeforeH > 0 ? beforePoolStaff * (p.beforeH / totalBeforeH) : 0;
    const eveningShare = totalEveningH > 0 ? eveningPoolStaff * (p.eveningH / totalEveningH) : 0;
    return { ...p, beforeShare, eveningShare, total: beforeShare + eveningShare };
  });

  // several unnamed coworkers all read as "Others", so number them for display
  const counts = {};
  people.forEach((p) => { counts[p.name] = (counts[p.name] || 0) + 1; });
  const seen = {};
  people.forEach((p) => {
    if (counts[p.name] > 1) {
      seen[p.name] = (seen[p.name] || 0) + 1;
      p.displayName = `${p.name} ${seen[p.name]}`;
    } else {
      p.displayName = p.name;
    }
  });

  const me = people.find((p) => p.isMe) || {
    beforeH: 0, eveningH: 0, beforeShare: 0, eveningShare: 0, total: 0,
  };

  return {
    people,
    beforePoolStaff,
    eveningPoolStaff,
    totalBeforeH,
    totalEveningH,
    myBeforeH: me.beforeH,
    myEveningH: me.eveningH,
    myBeforeShare: me.beforeShare,
    myEveningShare: me.eveningShare,
    myTotal: me.total,
  };
}

// recompute an estimate's full breakdown from its stored raw inputs, so old
// records (saved before names existed) still work — they just show as "Others"
function peopleForEstimate(e) {
  return calcTipSplit({
    myShift: { start: e.myStart, end: e.myEnd },
    colleagues: e.colleagues,
    tipBefore: e.tipBefore,
    tipClosing: e.tipClosing,
  }).people;
}
function migrateTips(rawTips) {
  const buckets = {};
  (rawTips || []).forEach((t) => {
    let month, period;
    if (t.month && t.period) {
      month = t.month;
      period = t.period;
    } else if (t.date) {
      month = monthKey(t.date);
      period = periodForDay(Number(t.date.slice(8, 10)));
    } else {
      return;
    }
    const key = `${month}|${period}`;
    buckets[key] = (buckets[key] || 0) + (Number(t.amount) || 0);
  });
  return Object.entries(buckets).map(([key, amount]) => {
    const [month, period] = key.split("|");
    return { id: key, month, period: Number(period), amount };
  });
}

/* ============================================================
   small UI atoms — reskinned
   ============================================================ */

// soft dashed/gingham backdrop strip used behind headers
function GinghamStrip({ color = C.pink, height = 10 }) {
  return (
    <div
      style={{
        height,
        width: "100%",
        backgroundImage: `repeating-linear-gradient(45deg, ${color}55 0, ${color}55 6px, transparent 6px, transparent 12px)`,
        borderRadius: 999,
      }}
    />
  );
}

function Card({ children, className = "", accent, style = {} }) {
  return (
    <div
      className={`rounded-3xl p-4 ${className}`}
      style={{
        background: C.card,
        border: `2px solid ${accent ? accent + "77" : C.line}`,
        boxShadow: `0 2px 0 ${C.line}, 0 6px 14px -8px rgba(91,66,56,0.18)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ icon: Icon, children, color = C.pinkText }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      {Icon && <Icon size={13} style={{ color }} />}
      <span className="text-xs font-bold uppercase tracking-wide" style={{ color, fontFamily: FONT_BODY }}>
        {children}
      </span>
    </div>
  );
}

function StatBlock({ label, value, accent = C.ink, sub }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: C.inkSoft }}>{label}</span>
      <span className="text-xl font-extrabold tabular-nums" style={{ color: accent, fontFamily: FONT_DISPLAY }}>{value}</span>
      {sub && <span className="text-[11px]" style={{ color: C.inkSoft }}>{sub}</span>}
    </div>
  );
}

function ProgressBar({ pct, color = C.pink, colorDeep = C.pinkDeep }) {
  const clamped = Math.max(0, Math.min(1, pct || 0));
  return (
    <div className="w-full h-3.5 rounded-full overflow-hidden" style={{ background: C.cardAlt, border: `1.5px solid ${C.line}` }}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${clamped * 100}%`, background: `linear-gradient(90deg, ${color}, ${colorDeep})` }}
      />
    </div>
  );
}

function ProgressRing({ pct, size = 178, strokeWidth = 16 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, pct || 0));
  const offset = circumference * (1 - clamped);
  const gradId = "ringGrad";
  return (
    <svg width={size} height={size} className="-rotate-90">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={C.pink} />
          <stop offset="100%" stopColor={C.rose} />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} stroke={C.cardAlt} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        stroke={`url(#${gradId})`}
        fill="none"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}

// builds a smooth closed "wavy flower" outline — radius oscillates around the
// circle, like the scalloped medallion stickers in the reference images
function scallopPath(cx, cy, baseR, amplitude, bumps, steps = 240) {
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const rad = baseR + amplitude * Math.cos(bumps * t);
    const x = cx + rad * Math.cos(t);
    const y = cy + rad * Math.sin(t);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)} `;
  }
  return d + "Z";
}

// scalloped sticker medallion frame, echoes the flower/heart badges in the
// reference images — one clean wavy outline, no gaps or overlaps
function ScallopFrame({ size = 210, ringColor = C.pink, children }) {
  const cx = size / 2;
  const cy = size / 2;
  const amplitude = size * 0.035;
  const baseR = size / 2 - amplitude - 3;
  const outerPath = scallopPath(cx, cy, baseR, amplitude, 14);
  const innerPath = scallopPath(cx, cy, baseR - size * 0.052, amplitude * 0.72, 14);
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0">
        <path d={outerPath} fill={C.card} stroke={ringColor} strokeWidth={2.5} strokeLinejoin="round" />
        <path d={innerPath} fill="none" stroke={ringColor} strokeWidth={1.5} opacity={0.55} strokeLinejoin="round" />
      </svg>
      <div className="relative z-10 flex items-center justify-center">{children}</div>
    </div>
  );
}

function MonthNav({ months, selected, onChange }) {
  const idx = months.indexOf(selected);
  return (
    <div className="flex items-center justify-center gap-3 mb-4">
      <button
        disabled={idx <= 0}
        onClick={() => onChange(months[idx - 1])}
        className="p-1.5 rounded-full disabled:opacity-30"
        style={{ background: C.card, border: `2px solid ${C.line}` }}
      >
        <ChevronLeft size={16} style={{ color: C.pinkText }} />
      </button>
      <span className="text-sm font-bold w-40 text-center" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>
        {monthLabel(selected)}
      </span>
      <button
        disabled={idx >= months.length - 1}
        onClick={() => onChange(months[idx + 1])}
        className="p-1.5 rounded-full disabled:opacity-30"
        style={{ background: C.card, border: `2px solid ${C.line}` }}
      >
        <ChevronRight size={16} style={{ color: C.pinkText }} />
      </button>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(91,66,56,0.35)" }} onClick={onClose}>
      <div
        className="w-full sm:w-96 p-5 max-h-[85vh] overflow-y-auto rounded-3xl"
        style={{ background: C.card, border: `2px solid ${C.line}`, boxShadow: `0 12px 0 -6px ${C.line}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-extrabold text-lg" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full" style={{ background: C.cardAlt }}>
            <X size={15} style={{ color: C.inkSoft }} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, center }) {
  return (
    <div className="mb-3" style={{ minWidth: 0 }}>
      <label
        className="block text-[11px] font-bold mb-1"
        style={{ color: C.inkSoft, textAlign: center ? "center" : "left" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  minWidth: 0,
  background: C.cardAlt,
  border: `2px solid ${C.line}`,
  borderRadius: "0.9rem",
  padding: "0.5rem 0.75rem",
  color: C.ink,
  fontSize: "0.875rem",
  outline: "none",
};
function StyledInput(props) {
  return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}

function StyledSelect({ children, style = {}, ...props }) {
  return (
    <select
      {...props}
      style={{
        ...inputStyle,
        appearance: "none",
        fontWeight: 700,
        fontFamily: FONT_BODY,
        cursor: "pointer",
        ...style,
      }}
    >
      {children}
    </select>
  );
}

function PillButton({ children, onClick, bg = C.pink, bgDeep = C.pinkDeep, text = C.white, disabled, style = {}, className = "" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-2 font-extrabold rounded-2xl py-3 transition-transform active:translate-y-[2px] ${className}`}
      style={{
        background: bg,
        color: text,
        fontFamily: FONT_DISPLAY,
        boxShadow: disabled ? "none" : `0 4px 0 ${bgDeep}`,
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/* ============================================================
   main app
   ============================================================ */
export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [workDays, setWorkDays] = useState([]);
  const [tips, setTips] = useState([]);
  const [futureShifts, setFutureShifts] = useState([]);
  const [monthlyGoals, setMonthlyGoals] = useState({});
  const [afterTaxHeffingsloon, setAfterTaxHeffingsloon] = useState({}); // { "2026-07": 1334.87 } — heffingsloon minus loonheffing, from the real payslip
  const [tipPeriodRanges, setTipPeriodRanges] = useState({});
  const [tipEstimates, setTipEstimates] = useState([]);
  const [tab, setTab] = useState("dashboard");
  const [showAddWork, setShowAddWork] = useState(false);
  const [showTipCalc, setShowTipCalc] = useState(false);
  const [editingEstimate, setEditingEstimate] = useState(null);
  const [editingWorkDay, setEditingWorkDay] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [statsSub, setStatsSub] = useState("calendar");
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          setSettings(migrateSettings(parsed.settings));
          // Strip cached gross/net/rate from old rows; pay is now always
          // derived live from settings, so old logs update automatically.
          setWorkDays((parsed.workDays || []).map(migrateWorkDay));
          setTips(migrateTips(parsed.tips));
          setFutureShifts(parsed.futureShifts || []);
          setTipPeriodRanges(parsed.tipPeriodRanges || {});
          setTipEstimates(parsed.tipEstimates || []);
          setMonthlyGoals(parsed.monthlyGoals || {});
          setAfterTaxHeffingsloon(parsed.afterTaxHeffingsloon || {});
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
        monthlyGoals: next.monthlyGoals ?? monthlyGoals,
        afterTaxHeffingsloon: next.afterTaxHeffingsloon ?? afterTaxHeffingsloon,
        tipPeriodRanges: next.tipPeriodRanges ?? tipPeriodRanges,
        tipEstimates: next.tipEstimates ?? tipEstimates,
      };
      const result = await window.storage.set(STORAGE_KEY, JSON.stringify(payload), false);
      if (!result) setSaveError(true);
      else setSaveError(false);
    } catch (e) {
      setSaveError(true);
    }
  }
  function upsertTipEstimate(record) {
    const exists = tipEstimates.some((e) => e.id === record.id);
    const next = exists
      ? tipEstimates.map((e) => (e.id === record.id ? record : e))
      : [...tipEstimates, record];
    setTipEstimates(next);
    persist({ tipEstimates: next });
  }
  function removeTipEstimate(id) {
    const next = tipEstimates.filter((e) => e.id !== id);
    setTipEstimates(next);
    persist({ tipEstimates: next });
  }

  function addWorkDay(entry) {
    // Raw inputs only — everything else is derived from current settings.
    const row = { id: uid(), date: entry.date, start: entry.start, end: entry.end, breakMin: Number(entry.breakMin) || 0 };
    const next = [...workDays, row].sort((a, b) => a.date.localeCompare(b.date));
    setWorkDays(next);
    persist({ workDays: next });
  }
  function deleteWorkDay(id) {
    const next = workDays.filter((w) => w.id !== id);
    setWorkDays(next);
    persist({ workDays: next });
  }
  function updateWorkDay(updated) {
    const row = migrateWorkDay(updated);
    const next = workDays.map((w) => (w.id === row.id ? row : w)).sort((a, b) => a.date.localeCompare(b.date));
    setWorkDays(next);
    persist({ workDays: next });
  }
  function setTipRangeField(month, period, field, value) {
    const current = getTipRanges(tipPeriodRanges, month).map((r) => ({ ...r }));
    const num = Number(value);
    if (!isNaN(num)) current[period - 1] = { ...current[period - 1], [field]: num };
    const next = { ...tipPeriodRanges, [month]: current };
    setTipPeriodRanges(next);
    persist({ tipPeriodRanges: next });
  }
  function upsertTip(month, period, amountStr) {
    const id = `${month}|${period}`;
    const amount = Number(amountStr);
    const withoutThis = tips.filter((t) => t.id !== id);
    const next =
      amountStr === "" || isNaN(amount) || amount === 0
        ? withoutThis
        : [...withoutThis, { id, month, period, amount }];
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
  function setAfterTaxForMonth(month, value) {
    const next = { ...afterTaxHeffingsloon };
    if (value === "" || isNaN(Number(value))) delete next[month];
    else next[month] = Number(value);
    setAfterTaxHeffingsloon(next);
    persist({ afterTaxHeffingsloon: next });
  }
  function setGoalForMonth(month, value) {
    const next = { ...monthlyGoals };
    if (value === "" || isNaN(Number(value))) delete next[month];
    else next[month] = Number(value);
    setMonthlyGoals(next);
    persist({ monthlyGoals: next });
  }

  const months = useMemo(() => {
    const set = new Set([todayStr().slice(0, 7)]);
    workDays.forEach((w) => set.add(monthKey(w.date)));
    tips.forEach((t) => set.add(t.month));
    tipEstimates.forEach((e) => set.add(monthKey(e.date)));
    return Array.from(set).sort();
  }, [workDays, tips, tipEstimates]);

  const [selectedMonth, setSelectedMonth] = useState(todayStr().slice(0, 7));
  useEffect(() => {
    if (!months.includes(selectedMonth) && months.length) setSelectedMonth(months[months.length - 1]);
  }, [months]); // eslint-disable-line

  // ---- derived pay: recomputed whenever workDays OR settings change ----
  const payInfo = useMemo(() => computeMonthlyPay(workDays, settings), [workDays, settings]);
  const decoratedDays = useMemo(
    () =>
      workDays.map((w) => {
        const hours = shiftHours(w);
        const rate = getRateForDate(settings.rateHistory, w.date);
        const alloc = payInfo.byShift[w.id] || { gross: r2(hours * rate), net: r2(hours * rate) };
        return { ...w, hours, rate, gross: alloc.gross, net: alloc.net };
      }),
    [workDays, settings, payInfo]
  );

  const monthWorkDays = useMemo(() => decoratedDays.filter((w) => monthKey(w.date) === selectedMonth), [decoratedDays, selectedMonth]);
  const monthTips = useMemo(() => tips.filter((t) => t.month === selectedMonth), [tips, selectedMonth]);
  const monthEstimates = useMemo(
    () => tipEstimates.filter((e) => monthKey(e.date) === selectedMonth),
    [tipEstimates, selectedMonth]
  );

  const summary = useMemo(() => {
    const mp = payInfo.byMonth[selectedMonth] || emptyMonthPay();
    const tipsSum = monthTips.reduce((s, t) => s + t.amount, 0);
    // The user enters the after-tax heffingsloon from the real payslip;
    // loonheffing follows from it. Until entered, loonheffing counts as €0.
    const afterTax = afterTaxHeffingsloon[selectedMonth];
    const hasTaxEntry = typeof afterTax === "number";
    const loonheffing = hasTaxEntry ? r2(mp.heffingsloon - afterTax) : 0;
    const netFinal = r2(mp.netBeforeTax - loonheffing);
    return {
      totalHours: mp.loonuren, gross: mp.bruto, net: mp.netBeforeTax,
      heffingsloon: mp.heffingsloon, monthPay: mp,
      afterTax, hasTaxEntry, loonheffing, netFinal,
      tipsSum, total: netFinal + tipsSum,
    };
  }, [payInfo, selectedMonth, monthTips, afterTaxHeffingsloon]);

  const avgIncomePerHour = useMemo(() => {
    if (summary.totalHours > 0) return summary.total / summary.totalHours;
    // Fallback: net/hour of a synthetic 1-hour shift under current settings.
    const probe = computeMonthlyPay([{ id: "probe", date: todayStr(), hours: 1 }], settings);
    const mp = probe.byMonth[monthKey(todayStr())];
    return mp ? mp.netBeforeTax : 0;
  }, [summary, settings]);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <FontLoader />
        <span className="text-sm font-bold" style={{ color: C.inkSoft, fontFamily: FONT_DISPLAY }}>Loading… 🍒</span>
      </div>
    );
  }

  const wallpaper = wallpaperForMonth(selectedMonth);

  return (
    <div
      className="min-h-screen pb-28 transition-[background] duration-500"
      style={{
        ...wallpaperStyle(wallpaper),
        color: C.ink,
        fontFamily: FONT_BODY,
      }}
    >
      <FontLoader />
      <div className="max-w-md mx-auto px-4 pt-6">
        <TopBar tab={tab} />
        {saveError && (
          <div className="mb-3 text-xs font-bold rounded-2xl px-3 py-2" style={{ color: C.roseDeep, background: `${C.rose}22`, border: `2px solid ${C.rose}55` }}>
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
            monthlyGoals={monthlyGoals}
            monthWorkDays={monthWorkDays}
            monthTips={monthTips}
            avgIncomePerHour={avgIncomePerHour}
            onAddWork={() => setShowAddWork(true)}
            onGoToTips={() => setTab("tips")}
            onEditWork={setEditingWorkDay}
            onDeleteWork={setConfirmDeleteId}
            onSetGoal={(val) => setGoalForMonth(selectedMonth, val)}
            onSetAfterTax={(val) => setAfterTaxForMonth(selectedMonth, val)}
          />
        )}

        {tab === "worklog" && (
          <WorkLog
            months={months}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            monthWorkDays={monthWorkDays}
            onEdit={setEditingWorkDay}
            onDelete={setConfirmDeleteId}
          />
        )}

        {tab === "tips" && (
          <TipsPage
            months={months}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            monthTips={monthTips}
            onUpsert={upsertTip}
            tipRanges={getTipRanges(tipPeriodRanges, selectedMonth)}
            onRangeChange={(period, field, value) => setTipRangeField(selectedMonth, period, field, value)}
            monthEstimates={monthEstimates}
            onOpenCalculator={() => {
              setEditingEstimate(null);
              setShowTipCalc(true);
            }}
            onEditEstimate={(record) => {
              setEditingEstimate(record);
              setShowTipCalc(true);
            }}
            onDeleteEstimate={removeTipEstimate}
          />
        )}

        {tab === "stats" && (
          <StatsPage
            statsSub={statsSub}
            setStatsSub={setStatsSub}
            months={months}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            workDays={decoratedDays}
            tips={tips}
            settings={settings}
            monthlyGoals={monthlyGoals}
            tipPeriodRanges={tipPeriodRanges}
          />
        )}

        {tab === "prediction" && (
          <PredictionPage
            settings={settings}
            summary={summary}
            workDays={workDays}
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
          workDays={workDays}
          onClose={() => setShowAddWork(false)}
          onSave={(entry) => {
            addWorkDay(entry);
            setShowAddWork(false);
          }}
        />
      )}

      {showTipCalc && (
        <TipCalculatorModal
          initial={editingEstimate}
          onClose={() => {
            setShowTipCalc(false);
            setEditingEstimate(null);
          }}
          onSave={(record) => {
            upsertTipEstimate(record);
            setShowTipCalc(false);
            setEditingEstimate(null);
          }}
        />
      )}

      {editingWorkDay && (
        <EditWorkModal
          settings={settings}
          workDays={workDays}
          entry={editingWorkDay}
          onClose={() => setEditingWorkDay(null)}
          onSave={(updated) => {
            updateWorkDay(updated);
            setEditingWorkDay(null);
          }}
        />
      )}

      {confirmDeleteId && (
        <ConfirmDeleteModal
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => {
            deleteWorkDay(confirmDeleteId);
            setConfirmDeleteId(null);
          }}
        />
      )}
    </div>
  );
}

function TopBar({ tab }) {
  return (
    <div className="mb-3 pt-1">
      <GinghamStrip color={C.pink} height={6} />
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
    <div className="fixed bottom-0 left-0 right-0 px-3 pb-3">
      <div
        className="max-w-md mx-auto grid grid-cols-6 rounded-3xl"
        style={{ background: C.card, border: `2px solid ${C.line}`, boxShadow: `0 6px 18px -8px rgba(91,66,56,0.28)` }}
      >
        {items.map((it) => {
          const Icon = it.icon;
          const active = tab === it.id;
          return (
            <button key={it.id} onClick={() => setTab(it.id)} className="flex flex-col items-center gap-1 py-2.5">
              <div
                className="flex items-center justify-center rounded-full transition-colors"
                style={{ width: 30, height: 30, background: active ? C.pink : "transparent" }}
              >
                <Icon size={16} style={{ color: active ? C.white : C.inkSoft }} />
              </div>
              <span className="text-[9px] font-bold" style={{ color: active ? C.pinkText : C.inkSoft }}>{it.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PayslipLine({ label, value, bold = false, negative = false, final = false }) {
  return (
    <div
      className="flex items-baseline justify-between gap-2"
      style={bold ? { borderTop: `1.5px dashed ${C.line}`, paddingTop: 4, marginTop: 2 } : {}}
    >
      <span className={bold ? "font-extrabold" : ""} style={{ color: bold ? C.ink : C.inkSoft, fontFamily: bold ? FONT_DISPLAY : FONT_BODY }}>
        {label}
      </span>
      <span
        className={bold ? "font-extrabold" : "font-bold"}
        style={{ color: final ? C.sageText : negative ? C.roseDeep : C.ink, fontFamily: FONT_DISPLAY }}
      >
        {value < 0 ? `− ${fmtEuro(Math.abs(value))}` : fmtEuro(value)}
      </span>
    </div>
  );
}

/* ---------- Dashboard ---------- */
function Dashboard({
  months, selectedMonth, setSelectedMonth, summary, settings, monthlyGoals,
  monthWorkDays, monthTips, avgIncomePerHour, onAddWork, onGoToTips, onEditWork, onDeleteWork, onSetGoal, onSetAfterTax,
}) {
  const hasCustomGoal = typeof monthlyGoals[selectedMonth] === "number";
  const goal = hasCustomGoal ? monthlyGoals[selectedMonth] : settings.monthlyGoal;
  const pct = goal > 0 ? summary.total / goal : 0;
  const remaining = Math.max(goal - summary.total, 0);
  const hoursNeeded = avgIncomePerHour > 0 ? remaining / avgIncomePerHour : 0;

  const [payslipOpen, setPayslipOpen] = useState(false);
  const [goalInput, setGoalInput] = useState(hasCustomGoal ? String(monthlyGoals[selectedMonth]) : "");
  const [afterTaxInput, setAfterTaxInput] = useState(summary.hasTaxEntry ? String(summary.afterTax) : "");
  useEffect(() => {
    setGoalInput(typeof monthlyGoals[selectedMonth] === "number" ? String(monthlyGoals[selectedMonth]) : "");
    setAfterTaxInput(summary.hasTaxEntry ? String(summary.afterTax) : "");
  }, [selectedMonth]); // eslint-disable-line

  // Warn until the after-tax number is entered for a month that has logs.
  const needsTaxEntry = summary.totalHours > 0 && !summary.hasTaxEntry;

  const recent = useMemo(() => {
    return [...monthWorkDays].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  }, [monthWorkDays]);

  return (
    <div>
      <MonthNav months={months} selected={selectedMonth} onChange={setSelectedMonth} />

      <div className="flex flex-col items-center mb-5">
        <ScallopFrame size={200}>
          <ProgressRing pct={pct} size={148} strokeWidth={13} />
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span style={{ fontSize: 16, marginBottom: -2 }}>🍒</span>
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: C.inkSoft }}>Total Earned</span>
            <span className="text-xl font-extrabold tabular-nums" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>{fmtEuro(summary.total)}</span>
            <span className="text-[10px]" style={{ color: C.inkSoft }}>of {fmtEuro(goal)} goal</span>
          </div>
        </ScallopFrame>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card><StatBlock label="Worked Hours" value={formatHM(summary.totalHours)} /></Card>
        <Card><StatBlock label="Net" value={fmtEuro(summary.net)} accent={C.sageText} /></Card>
        <Card><StatBlock label="Heffingsloon" value={fmtEuro(summary.heffingsloon)} accent={C.blueText} /></Card>
        <Card><StatBlock label="Tips" value={fmtEuro(summary.tipsSum)} accent={C.honeyText} /></Card>
      </div>

      <Card className="mb-4" accent={C.blue}>
        <button
          type="button"
          onClick={() => setPayslipOpen((o) => !o)}
          className="w-full flex items-center justify-between"
          aria-expanded={payslipOpen}
        >
          <div className="flex items-center gap-2">
            <Coins size={15} style={{ color: C.blueText }} />
            <span className="text-sm font-extrabold" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>
              Payslip Preview
            </span>
          </div>
          <div className="flex items-center gap-2">
            {needsTaxEntry && <AlertCircle size={15} style={{ color: C.roseDeep }} />}
            {!payslipOpen && (
              <span className="text-xs font-extrabold tabular-nums" style={{ color: C.sageText, fontFamily: FONT_DISPLAY }}>
                {fmtEuro(summary.hasTaxEntry ? summary.netFinal : summary.monthPay.netBeforeTax)}
              </span>
            )}
            <ChevronDown
              size={16}
              style={{ color: C.inkSoft, transition: "transform 0.25s ease", transform: payslipOpen ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </div>
        </button>

        {payslipOpen && (
          <div className="mt-3">
            <div className="flex flex-col gap-1 text-xs tabular-nums" style={{ color: C.ink }}>
              <PayslipLine label={`Loon (${summary.monthPay.loonuren.toFixed(2)} u)`} value={summary.monthPay.loon} />
              <PayslipLine label={`Res. vrije dagen ${settings.vakantieurenPct}%`} value={summary.monthPay.vrijeDagen} />
              <PayslipLine label={`Vakantiegeld ${settings.vakantiegeldPct}%`} value={summary.monthPay.vakantiegeld} />
              <PayslipLine label={`Maaltijd (${summary.monthPay.loondagen.toFixed(2)} dg)`} value={summary.monthPay.maaltijd} />
              <PayslipLine label="Bruto loon" value={summary.monthPay.bruto} bold />
              <PayslipLine label={`Ouderdomspensioen ${settings.ouderdomspensioenPct}%`} value={-summary.monthPay.op} negative />
              <PayslipLine label={`Nabestaandenpensioen ${settings.nabestaandenpensioenPct}%`} value={-summary.monthPay.np} negative />
              <PayslipLine label={`W.G.A. ${settings.wgaPct}%`} value={-summary.monthPay.wga} negative />
              <PayslipLine label={`Premie HOP ${settings.premieHopPct}%`} value={-summary.monthPay.hop} negative />
              <PayslipLine label="Maaltijd" value={-summary.monthPay.maaltijd} negative />
              <PayslipLine
                label="Inhoudingen totaal"
                value={-(r2(summary.monthPay.op + summary.monthPay.np + summary.monthPay.wga + summary.monthPay.hop + summary.monthPay.maaltijd))}
                negative
                bold
              />
              <PayslipLine label="Netto (voor loonheffing)" value={summary.monthPay.netBeforeTax} bold final={!summary.hasTaxEntry} />
            </div>

            <div className="mt-3 rounded-2xl p-3" style={{ background: C.cardAlt, border: `1.5px solid ${needsTaxEntry ? `${C.rose}66` : C.line}` }}>
              <div className="flex items-center gap-1.5 mb-1">
                {needsTaxEntry && <AlertCircle size={13} style={{ color: C.roseDeep }} />}
                <span className="text-[11px] font-bold" style={{ color: needsTaxEntry ? C.roseDeep : C.inkSoft }}>
                  Heffingsloon after loonheffing (from your payslip)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span style={{ color: C.inkSoft }}>€</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder={fmtEuro(summary.heffingsloon).slice(1)}
                  value={afterTaxInput}
                  onChange={(e) => {
                    setAfterTaxInput(e.target.value);
                    onSetAfterTax(e.target.value);
                  }}
                  className="w-full bg-transparent text-base font-extrabold tabular-nums focus:outline-none"
                  style={{ color: summary.hasTaxEntry ? C.sageText : C.roseDeep, fontFamily: FONT_DISPLAY }}
                />
              </div>
              {summary.hasTaxEntry ? (
                <div className="flex flex-col gap-1 text-xs tabular-nums mt-2" style={{ color: C.ink }}>
                  <PayslipLine label="Loonheffing (derived)" value={-summary.loonheffing} negative />
                  <PayslipLine label="Netto (na loonheffing)" value={summary.netFinal} bold final />
                </div>
              ) : (
                <p className="text-[11px] mt-1.5" style={{ color: C.roseDeep }}>
                  Not entered yet — showing heffingsloon ({fmtEuro(summary.heffingsloon)}) as the
                  default, which assumes €0 loonheffing. When the payslip arrives, enter
                  heffingsloon minus loonheffing here.
                </p>
              )}
            </div>

            <p className="text-[11px] mt-2" style={{ color: C.inkSoft }}>
              Matches the payslip line by line — heffingsloon {fmtEuro(summary.monthPay.heffingsloon)},{" "}
              {summary.monthPay.verloondeUren} verloonde uren. Total Earned = net −
              (heffingsloon − the amount above) + tips.
            </p>
          </div>
        )}
      </Card>

      <Card className="mb-4" accent={C.pink}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Target size={15} style={{ color: C.pinkText }} />
            <span className="text-sm font-extrabold" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>
              Goal for {monthLabel(selectedMonth).split(" ")[0]}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <span style={{ color: C.inkSoft }}>€</span>
          <input
            type="number"
            step="1"
            placeholder={String(settings.monthlyGoal)}
            value={goalInput}
            onChange={(e) => {
              setGoalInput(e.target.value);
              onSetGoal(e.target.value);
            }}
            className="w-full bg-transparent text-lg font-extrabold tabular-nums focus:outline-none"
            style={{ color: C.pinkText, fontFamily: FONT_DISPLAY }}
          />
        </div>
        {/* <p className="text-[11px] mb-2" style={{ color: C.inkSoft }}>
          {hasCustomGoal ? "Custom goal for this month" : `Using default goal (${fmtEuro(settings.monthlyGoal)})`}
        </p> */}
        <ProgressBar pct={pct} />
        <div className="flex justify-between mt-2 text-[11px]" style={{ color: C.inkSoft }}>
          <span>{fmtEuro(summary.total)} / {fmtEuro(goal)}</span>
          <span>{Math.round(pct * 100)}%</span>
        </div>
        {remaining > 0 ? (
          <p className="text-xs mt-2" style={{ color: C.ink }}>
            Need <span className="font-extrabold">{formatHM(hoursNeeded)}</span> more to reach the goal
          </p>
        ) : (
          <p className="text-xs font-bold mt-2" style={{ color: C.sageText }}>Goal reached 🎉</p>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <PillButton onClick={onAddWork} bg={C.pink} bgDeep={C.pinkDeep}>
          <Plus size={17} /> Work Day
        </PillButton>
        <PillButton onClick={onGoToTips} bg={C.honey} bgDeep={C.honeyDeep} text={C.ink}>
          <Coins size={17} /> Tips
        </PillButton>
      </div>

      <h3 className="text-sm font-extrabold mb-2 flex items-center gap-1.5" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>
        <Clock size={14} style={{ color: C.pinkText }} /> Recent
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {recent.length === 0 && <p className="col-span-2 text-sm" style={{ color: C.inkSoft }}>Nothing logged yet this month 🎀</p>}
        {recent.map((r) => (
          <WorkGridCard key={r.id} row={r} onEdit={onEditWork} onDelete={onDeleteWork} />
        ))}
      </div>
    </div>
  );
}

/* ---------- Work Log ---------- */
function WorkLog({ months, selectedMonth, setSelectedMonth, monthWorkDays, onEdit, onDelete }) {
  const sorted = [...monthWorkDays].sort((a, b) => b.date.localeCompare(a.date));
  const monthDaysCount = monthDays(selectedMonth);
  const firstDay = `${selectedMonth}-01`;
  const lastDay = `${selectedMonth}-${String(monthDaysCount).padStart(2, "0")}`;

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);

  const filtered = sorted.filter((w) => w.date >= startDate && w.date <= endDate);
  const totalHours = filtered.reduce((s, d) => s + d.hours, 0);
  const workedDays = new Set(filtered.map((d) => d.date)).size;

  return (
    <div>
      <MonthNav months={months} selected={selectedMonth} onChange={setSelectedMonth} />

      <Card className="mb-4">
        <SectionTitle icon={Clock}>Select Date Range</SectionTitle>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Field label="Start Date">
            <StyledInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} min={firstDay} max={lastDay} />
          </Field>
          <Field label="End Date">
            <StyledInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={firstDay} max={lastDay} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Card style={{ background: C.cardAlt }}>
            <StatBlock label="Total Hours" value={formatHM(totalHours)} accent={C.sageText} />
          </Card>
          <Card style={{ background: C.cardAlt }}>
            <StatBlock label="Worked Days" value={String(workedDays)} accent={C.blueText} />
          </Card>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        {filtered.length === 0 && <p className="col-span-2 text-sm text-center mt-6" style={{ color: C.inkSoft }}>No shifts in this date range 🌸</p>}
        {filtered.map((r) => (
          <WorkGridCard key={r.id} row={r} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

function WorkGridCard({ row, onEdit, onDelete }) {
  return (
    <Card style={{ cursor: "pointer" }}>
      <div onClick={() => onEdit(row)}>
        <p className="text-xs font-extrabold" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>{shiftDayLabel(row.date)}</p>
        <p className="text-[10px]" style={{ color: C.inkSoft }}>{row.start}–{row.end}</p>
        <p className="text-[10px]" style={{ color: C.inkSoft }}>{formatHM(row.hours)}</p>
        <p className="text-sm font-extrabold mt-1" style={{ color: C.sageText, fontFamily: FONT_DISPLAY }}>{fmtEuro(row.net)}</p>
      </div>
      <div className="flex items-center justify-end gap-2 mt-1.5">
        <button onClick={() => onEdit(row)}>
          <Pencil size={12} style={{ color: C.inkSoft }} />
        </button>
        <button onClick={() => onDelete(row.id)}>
          <Trash2 size={13} style={{ color: C.inkSoft }} />
        </button>
      </div>
    </Card>
  );
}

/* ---------- Tips ---------- */
function TipsPage({
  months, selectedMonth, setSelectedMonth, monthTips, onUpsert, tipRanges, onRangeChange,
  monthEstimates, onOpenCalculator, onEditEstimate, onDeleteEstimate,
}) {
  const total = monthTips.reduce((s, t) => s + t.amount, 0);
  return (
    <div>
      <MonthNav months={months} selected={selectedMonth} onChange={setSelectedMonth} />
      <Card className="mb-4" accent={C.honey}>
        <StatBlock label="Tips this month" value={fmtEuro(total)} accent={C.honeyText} />
      </Card>
      {/* <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
        Tips are paid out 3 times a month. Defaults to days 1–10, 11–20, 21–end — tap the day numbers below to adjust a range if a payout lands early or late.
      </p> */}
      <div className="flex flex-col gap-3">
        {TIP_PERIODS.map((period) => (
          <TipPeriodCard
            key={period}
            month={selectedMonth}
            period={period}
            range={tipRanges[period - 1]}
            amount={monthTips.find((t) => t.period === period)?.amount ?? ""}
            onUpsert={onUpsert}
            onRangeChange={onRangeChange}
          />
        ))}
      </div>

      <div className="mt-6">
        <SectionTitle icon={Sparkles} color={C.blueText}>Tip Calculator (estimate only)</SectionTitle>
        {/* <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
          Estimate how much tip you'd get for today's shift, and compare it against what you record above. This estimate is never counted toward your monthly income.
        </p> */}
        <PillButton onClick={onOpenCalculator} bg={C.blue} bgDeep={C.blueDeep} className="w-full mb-3">
          🧮 Calculate today's tip
        </PillButton>
        {monthEstimates && monthEstimates.length > 0 && (
          <EstimatesReview
            monthEstimates={monthEstimates}
            onEditEstimate={onEditEstimate}
            onDeleteEstimate={onDeleteEstimate}
          />
        )}
      </div>
    </div>
  );
}

/* Predicted tips, viewable per person: pick a name and the month total plus each
   shift below switches to that person's share. */
function EstimatesReview({ monthEstimates, onEditEstimate, onDeleteEstimate }) {
  const [who, setWho] = useState(ME_NAME);
  const [expanded, setExpanded] = useState(null);

  // recomputed from raw inputs, so edits and old records stay in sync
  const rows = useMemo(
    () =>
      monthEstimates
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((e) => ({ e, people: peopleForEstimate(e) })),
    [monthEstimates]
  );

  // one entry per person, with their month total and how many shifts they were on
  const participants = useMemo(() => {
    const map = new Map();
    rows.forEach(({ people }) => {
      const byName = {};
      people.forEach((p) => {
        byName[p.name] = (byName[p.name] || 0) + p.total;
      });
      Object.entries(byName).forEach(([name, total]) => {
        const cur = map.get(name) || { name, isMe: name === ME_NAME, total: 0, shifts: 0 };
        cur.total += total;
        cur.shifts += 1;
        map.set(name, cur);
      });
    });
    return Array.from(map.values()).sort((a, b) =>
      a.isMe ? -1 : b.isMe ? 1 : b.total - a.total
    );
  }, [rows]);

  const active =
    participants.find((p) => p.name === who) || participants[0] || { name: ME_NAME, total: 0, shifts: 0, isMe: true };
  const activeColor = colorForName(active.name);

  // only the shifts this person actually worked
  const activeRows = rows
    .map(({ e, people }) => {
      const mine = people.filter((p) => p.name === active.name);
      if (!mine.length) return null;
      return {
        e,
        people,
        total: mine.reduce((s, p) => s + p.total, 0),
        window: mine.length === 1 ? `${mine[0].start}–${mine[0].end}` : `${mine.length} people`,
      };
    })
    .filter(Boolean);

  return (
    <>
      <Card className="mb-3" accent={C.blue}>
        <div className="flex items-start justify-between gap-2">
          <div style={{ minWidth: 0 }}>
            <StatBlock
              label="Predicted Tips Total"
              value={fmtEuro(active.total)}
              accent={activeColor}
              sub={`${active.shifts} shift${active.shifts === 1 ? "" : "s"} estimated`}
            />
          </div>
          {participants.length > 1 && (
            <div style={{ flexShrink: 0, maxWidth: "45%" }}>
              <div className="flex items-center gap-1 mb-1 justify-center">
                <Users size={11} style={{ color: C.inkSoft }} />
                <span className="text-[9px] font-bold uppercase" style={{ color: C.inkSoft }}>Show</span>
              </div>
              <StyledSelect
                value={active.name}
                onChange={(ev) => { setWho(ev.target.value); setExpanded(null); }}
                style={{
                  padding: "0.35rem 0.5rem",
                  fontSize: "0.75rem",
                  borderRadius: "0.75rem",
                  color: activeColor,
                  textAlign: "center",
                  textAlignLast: "center",
                }}
              >
                {participants.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.isMe ? "Me" : p.name}
                  </option>
                ))}
              </StyledSelect>
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        {activeRows.map(({ e, people, total, window }) => {
          const open = expanded === e.id;
          return (
            <Card key={e.id} accent={C.blue}>
              <div style={{ cursor: "pointer" }} onClick={() => onEditEstimate(e)}>
                <p className="text-[10px] font-bold" style={{ color: C.inkSoft }}>{shiftDayLabel(e.date)}</p>
                <p className="text-[10px]" style={{ color: C.inkSoft }}>{window}</p>
                <p className="text-base font-extrabold mt-1 tabular-nums" style={{ color: activeColor, fontFamily: FONT_DISPLAY }}>
                  {fmtEuro(total)}
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 mt-1.5">
                {people.length > 1 ? (
                  <button
                    onClick={() => setExpanded(open ? null : e.id)}
                    className="flex items-center gap-0.5 text-[10px] font-bold"
                    style={{ color: C.blueText }}
                  >
                    <Users size={11} />
                    {people.length}
                    <ChevronDown
                      size={10}
                      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}
                    />
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2">
                  <button onClick={() => onEditEstimate(e)}>
                    <Pencil size={12} style={{ color: C.inkSoft }} />
                  </button>
                  <button onClick={(ev) => { ev.stopPropagation(); onDeleteEstimate(e.id); }}>
                    <Trash2 size={13} style={{ color: C.inkSoft }} />
                  </button>
                </div>
              </div>

              {open && people.length > 1 && (
                <div className="flex flex-col gap-1 mt-1.5 pt-1.5" style={{ borderTop: `1.5px solid ${C.line}` }}>
                  {people
                    .slice()
                    .sort((a, b) => b.total - a.total)
                    .map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-1">
                        <span
                          className="text-[10px] font-bold truncate"
                          style={{ color: colorForName(p.name), opacity: p.name === active.name ? 1 : 0.7 }}
                        >
                          {p.isMe ? "Me" : p.displayName}
                        </span>
                        <span className="text-[10px] font-extrabold tabular-nums" style={{ color: C.ink }}>
                          {fmtEuro(p.total)}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}

function TipPeriodCard({ month, period, range, amount, onUpsert, onRangeChange }) {
  const [value, setValue] = useState(amount === "" ? "" : String(amount));
  useEffect(() => {
    setValue(amount === "" ? "" : String(amount));
  }, [month]); // eslint-disable-line

  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-extrabold" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>Days</span>
          <input
            type="number" min={1} max={31} value={range.start}
            onChange={(e) => onRangeChange(period, "start", e.target.value)}
            className="w-11 rounded-lg px-1.5 py-1 text-center text-xs font-bold focus:outline-none"
            style={{ background: C.cardAlt, border: `1.5px solid ${C.line}`, color: C.ink }}
          />
          <span style={{ color: C.inkSoft }}>–</span>
          <input
            type="number" min={1} max={31} value={range.end}
            onChange={(e) => onRangeChange(period, "end", e.target.value)}
            className="w-11 rounded-lg px-1.5 py-1 text-center text-xs font-bold focus:outline-none"
            style={{ background: C.cardAlt, border: `1.5px solid ${C.line}`, color: C.ink }}
          />
        </div>
        <Coins size={15} style={{ color: C.honeyText }} />
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span style={{ color: C.inkSoft }}>€</span>
        <input
          type="number" step="0.01" placeholder="0.00" value={value}
          onChange={(e) => { setValue(e.target.value); onUpsert(month, period, e.target.value); }}
          className="w-full bg-transparent text-lg font-extrabold tabular-nums focus:outline-none"
          style={{ color: C.honeyText, fontFamily: FONT_DISPLAY }}
        />
      </div>
    </Card>
  );
}

function TipCalculatorModal({ onClose, onSave, initial }) {
  const isEditing = !!initial;
  const [date, setDate] = useState(initial?.date || todayStr());
  const [myStart, setMyStart] = useState(initial?.myStart || "17:00");
  const [myEnd, setMyEnd] = useState(initial?.myEnd || "22:30");
  const [colleagues, setColleagues] = useState(
    initial?.colleagues ? initial.colleagues.map((c) => ({ ...c, id: c.id || uid() })) : []
  );
  const [newColName, setNewColName] = useState("");
  const [newColStart, setNewColStart] = useState("17:00");
  const [newColEnd, setNewColEnd] = useState("22:30");
  const [tipBefore, setTipBefore] = useState(initial?.tipBefore != null ? String(initial.tipBefore) : "");
  const [tipClosing, setTipClosing] = useState(initial?.tipClosing != null ? String(initial.tipClosing) : "");

  // names already on today's shift shouldn't show up in the dropdown twice
  const takenNames = new Set(colleagues.map((c) => (c.name || "").trim()).filter(Boolean));
  const availableNames = COWORKER_ROSTER.filter((n) => !takenNames.has(n));

  function addColleague() {
    if (!newColStart || !newColEnd) return;
    setColleagues([...colleagues, { id: uid(), name: newColName, start: newColStart, end: newColEnd }]);
    setNewColName("");
  }
  function removeColleague(id) {
    setColleagues(colleagues.filter((c) => c.id !== id));
  }
  function renameColleague(id, name) {
    setColleagues(colleagues.map((c) => (c.id === id ? { ...c, name } : c)));
  }

  const result = calcTipSplit({
    myShift: { start: myStart, end: myEnd },
    colleagues,
    tipBefore,
    tipClosing,
  });

  return (
    <Modal title={isEditing ? "Edit Tip Estimate ✏️" : "Tip Calculator 🧮"} onClose={onClose}>
      <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
        Splits the day's tips into a before-{TIP_SPLIT_TIME} pool and an evening pool, takes {KITCHEN_SHARE_PCT}% off each for the kitchen, then shares the rest based on everyone's hours in that window. This is just an estimate and won't affect your recorded tips.
      </p>

      <Field label="Date">
        <StyledInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>

      <div className="rounded-2xl p-3 mb-3" style={{ background: C.cardAlt, border: `1.5px solid ${C.line}` }}>
        <p className="text-xs font-bold mb-2" style={{ color: C.pinkText }}>My Shift</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Start" center>
            <StyledInput className="center-time" type="time" value={myStart} onChange={(e) => setMyStart(e.target.value)} style={{ textAlign: "center" }} />
          </Field>
          <Field label="End" center>
            <StyledInput className="center-time" type="time" value={myEnd} onChange={(e) => setMyEnd(e.target.value)} style={{ textAlign: "center" }} />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl p-3 mb-3" style={{ background: C.cardAlt, border: `1.5px solid ${C.line}` }}>
        <p className="text-xs font-bold mb-2" style={{ color: C.pinkText }}>Coworkers' Shifts</p>
        {colleagues.length === 0 && (
          <p className="text-[11px] mb-2" style={{ color: C.inkSoft }}>No coworkers added yet — add whoever worked with you today</p>
        )}
        {colleagues.length > 0 && (
          <div className="flex flex-col gap-2 mb-2">
            {colleagues.map((c) => {
              const name = (c.name || "").trim();
              return (
                <div
                  key={c.id}
                  className="grid items-center gap-2 rounded-xl px-2 py-1.5"
                  style={{ gridTemplateColumns: "1fr 3fr", background: C.card, border: `1.5px solid ${C.line}` }}
                >
                  <StyledSelect
                    value={name}
                    onChange={(e) => renameColleague(c.id, e.target.value)}
                    style={{
                      padding: "0.25rem 0.3rem",
                      fontSize: "0.7rem",
                      borderRadius: "0.6rem",
                      background: C.cardAlt,
                      textAlign: "center",
                      textAlignLast: "center",
                      color: name ? colorForName(name) : C.inkSoft,
                    }}
                  >
                    <option value="">{OTHERS_NAME}</option>
                    {COWORKER_ROSTER.filter((n) => n === name || !takenNames.has(n)).map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </StyledSelect>
                  <div className="relative flex items-center justify-center min-w-0">
                    <span className="text-xs font-bold whitespace-nowrap" style={{ color: C.ink }}>
                      {c.start} – {c.end}
                    </span>
                    <button
                      onClick={() => removeColleague(c.id)}
                      className="absolute"
                      style={{ right: 0, top: "50%", transform: "translateY(-50%)" }}
                    >
                      <Trash2 size={13} style={{ color: C.inkSoft }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="grid gap-2 mb-2 items-end" style={{ gridTemplateColumns: "1fr 1.5fr 1.5fr" }}>
          <Field label="Who" center>
            <StyledSelect
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              style={{
                padding: "0.5rem 0.3rem",
                fontSize: "0.7rem",
                textAlign: "center",
                textAlignLast: "center",
                color: newColName ? colorForName(newColName) : C.inkSoft,
              }}
            >
              <option value="">{OTHERS_NAME}</option>
              {availableNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </StyledSelect>
          </Field>
          <Field label="Start" center>
            <StyledInput
              className="center-time" type="time" value={newColStart} onChange={(e) => setNewColStart(e.target.value)}
              style={{ padding: "0.5rem 0.4rem", fontSize: "0.8rem", textAlign: "center" }}
            />
          </Field>
          <Field label="End" center>
            <StyledInput
              className="center-time" type="time" value={newColEnd} onChange={(e) => setNewColEnd(e.target.value)}
              style={{ padding: "0.5rem 0.4rem", fontSize: "0.8rem", textAlign: "center" }}
            />
          </Field>
        </div>
        <PillButton onClick={addColleague} bg={C.blue} bgDeep={C.blueDeep} className="py-2 w-full">
          <Plus size={15} /> Add Coworker
        </PillButton>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <Field label={`Tips before ${TIP_SPLIT_TIME} (€)`}>
          <StyledInput type="number" step="0.01" placeholder="0.00" value={tipBefore} onChange={(e) => setTipBefore(e.target.value)} />
        </Field>
        <Field label="Closing total tips (€)">
          <StyledInput type="number" step="0.01" placeholder="0.00" value={tipClosing} onChange={(e) => setTipClosing(e.target.value)} />
        </Field>
      </div>

      <div className="rounded-2xl p-3 mb-3" style={{ background: C.cardAlt, border: `2px solid ${C.honey}77` }}>
        <div className="grid grid-cols-2 gap-2 mb-2 text-center">
          <div>
            <p className="text-[10px] font-bold" style={{ color: C.inkSoft }}>Early share ({result.myBeforeH.toFixed(2)}h)</p>
            <p className="text-sm font-extrabold" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>{fmtEuro(result.myBeforeShare)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold" style={{ color: C.inkSoft }}>Evening share ({result.myEveningH.toFixed(2)}h)</p>
            <p className="text-sm font-extrabold" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>{fmtEuro(result.myEveningShare)}</p>
          </div>
        </div>
        <div className="text-center pt-2" style={{ borderTop: `1.5px solid ${C.line}` }}>
          <p className="text-[10px] font-bold uppercase" style={{ color: C.honeyText }}>You'll get about</p>
          <p className="text-2xl font-extrabold" style={{ color: C.honeyText, fontFamily: FONT_DISPLAY }}>{fmtEuro(result.myTotal)}</p>
        </div>

        {result.people.length > 1 && (
          <div className="mt-3 pt-2" style={{ borderTop: `1.5px solid ${C.line}` }}>
            <p className="text-[10px] font-bold uppercase mb-1.5" style={{ color: C.inkSoft }}>
              Everyone on today's shift
            </p>
            <div className="flex flex-col gap-1">
              {result.people
                .slice()
                .sort((a, b) => (a.isMe ? -1 : b.isMe ? 1 : b.total - a.total))
                .map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2">
                    <span
                      className="text-[11px] font-bold truncate"
                      style={{ color: p.isMe ? C.pinkText : colorForName(p.name) }}
                    >
                      {p.isMe ? "Me" : p.displayName}
                      <span className="font-normal ml-1" style={{ color: C.inkSoft }}>
                        {p.start}–{p.end}
                      </span>
                    </span>
                    <span className="text-[11px] font-extrabold tabular-nums" style={{ color: C.ink }}>
                      {fmtEuro(p.total)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      <PillButton
        onClick={() =>
          onSave({
            id: initial?.id || uid(),
            date,
            myStart,
            myEnd,
            colleagues,
            tipBefore: Number(tipBefore) || 0,
            tipClosing: Number(tipClosing) || 0,
            myTotal: result.myTotal,
          })
        }
        bg={C.pink}
        bgDeep={C.pinkDeep}
        className="w-full"
      >
        {isEditing ? "Save Changes" : "Save This Estimate"}
      </PillButton>
    </Modal>
  );
}

/* ---------- Stats ---------- */
function StatsPage({ statsSub, setStatsSub, months, selectedMonth, setSelectedMonth, workDays, tips, settings, monthlyGoals, tipPeriodRanges }) {
  const monthWorkDays = workDays.filter((w) => monthKey(w.date) === selectedMonth);
  const monthTips = tips.filter((t) => t.month === selectedMonth);
  const tipRanges = getTipRanges(tipPeriodRanges, selectedMonth);

  const totalHours = monthWorkDays.reduce((s, d) => s + d.hours, 0);
  const gross = monthWorkDays.reduce((s, d) => s + d.gross, 0);
  const net = monthWorkDays.reduce((s, d) => s + d.net, 0);
  const tipsSum = monthTips.reduce((s, t) => s + t.amount, 0);
  const total = net + tipsSum;

  const workedDaysCount = new Set(monthWorkDays.map((d) => d.date)).size;
  const avgHoursPerShift = monthWorkDays.length ? totalHours / monthWorkDays.length : 0;
  const weeksInMonth = Math.max(1, monthDays(selectedMonth) / 7);
  const avgHoursPerWeek = totalHours / weeksInMonth;

  const avgNetPerHour = totalHours ? net / totalHours : 0;
  const avgTipPerHour = totalHours ? tipsSum / totalHours : 0;
  const avgIncomePerHour = avgNetPerHour + avgTipPerHour;

  const shiftLengths = monthWorkDays.map((d) => d.hours);
  const longest = shiftLengths.length ? Math.max(...shiftLengths) : 0;
  const shortest = shiftLengths.length ? Math.min(...shiftLengths) : 0;
  const longestDay = monthWorkDays.find((d) => d.hours === longest);
  const shortestDay = monthWorkDays.find((d) => d.hours === shortest);

  const highestTip = monthTips.length ? Math.max(...monthTips.map((t) => t.amount)) : 0;
  const avgTipPerPeriod = monthTips.length ? tipsSum / monthTips.length : 0;

  const goal = typeof monthlyGoals[selectedMonth] === "number" ? monthlyGoals[selectedMonth] : settings.monthlyGoal;
  const pct = goal > 0 ? total / goal : 0;
  const remaining = Math.max(goal - total, 0);
  const hoursNeeded = avgIncomePerHour > 0 ? remaining / avgIncomePerHour : 0;

  const hoursByWeekday = WEEKDAYS.map((label, idx) => {
    const h = monthWorkDays.filter((d) => weekdayIdx(d.date) === idx).reduce((s, d) => s + d.hours, 0);
    return { day: label, hours: Math.round(h * 100) / 100 };
  });
  const incomeByPeriod = TIP_PERIODS.map((period) => {
    const workNet = monthWorkDays
      .filter((d) => periodForDayInRanges(Number(d.date.slice(8, 10)), tipRanges) === period)
      .reduce((s, d) => s + d.net, 0);
    const tipAmt = monthTips.find((t) => t.period === period)?.amount || 0;
    return { period: tipRangeLabel(tipRanges, period), income: Math.round((workNet + tipAmt) * 100) / 100 };
  });

  const firstWeekday = monthFirstWeekday(selectedMonth);
  const daysCount = monthDays(selectedMonth);
  const today = todayStr();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysCount; d++) {
    const dateStr = `${selectedMonth}-${String(d).padStart(2, "0")}`;
    const hrs = monthWorkDays.filter((w) => w.date === dateStr).reduce((s, w) => s + w.hours, 0);
    const netDay = monthWorkDays.filter((w) => w.date === dateStr).reduce((s, w) => s + w.net, 0);
    let bg = C.cardAlt, fg = C.inkSoft, border = C.line;
    if (hrs >= 6) { bg = `${C.sage}33`; fg = C.sageText; border = `${C.sage}88`; }
    else if (hrs > 0) { bg = `${C.honey}33`; fg = C.honeyText; border = `${C.honey}99`; }
    else if (dateStr <= today) { bg = `${C.red}22`; fg = C.redDeep; border = `${C.red}55`; }
    cells.push({ day: d, hrs, netDay, bg, fg, border });
  }

  const allMonths = Array.from(new Set([...workDays.map((w) => monthKey(w.date)), ...tips.map((t) => t.month)])).sort();
  const yearOf = selectedMonth.slice(0, 4);
  const yearMonths = allMonths.filter((m) => m.startsWith(yearOf));
  const yearHours = workDays.filter((w) => yearMonths.includes(monthKey(w.date))).reduce((s, w) => s + w.hours, 0);
  const yearNet = workDays.filter((w) => yearMonths.includes(monthKey(w.date))).reduce((s, w) => s + w.net, 0);
  const yearTips = tips.filter((t) => yearMonths.includes(t.month)).reduce((s, t) => s + t.amount, 0);

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
            className="px-3 py-1.5 rounded-full text-xs whitespace-nowrap font-bold"
            style={
              statsSub === s.id
                ? { background: C.pink, color: C.white, border: `2px solid ${C.pink}` }
                : { background: C.card, color: C.inkSoft, border: `2px solid ${C.line}` }
            }
          >
            {s.label}
          </button>
        ))}
      </div>

      {statsSub === "overview" && (
        <div className="flex flex-col gap-3">
          <Card>
            <SectionTitle icon={Sparkles}>Salary Overview</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <StatBlock label="Gross Salary" value={fmtEuro(gross)} accent={C.blueText} />
              <StatBlock label="Net Salary" value={fmtEuro(net)} accent={C.sageText} sub="after pension" />
              <StatBlock label="Tips" value={fmtEuro(tipsSum)} accent={C.honeyText} />
              <StatBlock label="Total Income" value={fmtEuro(total)} />
            </div>
          </Card>

          <Card>
            <SectionTitle icon={Clock}>Working Hours</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <StatBlock label="Total Hours" value={formatHM(totalHours)} />
              <StatBlock label="Worked Days" value={String(workedDaysCount)} />
              <StatBlock label="Avg / Shift" value={formatHM(avgHoursPerShift)} />
              <StatBlock label="Avg / Week" value={formatHM(avgHoursPerWeek)} />
            </div>
          </Card>

          <Card>
            <SectionTitle icon={Coins}>Earnings per Hour</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <StatBlock label="Hourly Wage" value={fmtEuro(getRateForDate(settings.rateHistory, selectedMonth + "-01"))} />
              <StatBlock label="Avg Net / Hour" value={fmtEuro(avgNetPerHour)} accent={C.sageText} />
              <StatBlock label="Avg Tip / Hour" value={fmtEuro(avgTipPerHour)} accent={C.honeyText} />
              <StatBlock label="Avg Income / Hour" value={fmtEuro(avgIncomePerHour)} />
            </div>
            <p className="text-[11px] mt-2" style={{ color: C.inkSoft }}>What you actually take home per hour worked, wage + tips combined.</p>
          </Card>

          <Card>
            <SectionTitle icon={Clock}>Shift Statistics</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <StatBlock label="Longest Shift" value={formatHM(longest)} sub={longestDay ? shiftDayLabel(longestDay.date) : "—"} />
              <StatBlock label="Shortest Shift" value={formatHM(shortest)} sub={shortestDay ? shiftDayLabel(shortestDay.date) : "—"} />
              <StatBlock label="Average Shift" value={formatHM(avgHoursPerShift)} />
            </div>
          </Card>

          <Card>
            <SectionTitle icon={Coins}>Tips</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <StatBlock label="Total Tips" value={fmtEuro(tipsSum)} accent={C.honeyText} />
              <StatBlock label="Highest Tip" value={fmtEuro(highestTip)} accent={C.honeyText} />
              <StatBlock label="Avg / Period" value={fmtEuro(avgTipPerPeriod)} />
              <StatBlock label="Avg / Hour" value={fmtEuro(avgTipPerHour)} />
            </div>
          </Card>

          <Card accent={C.pink}>
            <div className="flex items-center gap-2 mb-2">
              <Target size={15} style={{ color: C.pinkText }} />
              <span className="text-sm font-extrabold" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>Monthly Goal {fmtEuro(goal)}</span>
            </div>
            <ProgressBar pct={pct} />
            <p className="text-[11px] mt-2" style={{ color: C.inkSoft }}>{Math.round(pct * 100)}%</p>
            {remaining > 0 ? (
              <p className="text-xs mt-1" style={{ color: C.ink }}>
                Remaining <span className="font-extrabold">{fmtEuro(remaining)}</span> · Need <span className="font-extrabold">{formatHM(hoursNeeded)}</span>
              </p>
            ) : (
              <p className="text-xs font-bold mt-1" style={{ color: C.sageText }}>Goal reached 🎉</p>
            )}
          </Card>
        </div>
      )}

      {statsSub === "calendar" && (
        <Card>
          <div className="grid grid-cols-7 gap-1 mb-2 text-center">
            {WEEKDAYS.map((w) => (
              <span key={w} className="text-[10px] font-bold" style={{ color: C.inkSoft }}>{w[0]}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((c, i) =>
              c ? (
                <div key={i} className="rounded-xl py-1.5 flex flex-col items-center" style={{ background: c.bg, border: `1.5px solid ${c.border}` }}>
                  <span className="text-xs font-bold" style={{ color: c.fg }}>{c.day}</span>
                  {c.hrs > 0 && <span className="text-[8px] font-mono" style={{ color: c.fg }}>{fmtEuro(c.netDay)}</span>}
                </div>
              ) : (
                <div key={i} />
              )
            )}
          </div>
          <div className="flex gap-3 mt-3 text-[10px]" style={{ color: C.inkSoft }}>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: `${C.sage}88` }} /> Long shift</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: `${C.honey}88` }} /> Normal</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: `${C.red}55` }} /> No work</span>
          </div>
        </Card>
      )}

      {statsSub === "charts" && (
        <div className="flex flex-col gap-4">
          <Card>
            <SectionTitle icon={BarChart3}>Hours by Weekday</SectionTitle>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={hoursByWeekday}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
                <XAxis dataKey="day" tick={{ fill: C.inkSoft, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.inkSoft, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: C.card, border: `2px solid ${C.line}`, borderRadius: 12 }} labelStyle={{ color: C.ink }} />
                <Bar dataKey="hours" fill={C.pink} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <SectionTitle icon={Coins}>Income by Pay Period</SectionTitle>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={incomeByPeriod}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.line} vertical={false} />
                <XAxis dataKey="period" tick={{ fill: C.inkSoft, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.inkSoft, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: C.card, border: `2px solid ${C.line}`, borderRadius: 12 }} labelStyle={{ color: C.ink }} />
                <Bar dataKey="income" fill={C.blue} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {statsSub === "history" && (
        <div className="flex flex-col gap-2">
          {allMonths.length === 0 && <p className="text-sm text-center mt-6" style={{ color: C.inkSoft }}>No history yet 🌸</p>}
          {allMonths.slice().reverse().map((m) => {
            const mDays = workDays.filter((w) => monthKey(w.date) === m);
            const mh = mDays.reduce((s, w) => s + w.hours, 0);
            const mn = mDays.reduce((s, w) => s + w.net, 0);
            return (
              <Card key={m} className="flex items-center justify-between">
                <span className="text-sm font-extrabold" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>{monthLabel(m)}</span>
                <div className="flex gap-4 text-right">
                  <StatBlock label="Hours" value={formatHM(mh)} />
                  <StatBlock label="Net" value={fmtEuro(mn)} accent={C.sageText} />
                </div>
              </Card>
            );
          })}
          <Card className="mt-2" accent={C.lavender}>
            <SectionTitle icon={Sparkles} color={C.lavenderDeep}>{yearOf} Total</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <StatBlock label="Hours" value={formatHM(yearHours)} />
              <StatBlock label="Net Salary" value={fmtEuro(yearNet)} accent={C.sageText} />
              <StatBlock label="Tips" value={fmtEuro(yearTips)} accent={C.honeyText} />
              <StatBlock label="Grand Total" value={fmtEuro(yearNet + yearTips)} />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ---------- Prediction ---------- */
function PredictionPage({ settings, summary, workDays, selectedMonth, futureShifts, onAdd, onRemove }) {
  const [date, setDate] = useState(todayStr());
  const [start, setStart] = useState("17:00");
  const [end, setEnd] = useState("22:30");

  // Project the month by running the real pay engine over logged + future
  // shifts together, so vakantiegeld, meal and the cumulative pension are
  // all as accurate as the payslip.
  const projected = useMemo(() => {
    const futureRows = futureShifts.map((f) => ({ id: "future_" + f.id, date: f.date, start: f.start, end: f.end, breakMin: 0 }));
    const pay = computeMonthlyPay([...workDays, ...futureRows], settings);
    return pay.byMonth[selectedMonth] || emptyMonthPay();
  }, [workDays, futureShifts, settings, selectedMonth]);

  const addedHours = Math.max(0, projected.loonuren - summary.totalHours);
  const addedNet = r2(projected.netBeforeTax - summary.net);
  const tipRatePerHour = summary.totalHours > 0 ? summary.tipsSum / summary.totalHours : 0;
  const estimatedTips = tipRatePerHour * addedHours;

  const projHours = projected.loonuren;
  const projTipsTotal = summary.tipsSum + estimatedTips;
  const projectedTotal = projected.netBeforeTax + projTipsTotal;

  return (
    <div>
      <Card className="mb-4">
        <SectionTitle icon={Sparkles}>Current — {monthLabel(selectedMonth)}</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <StatBlock label="Net Salary" value={fmtEuro(summary.net)} accent={C.sageText} />
          <StatBlock label="Hours" value={summary.totalHours.toFixed(2)} />
        </div>
      </Card>

      <Card className="mb-4">
        <SectionTitle icon={Plus}>Add a Future Shift</SectionTitle>
        <Field label="Date">
          <StyledInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Start"><StyledInput type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="End"><StyledInput type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <PillButton onClick={() => onAdd({ date, start, end })} bg={C.blue} bgDeep={C.blueDeep} className="mt-1">
          <Plus size={16} /> Add Shift
        </PillButton>
      </Card>

      {futureShifts.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {futureShifts.map((f) => (
            <Card key={f.id} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-extrabold" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>{shiftDayLabel(f.date)}</p>
                <p className="text-xs" style={{ color: C.inkSoft }}>{f.start}–{f.end} · {formatHM(calcHoursDecimal(f.start, f.end, 0))}</p>
              </div>
              <button onClick={() => onRemove(f.id)}>
                <Trash2 size={15} style={{ color: C.inkSoft }} />
              </button>
            </Card>
          ))}
        </div>
      )}

      <Card accent={C.lavender}>
        <SectionTitle icon={TrendingUp} color={C.lavenderDeep}>End of {monthLabel(selectedMonth).split(" ")[0]}, Projected</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <StatBlock label="Projected Hours" value={projHours.toFixed(1)} sub={addedHours > 0 ? `+${formatHM(addedHours)} planned` : undefined} />
          <StatBlock label="Extra Net Expected" value={fmtEuro(addedNet)} accent={C.blueText} sub="from planned shifts" />
          <StatBlock label="Tips (estimated)" value={fmtEuro(projTipsTotal)} accent={C.honeyText} />
          <StatBlock label="Projected Total" value={fmtEuro(projectedTotal)} accent={C.sageText} />
        </div>
        <p className="text-[11px] mt-2" style={{ color: C.inkSoft }}>
          Projected Total = what you've earned so far this month ({fmtEuro(summary.total)}) + extra net from planned shifts + estimated
          tips, using your average tip rate of {fmtEuro(tipRatePerHour)}/hour so far.
        </p>
      </Card>
    </div>
  );
}

/* ---------- Settings ---------- */
const NUMERIC_SETTINGS = [
  "vakantieurenPct", "vakantiegeldPct", "franchisePerHour", "mealNormPerDay",
  "fullDayHours", "ouderdomspensioenPct", "nabestaandenpensioenPct",
  "wgaPct", "premieHopPct", "monthlyGoal",
];

function SettingsPage({ settings, onSave }) {
  // Numeric fields are kept as strings while editing; every valid change is
  // saved immediately and recalculates all logged months automatically.
  const [form, setForm] = useState(() => {
    const f = { ...settings };
    NUMERIC_SETTINGS.forEach((k) => (f[k] = String(settings[k] ?? "")));
    return f;
  });
  const [newRateDate, setNewRateDate] = useState(todayStr());
  const [newRateValue, setNewRateValue] = useState("");

  function update(key, value) {
    const nextForm = { ...form, [key]: value };
    setForm(nextForm);
    const next = { ...settings, rateHistory: nextForm.rateHistory, pensionResetMonth: nextForm.pensionResetMonth };
    NUMERIC_SETTINGS.forEach((k) => {
      const n = Number(nextForm[k]);
      if (nextForm[k] !== "" && Number.isFinite(n)) next[k] = n;
    });
    onSave(next);
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
    if (form.rateHistory.length <= 1) return;
    update("rateHistory", form.rateHistory.filter((r) => r.date !== date));
  }

  return (
    <div>
      <div className="mb-4 text-xs font-bold rounded-2xl px-3 py-2" style={{ color: C.sageText, background: `${C.sage}22`, border: `2px solid ${C.sage}55` }}>
        Changes save automatically and instantly recalculate every logged month. 🍒
      </div>
      <Card className="mb-4">
        <SectionTitle icon={Coins}>Pay Rates</SectionTitle>
        <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
          Add a new row whenever your hourly rate changes. Each shift uses whichever rate was effective on its own date.
        </p>

        <div className="flex flex-col gap-2 mb-3">
          {sortedRates.map((r) => (
            <div key={r.date} className="flex items-center justify-between rounded-2xl px-3 py-2" style={{ background: C.cardAlt, border: `1.5px solid ${C.line}` }}>
              <div>
                <p className="text-sm font-extrabold" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>{fmtEuro(r.rate)}/h</p>
                <p className="text-[11px]" style={{ color: C.inkSoft }}>from {r.date}</p>
              </div>
              <button onClick={() => removeRate(r.date)} disabled={form.rateHistory.length <= 1}>
                <Trash2 size={15} style={{ color: form.rateHistory.length <= 1 ? `${C.inkSoft}55` : C.inkSoft }} />
              </button>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 mb-2">
          <Field label="Effective from"><StyledInput type="date" value={newRateDate} onChange={(e) => setNewRateDate(e.target.value)} /></Field>
          <Field label="New rate (€/h)">
            <StyledInput type="number" step="0.01" value={newRateValue} onChange={(e) => setNewRateValue(e.target.value)} placeholder="15.05" />
          </Field>
        </div>
        <PillButton onClick={addRate} bg={C.blue} bgDeep={C.blueDeep} className="py-2">
          <Plus size={16} /> Add Rate Change
        </PillButton>
      </Card>

      <Card className="mb-4">
        <SectionTitle icon={SettingsIcon}>Pay Rules</SectionTitle>
        <Field label="Vakantieuren (%)"><StyledInput type="number" step="0.01" value={form.vakantieurenPct} onChange={(e) => update("vakantieurenPct", e.target.value)} /></Field>
        <Field label="Vakantiegeld (%) — applied to loon + vrije dagen"><StyledInput type="number" step="0.01" value={form.vakantiegeldPct} onChange={(e) => update("vakantiegeldPct", e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Meal charge (€/loondag)"><StyledInput type="number" step="0.01" value={form.mealNormPerDay} onChange={(e) => update("mealNormPerDay", e.target.value)} /></Field>
          <Field label="Hours per loondag"><StyledInput type="number" step="0.1" value={form.fullDayHours} onChange={(e) => update("fullDayHours", e.target.value)} /></Field>
        </div>
        <p className="text-xs" style={{ color: C.inkSoft }}>
          Maaltijd = meal charge × (hours ÷ hours per loondag). It's added to gross and deducted
          from net, so it barely affects your cash — the fiscal normbedrag is €4.05 in 2026.
        </p>
      </Card>

      <Card className="mb-4">
        <SectionTitle icon={Sparkles}>Pension &amp; Deductions</SectionTitle>
        <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
          Ouderdomspensioen uses the PH&amp;C franchise, calculated cumulatively across the year:
          basis = gross − franchise × paid hours (rounded up). For 2026 the franchise is
          €15,308/yr ÷ 1976 h = €7.746964/h; it changes every January. Set the restart month to
          when you joined your current employer — the cumulative calculation starts over there.
        </p>
        <div className="grid grid-cols-2 gap-2 mb-1">
          <Field label="Franchise (€/hour)"><StyledInput type="number" step="0.000001" value={form.franchisePerHour} onChange={(e) => update("franchisePerHour", e.target.value)} /></Field>
          <Field label="Pension restarts from"><StyledInput type="month" value={form.pensionResetMonth || ""} onChange={(e) => update("pensionResetMonth", e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Ouderdomspensioen (%)"><StyledInput type="number" step="0.01" value={form.ouderdomspensioenPct} onChange={(e) => update("ouderdomspensioenPct", e.target.value)} /></Field>
          <Field label="Nabestaandenpensioen (%)"><StyledInput type="number" step="0.01" value={form.nabestaandenpensioenPct} onChange={(e) => update("nabestaandenpensioenPct", e.target.value)} /></Field>
          <Field label="W.G.A. (%)"><StyledInput type="number" step="0.01" value={form.wgaPct} onChange={(e) => update("wgaPct", e.target.value)} /></Field>
          <Field label="Premie HOP (%)"><StyledInput type="number" step="0.01" value={form.premieHopPct} onChange={(e) => update("premieHopPct", e.target.value)} /></Field>
        </div>
        <p className="text-xs" style={{ color: C.inkSoft }}>
          Nabestaanden &amp; HOP apply to full gross; W.G.A. applies to heffingsloon
          (gross − pension deductions).
        </p>
      </Card>

      <Card className="mb-4">
        <SectionTitle icon={Target}>Goal</SectionTitle>
        <p className="text-xs mb-3" style={{ color: C.inkSoft }}>
          Used as the fallback goal for any month that doesn't have its own custom goal. Set a custom goal for a specific month right on the Dashboard.
        </p>
        <Field label="Default monthly goal (€)"><StyledInput type="number" step="1" value={form.monthlyGoal} onChange={(e) => update("monthlyGoal", e.target.value)} /></Field>
      </Card>

      <p className="text-xs mt-4 leading-relaxed" style={{ color: C.inkSoft }}>
        Monthly pay follows your payslip exactly: loon = hours × rate; vrije dagen = loon × 10.64%;
        vakantiegeld = 8% of (loon + vrije dagen); maaltijd = €4.05 per 7.6-hour loondag (added to
        gross, deducted from net); ouderdomspensioen = 8.4% of the cumulative franchise basis;
        nabestaandenpensioen and HOP on full gross; W.G.A. on heffingsloon. Loonheffing (income
        tax) comes from the official tax tables and isn't predicted. Tips are added on top and
        never taxed.
      </p>
    </div>
  );
}

/* ---------- Modals ---------- */
function AddWorkModal({ settings, workDays, onClose, onSave }) {
  const [date, setDate] = useState(todayStr());
  const [start, setStart] = useState("17:00");
  const [end, setEnd] = useState("22:30");
  const [breakMin, setBreakMin] = useState(0);

  const hours = calcHoursDecimal(start, end, breakMin);
  const rate = getRateForDate(settings.rateHistory, date);
  // What this shift adds to its month, incl. vakantiegeld, meal & pension.
  const { gross, net } = useMemo(
    () => marginalShiftPay(workDays, settings, { id: "__preview__", date, start, end, breakMin: Number(breakMin) || 0 }),
    [workDays, settings, date, start, end, breakMin]
  );

  return (
    <Modal title="Add Work Day 🍒" onClose={onClose}>
      <Field label="Date"><StyledInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Start"><StyledInput type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="End"><StyledInput type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <Field label="Break (minutes)"><StyledInput type="number" value={breakMin} onChange={(e) => setBreakMin(e.target.value)} /></Field>

      <div className="rounded-2xl p-3 my-3 grid grid-cols-3 gap-2 text-center" style={{ background: C.cardAlt, border: `1.5px solid ${C.line}` }}>
        <div>
          <p className="text-[10px] font-bold" style={{ color: C.inkSoft }}>Hours</p>
          <p className="text-sm font-extrabold" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>{formatHM(hours)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold" style={{ color: C.inkSoft }}>Gross</p>
          <p className="text-sm font-extrabold" style={{ color: C.blueText, fontFamily: FONT_DISPLAY }}>{fmtEuro(gross)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold" style={{ color: C.inkSoft }}>Net</p>
          <p className="text-sm font-extrabold" style={{ color: C.sageText, fontFamily: FONT_DISPLAY }}>{fmtEuro(net)}</p>
        </div>
      </div>
      <p className="text-[11px] -mt-2 mb-3" style={{ color: C.inkSoft }}>Using rate {fmtEuro(rate)}/h for this date.</p>

      <PillButton onClick={() => onSave({ date, start, end, breakMin })} bg={C.pink} bgDeep={C.pinkDeep} className="w-full">
        Save
      </PillButton>
    </Modal>
  );
}

function EditWorkModal({ settings, workDays, entry, onClose, onSave }) {
  const [date, setDate] = useState(entry.date);
  const [start, setStart] = useState(entry.start);
  const [end, setEnd] = useState(entry.end);
  const [breakMin, setBreakMin] = useState(entry.breakMin || 0);

  const hours = calcHoursDecimal(start, end, breakMin);
  const rate = getRateForDate(settings.rateHistory, date);
  // What this (edited) shift contributes to its month, incl. everything.
  const { gross, net } = useMemo(
    () => marginalShiftPay(workDays, settings, { id: entry.id, date, start, end, breakMin: Number(breakMin) || 0 }, entry.id),
    [workDays, settings, entry.id, date, start, end, breakMin]
  );

  return (
    <Modal title="Edit Work Day ✏️" onClose={onClose}>
      <Field label="Date"><StyledInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Start"><StyledInput type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="End"><StyledInput type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <Field label="Break (minutes)"><StyledInput type="number" value={breakMin} onChange={(e) => setBreakMin(e.target.value)} /></Field>

      <div className="rounded-2xl p-3 my-3 grid grid-cols-3 gap-2 text-center" style={{ background: C.cardAlt, border: `1.5px solid ${C.line}` }}>
        <div>
          <p className="text-[10px] font-bold" style={{ color: C.inkSoft }}>Hours</p>
          <p className="text-sm font-extrabold" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>{formatHM(hours)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold" style={{ color: C.inkSoft }}>Gross</p>
          <p className="text-sm font-extrabold" style={{ color: C.blueText, fontFamily: FONT_DISPLAY }}>{fmtEuro(gross)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold" style={{ color: C.inkSoft }}>Net</p>
          <p className="text-sm font-extrabold" style={{ color: C.sageText, fontFamily: FONT_DISPLAY }}>{fmtEuro(net)}</p>
        </div>
      </div>
      <p className="text-[11px] -mt-2 mb-3" style={{ color: C.inkSoft }}>Using rate {fmtEuro(rate)}/h for this date.</p>

      <PillButton onClick={() => onSave({ ...entry, date, start, end, breakMin })} bg={C.pink} bgDeep={C.pinkDeep} className="w-full">
        Save Changes
      </PillButton>
    </Modal>
  );
}

function ConfirmDeleteModal({ onCancel, onConfirm }) {
  return (
    <Modal title="Delete Entry?" onClose={onCancel}>
      <p className="text-sm mb-4" style={{ color: C.inkSoft }}>This work log entry will be permanently removed. This can't be undone.</p>
      <div className="grid grid-cols-2 gap-2">
        <PillButton onClick={onCancel} bg={C.cardAlt} bgDeep={C.line} text={C.ink}>Cancel</PillButton>
        <PillButton onClick={onConfirm} bg={C.red} bgDeep={C.redDeep}>Delete</PillButton>
      </div>
    </Modal>
  );
}
