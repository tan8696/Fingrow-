import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  fetchWeather,
  fetchInsurancePolicy,
  submitInsuranceClaim,
  deleteInsuranceClaim,
  fetchReminders,
  submitReminder,
  deleteReminder,
  downloadWeatherProtocol,
} from '../hooks/useReport';

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const inr = (v) => (v == null ? '—' : '₹' + Math.round(v).toLocaleString('en-IN'));
const inLakh = (v) => (v == null ? '—' : (v / 100000).toFixed(1).replace(/\.0$/, '') + ' L');

function fmtDay(dateStr, idx) {
  if (idx === 0) return 'Today';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const wd = d.toLocaleDateString('en-IN', { weekday: 'short' });
    const num = d.getDate();
    const suffix = num % 10 === 1 && num !== 11 ? 'st' : num % 10 === 2 && num !== 12 ? 'nd' : num % 10 === 3 && num !== 13 ? 'rd' : 'th';
    return `${wd}, ${num}${suffix}`;
  } catch {
    return dateStr;
  }
}

function fmtLongDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return dateStr;
  }
}

function condOf(code) {
  code = Number(code) || 0;
  if (code === 0) return { label: 'Clear sky', icon: 'wb_sunny' };
  if (code === 1 || code === 2) return { label: 'Partly cloudy', icon: 'partly_cloudy_day' };
  if (code === 3) return { label: 'Overcast', icon: 'cloud' };
  if (code === 45 || code === 48) return { label: 'Fog', icon: 'foggy' };
  if ((code >= 51 && code <= 57) || (code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: 'Rain', icon: 'rainy' };
  if (code >= 95) return { label: 'Thunderstorm', icon: 'thunderstorm' };
  return { label: 'Cloudy', icon: 'cloud' };
}

/** Deterministic spray window — mirrors the backend rules in core/agro.py. */
function windowStatus(day) {
  const p = Number(day?.precipitation_probability_max) || 0;
  const w = Number(day?.wind_speed_10m_max) || 0;
  const mm = Number(day?.precipitation_sum) || 0;
  const code = Number(day?.weather_code) || 0;
  if (code >= 95 || p >= 85 || (mm >= 10 && p >= 60)) return { key: 'avoid', label: 'Avoid Spray', cls: 'bg-tertiary text-on-tertiary' };
  if (p < 35 && w < 15) return { key: 'optimal', label: 'Optimal Spray', cls: 'bg-primary text-on-primary' };
  if (p < 60 && w < 20) return { key: 'good', label: 'Good Window', cls: 'bg-primary/10 text-primary' };
  return { key: 'marginal', label: 'Marginal', cls: 'bg-surface-container-high text-on-surface-variant' };
}

/** Pest threat heuristic — mirrors core/agro.py::pest_threat. */
function pestEstimate(daily) {
  if (!daily || !daily.length) {
    return { risk_pct: 0, level: 1, levelLabel: 'Level 1 Low', vector: 'None', note: 'No forecast available.', protocol: '' };
  }
  const humidities = daily.map(d => Number(d.relative_humidity_2m_mean) || 0);
  const avgH = humidities.reduce((a, b) => a + b, 0) / humidities.length;
  const rainy = daily.filter(d => (Number(d.precipitation_sum) || 0) >= 1).length;
  if (avgH >= 70 && rainy >= 2) {
    return { risk_pct: Math.min(95, Math.round(35 + (avgH - 70) * 4)), level: 3, levelLabel: 'Level 3 Alert',
      vector: 'Pink Bollworm & YMV', icon: 'pest_control',
      note: `Warm, humid stretch (${Math.round(avgH)}% avg RH) favours bollworm egg-lay and yellow-mosaic virus — scout traps twice daily.`,
      protocol: 'Deploy 5 pheromone traps/acre. Release Trichogramma bactrae @ 60,000 parasitoids/acre if egg count > 10%.' };
  }
  if (avgH >= 60) {
    return { risk_pct: Math.min(70, Math.round(30 + (avgH - 60) * 3)), level: 2, levelLabel: 'Level 2 Watch',
      vector: 'Stem Fly & Blight', icon: 'bug_report',
      note: `Moderate humidity (${Math.round(avgH)}% avg RH) favours stem fly and charcoal rot — keep foliage dry and monitor lower leaves.`,
      protocol: 'Spray Chlorantraniliprole 18.5 SC @ 3 ml/10 L water; apply Trichoderma to stem base in wet patches.' };
  }
  return { risk_pct: Math.max(15, Math.round(35 - (60 - avgH) * 1.5)), level: 1, levelLabel: 'Level 1 Low',
    vector: 'Aphids / Thrips (low)', icon: 'eco',
    note: 'Dry conditions keep pest pressure low — routine weekly scouting only.',
    protocol: 'Maintain weekly scouting. Keep a neem-based foliar spray ready for early outbreaks.' };
}

const LEVEL_META = {
  Low: { chip: 'bg-primary/10 text-primary', bar: 'bg-primary', text: 'Low to Moderate', ring: '#006948' },
  Moderate: { chip: 'bg-tertiary/10 text-tertiary', bar: 'bg-tertiary', text: 'Moderate', ring: '#9b3e3b' },
  High: { chip: 'bg-error/10 text-error', bar: 'bg-error', text: 'High', ring: '#ba1a1a' },
  Severe: { chip: 'bg-error-container text-on-error-container', bar: 'bg-error', text: 'Severe', ring: '#93000a' },
};

const SEVERITY_STYLE = {
  critical: 'border-tertiary bg-tertiary/5',
  warning: 'border-tertiary/40 bg-tertiary/5',
  info: 'border-surface-variant bg-surface',
};

const TRIGGER_STYLE = {
  SAFE: { chip: 'bg-primary/10 text-primary', dot: 'bg-primary', label: 'SAFE' },
  WATCHLIST: { chip: 'bg-secondary-container text-on-secondary-fixed', dot: 'bg-secondary', label: 'WATCHLIST' },
  TRIGGERED: { chip: 'bg-error-container text-on-error-container', dot: 'bg-error', label: 'TRIGGERED' },
  Offline: { chip: 'bg-surface-container-high text-on-surface-variant', dot: 'bg-outline', label: 'OFFLINE' },
};

const RADAR_MODES = [
  { key: 'rain', label: 'Precip. Radar', icon: 'rainy', valueOf: d => Number(d.precipitation_sum) || 0, max: 65, unit: 'mm' },
  { key: 'humidity', label: 'Humidity', icon: 'humidity_percentage', valueOf: d => Number(d.relative_humidity_2m_mean) || 0, max: 100, unit: '%' },
  { key: 'wind', label: 'Wind Gusts', icon: 'air', valueOf: d => Number(d.wind_speed_10m_max) || 0, max: 60, unit: 'km/h' },
  { key: 'temp', label: 'Thermal', icon: 'device_thermostat', valueOf: d => Number(d.temperature_2m_max) || 0, max: 46, unit: '°C' },
];

const CROPS = [
  {
    id: 'cotton', name: 'Cotton (Bt)', variant: 'Square & Flowering · 65 DAS', icon: 'local_florist',
    vector: 'Pink Bollworm (Pectinophora)', action: 'Order Subsidized Traps', actionIcon: 'inventory_2', chat: 'How do I order subsidized pheromone traps for pink bollworm under the govt 40% subsidy scheme?',
    protocol: 'Deploy 5 pheromone traps/acre. Release Trichogramma bactrae @ 60,000 parasitoids/acre; spray Profenofos 50 EC @ 2 ml/L if egg count > 10%.',
    subsidy: 'Govt. 40% Subsidy', getLevel: p => p.level, trapLine: p => `${p.risk_pct >= 70 ? '9+' : p.risk_pct >= 50 ? '6–8' : '<4'} Moths/Trap ${p.risk_pct >= 50 ? '(Trigger > 8)' : ''}`,
  },
  {
    id: 'soybean', name: 'Soybean (JS-335)', variant: 'Pod Filling & Maturation', icon: 'grain',
    vector: 'Stem Fly & Charcoal Rot', action: 'View Bio-Fertilizer Stock', actionIcon: 'science', chat: 'What bio-fertilizer stock is available at the FPO hub for soybean stem fly control?',
    protocol: 'Foliar Chlorantraniliprole 18.5 SC @ 3 ml/10 L water. In waterlogged patches apply Trichoderma viride to the stem base against fungal wilt.',
    subsidy: 'In Stock: FPO Hub', getLevel: p => Math.min(3, Math.max(1, p.level)), trapLine: () => null,
  },
  {
    id: 'tur', name: 'Tur / Arhar Dal (BDN-711)', variant: 'Active Vegetative & Branching', icon: 'grass',
    vector: 'Phytophthora Stem Blight', action: 'Field Drainage Guide', actionIcon: 'water', chat: 'Show me the field drainage guide to prevent Phytophthora stem blight on tur during heavy rain.',
    protocol: 'Clear furrow drainage between every 4 rows to prevent ponding in heavy rain; spray 0.5% Zinc Sulphate + 1% Urea for canopy vigour.',
    subsidy: 'Blocks A & C', getLevel: p => Math.max(1, p.level - 1), trapLine: () => null,
  },
];

const CROP_RISK_CHIP = { 3: 'HIGH RISK', 2: 'MODERATE', 1: 'LOW RISK' };
const CROP_RISK_CLS = {
  3: 'bg-tertiary text-on-tertiary',
  2: 'bg-secondary-container text-on-secondary-fixed',
  1: 'bg-primary/10 text-primary',
};

const NOTIF_ICONS = { sms: 'sms', call: 'call', push: 'notifications_active' };

/* ------------------------------------------------------------------ */
/* Reusable bits                                                       */
/* ------------------------------------------------------------------ */

function Modal({ open, onClose, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-on-background/60 backdrop-blur-sm p-4">
      <div className={`bg-surface-container-lowest rounded-2xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} p-6 md:p-8 flex flex-col gap-5 relative max-h-[92vh] overflow-y-auto`}>
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 w-10 h-10 rounded-xl hover:bg-surface-container flex items-center justify-center text-on-surface-variant">
          <span className="material-symbols-outlined">close</span>
        </button>
        {children}
      </div>
    </div>
  );
}

function KpiCard({ icon, iconCls, iconBg, label, value, sub, barPct, barCls, footer, footerCls }) {
  return (
    <div className="bg-surface-container-lowest p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between gap-3 border border-surface-variant">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">{label}</span>
          <span className="font-headline-lg text-headline-lg-mobile md:text-[26px] font-bold text-on-surface leading-tight">{value}</span>
        </div>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconBg || 'bg-surface-container-low text-primary'}`}>
          <span className={`material-symbols-outlined text-[24px] ${iconCls || ''}`}>{icon}</span>
        </div>
      </div>
      {sub && <div className="font-label-sm text-label-sm text-on-surface-variant -mt-1">{sub}</div>}
      {barPct != null && (
        <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
          <div className={`${barCls || 'bg-primary'} h-full rounded-full transition-all`} style={{ width: `${Math.max(0, Math.min(100, barPct))}%` }} />
        </div>
      )}
      {footer && <div className={`font-label-sm text-label-sm ${footerCls || 'text-on-surface-variant'}`}>{footer}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main page                                                           */
/* ------------------------------------------------------------------ */

export default function WeatherRisk({ locationText = '' }) {
  const loc = locationText && locationText !== 'Vidarbha, MH' ? locationText : 'Akola, Maharashtra';

  const [weather, setWeather] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const [field, setField] = useState('cotton');
  const [radarMode, setRadarMode] = useState('rain');
  const [stepsDone, setStepsDone] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fingrow-advisory-steps') || '[]'); } catch { return []; }
  });

  const [claimOpen, setClaimOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [claimSending, setClaimSending] = useState(false);
  const [reminderSending, setReminderSending] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // claim form
  const [claimType, setClaimType] = useState('excess_rain');
  const [claimArea, setClaimArea] = useState('4.0');
  const [claimMobile, setClaimMobile] = useState('');
  const [claimNote, setClaimNote] = useState('');

  // reminder form
  const [reminderDay, setReminderDay] = useState('');
  const [reminderKind, setReminderKind] = useState('sms');
  const [reminderContact, setReminderContact] = useState('');

  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const notify = useCallback((msg, kind = 'ok') => {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  const openChatWith = useCallback((text) => window.dispatchEvent(new CustomEvent('open-chat-with', { detail: { text } })), []);
  const openVoice = useCallback(() => window.dispatchEvent(new CustomEvent('open-voice-agent')), []);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [w, p, r] = await Promise.all([
        fetchWeather(loc, 7),
        fetchInsurancePolicy(loc),
        fetchReminders(),
      ]);
      if (w) setWeather(w);
      if (p) setPolicy(p);
      setReminders(r?.reminders || []);
    } catch (err) {
      console.error('weather page load', err);
      setError(err?.message || 'The live weather feed could not be reached.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loc]);

  useEffect(() => { loadAll(); }, [loadAll]);

  /* ----------------------------- derived ----------------------------- */

  const derived = useMemo(() => {
    const daily = weather?.daily || [];
    const current = weather?.current || {};
    const risk = weather?.risk || { score: 0, level: 'Low', factors: [], advisories: [] };
    const pest = pestEstimate(daily);
    const levelMeta = LEVEL_META[risk.level] || LEVEL_META.Low;

    const totalRain = daily.reduce((a, d) => a + (Number(d.precipitation_sum) || 0), 0);
    const humidities = daily.map(d => Number(d.relative_humidity_2m_mean) || 0);
    const avgHum = humidities.length ? humidities.reduce((a, b) => a + b, 0) / humidities.length : 0;
    const moisture = Math.max(0, Math.min(100, Math.round(avgHum)));
    const moistureMeta = moisture >= 68 ? { label: 'Optimal Saturated', cls: 'text-primary' }
      : moisture >= 50 ? { label: 'Adequate', cls: 'text-on-surface' }
        : { label: 'Dry — Stress Watch', cls: 'text-tertiary' };

    let spike = null;
    for (const d of daily) {
      const mm = Number(d.precipitation_sum) || 0;
      if (mm >= 10 && (!spike || mm > spike.mm)) spike = { date: d.date, mm };
    }

    const windows = daily.map((d, i) => ({ ...d, dayLabel: fmtDay(d.date, i), w: windowStatus(d) }));
    const best = windows.find(d => (d.w.key === 'optimal' || d.w.key === 'good')) || null;
    const advisories = risk.advisories || [];
    const topAdvisory = advisories.find(a => a.severity !== 'info') || advisories[0] || null;

    const pol = policy?.policy || null;
    const triggers = policy?.triggers || [];
    const claims = policy?.claims || [];
    const payoutHistory = policy?.payout_history || [];
    const claimFactors = policy?.claim_factors || {};
    const damageTypes = policy?.damage_types || [];
    const policyHealth = policy?.policy_health || 'Offline';

    const steps = [];
    if (topAdvisory) steps.push({ title: topAdvisory.title, desc: topAdvisory.detail, chip: topAdvisory.severity === 'critical' ? 'CRITICAL — Within 24 Hrs' : topAdvisory.severity === 'warning' ? 'ACTION REQUIRED' : 'GUIDANCE', chipCls: topAdvisory.severity === 'critical' ? 'bg-tertiary-fixed text-on-tertiary-fixed' : 'bg-primary/10 text-primary' });
    if (pest.level >= 2) steps.push({ title: `Pest protocol — ${pest.vector}`, desc: pest.protocol, chip: pest.levelLabel.toUpperCase(), chipCls: 'bg-secondary-container text-on-secondary-fixed' });
    else if (best) steps.push({ title: 'Precision foliar nutrient spray (Zinc + Urea 1%)', desc: `Calm winds forecast on ${best.dayLabel} morning — spray between ${best.time || '06:30 AM – 10:30 AM'} to maximise uptake before overcast days.`, chip: 'SCHEDULED WINDOW', chipCls: 'bg-primary/10 text-primary' });
    if (daily.length) {
      const hasHeavyRain = windows.some(d => (Number(d.precipitation_sum) || 0) >= 10);
      if (hasHeavyRain) {
        const rainDay = windows.find(d => (Number(d.precipitation_sum) || 0) >= 10);
        steps.push({ title: 'Clear field drainage runoffs', desc: `${rainDay.dayLabel} brings ${Number(rainDay.precipitation_sum).toFixed(0)} mm — create 30 cm side trenches in low-lying blocks before the rain to prevent collar rot.`, chip: 'BEFORE RAIN', chipCls: 'bg-tertiary/10 text-tertiary' });
      } else {
        steps.push({ title: 'Verify pheromone trap counts', desc: `Dry stretch with ${Math.round(avgHum)}% humidity — log moth counts daily and keep sprays ready if counts cross 8/trap.`, chip: 'ROUTINE', chipCls: 'bg-surface-container-high text-on-surface-variant' });
      }
    }
    while (steps.length < 3) steps.push({ title: 'Inspect irrigation & equipment', desc: 'Confirm drippers, sprayers and storage seals are serviced before the next field operation window.', chip: 'ROUTINE', chipCls: 'bg-surface-container-high text-on-surface-variant' });

    const damageTypeMeta = claimType => damageTypes.find(t => t.key === claimType) || { label: claimType };

    return {
      daily, current, risk, pest, levelMeta, totalRain, avgHum, moisture, moistureMeta, spike,
      windows, best, topAdvisory, pol, triggers, claims, payoutHistory, claimFactors,
      damageTypes, policyHealth, steps, damageTypeMeta,
    };
  }, [weather, policy]);

  const {
    current = {}, risk = { score: 0, level: 'Low', advisories: [] }, pest, levelMeta, totalRain,
    moisture, moistureMeta, spike, windows, best, pol, triggers, claims, payoutHistory,
    claimFactors, damageTypes, policyHealth, steps, damageTypeMeta,
  } = derived;

  const claimEstimate = useMemo(() => {
    const sum = pol?.sum_insured || 0;
    const acres = pol?.area_acres || 1;
    const factor = claimFactors[claimType] || 0.15;
    const area = Math.max(0, Math.min(Number(claimArea) || 0, acres));
    return { amount: sum * factor * (area / acres), factor, area, basis: `${(factor * 100).toFixed(0)}% of the sum insured × affected ${area.toFixed(1)} of ${acres.toFixed(1)} insured acres` };
  }, [claimType, claimArea, pol, claimFactors]);

  /* ----------------------------- actions ----------------------------- */

  const toggleStep = (idx) => {
    setStepsDone(prev => {
      const next = prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx];
      try { localStorage.setItem('fingrow-advisory-steps', JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  const fileClaim = async (e) => {
    e.preventDefault();
    if (!/^\d{10}$/.test(claimMobile || '')) { notify('Enter a valid 10-digit mobile number.', 'err'); return; }
    if (!(Number(claimArea) > 0)) { notify('Enter the affected area in acres.', 'err'); return; }
    setClaimSending(true);
    try {
      const res = await submitInsuranceClaim({
        damage_type: claimType,
        area_acres: Number(claimArea),
        mobile: claimMobile,
        note: claimNote,
      });
      notify(`Claim ${res.id} filed — estimated payout ${inr(res.estimate_amount)}. A notification was raised for the desk.`);
      setClaimOpen(false);
      setClaimArea('4.0'); setClaimMobile(''); setClaimNote(''); setClaimType('excess_rain');
      loadAll(true);
    } catch (err) {
      notify('Could not file the claim — try again.', 'err');
    } finally {
      setClaimSending(false);
    }
  };

  const withdrawClaim = async (id) => {
    try {
      await deleteInsuranceClaim(id);
      notify(`Claim ${id} withdrawn.`);
      loadAll(true);
    } catch { notify('Could not withdraw the claim.', 'err'); }
  };

  const scheduleReminder = async (e) => {
    e.preventDefault();
    if (!reminderDay) { notify('Pick a spray-window day first.', 'err'); return; }
    if (!/^\d{10}$/.test(reminderContact || '')) { notify('Enter a valid 10-digit mobile number.', 'err'); return; }
    setReminderSending(true);
    try {
      const res = await submitReminder({
        kind: reminderKind,
        contact: reminderContact,
        target_date: reminderDay,
        time_slot: '06:30 AM – 10:30 AM',
        note: `Spray reminder for the ${fmtLongDate(reminderDay)} morning window`,
      });
      notify(`${reminderKind.toUpperCase()} reminder ${res.id} scheduled for ${fmtLongDate(reminderDay)}.`);
      setReminderOpen(false);
      setReminderContact('');
      loadAll(true);
    } catch {
      notify('Could not schedule the reminder — try again.', 'err');
    } finally {
      setReminderSending(false);
    }
  };

  const cancelReminder = async (id) => {
    try {
      await deleteReminder(id);
      notify(`Reminder ${id} cancelled.`);
      setReminders(prev => prev.filter(r => r.id !== id));
    } catch { notify('Could not cancel the reminder.', 'err'); }
  };

  const grabProtocol = async () => {
    setDownloading(true);
    const ok = await downloadWeatherProtocol(loc);
    setDownloading(false);
    notify(ok ? 'Spray protocol downloaded — open it and Print → Save as PDF.' : 'Protocol download failed — check the connection.');
  };

  /* ----------------------------- loading ----------------------------- */

  if (loading && !weather) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-4 text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">radar</span>
        <p className="font-body-lg text-body-lg">Fetching live district weather, risk & policy state…</p>
      </div>
    );
  }

  if (!weather && error) {
    return (
      <div className="py-16 text-center bg-surface-container-lowest rounded-2xl border border-surface-variant">
        <span className="material-symbols-outlined text-5xl text-error mb-3">cloud_off</span>
        <p className="font-body-lg text-body-lg text-on-surface mb-1">{error}</p>
        <p className="font-body-md text-body-md text-on-surface-variant mb-6">The live feed could not be reached — check your internet connection and retry.</p>
        <button onClick={() => loadAll()} className="px-6 py-3 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg hover:bg-primary-container transition-colors">Retry</button>
      </div>
    );
  }

  const farmRiskLevel = LEVEL_META[risk.level] || LEVEL_META.Low;
  const topFactor = (risk.factors || [])[0];
  const riskNote = topFactor || (risk.advisories?.[0]?.detail) || `No major weather triggers in the forecast window.`;
  const fetched = weather?.fetched_at ? new Date(weather.fetched_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
  const preferred = windows.filter(d => d.w.key === 'optimal' || d.w.key === 'good');
  const dayChoices = (preferred.length ? preferred : windows).slice(0, 3);
  const hasSafeWindow = preferred.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-24 md:bottom-8 right-4 z-[80] max-w-sm rounded-xl shadow-2xl px-5 py-4 text-sm font-medium border ${toast.kind === 'err' ? 'bg-error-container text-on-error-container border-error/20' : 'bg-primary-container text-on-primary-container border-primary/20'}`}>
          {toast.msg}
        </div>
      )}

      {/* ============ Header banner ============ */}
      <section className="bg-surface-container-lowest rounded-2xl p-5 md:p-6 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary font-label-sm text-label-sm font-semibold">
              <span className="material-symbols-outlined text-[14px]">my_location</span>
              {weather?.location?.name || loc}
            </span>
            <span className="hidden sm:inline text-on-surface-variant font-label-sm text-label-sm">•</span>
            <span className="inline-flex items-center gap-1.5 text-on-surface-variant font-label-sm text-label-sm">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Live Open-Meteo AWS feed{fetched ? ` · Synced ${fetched}` : ''}
            </span>
            {refreshing && <span className="material-symbols-outlined text-[16px] text-primary animate-spin">progress_activity</span>}
          </div>
          <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface tracking-tight">Agro-Climatic Advisory & Crop Risk Intelligence</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Hyperlocal micro-weather tracking, pest vulnerability, spray-window forecasting and parametric insurance risk modeling — every number below comes from the live district forecast.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button onClick={grabProtocol} disabled={downloading}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-surface-container-high hover:bg-surface-container text-on-surface font-label-lg text-label-lg flex items-center gap-2 transition-colors shadow-sm disabled:opacity-60">
            <span className="material-symbols-outlined text-[20px] text-primary">{downloading ? 'progress_activity' : 'download'}</span>
            {downloading ? 'Preparing…' : 'Spray Protocol (PDF)'}
          </button>
          <button onClick={() => setClaimOpen(true)}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-tertiary text-on-tertiary hover:opacity-95 font-label-lg text-label-lg flex items-center gap-2 transition-opacity shadow-sm">
            <span className="material-symbols-outlined text-[20px]">shield_with_heart</span>
            File Weather Claim
          </button>
          <button onClick={() => openChatWith(`Summarise today's weather-based farm advisory for ${loc.split(',')[0]} in simple Marathi or Hindi.`)}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-primary text-on-primary hover:bg-primary-container font-label-lg text-label-lg flex items-center gap-2 transition-colors shadow-sm">
            <span className="material-symbols-outlined text-[20px]">smart_toy</span>
            Consult Agri-Bot
          </button>
        </div>
      </section>

      {/* ============ Alert ticker ============ */}
      <section className="bg-primary/5 rounded-xl px-4 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 border border-primary/10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-primary text-on-primary flex items-center justify-center shrink-0 shadow-sm">
            <span className="material-symbols-outlined text-[20px]">emergency</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-label-lg text-label-lg text-primary font-semibold">
              {pest.level >= 3 ? `Advisory — ${pest.vector}` : risk.advisories?.[0]?.title || 'Tahsildar & KVK Advisory (Akola West)'}
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant truncate">{risk.advisories?.[0]?.detail || riskNote}</span>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container-lowest text-on-surface font-label-sm text-label-sm shadow-sm shrink-0">
          <span className="material-symbols-outlined text-[16px] text-tertiary">call</span>
          Helpline: 1800-180-1551 (Toll Free)
        </span>
      </section>

      {/* ============ KPI cards ============ */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          icon="speed" label="Overall Farm Risk"
          value={<><span className="text-primary">{risk.score}</span><span className="font-body-md text-on-surface-variant"> /10</span></>}
          sub={<span className="inline-flex items-center gap-1 text-primary font-semibold"><span className="material-symbols-outlined text-[15px]">insights</span>{levelMeta.text}</span>}
          barPct={risk.score * 10} barCls={levelMeta.bar}
          footer={<span className="bg-surface-container-low px-2.5 py-1.5 rounded-lg font-label-sm text-label-sm text-on-surface-variant leading-snug">{riskNote.slice(0, 110)}{riskNote.length > 110 ? '…' : ''}</span>}
        />
        <KpiCard
          icon="rainy" iconBg="bg-secondary-container text-on-secondary-fixed" label="7-Day Rain & Moisture"
          value={<><span className="text-on-surface">{Math.round(totalRain)}</span><span className="font-body-md text-on-surface-variant"> mm</span></>}
          sub={<span className={`font-semibold ${moistureMeta.cls}`}>Moisture Index: {moisture}% · {moistureMeta.label}</span>}
          barPct={moisture} barCls="bg-secondary"
          footer={spike
            ? <span className="bg-surface-container-low px-2.5 py-1.5 rounded-lg font-label-sm text-label-sm text-on-surface-variant">Next high spike: {fmtLongDate(spike.date)} (~{Math.round(spike.mm)} mm)</span>
            : <span className="bg-surface-container-low px-2.5 py-1.5 rounded-lg font-label-sm text-label-sm text-on-surface-variant">No heavy-rain spike in the 7-day window</span>}
        />
        <KpiCard
          icon={pest.icon || 'pest_control'} iconBg="bg-tertiary-fixed text-on-tertiary-fixed" iconCls="text-tertiary" label="Pest Outbreak Risk"
          value={<><span className="text-tertiary">{pest.risk_pct}%</span><span className="font-body-md text-on-surface-variant"> prob.</span></>}
          sub={<span className="inline-flex items-center gap-1 text-tertiary font-semibold"><span className="material-symbols-outlined text-[15px]">warning</span>{pest.vector}</span>}
          barPct={pest.risk_pct} barCls="bg-tertiary"
          footer={<span className="bg-surface-container-low px-2.5 py-1.5 rounded-lg font-label-sm text-label-sm text-on-surface-variant">{pest.levelLabel}</span>}
        />
        <KpiCard
          icon="verified_user" iconBg="bg-primary-fixed text-on-primary-fixed" label="Parametric Insurance"
          value={<><span className="text-on-surface">{pol ? inLakh(pol.sum_insured) : '—'}</span><span className="font-body-md text-on-surface-variant"> L insured</span></>}
          sub={pol
            ? <span className="font-semibold text-on-surface-variant">{pol.policy_id} · {pol.area_acres} acres</span>
            : <span className="text-on-surface-variant">Policy feed offline</span>}
          barPct={policyHealth === 'Triggered' ? 100 : policyHealth === 'WATCHLIST' || (triggers.some(t => t.status === 'WATCHLIST') ? 62 : 8)}
          barCls={policyHealth === 'Triggered' ? 'bg-error' : 'bg-primary'}
          footer={<span className={`px-2.5 py-1.5 rounded-lg font-label-sm text-label-sm flex items-center justify-between gap-2 ${policyHealth === 'Triggered' ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'}`}>
            <span className="font-semibold">{policyHealth === 'Triggered' ? 'Payout due — auto mode' : policyHealth}</span>
            <span className="material-symbols-outlined text-[16px]">sensors</span>
          </span>}
        />
      </section>

      {/* ============ 7-day forecast + radar ============ */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 bg-surface-container-lowest rounded-2xl p-5 md:p-6 shadow-sm flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">calendar_today</span>
                <h2 className="font-headline-md text-headline-md text-on-surface tracking-tight">7-Day Field Forecast & Spray Windows</h2>
              </div>
              <span className="font-label-sm text-label-sm text-on-surface-variant">Calibrated for Vidarbha Vertisol (black cotton soil)</span>
            </div>
            <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-xl shrink-0 self-start sm:self-auto">
              {CROPS.map(c => (
                <button key={c.id} onClick={() => setField(c.id)}
                  className={`px-3 py-1.5 rounded-lg font-label-sm text-label-sm transition-colors ${field === c.id ? 'bg-surface-container-lowest text-on-surface shadow-sm font-semibold' : 'text-on-surface-variant hover:text-on-surface'}`}>
                  Field · {c.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Day cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2.5">
            {windows.map((d, i) => {
              const cond = condOf(d.weather_code);
              const dayChip = d.w.key === 'avoid' ? 'bg-tertiary text-on-tertiary' : d.w.key === 'optimal' ? 'bg-primary text-on-primary' : d.w.key === 'good' ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-on-surface-variant';
              return (
                <div key={d.date} className={`rounded-xl p-3 flex flex-col items-center text-center gap-1.5 border ${d.w.key === 'avoid' ? 'bg-tertiary/5 border-tertiary/20' : d.w.key === 'optimal' ? 'bg-primary/5 border-primary/20' : 'bg-surface border-surface-variant'}`}>
                  <span className={`px-2 py-0.5 rounded-full font-label-sm text-[11px] font-semibold ${i === 0 ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>{d.dayLabel}</span>
                  <span className={`material-symbols-outlined text-[30px] ${i === 0 ? 'text-primary' : 'text-on-surface'}`}>{cond.icon}</span>
                  <div className="flex items-baseline gap-1">
                    <span className="font-headline-md text-[19px] text-on-surface font-bold">{Math.round(Number(d.temperature_2m_max) || 0)}°</span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">{Math.round(Number(d.temperature_2m_min) || 0)}°</span>
                  </div>
                  <div className="flex flex-col gap-0.5 w-full text-left bg-surface-container-lowest rounded-lg p-1.5 font-label-sm text-[11px] text-on-surface-variant">
                    <span className="flex items-center justify-between gap-1"><span className="material-symbols-outlined text-[13px] text-primary">water_drop</span>{Math.round(Number(d.precipitation_probability_max) || 0)}%</span>
                    <span className="flex items-center justify-between gap-1"><span className="material-symbols-outlined text-[13px] text-primary">air</span>{Math.round(Number(d.wind_speed_10m_max) || 0)} km/h</span>
                    <span className="flex items-center justify-between gap-1"><span className="material-symbols-outlined text-[13px] text-primary">humidity_percentage</span>{Math.round(Number(d.relative_humidity_2m_mean) || 0)}%</span>
                  </div>
                  <span className={`w-full text-center py-0.5 rounded font-label-sm text-[11px] font-semibold ${dayChip}`}>{d.w.label}</span>
                </div>
              );
            })}
          </div>

          {/* Spray diagnostic */}
          <div className={`mt-1 bg-surface-container-low rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${best ? '' : 'border border-tertiary/30'}`}>
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${best ? 'bg-primary text-on-primary' : 'bg-tertiary text-on-tertiary'}`}>
                <span className="material-symbols-outlined text-[22px]">{best ? 'cloud_download' : 'water_drop'}</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-label-lg text-label-lg text-on-surface">
                  {best ? `Recommendation: spray on ${best.dayLabel} between 06:30 AM – 10:30 AM` : 'No safe spray window inside the next 48 hours'}
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">
                  {best ? `Wind under 12 km/h, rain-free morning — the live forecast confirms ${best.w.label.toLowerCase()} conditions.` : 'Postpone plant-protection application until winds drop and rain clears.'}
                </span>
              </div>
            </div>
            <button onClick={() => setReminderOpen(true)}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-surface-container-lowest text-primary font-label-sm text-label-sm font-semibold shadow-sm hover:bg-surface-container transition-colors shrink-0">
              Set SMS Spray Reminder
            </button>
          </div>

          {/* Scheduled reminders */}
          {reminders.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Scheduled field reminders</span>
              <div className="flex flex-wrap gap-2">
                {reminders.map(r => (
                  <span key={r.id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container text-on-surface font-label-sm text-label-sm border border-surface-variant">
                    <span className="material-symbols-outlined text-[16px] text-primary">{NOTIF_ICONS[r.kind] || 'notifications_active'}</span>
                    {r.id} · {fmtLongDate(r.target_date)} · {r.time_slot}
                    <button onClick={() => cancelReminder(r.id)} aria-label={`Cancel ${r.id}`} className="text-on-surface-variant hover:text-error transition-colors">
                      <span className="material-symbols-outlined text-[15px]">close</span>
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Radar heatmap */}
        <div className="lg:col-span-4 bg-surface-container-lowest rounded-2xl p-5 md:p-6 shadow-sm flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">radar</span>
                <h3 className="font-headline-md text-headline-md text-on-surface">Forecast Radar</h3>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-label-sm text-[11px] font-semibold">LIVE FEED</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-surface-container-low rounded-xl mb-3">
              {RADAR_MODES.map(m => (
                <button key={m.key} onClick={() => setRadarMode(m.key)}
                  className={`px-2.5 py-1.5 rounded-lg font-label-sm text-[12px] text-center transition-colors ${radarMode === m.key ? 'bg-surface-container-lowest text-primary font-semibold shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}>
                  {m.label}
                </button>
              ))}
            </div>

            <div className="relative w-full rounded-xl overflow-hidden border border-surface-variant bg-surface-container p-3">
              <div className="absolute top-2.5 left-2.5 bg-surface-container-lowest/90 backdrop-blur-md px-2.5 py-1 rounded-lg shadow-sm flex items-center gap-1.5 z-10">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="font-label-sm text-[11px] text-on-surface font-semibold">{RADAR_MODES.find(m => m.key === radarMode).label} — 7-day trace</span>
              </div>
              <div className="flex items-end justify-between gap-1.5 h-32 pt-8 pb-1 px-1">
                {windows.map(d => {
                  const mode = RADAR_MODES.find(m => m.key === radarMode);
                  const val = mode.valueOf(d);
                  const pct = Math.max(4, Math.min(100, (val / mode.max) * 100));
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                      <span className="font-label-sm text-[10px] font-bold text-on-surface">{Math.round(val)}</span>
                      <div className="w-full flex items-end rounded-md bg-surface-container-high" style={{ height: 84 }}>
                        <div className={`w-full rounded-md transition-all ${radarMode === 'temp' ? 'bg-tertiary' : radarMode === 'wind' ? 'bg-secondary' : 'bg-primary'}`}
                          style={{ height: `${pct}%`, opacity: 0.35 + (pct / 100) * 0.65 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between px-1">
                {windows.map(d => (
                  <span key={d.date} className="flex-1 text-center font-label-sm text-[10px] text-on-surface-variant truncate">{d.dayLabel}</span>
                ))}
              </div>
              <div className="absolute bottom-8 left-2.5 right-2.5 h-0.5 bg-on-surface/5 pointer-events-none" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant">
              <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[15px] text-primary">filter_center_focus</span>Resolution: Open-Meteo ~5 km</span>
              <span className="font-semibold text-on-surface">{weather?.location?.latitude?.toFixed?.(2) ?? '—'}, {weather?.location?.longitude?.toFixed?.(2) ?? '—'}</span>
            </div>
            <p className="font-label-sm text-label-sm text-on-surface-variant bg-surface-container-low px-2.5 py-2 rounded-lg leading-relaxed">
              Bars show the {RADAR_MODES.find(m => m.key === radarMode).label.toLowerCase()} per forecast day — hover the day cards on the left for exact figures. Moisture-tracking layer switches to precipitation radar for spray planning.
            </p>
          </div>
        </div>
      </section>

      {/* ============ Crop vulnerability matrix ============ */}
      <section className="bg-surface-container-lowest rounded-2xl p-5 md:p-6 shadow-sm flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[24px]">bug_report</span>
              <h2 className="font-headline-md text-headline-md text-on-surface tracking-tight">Crop Vulnerability & Threat Matrix</h2>
            </div>
            <span className="font-label-sm text-label-sm text-on-surface-variant">Cross-referenced with the 72-hour humidity & heat index from the live forecast</span>
          </div>
          <span className="font-label-sm text-label-sm text-on-surface-variant self-start">Active field: <strong className="text-primary">{field}</strong></span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {CROPS.map(crop => {
            const level = crop.getLevel(pest);
            const chipCls = CROP_RISK_CLS[level];
            const chipText = CROP_RISK_CHIP[level];
            const active = field === crop.id;
            const trapLine = crop.trapLine(pest);
            return (
              <div key={crop.id}
                className={`bg-surface p-4 rounded-xl flex flex-col justify-between gap-3 transition-all ${active ? 'ring-2 ring-primary shadow-md' : 'hover:shadow-md'}`}>
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-surface-container-lowest flex items-center justify-center text-primary shadow-sm">
                        <span className="material-symbols-outlined text-[22px]">{crop.icon}</span>
                      </div>
                      <div>
                        <p className="font-label-lg text-label-lg text-on-surface font-semibold">{crop.name}</p>
                        <p className="font-label-sm text-label-sm text-on-surface-variant">{crop.variant}</p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full font-label-sm text-[11px] font-semibold ${chipCls}`}>{chipText}</span>
                  </div>
                  <div className="bg-surface-container-lowest rounded-xl p-3 flex flex-col gap-1.5 text-[13px]">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-label-sm text-label-sm text-on-surface-variant shrink-0">Target Vector:</span>
                      <span className="font-label-sm text-label-sm font-semibold text-on-surface text-right">{crop.vector}</span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-label-sm text-label-sm text-on-surface-variant shrink-0">{crop.id === 'cotton' ? 'Trap Density:' : crop.id === 'soybean' ? 'Moisture Stress:' : 'Root-Zone Drainage:'}</span>
                      <span className="font-label-sm text-label-sm font-semibold text-on-surface text-right">{trapLine || (moisture >= 60 ? `${moisture}% · Normal RH` : `${moisture}% · Drying`)}</span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-label-sm text-label-sm text-on-surface-variant shrink-0">Humidity Window:</span>
                      <span className="font-label-sm text-label-sm font-semibold text-tertiary text-right">{Math.round(derived.avgHum)}% over 7 days · {pest.risk_pct}% pest prob.</span>
                    </div>
                  </div>
                  <p className="font-label-sm text-label-sm text-on-surface-variant leading-relaxed">{crop.protocol}</p>
                </div>
                <button onClick={() => openChatWith(crop.chat)}
                  className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-primary font-label-sm text-label-sm font-semibold transition-colors text-left">
                  <span className="flex items-center gap-1.5"><span className="material-symbols-outlined text-[16px]">{crop.actionIcon}</span>{crop.action}</span>
                  <span className="font-label-sm text-[11px] text-on-surface-variant shrink-0">{crop.subsidy}</span>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ============ Advisory checklist + agri-bot ============ */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 bg-surface-container-lowest rounded-2xl p-5 md:p-6 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[22px]">fact_check</span>
              <h2 className="font-headline-md text-headline-md text-on-surface tracking-tight">Actionable Farm Advisory Checklist</h2>
            </div>
            <span className="font-label-sm text-label-sm text-on-surface-variant">{stepsDone.length}/{steps.length} completed</span>
          </div>
          <div className="flex flex-col gap-3">
            {steps.map((step, idx) => {
              const done = stepsDone.includes(idx);
              return (
                <div key={idx} className={`flex items-start gap-3.5 p-4 rounded-xl border transition-colors ${done ? 'bg-surface-container-low border-primary/20 opacity-80' : 'bg-surface border-surface-variant'}`}>
                  <button onClick={() => toggleStep(idx)} aria-label={done ? 'Mark incomplete' : 'Mark as completed'}
                    className={`w-10 h-10 rounded-xl shrink-0 flex items-center justify-center font-label-lg text-label-lg font-bold transition-colors ${done ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface'}`}>
                    {done ? <span className="material-symbols-outlined text-[20px]">check</span> : String(idx + 1).padStart(2, '0')}
                  </button>
                  <div className="flex flex-col gap-1 flex-1 min-w-0">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className={`font-label-lg text-label-lg font-semibold ${done ? 'text-on-surface-variant line-through' : 'text-on-surface'}`}>{step.title}</span>
                      <span className={`px-2.5 py-0.5 rounded-full font-label-sm text-[11px] font-semibold ${step.chipCls || 'bg-surface-container-high text-on-surface-variant'}`}>{step.chip}</span>
                    </div>
                    <p className="font-label-sm text-label-sm text-on-surface-variant leading-relaxed">{step.desc}</p>
                    <button onClick={() => toggleStep(idx)} className={`self-start mt-1 inline-flex items-center gap-1.5 font-label-sm text-label-sm font-semibold ${done ? 'text-primary' : 'text-primary'} hover:underline`}>
                      <span className="material-symbols-outlined text-[16px]">{done ? 'check_box' : 'check_box_outline_blank'}</span>
                      {done ? 'Completed — tap to undo' : 'Mark as Completed'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {stepsDone.length === steps.length && steps.length > 0 && (
            <div className="flex items-center gap-3 rounded-xl bg-primary/10 border border-primary/20 p-4">
              <span className="material-symbols-outlined text-primary text-[28px]">emoji_events</span>
              <p className="font-label-lg text-label-lg text-primary font-semibold">All advisory tasks completed — the live forecast confirms a safe field window.</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-4 bg-gradient-to-br from-primary/10 via-surface-container-lowest to-surface-container-lowest rounded-2xl p-5 md:p-6 shadow-sm flex flex-col justify-between gap-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shadow-sm">
                  <span className="material-symbols-outlined text-[24px]">support_agent</span>
                </div>
                <div>
                  <h3 className="font-headline-md text-headline-md text-on-surface leading-tight">FinGrow Agri-Bot</h3>
                  <span className="font-label-sm text-label-sm text-primary font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> Regional Risk Assistant
                  </span>
                </div>
              </div>
              <span className="font-label-sm text-[11px] text-on-surface font-semibold bg-surface-container-low px-2 py-1 rounded-lg">मराठी / हिन्दी / EN</span>
            </div>

            <div className="bg-surface-container-lowest rounded-xl shadow-sm p-4 flex flex-col items-center gap-2">
              <span className="font-label-sm text-label-sm text-on-surface-variant text-center">Ask in Marathi, Hindi, or English — the bot reads the same live forecast you see here.</span>
              <button onClick={openVoice} aria-label="Tap to speak"
                className="relative w-16 h-16 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all my-1">
                <span className="material-symbols-outlined text-[32px]">mic</span>
                <span className="absolute inset-0 rounded-full border-2 border-primary animate-ping opacity-25" />
              </button>
              <p className="font-label-sm text-label-sm text-on-surface font-medium text-center">Tap the mic or pick a quick query</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {[
              best ? `Will rain on ${best.dayLabel} affect the urea spray I did today?` : 'When is the next safe window to spray urea?',
              `What is the ${pest.vector} threat level for my ${CROPS.find(c => c.id === field)?.name.split(' ')[0]} field this week?`,
              'How do I file a PMFBY weather-damage claim and what documents do I need?',
            ].map((q, i) => (
              <button key={i} onClick={() => openChatWith(q)}
                className="w-full text-left p-2.5 rounded-xl bg-surface-container-lowest hover:bg-surface-container text-on-surface font-label-sm text-label-sm flex items-center justify-between gap-2 shadow-sm transition-colors">
                <span className="truncate">“{q}”</span>
                <span className="material-symbols-outlined text-[18px] text-primary shrink-0">volume_up</span>
              </button>
            ))}
            <p className="font-label-sm text-[11px] text-on-surface-variant flex items-center gap-1 pt-1">
              <span className="material-symbols-outlined text-[14px] text-primary">verified</span> Vetted with KVK protocol lines · 24×7
            </p>
          </div>
        </div>
      </section>

      {/* ============ Insurance section ============ */}
      <section className="bg-surface-container-lowest rounded-2xl p-5 md:p-6 shadow-sm flex flex-col gap-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0 shadow-sm">
              <span className="material-symbols-outlined text-[26px]">shield</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-headline-md text-headline-md text-on-surface tracking-tight">Parametric Weather Insurance (AWS Linked)</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-label-sm text-[11px] font-semibold uppercase">{policyHealth}</span>
              </div>
              <p className="font-label-sm text-label-sm text-on-surface-variant">
                {pol ? `${pol.policy_id} · Sum insured ${inr(pol.sum_insured)} across ${pol.area_acres} acres · ${pol.crop}` : 'Policy feed offline — trigger meters paused.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            <button onClick={() => setClaimOpen(true)}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-tertiary text-on-tertiary font-label-lg text-label-lg font-semibold hover:opacity-95 shadow-sm transition-opacity flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]">report_problem</span>
              Raise Weather Damage Claim
            </button>
            <button onClick={() => setLedgerOpen(true)}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-surface-container-high text-on-surface hover:bg-surface-container font-label-lg text-label-lg transition-colors flex items-center gap-2 shadow-sm">
              <span className="material-symbols-outlined text-[20px]">receipt_long</span>
              View Policy Ledger
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {triggers.map(t => {
            const style = TRIGGER_STYLE[t.status] || TRIGGER_STYLE.Offline;
            return (
              <div key={t.key} className="bg-surface p-4 rounded-xl flex flex-col justify-between gap-3 border border-surface-variant">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">Parameter</span>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-label-sm text-[11px] font-semibold ${style.chip}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />{style.label}
                    </span>
                  </div>
                  <span className="font-label-lg text-label-lg text-on-surface font-semibold leading-tight">{t.label}</span>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">{t.threshold}</p>
                </div>
                <div className="pt-2.5 border-t border-surface-container flex items-center justify-between gap-2 font-label-sm text-label-sm">
                  <span className="text-on-surface-variant">Status:</span>
                  <span className="font-semibold text-on-surface text-right">{t.note}</span>
                </div>
              </div>
            );
          })}
          {triggers.length === 0 && (
            <p className="md:col-span-3 text-center text-on-surface-variant font-body-md text-body-md py-6">Trigger meters are waiting for the live weather feed.</p>
          )}
        </div>

        <div className="p-4 rounded-xl bg-surface-container flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-surface-container-lowest text-primary flex items-center justify-center shadow-sm shrink-0">
              <span className="material-symbols-outlined text-[20px]">history</span>
            </div>
            <div>
              <span className="font-label-lg text-label-lg text-on-surface font-semibold">Direct Beneficiary Payout History</span>
              {payoutHistory.length > 0 ? (
                <span className="font-label-sm text-label-sm text-on-surface-variant block">
                  {inr(payoutHistory[0].amount)} disbursed on {payoutHistory[0].label} for {payoutHistory[0].reason} via DBT.
                </span>
              ) : (
                <span className="font-label-sm text-label-sm text-on-surface-variant block">No payouts on record yet.</span>
              )}
            </div>
          </div>
          <button onClick={() => setLedgerOpen(true)}
            className="px-4 py-2 rounded-xl bg-surface-container-lowest hover:bg-surface-container-high text-primary font-label-sm text-label-sm font-semibold transition-colors shadow-sm shrink-0 flex items-center gap-1">
            Claim History Ledger <span className="material-symbols-outlined text-[16px]">chevron_right</span>
          </button>
        </div>
      </section>

      {/* ============ Claim modal ============ */}
      <Modal open={claimOpen} onClose={() => setClaimOpen(false)}>
        <div className="flex items-center gap-3 pb-4 border-b border-surface-container">
          <div className="w-10 h-10 rounded-xl bg-tertiary/10 text-tertiary flex items-center justify-center">
            <span className="material-symbols-outlined text-[24px]">report_problem</span>
          </div>
          <div>
            <h3 className="font-headline-md text-headline-md text-on-surface leading-tight">Raise Weather Damage Claim</h3>
            <p className="font-label-sm text-label-sm text-on-surface-variant">{pol ? `${pol.policy_id} · ${inr(pol.sum_insured)} insured` : 'PMFBY · AWS-Linked Parametric'}</p>
          </div>
        </div>

        <form onSubmit={fileClaim} className="flex flex-col gap-4">
          <div>
            <label className="block font-label-sm text-label-sm text-on-surface mb-1 font-semibold">Damage type</label>
            <select value={claimType} onChange={e => setClaimType(e.target.value)}
              className="w-full h-12 px-3.5 rounded-xl bg-surface-container-low text-on-surface font-body-md focus:outline-none focus:ring-2 focus:ring-primary border border-surface-variant">
              {damageTypes.length ? damageTypes.map(t => <option key={t.key} value={t.key}>{t.label}</option>)
                : Object.keys(claimFactors).map(k => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-label-sm text-label-sm text-on-surface mb-1 font-semibold">Affected area (acres)</label>
              <input type="number" min="0.1" step="0.1" value={claimArea} onChange={e => setClaimArea(e.target.value)}
                className="w-full h-12 px-3.5 rounded-xl bg-surface-container-low text-on-surface focus:outline-none focus:ring-2 focus:ring-primary border border-surface-variant" />
            </div>
            <div>
              <label className="block font-label-sm text-label-sm text-on-surface mb-1 font-semibold">Your mobile (10 digits)</label>
              <input type="tel" maxLength="10" value={claimMobile} onChange={e => setClaimMobile(e.target.value.replace(/\D/g, ''))}
                placeholder="98XXXXXXXX"
                className="w-full h-12 px-3.5 rounded-xl bg-surface-container-low text-on-surface focus:outline-none focus:ring-2 focus:ring-primary border border-surface-variant" />
            </div>
          </div>
          <div>
            <label className="block font-label-sm text-label-sm text-on-surface mb-1 font-semibold">Description (optional)</label>
            <textarea rows={2} value={claimNote} onChange={e => setClaimNote(e.target.value)} placeholder="e.g. Hail flattened soybean pods in block C"
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-container-low text-on-surface focus:outline-none focus:ring-2 focus:ring-primary border border-surface-variant" />
          </div>

          <div className="rounded-xl bg-primary/5 border border-primary/15 p-4 flex items-center justify-between gap-3">
            <div>
              <span className="font-label-sm text-label-sm text-on-surface-variant block">Estimated payout (auto)</span>
              <span className="font-headline-lg text-headline-lg font-bold text-primary">{inr(claimEstimate.amount)}</span>
              <span className="font-label-sm text-[11px] text-on-surface-variant block">{claimEstimate.basis}</span>
            </div>
            <span className="material-symbols-outlined text-[34px] text-primary">payments</span>
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={() => setClaimOpen(false)} className="px-5 h-11 rounded-xl text-on-surface-variant font-label-lg hover:bg-surface-container transition-colors">Cancel</button>
            <button type="submit" disabled={claimSending}
              className="px-6 h-11 rounded-xl bg-tertiary text-on-tertiary font-label-lg hover:opacity-95 transition-opacity shadow-sm flex items-center gap-2 disabled:opacity-60">
              {claimSending && <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>}
              {claimSending ? 'Filing…' : 'Submit Claim'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ============ Ledger modal ============ */}
      <Modal open={ledgerOpen} onClose={() => setLedgerOpen(false)} wide>
        <div className="flex items-center gap-3 pb-4 border-b border-surface-container">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-[24px]">receipt_long</span>
          </div>
          <div>
            <h3 className="font-headline-md text-headline-md text-on-surface leading-tight">Policy Ledger</h3>
            <p className="font-label-sm text-label-sm text-on-surface-variant">{pol ? `${pol.policy_id} · ${pol.insurer}` : 'PMFBY · AWS-Linked Parametric'}</p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              ['Sum Insured', pol ? inr(pol.sum_insured) : '—'],
              ['Insured Area', pol ? `${pol.area_acres} acres` : '—'],
              ['Season', pol ? pol.season : '—'],
              ['Status', policyHealth],
            ].map(([k, v]) => (
              <div key={k} className="bg-surface p-3 rounded-xl border border-surface-variant">
                <p className="font-label-sm text-[11px] text-on-surface-variant uppercase tracking-wider">{k}</p>
                <p className="font-label-lg text-label-lg font-bold text-on-surface mt-0.5">{v}</p>
              </div>
            ))}
          </div>

          <div>
            <h4 className="font-label-lg text-label-lg text-on-surface font-semibold mb-2">Filed claims</h4>
            {claims.length === 0 ? (
              <p className="text-on-surface-variant font-body-md text-body-md text-sm bg-surface rounded-xl p-4">No weather claims filed yet — triggers are evaluated live from the forecast.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {claims.map(c => (
                  <div key={c.id} className="flex flex-col sm:flex-row sm:items-center gap-2 justify-between bg-surface rounded-xl p-3.5 border border-surface-variant">
                    <div className="min-w-0">
                      <p className="font-label-lg text-label-lg text-on-surface font-semibold">{c.id} · {damageTypeMeta(c.damage_type).label || c.damage_type}</p>
                      <p className="font-label-sm text-label-sm text-on-surface-variant truncate">
                        {c.area_acres} acres · est. {inr(c.estimate?.estimate_amount ?? c.estimate_amount)} · {c.status} · {c.created_at ? new Date(c.created_at).toLocaleDateString('en-IN') : ''}
                        {` · ${c.estimate?.basis || c.basis || ''}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary font-label-sm text-[11px] font-semibold">{c.status}</span>
                      <button onClick={() => withdrawClaim(c.id)} className="px-3 py-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/5 font-label-sm text-label-sm transition-colors">
                        Withdraw
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="font-label-lg text-label-lg text-on-surface font-semibold mb-2">Payout history (DBT)</h4>
            <div className="flex flex-col gap-2">
              {payoutHistory.map((p, i) => (
                <div key={i} className="flex items-center gap-3 bg-surface rounded-xl p-3.5 border border-surface-variant">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[20px]">verified_user</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-label-lg text-label-lg text-on-surface font-semibold">{inr(p.amount)} <span className="text-on-surface-variant font-normal">· {p.label}</span></p>
                    <p className="font-label-sm text-label-sm text-on-surface-variant">{p.reason} · {p.mode}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* ============ Reminder modal ============ */}
      <Modal open={reminderOpen} onClose={() => setReminderOpen(false)}>
        <div className="flex items-center gap-3 pb-4 border-b border-surface-container">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-[24px]">notifications_active</span>
          </div>
          <div>
            <h3 className="font-headline-md text-headline-md text-on-surface leading-tight">Set Spray Reminder</h3>
            <p className="font-label-sm text-label-sm text-on-surface-variant">We'll nudge you before the next safe morning window</p>
          </div>
        </div>

        <form onSubmit={scheduleReminder} className="flex flex-col gap-4">
          <div>
            <label className="block font-label-sm text-label-sm text-on-surface mb-1.5 font-semibold">Choose a spray-window day from the live forecast</label>
            {dayChoices.length === 0 ? (
              <p className="text-on-surface-variant font-body-md text-body-md text-sm bg-surface rounded-xl p-3.5">
                No safe window inside the next 48 hours — check back when the forecast clears.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {dayChoices.map((d, i) => (
                  <label key={d.date} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${reminderDay === d.date ? 'border-primary bg-primary/5' : 'border-surface-variant bg-surface hover:bg-surface-container-low'}`}>
                    <input type="radio" name="day" value={d.date} checked={reminderDay === d.date} onChange={() => setReminderDay(d.date)} className="accent-[#006948]" />
                    <span className="flex-1">
                      <span className="block font-label-lg text-label-lg text-on-surface font-semibold">{d.dayLabel} — {d.w.label}</span>
                      <span className="block font-label-sm text-label-sm text-on-surface-variant">{hasSafeWindow ? 'Best between' : 'Monitor — forecast may improve; we\'ll confirm before'} 06:30 AM – 10:30 AM · wind {Math.round(Number(d.wind_speed_10m_max) || 0)} km/h · rain {Math.round(Number(d.precipitation_probability_max) || 0)}%</span>
                    </span>
                    {i === 0 && <span className={`px-2 py-0.5 rounded-full font-label-sm text-[11px] font-semibold ${hasSafeWindow ? 'bg-primary/10 text-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>{hasSafeWindow ? 'Best' : 'Monitor'}</span>}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-label-sm text-label-sm text-on-surface mb-1 font-semibold">Remind me by</label>
              <select value={reminderKind} onChange={e => setReminderKind(e.target.value)}
                className="w-full h-12 px-3.5 rounded-xl bg-surface-container-low text-on-surface focus:outline-none focus:ring-2 focus:ring-primary border border-surface-variant">
                <option value="sms">SMS</option>
                <option value="call">Voice call (IVR)</option>
                <option value="push">App push</option>
              </select>
            </div>
            <div>
              <label className="block font-label-sm text-label-sm text-on-surface mb-1 font-semibold">Mobile number</label>
              <input type="tel" maxLength="10" value={reminderContact} onChange={e => setReminderContact(e.target.value.replace(/\D/g, ''))}
                placeholder="98XXXXXXXX"
                className="w-full h-12 px-3.5 rounded-xl bg-surface-container-low text-on-surface focus:outline-none focus:ring-2 focus:ring-primary border border-surface-variant" />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={() => setReminderOpen(false)} className="px-5 h-11 rounded-xl text-on-surface-variant font-label-lg hover:bg-surface-container transition-colors">Cancel</button>
            <button type="submit" disabled={reminderSending || dayChoices.length === 0}
              className="px-6 h-11 rounded-xl bg-primary text-on-primary font-label-lg hover:bg-primary-container transition-colors shadow-sm flex items-center gap-2 disabled:opacity-60">
              {reminderSending && <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>}
              {reminderSending ? 'Scheduling…' : `Schedule ${reminderKind.toUpperCase()} Reminder`}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
