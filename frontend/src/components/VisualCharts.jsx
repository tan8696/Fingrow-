import React from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, Tooltip,
  BarChart, Bar,
  LineChart, Line,
} from 'recharts';

// ─── Color Palette (village-friendly, high contrast) ──────────────────────
const COLORS = {
  primary: '#006948',
  primaryLight: '#68dba9',
  bank: '#1d4ed8',
  bankLight: '#93bbfd',
  subsidy: '#f59e0b',
  subsidyLight: '#fcd34d',
  farmer: '#059669',
  farmerLight: '#6ee7b7',
  interest: '#9b3e3b',
  interestLight: '#fca5a5',
  surface: '#e9efe9',
  text: '#171d19',
  muted: '#6d7a72',
  green: '#16a34a',
  yellow: '#eab308',
  red: '#dc2626',
};

// ─── Format helpers ────────────────────────────────────────────────────────
export function fmtLakh(n) {
  const num = Number(n || 0);
  if (num >= 10000000) return '₹' + (num / 10000000).toFixed(1) + ' Cr';
  if (num >= 100000) return '₹' + (num / 100000).toFixed(1) + 'L';
  if (num >= 1000) return '₹' + (num / 1000).toFixed(0) + 'K';
  return '₹' + num.toLocaleString('en-IN');
}

// ─── 1. Loan Pie Chart (Donut: Your Money / Bank Loan / Subsidy) ──────────
export function LoanPieChart({ marginAmount, loanAmount, subsidyAmount, size = 200 }) {
  const data = [
    { name: 'Your Money', value: marginAmount, color: COLORS.farmer },
    { name: 'Bank Loan', value: loanAmount, color: COLORS.bank },
  ];
  if (subsidyAmount > 0) {
    data.push({ name: 'Subsidy', value: subsidyAmount, color: COLORS.subsidy });
  }
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex flex-col items-center gap-3">
      <ResponsiveContainer width={size} height={size}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.3}
            outerRadius={size * 0.44}
            paddingAngle={3}
            dataKey="value"
            strokeWidth={0}
            animationBegin={0}
            animationDuration={800}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute flex flex-col items-center justify-center pointer-events-none" style={{ width: size, height: size }}>
        <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">Total</span>
        <span className="text-[22px] font-bold text-on-surface leading-none">{fmtLakh(total)}</span>
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {data.map((d) => (
          <span key={d.name} className="flex items-center gap-1.5 text-[12px] font-semibold text-on-surface-variant">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: d.color }} />
            {d.name}: {fmtLakh(d.value)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── 2. EMI Area Chart (Principal vs Interest over time) ──────────────────
export function EMIAreaChart({ loanAmount, annualRate, tenureMonths, height = 220 }) {
  const monthlyRate = annualRate / 100 / 12;
  const factor = Math.pow(1 + monthlyRate, tenureMonths);
  const emi = monthlyRate > 0
    ? (loanAmount * monthlyRate * factor) / (factor - 1)
    : loanAmount / tenureMonths;

  const data = [];
  let balance = loanAmount;
  // Sample every few months for performance
  const step = tenureMonths <= 36 ? 1 : tenureMonths <= 60 ? 2 : 3;
  for (let m = 1; m <= tenureMonths; m += step) {
    const interest = balance * monthlyRate;
    const principal = Math.min(emi - interest, balance);
    data.push({
      month: m,
      label: `M${m}`,
      Principal: Math.round(principal),
      Interest: Math.round(interest),
    });
    // Advance balance by 'step' months
    for (let s = 0; s < step && balance > 0; s++) {
      const int = balance * monthlyRate;
      const princ = Math.min(emi - int, balance);
      balance = Math.max(0, balance - princ);
    }
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradPrincipal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.primary} stopOpacity={0.4} />
            <stop offset="100%" stopColor={COLORS.primary} stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="gradInterest" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.interest} stopOpacity={0.3} />
            <stop offset="100%" stopColor={COLORS.interest} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: COLORS.muted }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11, fill: COLORS.muted }} tickLine={false} axisLine={false} tickFormatter={fmtLakh} width={55} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', fontSize: 13 }}
          formatter={(v, name) => [fmtLakh(v), name]}
        />
        <Area type="monotone" dataKey="Principal" stroke={COLORS.primary} fill="url(#gradPrincipal)" strokeWidth={2} dot={false} />
        <Area type="monotone" dataKey="Interest" stroke={COLORS.interest} fill="url(#gradInterest)" strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── 3. Crop Sparkline (tiny trend line for mandi prices) ─────────────────
export function CropSparkline({ trend = 'up', color, width = 64, height = 28 }) {
  const c = color || (trend === 'up' ? COLORS.green : trend === 'down' ? COLORS.red : COLORS.yellow);
  // Generate a simple fake trend line
  const points = trend === 'up'
    ? [{ v: 20 }, { v: 28 }, { v: 24 }, { v: 35 }, { v: 32 }, { v: 42 }]
    : trend === 'down'
    ? [{ v: 40 }, { v: 35 }, { v: 38 }, { v: 28 }, { v: 30 }, { v: 22 }]
    : [{ v: 30 }, { v: 32 }, { v: 28 }, { v: 31 }, { v: 29 }, { v: 30 }];

  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={points} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Line type="monotone" dataKey="v" stroke={c} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── 4. Weather Gauge (semicircle for risk 0-10) ──────────────────────────
export function WeatherGauge({ score = 0, size = 160 }) {
  const maxScore = 10;
  const pct = Math.min(score / maxScore, 1);
  const color = score <= 3 ? COLORS.green : score <= 6 ? COLORS.yellow : COLORS.red;
  const label = score <= 3 ? 'Safe' : score <= 6 ? 'Caution' : 'Danger';

  // SVG semicircle
  const r = 55;
  const circumHalf = Math.PI * r;
  const dashLength = pct * circumHalf;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size * 0.65} viewBox="0 0 140 90">
        {/* Background arc */}
        <path
          d="M 15,80 A 55,55 0 0,1 125,80"
          fill="none"
          stroke="#e9efe9"
          strokeWidth="14"
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <path
          d="M 15,80 A 55,55 0 0,1 125,80"
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${dashLength} ${circumHalf}`}
          style={{ transition: 'stroke-dasharray 0.8s ease-out' }}
        />
        {/* Score text */}
        <text x="70" y="70" textAnchor="middle" fontSize="28" fontWeight="800" fill={color}>
          {score}
        </text>
        <text x="70" y="86" textAnchor="middle" fontSize="11" fontWeight="600" fill="#6d7a72">
          /10
        </text>
      </svg>
      <span
        className="px-3 py-1 rounded-full font-label-sm text-label-sm font-bold text-white"
        style={{ background: color }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── 5. Revenue Bar Chart (monthly harvest) ────────────────────────────────
export function RevenueBarChart({ months = [], height = 180 }) {
  const data = months.map((m) => ({
    name: new Date(m.month + '-01').toLocaleDateString('en-IN', { month: 'short' }),
    Revenue: m.revenue || 0,
  }));

  if (!data.length) return null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: COLORS.muted }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: COLORS.muted }} tickLine={false} axisLine={false} tickFormatter={fmtLakh} width={50} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', fontSize: 13 }}
          formatter={(v) => [fmtLakh(v), 'Revenue']}
        />
        <Bar dataKey="Revenue" fill={COLORS.primary} radius={[6, 6, 0, 0]} barSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── 6. Viability Donut (animated score) ──────────────────────────────────
export function ViabilityDonut({ score = 85, size = 180 }) {
  const color = score >= 80 ? COLORS.green : score >= 60 ? COLORS.yellow : COLORS.red;
  const label = score >= 80 ? '👍 Great!' : score >= 60 ? '👌 Fair' : '⚠️ Low';
  const data = [
    { name: 'Score', value: score },
    { name: 'Remaining', value: 100 - score },
  ];

  return (
    <div className="flex flex-col items-center gap-2 relative">
      <ResponsiveContainer width={size} height={size}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.32}
            outerRadius={size * 0.46}
            startAngle={90}
            endAngle={-270}
            paddingAngle={0}
            dataKey="value"
            strokeWidth={0}
            animationBegin={0}
            animationDuration={1000}
          >
            <Cell fill={color} />
            <Cell fill="#e9efe9" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ width: size, height: size }}>
        <span className="text-[36px] font-bold leading-none" style={{ color }}>{score}%</span>
        <span className="text-[13px] font-semibold text-on-surface-variant mt-1">{label}</span>
      </div>
    </div>
  );
}

// ─── 7. Progress Ring (circular progress for EMI completion) ──────────────
export function ProgressRing({ current = 0, total = 1, size = 64, label = '' }) {
  const pct = total > 0 ? Math.min(current / total, 1) : 0;
  const r = 24;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;
  const color = pct >= 0.8 ? COLORS.green : pct >= 0.4 ? COLORS.primary : COLORS.yellow;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox="0 0 60 60">
        <circle cx="30" cy="30" r={r} fill="none" stroke="#e9efe9" strokeWidth="6" />
        <circle
          cx="30"
          cy="30"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform="rotate(-90 30 30)"
          style={{ transition: 'stroke-dasharray 0.6s ease-out' }}
        />
        <text x="30" y="34" textAnchor="middle" fontSize="13" fontWeight="700" fill={COLORS.text}>
          {Math.round(pct * 100)}%
        </text>
      </svg>
      {label && <span className="text-[11px] font-medium text-on-surface-variant text-center leading-tight">{label}</span>}
    </div>
  );
}

// ─── 8. Visual SWOT Grid ──────────────────────────────────────────────────
const SWOT_CONFIG = [
  { key: 'strengths', title: '💪 Strengths', bg: 'bg-green-50', border: 'border-green-200', icon: 'thumb_up', iconColor: 'text-green-600' },
  { key: 'weaknesses', title: '⚠️ Weaknesses', bg: 'bg-amber-50', border: 'border-amber-200', icon: 'warning', iconColor: 'text-amber-600' },
  { key: 'opportunities', title: '🌟 Opportunities', bg: 'bg-blue-50', border: 'border-blue-200', icon: 'lightbulb', iconColor: 'text-blue-600' },
  { key: 'threats', title: '🔴 Threats', bg: 'bg-red-50', border: 'border-red-200', icon: 'shield', iconColor: 'text-red-600' },
];

export function SWOTGrid({ swot = {} }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {SWOT_CONFIG.map(({ key, title, bg, border, icon, iconColor }) => {
        const items = swot[key] || [];
        return (
          <div key={key} className={`${bg} ${border} border rounded-2xl p-5 flex flex-col gap-3`}>
            <div className="flex items-center gap-2">
              <span className={`material-symbols-outlined ${iconColor} text-[22px]`}>{icon}</span>
              <h4 className="font-label-lg text-label-lg font-bold text-on-surface">{title}</h4>
            </div>
            <ul className="flex flex-col gap-2">
              {items.map((item, i) => (
                <li key={i} className="flex items-start gap-2 font-body-md text-[14px] text-on-surface-variant leading-relaxed">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'currentColor' }} />
                  {item}
                </li>
              ))}
              {!items.length && (
                <li className="font-body-md text-[14px] text-on-surface-variant italic">No data available</li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
