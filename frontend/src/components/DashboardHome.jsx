import React, { useState, useEffect, useCallback, useRef } from 'react';
import RepaymentTracker from './RepaymentTracker';
import {
  fetchLoanHistory,
  fetchMarketPrices,
  fetchPortfolio,
  fetchPortfolioCashflow,
  fetchHarvestLogs,
  fetchWeather,
  fetchClusterActivity,
  submitLoanApplication,
  submitHarvest,
  deleteHarvest,
  markRepaymentPaid,
  fetchLoanStatement,
} from '../hooks/useReport';

const CREDIT_LIMIT = 2500000;
const PROFILE_NAME = 'Ramesh Rao';

const FACILITIES = [
  { id: 'kcc', name: 'Kisan Credit Facility (KCC Subsidized)', category: 'Crop Season Credit', scheme: 'Kisan Credit Card Scheme', annualRate: 4.0, subsidyRate: 0, note: '3% interest subvention on prompt repayment' },
  { id: 'cold', name: 'Post-Harvest Processing & Cold Storage', category: 'Cold Storage & Processing', scheme: 'Term Loan Scheme', annualRate: 7.0, subsidyRate: 0.35, note: '35% backend capital subsidy under AIF (capped ₹5L)' },
  { id: 'solar', name: 'Solar Water Pump / Drip Irrigation Scheme', category: 'Solar & Micro-Irrigation', scheme: 'Solar Pump Subsidy Scheme', annualRate: 5.0, subsidyRate: 0.3, note: '30% PM-KUSUM component subsidy' },
  { id: 'mach', name: 'Agri-Machinery & Farm Mechanization', category: 'Farm Machinery', scheme: 'Sub-Mission on Agricultural Mechanization', annualRate: 6.0, subsidyRate: 0.25, note: '25% subsidy for small & marginal farmers' },
];

const TENURE_OPTIONS = [
  { months: 12, label: '12 Months (Kharif Cycle)' },
  { months: 24, label: '24 Months (Biannual)' },
  { months: 36, label: '36 Months (Seasonal EMIs)' },
  { months: 60, label: '60 Months (5 Years)' },
  { months: 84, label: '84 Months (7 Years)' },
];

const SEASON_RANGES = [
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'season', label: 'Current Season' },
  { id: 'custom', label: 'Full Horizon' },
];

const MARKET_PRIORITY = ['Soybean', 'Cotton', 'Tur'];

function fmtINR(n) {
  const num = Number(n || 0);
  if (num >= 10000000) return '₹' + (num / 10000000).toFixed(2) + ' Cr';
  if (num >= 100000) return '₹' + (num / 100000).toFixed(2) + ' L';
  return '₹' + num.toLocaleString('en-IN');
}

function facilityWord(n) {
  return n === 1 ? 'facility' : 'facilities';
}

function fmtDateLabel(value) {
  if (!value) return '—';
  const text = String(value);
  try {
    const d = new Date(text.length === 10 ? text + 'T00:00:00' : text);
    if (Number.isNaN(d.getTime())) return text;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return text;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const Input = ({ label, children, hint }) => (
  <div>
    <label className="block font-label-sm text-label-sm text-on-surface mb-1 font-semibold">{label}</label>
    {children}
    {hint && <p className="font-label-sm text-label-sm text-on-surface-variant mt-1">{hint}</p>}
  </div>
);

const fieldCls = 'w-full h-14 px-4 rounded-xl bg-surface-container-low text-on-surface font-body-md text-[15px] focus:outline-none focus:ring-2 focus:ring-primary border border-transparent focus:border-primary transition-all';

export default function DashboardHome({ onNavigate, onNewReport, report, hasLiveReport }) {
  const [loans, setLoans] = useState([]);
  const [marketCrops, setMarketCrops] = useState([]);
  const [marketMeta, setMarketMeta] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [cashflowData, setCashflowData] = useState({ months: [], ledger: [] });
  const [harvestData, setHarvestData] = useState(null);
  const [cluster, setCluster] = useState(null);
  const [weather, setWeather] = useState(null);
  const [weatherFailed, setWeatherFailed] = useState(false);
  const [dataError, setDataError] = useState('');

  const [loanModal, setLoanModal] = useState(false);
  const [harvestModal, setHarvestModal] = useState(false);
  const [trackingLoan, setTrackingLoan] = useState(null);
  const [payingId, setPayingId] = useState(null);

  const [chartTab, setChartTab] = useState('overview');
  const [range, setRange] = useState('season');
  const [toast, setToast] = useState(null);
  const feasibilityPanelRef = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 3800);
  };

  const refreshAll = useCallback(() => {
    fetchPortfolio().then(setPortfolio).catch(err => console.error('portfolio', err));
    fetchPortfolioCashflow().then(setCashflowData).catch(err => console.error('cashflow', err));
    fetchLoanHistory()
      .then(data => setLoans(data.loans || []))
      .catch(err => { console.error('loans', err); setDataError('Loan data unavailable — is the backend running?'); });
    fetchMarketPrices()
      .then(data => { setMarketCrops(data.crops || data.prices || []); setMarketMeta({ generated_at: data.generated_at, source: data.source }); })
      .catch(err => console.error('market', err));
    fetchHarvestLogs().then(setHarvestData).catch(() => {});
    fetchClusterActivity().then(setCluster).catch(() => {});
    setWeatherFailed(false);
    fetchWeather('Akola, Maharashtra')
      .then(payload => setWeather(payload))
      .catch(() => setWeatherFailed(true));
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const payNextInstalment = async (loan) => {
    if (payingId) return;
    const month = (loan.months_paid || 0) + 1;
    if (!window.confirm(`Record EMI instalment ${month} as paid for ${loan.id}?`)) return;
    setPayingId(loan.id);
    try {
      await markRepaymentPaid(loan.id, month);
      showToast(`${loan.id}: instalment ${month} marked paid.`);
      refreshAll();
    } catch (err) {
      console.error(err);
      showToast('Payment failed: ' + err.message);
    } finally {
      setPayingId(null);
    }
  };

  const downloadStatement = async (loan) => {
    try {
      const blob = await fetchLoanStatement(loan.id);
      downloadBlob(blob, `loan_statement_${loan.id}.csv`);
      showToast('Statement downloaded for ' + loan.id + '.');
    } catch (err) {
      showToast('Statement unavailable: ' + err.message);
    }
  };

  const downloadAllStatements = async () => {
    const apps = loans.filter(l => l.source === 'application' && l.status === 'Active');
    if (!apps.length) {
      showToast('No active application loans with statements yet.');
      return;
    }
    for (const loan of apps) {
      try {
        const blob = await fetchLoanStatement(loan.id);
        downloadBlob(blob, `loan_statement_${loan.id}.csv`);
      } catch (err) {
        console.error(err);
      }
    }
    showToast(`Downloaded ${apps.length} repayment statement${apps.length === 1 ? '' : 's'}.`);
  };

  const openVoiceAgent = () => window.dispatchEvent(new CustomEvent('open-voice-agent'));
  const openChatWith = (text) => window.dispatchEvent(new CustomEvent('open-chat-with', { detail: { text } }));

  if (trackingLoan) {
    return (
      <RepaymentTracker
        loan={trackingLoan}
        onBack={() => { setTrackingLoan(null); refreshAll(); }}
        onChanged={() => { refreshAll(); }}
      />
    );
  }

  // ---------------------------------------------------------------- derived
  const activeApps = loans.filter(l => l.source === 'application' && l.status === 'Active');
  const pendingApps = loans.filter(l => l.source === 'application' && l.status === 'Pending');

  const p = portfolio || {
    active_loans: 0, pending_applications: 0, outstanding_total: 0, monthly_emi_total: 0,
    months_paid: 0, months_total: 0, subsidy_approved_total: 0, subsidy_pipeline_total: 0,
    utilization_pct: 0, next_due_date: null, next_due_amount: 0, credit_limit: CREDIT_LIMIT,
  };

  const utilPct = Math.min(100, Math.round(p.utilization_pct || 0));
  const months = cashflowData.months || [];
  const maxEmi = Math.max(...months.map(m => m.total_emi), 0);
  const shownMonths = range === 'week' || range === 'month' ? months.slice(0, 1) : months;
  const maxShown = Math.max(...shownMonths.map(m => m.total_emi), 0);

  const watchCrops = (() => {
    const ordered = [];
    for (const key of MARKET_PRIORITY) {
      const found = marketCrops.find(c => (c.name || '').toLowerCase().includes(key.toLowerCase()));
      if (found && !ordered.includes(found)) ordered.push(found);
    }
    for (const crop of marketCrops) {
      if (ordered.length >= 3) break;
      if (!ordered.includes(crop)) ordered.push(crop);
    }
    return ordered.slice(0, 3);
  })();

  const avgMandiDelta = (() => {
    const deltas = watchCrops.map(c => (c.trend === 'up' ? c.trendPercent : c.trend === 'down' ? -c.trendPercent : 0));
    if (!deltas.length) return 0;
    return deltas.reduce((a, b) => a + b, 0) / deltas.length;
  })();

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const reportDisplay = report || {
    business_category: 'Organic Poultry Farm',
    display_name: 'Vidarbha Region, Maharashtra',
    financials: { project_cost: 600000, loan_amount: 480000, margin_contribution: 120000, selected_scheme: 'Maha-Krushi Scheme', interest_rate_pct: 7.0, tenure_months: 84 },
  };
  const fin = reportDisplay.financials || {};

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* 1. Executive header & operational command bar */}
      <header className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6 pb-2">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-highest text-on-surface font-label-sm text-label-sm">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Vidarbha Agri Cluster #042
            </span>
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed font-label-sm text-label-sm font-semibold">
              <span className="material-symbols-outlined text-[14px]">verified</span>
              KYC Verified (Tier 1 Priority Lending)
            </span>
            <span className="text-on-surface-variant font-label-sm text-label-sm flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px]">calendar_today</span> {today}
            </span>
          </div>
          <div className="flex items-baseline gap-3">
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">Welcome back, {PROFILE_NAME}</h1>
            <span className="font-label-lg text-label-lg text-primary font-semibold hidden md:inline">District: Vidarbha</span>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
            {p.active_loans > 0
              ? `${p.active_loans} active ${facilityWord(p.active_loans)} · ${p.months_paid}/${p.months_total} EMIs on schedule · next repayment ${p.next_due_date ? fmtDateLabel(p.next_due_date) : 'n/a'} (₹${(p.next_due_amount || 0).toLocaleString('en-IN')})`
              : 'Your loan book is empty — start by applying for a credit facility or generating a feasibility report.'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full xl:w-auto">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setLoanModal(true)}
              className="min-h-[48px] px-4 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg hover:bg-primary-container transition-all shadow-sm flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[20px]">add_circle</span>
              <span>New Loan Application</span>
            </button>
            <button
              onClick={() => feasibilityPanelRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="min-h-[48px] px-3.5 rounded-xl bg-surface-container-lowest text-on-surface font-label-lg text-label-lg hover:bg-surface-container transition-all shadow-sm flex items-center gap-2 border border-outline-variant/60"
            >
              <span className="material-symbols-outlined text-primary text-[20px]">analytics</span>
              <span>Calculate Feasibility</span>
            </button>
            <button
              onClick={() => setHarvestModal(true)}
              className="min-h-[48px] px-3.5 rounded-xl bg-surface-container-lowest text-on-surface font-label-lg text-label-lg hover:bg-surface-container transition-all shadow-sm flex items-center gap-2 border border-outline-variant/60"
            >
              <span className="material-symbols-outlined text-on-surface-variant text-[20px]">inventory_2</span>
              <span>Log Harvest</span>
            </button>
            <button
              onClick={openVoiceAgent}
              className="min-h-[48px] px-4 rounded-xl bg-secondary-fixed text-on-secondary-fixed font-label-lg text-label-lg hover:bg-secondary-fixed-dim transition-all shadow-sm flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-primary text-[20px]">mic</span>
              <span className="hidden sm:inline">Voice Advisory</span>
            </button>
          </div>
        </div>
      </header>

      {/* Sub-header seasonal pill filter */}
      <div className="flex items-center justify-between overflow-x-auto pb-1 gap-4 -mt-2">
        <div className="flex items-center bg-surface-container-low p-1.5 rounded-xl gap-1 shrink-0">
          {SEASON_RANGES.map(option => (
            <button
              key={option.id}
              onClick={() => setRange(option.id)}
              className={`px-4 py-2 rounded-lg font-label-sm text-label-sm transition-colors ${
                range === option.id
                  ? 'bg-surface-container-lowest text-primary font-semibold shadow-sm flex items-center gap-1.5'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {range === option.id && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-label-sm text-label-sm text-on-surface-variant">Crop-risk score:</span>
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-label-sm text-label-sm font-semibold ${
              weather && (weather.risk?.score || 0) >= 6 ? 'bg-error-container text-on-error-container' : weather && (weather.risk?.score || 0) >= 4 ? 'bg-tertiary-container/10 text-tertiary' : 'bg-primary/10 text-primary'
            }`}
            title={weather?.risk?.factors?.join(' · ')}
          >
            <span className="material-symbols-outlined text-[14px]">{weather ? 'shield' : weatherFailed ? 'cloud_off' : 'progress_activity'}</span>
            {weather ? `${weather.risk?.level || '—'} (${weather.risk?.score}/10)` : weatherFailed ? 'unavailable' : 'fetching…'}
          </span>
          {weather && (
            <button onClick={() => onNavigate('weather')} className="text-primary font-label-sm text-label-sm underline decoration-dotted underline-offset-2">
              details
            </button>
          )}
        </div>
      </div>

      {/* 2. KPI bento grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1: Active capital & credit */}
        <button
          onClick={() => onNavigate('history')}
          className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between gap-4 text-left"
        >
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">Active Capital &amp; Credit</span>
              <span className="font-display-lg text-display-lg text-on-surface tracking-tight">{fmtINR(p.outstanding_total)}</span>
            </div>
            <div className="w-11 h-11 rounded-xl bg-surface-container-low flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[24px]">account_balance_wallet</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <div className="flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm">
              <span>Utilization: {utilPct}% of ₹25L limit</span>
              <span className="font-semibold text-primary">{p.active_loans} active</span>
            </div>
            <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
              <div className="bg-primary h-full rounded-full transition-all" style={{ width: Math.max(2, utilPct) + '%' }} />
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                Next EMI: <strong className="text-on-surface">{p.next_due_date ? fmtDateLabel(p.next_due_date) : '—'} {p.next_due_amount ? `(₹${(p.next_due_amount || 0).toLocaleString('en-IN')})` : ''}</strong>
              </span>
              {p.months_total > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary font-label-sm text-label-sm font-semibold">
                  <span className="material-symbols-outlined text-[12px]">schedule</span> {p.months_paid}/{p.months_total}
                </span>
              )}
            </div>
          </div>
        </button>

        {/* Card 2: Season revenue (real harvest log) */}
        <button
          onClick={() => setHarvestModal(true)}
          className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between gap-4 text-left"
        >
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">Season Harvest Revenue</span>
              <span className="font-display-lg text-display-lg text-on-surface tracking-tight">{fmtINR(harvestData?.summary?.total_revenue)}</span>
            </div>
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[24px]">grass</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-primary font-label-lg text-label-lg font-bold">
                <span className="material-symbols-outlined text-[18px]">trending_up</span> {harvestData?.summary?.lots || 0} lots logged
              </span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">avg ₹{(harvestData?.summary?.avg_price_per_qtl || 0).toLocaleString('en-IN')}/qtl</span>
            </div>
            <div className="flex items-end gap-1 h-9 mt-1">
              {(harvestData?.summary?.by_month || []).slice(0, 6).map((m) => {
                const maxRev = Math.max(...(harvestData?.summary?.by_month || []).slice(0, 6).map(x => x.revenue), 1);
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-0.5" title={`${m.month}: ${fmtINR(m.revenue)}`}>
                    <div className="w-full bg-primary/25 rounded-t-sm" style={{ height: Math.max(4, (m.revenue / maxRev) * 26) + 'px' }} />
                    <span className="text-[10px] text-on-surface-variant font-medium">{new Date(m.month + '-01').toLocaleDateString('en-IN', { month: 'short' })}</span>
                  </div>
                );
              })}
              {!harvestData?.summary?.by_month?.length && (
                <span className="text-[11px] text-on-surface-variant py-1">Tap to log your first harvest lot — it feeds this KPI.</span>
              )}
            </div>
          </div>
        </button>

        {/* Card 3: Mandi index */}
        <button
          onClick={() => onNavigate('market')}
          className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between gap-4 text-left"
        >
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">Mandi Watch Index</span>
              <span className="font-display-lg text-display-lg text-on-surface tracking-tight">
                ₹{watchCrops.length ? watchCrops[0].price.toLocaleString('en-IN') : '—'}
                <span className="font-body-md text-body-md font-normal text-on-surface-variant">/qtl</span>
              </span>
            </div>
            <div className="w-11 h-11 rounded-xl bg-secondary-container flex items-center justify-center text-on-secondary-container">
              <span className="material-symbols-outlined text-[24px]">storefront</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <div className="flex items-center justify-between">
              <span className={`inline-flex items-center gap-1 font-label-sm text-label-sm font-semibold ${avgMandiDelta >= 0 ? 'text-primary' : 'text-tertiary'}`}>
                <span className="material-symbols-outlined text-[16px]">{avgMandiDelta >= 0 ? 'arrow_upward' : 'arrow_downward'}</span>
                {avgMandiDelta >= 0 ? '+' : ''}{avgMandiDelta.toFixed(1)}% today
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-bold">Live feed</span>
            </div>
            <div className="flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm pt-2">
              <span className="truncate pr-2">{watchCrops.map(c => c.name).join(' · ') || 'Vidarbha & regional APMCs'}</span>
              <span className="text-on-surface font-semibold shrink-0">{marketMeta?.source ? 'Composite' : '—'}</span>
            </div>
          </div>
        </button>

        {/* Card 4: Capital subsidy */}
        <button
          onClick={() => onNavigate('history')}
          className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between gap-4 text-left"
        >
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">Capital Subsidy Position</span>
              <span className="font-display-lg text-display-lg text-primary tracking-tight">{fmtINR(p.subsidy_approved_total)}</span>
            </div>
            <div className="w-11 h-11 rounded-xl bg-surface-container-low flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[24px]">assured_workload</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <div className="flex items-center justify-between font-label-sm text-label-sm">
              <span className="text-on-surface font-semibold">Attached to sanctioned loans</span>
              <span className="text-primary font-bold">{fmtINR(p.subsidy_approved_total)} cleared</span>
            </div>
            <div className="w-full bg-surface-container h-2 rounded-full overflow-hidden">
              <div className="bg-primary-container h-full rounded-full" style={{ width: `${Math.min(100, 8 + Math.round((p.subsidy_pipeline_total || 0) / Math.max(p.subsidy_approved_total, 1) * 50))}%` }} />
            </div>
            <div className="flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm">
              <span>Pending pipeline: {fmtINR(p.subsidy_pipeline_total)}</span>
              <span className="text-on-surface underline cursor-pointer hover:text-primary">Track DBT</span>
            </div>
          </div>
        </button>
      </section>

      {/* 3. Main split layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 flex flex-col gap-8">
          {/* 3a. Cashflow & EMI chart */}
          <section className="bg-surface-container-lowest rounded-2xl p-6 md:p-8 shadow-sm flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-surface-container">
              <div className="flex flex-col">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">Financial Outlook</span>
                <h2 className="font-headline-md text-headline-md text-on-surface">EMI Cashflow Forecast</h2>
              </div>
              <div className="flex items-center bg-surface-container p-1 rounded-xl" id="forecast-tabs">
                {[
                  { id: 'overview', label: 'Overview' },
                  { id: 'ledger', label: 'Detailed Repayment Ledger' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setChartTab(tab.id)}
                    className={`px-4 py-1.5 rounded-lg font-label-sm text-label-sm transition-all ${
                      chartTab === tab.id ? 'bg-surface-container-lowest text-primary font-semibold shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {chartTab === 'overview' ? (
              <>
                <div className="p-4 rounded-xl bg-surface-container-low flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      <span className="material-symbols-outlined text-[20px]">event_available</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="font-label-sm text-label-sm text-on-surface font-semibold">
                        Monthly EMI commitment: {p.monthly_emi_total ? `${fmtINR(p.monthly_emi_total)}/month` : 'none scheduled yet'}
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        {p.next_due_date ? `Due ${fmtDateLabel(p.next_due_date)} across ${activeApps.length} active ${facilityWord(activeApps.length)}` : 'Approved loans will appear here with their schedules'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end md:self-center">
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/15 text-primary font-label-sm text-label-sm font-bold">
                      <span className="material-symbols-outlined text-[14px]">shield</span>
                      {p.months_paid}/{p.months_total} EMIs on schedule
                    </span>
                  </div>
                </div>

                {shownMonths.length > 0 ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-end gap-6 font-label-sm text-label-sm">
                      <span className="flex items-center gap-2 text-on-surface-variant"><span className="w-3 h-3 rounded-sm bg-primary" /> Principal</span>
                      <span className="flex items-center gap-2 text-on-surface-variant"><span className="w-3 h-3 rounded-sm bg-tertiary" /> Interest</span>
                    </div>
                    <div className="grid gap-2 md:gap-4 pt-4 items-end border-b border-surface-container pb-2" style={{ gridTemplateColumns: `repeat(${Math.max(shownMonths.length, 1)}, minmax(0, 1fr))` }}>
                      {shownMonths.map((month, idx) => {
                        const total = month.total_emi || 0;
                        const principal = month.total_principal || 0;
                        const interest = month.total_interest || 0;
                        const h = maxShown > 0 ? (total / maxShown) * 180 : 0;
                        const principalH = maxShown > 0 ? (principal / maxShown) * 180 : 0;
                        return (
                          <div key={month.key} className="flex flex-col items-center gap-2 justify-end relative">
                            <span className="font-label-sm text-label-sm text-on-surface-variant">{fmtINR(total)}</span>
                            <div className="w-full max-w-[64px] flex flex-col justify-end overflow-hidden rounded-t-md bg-surface-container-high relative" style={{ height: Math.max(h, 4) + 'px' }}>
                              <div className="w-full bg-tertiary" style={{ height: Math.max(interest / maxShown * 180, total ? 2 : 0) + 'px', position: 'absolute', bottom: 0 }} title={`Interest: ${fmtINR(interest)}`} />
                              <div className="w-full bg-primary/70" style={{ height: Math.max(principal / maxShown * 180, total ? 2 : 0) + 'px', position: 'absolute', bottom: total ? Math.max(interest / maxShown * 180, 0) : 0 }} title={`Principal: ${fmtINR(principal)}`} />
                            </div>
                            <span className={`font-label-sm text-label-sm ${idx === 0 ? 'text-primary font-bold' : 'text-on-surface-variant'}`}>{month.label.replace(/ \d+$/, '')}</span>
                            {idx === 0 && <span className="absolute -top-1 px-2 py-0.5 bg-primary text-on-primary text-[10px] font-bold rounded-full">Next</span>}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        Forecast from your real repayment schedules {range !== 'season' ? `· showing ${range === 'week' || range === 'month' ? 'this month' : range} window` : ''}
                      </span>
                      <span className="font-label-sm text-label-sm text-primary font-semibold">{activeApps.length} active {facilityWord(activeApps.length)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center flex flex-col items-center gap-3">
                    <span className="material-symbols-outlined text-4xl text-on-surface-variant">monitoring</span>
                    <p className="font-body-md text-body-md text-on-surface-variant max-w-md">No upcoming EMI obligations yet. Apply for a loan or approve the pending queue and the forecast chart fills with your real schedule.</p>
                    <div className="flex gap-3">
                      <button onClick={() => setLoanModal(true)} className="px-5 py-2.5 rounded-xl bg-primary text-on-primary font-label-sm text-label-sm hover:bg-primary-container transition-colors">Apply for Loan</button>
                      <button onClick={() => onNavigate('history')} className="px-5 py-2.5 rounded-xl bg-surface-container text-on-surface font-label-sm text-label-sm hover:bg-surface-container-high transition-colors">Review Queue</button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[640px]">
                  <thead>
                    <tr className="font-label-sm text-label-sm text-on-surface-variant border-b border-surface-variant">
                      <th className="py-3 pr-4">Month</th>
                      <th className="py-3 pr-4">Facility</th>
                      <th className="py-3 pr-4 text-right">Principal</th>
                      <th className="py-3 pr-4 text-right">Interest</th>
                      <th className="py-3 pr-4 text-right">Total EMI</th>
                      <th className="py-3 text-right">Closing Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container">
                    {cashflowData.ledger.flatMap((month) => month.rows.map((row, i) => (
                      <tr key={month.key + '-' + row.id} className="font-body-md text-body-md text-on-surface text-sm">
                        <td className="py-3 pr-4 font-label-sm text-label-sm">{i === 0 ? month.label : ''}</td>
                        <td className="py-3 pr-4 text-on-surface-variant">{row.name} <span className="text-[11px] text-on-surface-variant/70">({row.id})</span></td>
                        <td className="py-3 pr-4 text-right">{fmtINR(row.principal)}</td>
                        <td className="py-3 pr-4 text-right">{fmtINR(row.interest)}</td>
                        <td className="py-3 pr-4 text-right font-semibold text-on-surface">{fmtINR(row.emi)}</td>
                        <td className="py-3 text-right text-on-surface-variant">{fmtINR(row.balance)}</td>
                      </tr>
                    )))}
                    {!cashflowData.ledger.length && (
                      <tr><td colSpan={6} className="py-8 text-center text-on-surface-variant">No upcoming instalments — approve the pending queue to generate schedules.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 3b. Active loans & credit facilities */}
          <section className="bg-surface-container-lowest rounded-2xl p-6 md:p-8 shadow-sm flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">Credit Portfolio</span>
                <h2 className="font-headline-md text-headline-md text-on-surface">Active Loans &amp; Credit Facilities</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadAllStatements}
                  className="min-h-[44px] px-3.5 rounded-xl bg-surface-container-low text-on-surface font-label-sm text-label-sm hover:bg-surface-container transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">download</span>
                  <span>Download Statements</span>
                </button>
                <button
                  onClick={() => onNavigate('history')}
                  className="min-h-[44px] px-3.5 rounded-xl bg-surface-container-low text-on-surface font-label-sm text-label-sm hover:bg-surface-container transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                  <span>Manage Loans</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {loans.length === 0 && !dataError && (
                <div className="p-8 text-center bg-surface-container-low rounded-2xl text-on-surface-variant font-body-md text-body-md">
                  Loading facilities…
                </div>
              )}
              {dataError && loans.length === 0 && (
                <div className="p-8 text-center bg-error-container/20 rounded-2xl text-error font-body-md text-body-md">{dataError}</div>
              )}

              {activeApps.map((loan) => (
                <div key={loan.id} className="p-5 rounded-2xl bg-surface-container-low hover:bg-surface-container transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[24px]">{loan.icon === 'hourglass_empty' ? 'verified_user' : 'account_balance'}</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-headline-md text-[17px] leading-snug font-bold text-on-surface">{loan.name}</span>
                        <span className="px-2.5 py-0.5 rounded-full bg-primary/15 text-primary font-label-sm text-label-sm font-semibold">Active · On Track</span>
                      </div>
                      <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
                        {loan.id} · {loan.interest_rate_pct ? `${loan.interest_rate_pct}% p.a. · ${loan.tenure_months} months` : 'approved facility'}
                      </span>
                      <div className="flex items-center gap-4 pt-1 font-label-sm text-label-sm text-on-surface-variant">
                        <span>Outstanding: <strong className="text-on-surface">{fmtINR(loan.outstanding_principal)}</strong></span>
                        <span>·</span>
                        <span>Next Due: <strong className="text-on-surface">{fmtDateLabel(loan.date)} ({fmtINR(loan.amount)}/mo)</strong></span>
                        <span>·</span>
                        <span className="text-primary font-semibold">{loan.months_paid || 0}/{loan.tenure_months} paid</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                    <button
                      onClick={() => setTrackingLoan(loan)}
                      className="px-3.5 py-2 rounded-xl bg-surface-container-lowest text-on-surface font-label-sm text-label-sm shadow-sm hover:bg-surface transition-colors"
                    >
                      View Ledger
                    </button>
                    <button
                      onClick={() => payNextInstalment(loan)}
                      disabled={payingId === loan.id}
                      className="px-3.5 py-2 rounded-xl bg-primary text-on-primary font-label-sm text-label-sm hover:bg-primary-container disabled:opacity-60 transition-colors flex items-center gap-1.5"
                    >
                      {payingId === loan.id && <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>}
                      Pay Installment
                    </button>
                    <button
                      onClick={() => downloadStatement(loan)}
                      title="Download repayment statement (CSV)"
                      className="w-9 h-9 rounded-lg bg-surface-container-lowest text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center"
                    >
                      <span className="material-symbols-outlined text-[18px]">download</span>
                    </button>
                  </div>
                </div>
              ))}

              {pendingApps.map((loan) => (
                <div key={loan.id} className="p-5 rounded-2xl bg-surface-container-low/70 hover:bg-surface-container transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-surface-container-high text-on-surface-variant flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[24px]">hourglass_empty</span>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-headline-md text-[17px] leading-snug font-bold text-on-surface">{loan.name}</span>
                        <span className="px-2.5 py-0.5 rounded-full bg-surface-container-highest text-on-surface font-label-sm text-label-sm font-semibold">Under Review</span>
                      </div>
                      <span className="font-label-sm text-label-sm text-on-surface-variant truncate">{loan.id} · applied {fmtDateLabel(loan.date)}</span>
                      <div className="flex items-center gap-4 pt-1 font-label-sm text-label-sm text-on-surface-variant">
                        <span>Requested: <strong className="text-on-surface">{fmtINR(loan.amount)}</strong></span>
                        <span>·</span>
                        <span className="text-primary font-medium">Awaiting bank officer sanction</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                    <button
                      onClick={() => onNavigate('history')}
                      className="px-4 py-2 rounded-xl bg-primary text-on-primary font-label-sm text-label-sm hover:bg-primary-container transition-colors shadow-sm flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">track_changes</span>
                      Track Status
                    </button>
                  </div>
                </div>
              ))}

            </div>
          </section>

          {/* 3c. Live mandi watchlist */}
          <section className="bg-surface-container-lowest rounded-2xl p-6 md:p-8 shadow-sm flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">Mandi Spot Intelligence</span>
                <h2 className="font-headline-md text-headline-md text-on-surface">Live Watchlist</h2>
              </div>
              <div className="flex items-center gap-2 font-label-sm text-label-sm text-on-surface-variant">
                <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                {marketMeta?.source || 'Live market feed'}
              </div>
            </div>

            {watchCrops.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {watchCrops.map(crop => (
                  <div key={crop.id} className="p-4 rounded-xl bg-surface-container-low flex flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-headline-md text-[18px] font-bold text-on-surface">{crop.name}</h4>
                        <span className="font-label-sm text-label-sm text-on-surface-variant">{crop.mandi}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full font-label-sm text-label-sm font-bold ${crop.trendBg}`}>{crop.trend === 'up' ? '▲' : crop.trend === 'down' ? '▼' : '◆'} {crop.trendPercent}%</span>
                    </div>
                    <div className="flex items-baseline justify-between pt-1">
                      <span className="font-headline-lg text-[22px] font-bold text-on-surface">₹{crop.price.toLocaleString('en-IN')}<span className="font-label-sm text-label-sm font-normal text-on-surface-variant">/qtl</span></span>
                      <span className={`font-label-sm text-label-sm font-semibold ${crop.trendColor}`}>{crop.status}</span>
                    </div>
                    <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                      <div className="bg-primary h-full rounded-full transition-all" style={{ width: Math.min(100, Math.max(8, (crop.price / 10400) * 100)) + '%' }} />
                    </div>
                    <div className="flex items-center justify-between text-on-surface-variant font-label-sm text-[11px]">
                      <span>Spot rate</span>
                      <span>Δ {crop.trend === 'up' ? '+' : crop.trend === 'down' ? '-' : ''}₹{crop.trendAmount || 0}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-on-surface-variant font-body-md text-body-md">Market feed unavailable — open the Mandi page to retry.</div>
            )}

            <div className="flex items-center justify-between pt-2">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Prices for the crops you watch · server-generated composite feed</span>
              <button onClick={() => onNavigate('market')} className="font-label-sm text-label-sm text-primary font-semibold hover:underline flex items-center gap-1">
                Explore all mandis <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>
          </section>
        </div>

        {/* Secondary right column */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Advisory AI widget */}
          <section className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm flex flex-col gap-5 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shadow-sm">
                  <span className="material-symbols-outlined text-[22px]">smart_toy</span>
                </div>
                <div className="flex flex-col">
                  <h3 className="font-headline-md text-[18px] font-bold text-on-surface leading-tight">FinGrow Advisory AI</h3>
                  <span className="font-label-sm text-[11px] text-primary font-semibold">Instant scheme &amp; loan assistance</span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-primary-fixed text-on-primary-fixed font-label-sm text-[11px] font-bold">Active</span>
            </div>

            <div className="p-4 rounded-xl bg-surface-container-low flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-label-sm text-label-sm text-on-surface-variant">Ask in English, Marathi or Hindi</span>
                <button onClick={openVoiceAgent} aria-label="Voice assistant" className="w-8 h-8 rounded-lg bg-surface-container-lowest text-primary flex items-center justify-center hover:bg-surface transition-colors">
                  <span className="material-symbols-outlined text-[18px]">mic</span>
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const input = e.currentTarget.elements.namedItem('advisor-query');
                  const text = input.value.trim();
                  if (text) openChatWith(text);
                }}
                className="flex gap-2"
              >
                <input
                  name="advisor-query"
                  placeholder="Ask about subsidies, EMIs, eligibility…"
                  className="flex-1 w-full h-11 px-4 rounded-xl bg-surface-container-lowest text-on-surface font-body-md text-[13px] focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
                />
                <button type="submit" className="shrink-0 w-11 h-11 rounded-xl bg-primary text-on-primary flex items-center justify-center hover:bg-primary-container transition-colors">
                  <span className="material-symbols-outlined text-[18px]">send</span>
                </button>
              </form>
            </div>

            <div className="flex flex-col gap-2">
              <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold">Recommended prompts:</span>
              {[
                { q: 'How much EMI for a ₹5,00,000 facility?', icon: 'calculate' },
                { q: 'Am I eligible for a capital subsidy?', icon: 'redeem' },
                { q: 'Which facility should I pick for my next harvest?', icon: 'psychology' },
              ].map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => openChatWith(prompt.q)}
                  className="w-full text-left p-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-label-sm text-label-sm transition-colors flex items-center justify-between gap-2"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-[16px] text-primary shrink-0">{prompt.icon}</span>
                    <span className="truncate">{prompt.q}</span>
                  </span>
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0">chevron_right</span>
                </button>
              ))}
            </div>
          </section>

          {/* Weather mini */}
          <section className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">thunderstorm</span>
                <h3 className="font-headline-md text-[18px] font-bold text-on-surface">Agro-Climatic Advisory</h3>
              </div>
              <span className="font-label-sm text-label-sm text-on-surface-variant">Live · Open-Meteo</span>
            </div>

            {weather ? (
              <>
                <div className="p-4 rounded-xl bg-surface-container-low flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[36px] text-primary">{weather.current?.condition?.icon || 'cloud'}</span>
                    <div className="flex flex-col">
                      <span className="font-headline-lg text-[26px] font-bold text-on-surface leading-none">{weather.current?.temperature_c != null ? Math.round(weather.current.temperature_c) : '—'}°C</span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">{weather.current?.condition?.label}</span>
                    </div>
                  </div>
                  <div className="flex flex-col text-right font-label-sm text-label-sm text-on-surface-variant">
                    <span>Humidity: <strong>{weather.current?.humidity_pct ?? '—'}%</strong></span>
                    <span>Wind: <strong>{weather.current?.wind_kph ?? '—'} km/h</strong></span>
                  </div>
                </div>
                <div className={`p-4 rounded-xl flex-1 flex items-start gap-3 ${(weather.risk?.score || 0) >= 4 ? 'bg-tertiary/10' : 'bg-primary/10'}`}>
                  <span className={`material-symbols-outlined text-[22px] shrink-0 mt-0.5 ${(weather.risk?.score || 0) >= 4 ? 'text-tertiary' : 'text-primary'}`}>warning</span>
                  <div className="flex flex-col gap-1">
                    <span className={`font-label-sm text-label-sm font-bold ${(weather.risk?.score || 0) >= 4 ? 'text-tertiary' : 'text-primary'}`}>
                      Crop-risk {weather.risk?.level} ({weather.risk?.score}/10)
                    </span>
                    <p className="font-body-md text-[13px] leading-relaxed text-on-surface">
                      {(weather.risk?.advisories || [])[0]?.title || 'Conditions look favourable — no major weather triggers.'}
                    </p>
                  </div>
                </div>
              </>
            ) : weatherFailed ? (
              <div className="p-4 rounded-xl bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">cloud_off</span>
                Live feed unavailable right now.
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] animate-pulse">cloud_sync</span>
                Fetching live district weather…
              </div>
            )}

            <button
              onClick={() => onNavigate('weather')}
              className="w-full h-12 rounded-xl bg-surface-container text-on-surface font-label-sm text-label-sm hover:bg-surface-container-high transition-colors flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">partly_cloudy_day</span>
              <span>Open Weather &amp; Crop Risk</span>
            </button>
          </section>

          {/* Enterprise feasibility fast tracker */}
          <section className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm flex flex-col gap-5" ref={feasibilityPanelRef}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">model_training</span>
                <h3 className="font-headline-md text-[18px] font-bold text-on-surface">Enterprise Feasibility</h3>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-label-sm text-label-sm font-bold">
                {hasLiveReport ? 'Live Report' : 'Sample Report'}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-headline-md text-[16px] font-semibold text-on-surface truncate">{reportDisplay.business_category || 'Business Venture'}</h4>
                  <p className="font-label-sm text-label-sm text-on-surface-variant truncate">{reportDisplay.display_name || ''} · Outlay {fmtINR(fin.project_cost)}</p>
                </div>
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary font-headline-md text-[16px] font-bold shrink-0 flex-col">
                  {fin.selected_scheme?.replace(' Scheme', '') || '—'}
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <div className="flex items-center justify-between font-label-sm text-label-sm">
                  <span className="text-on-surface-variant">Bank funding (loan / cost)</span>
                  <span className="font-semibold text-on-surface">{fin.loan_amount && fin.project_cost ? Math.round((fin.loan_amount / fin.project_cost) * 100) + '%' : '—'}</span>
                </div>
                <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                  <div className="bg-primary h-full rounded-full" style={{ width: (fin.loan_amount && fin.project_cost ? Math.min(100, (fin.loan_amount / fin.project_cost) * 100) : 0) + '%' }} />
                </div>
                <div className="flex items-center justify-between font-label-sm text-label-sm pt-1">
                  <span className="text-on-surface-variant">Quoted interest</span>
                  <span className="font-semibold text-on-surface">{fin.interest_rate_pct ? fin.interest_rate_pct + '% p.a.' : '—'}</span>
                </div>
                <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                  <div className="bg-secondary h-full rounded-full" style={{ width: (fin.interest_rate_pct ? Math.min(100, fin.interest_rate_pct / 15 * 100) : 0) + '%' }} />
                </div>
                <div className="flex items-center justify-between font-label-sm text-label-sm pt-1">
                  <span className="text-on-surface-variant">Tenure</span>
                  <span className="font-semibold text-on-surface">{fin.tenure_months ? Math.round(fin.tenure_months / 12 * 10) / 10 + ' years' : '—'}</span>
                </div>
                <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                  <div className="bg-primary-container h-full rounded-full" style={{ width: (fin.tenure_months ? Math.min(100, (fin.tenure_months / 180) * 100) : 0) + '%' }} />
                </div>
              </div>
            </div>

            <button
              onClick={() => onNavigate('feasibility')}
              className="w-full h-12 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg hover:bg-primary-container transition-colors shadow-sm flex items-center justify-center gap-2"
            >
              <span>Open Full Feasibility Report</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
            <button
              onClick={onNewReport || (() => onNavigate('feasibility'))}
              className="w-full h-11 rounded-xl bg-surface-container text-on-surface font-label-sm text-label-sm hover:bg-surface-container-high transition-colors"
            >
              {hasLiveReport ? 'Generate a fresh report' : 'Generate a feasibility report to fill this panel'}
            </button>
          </section>

          {/* Cluster co-op pulse */}
          <section className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-headline-md text-[18px] font-bold text-on-surface">Cluster Co-op Pulse</h3>
              <span className="font-label-sm text-label-sm text-primary font-semibold">
                {(cluster?.stats?.active_loans || 0) + (cluster?.stats?.pending || 0)} loans in pipeline
              </span>
            </div>

            {cluster?.events?.length ? (
              <div className="flex flex-col gap-2.5">
                {cluster.events.slice(0, 4).map(event => (
                  <div key={event.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-low">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-label-lg text-label-lg font-bold shrink-0 ${
                        event.kind === 'approval' ? 'bg-primary text-on-primary' : event.kind === 'harvest' ? 'bg-secondary-fixed text-on-secondary-fixed' : event.kind === 'repayment' ? 'bg-primary-fixed text-on-primary-fixed' : 'bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      {event.member === 'Your Farm' ? <span className="material-symbols-outlined text-[18px]">grass</span> : (event.member.split(' ').map(w => w[0]).slice(0, 2).join('') || '?').toUpperCase()}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-label-sm text-label-sm font-semibold text-on-surface truncate">{event.title}</span>
                      <span className="font-label-sm text-[11px] text-on-surface-variant truncate">{event.detail}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2 p-4 rounded-xl bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm">
                <p>No cluster activity yet — applications, approvals and harvest logs from your village will appear here as live feed.</p>
                <button
                  onClick={() => setLoanModal(true)}
                  className="self-start px-4 py-2 rounded-xl bg-primary text-on-primary font-label-sm text-label-sm hover:bg-primary-container transition-colors"
                >
                  Start with a loan application
                </button>
              </div>
            )}

            <button
              onClick={() => openChatWith('Show me my loan and repayment summary')}
              className="w-full h-11 rounded-xl bg-surface-container-low text-on-surface font-label-sm text-label-sm hover:bg-surface-container transition-colors flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">groups</span>
              <span>Ask about cluster activity</span>
            </button>
          </section>
        </div>
      </div>

      {/* ---- Loan application modal ---- */}
      {loanModal && <LoanApplyModal
        onClose={() => setLoanModal(false)}
        onSuccess={(refId) => { showToast(`Application ${refId} submitted — track it in Loan Management.`); setLoanModal(false); refreshAll(); }}
        onViewHistory={() => { setLoanModal(false); onNavigate('history'); }}
      />}

      {harvestModal && <HarvestModal
        onClose={() => setHarvestModal(false)}
        onSuccess={() => { showToast('Harvest lot logged.'); setHarvestModal(false); refreshAll(); }}
      />}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[80] bg-on-surface text-inverse-on-surface px-5 py-3 rounded-xl shadow-xl font-label-lg text-label-lg flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">info</span>
          {toast}
        </div>
      )}
    </div>
  );
}

/* ===================================================================== */
/* Loan application modal (real submission via POST /api/loans/apply)     */
/* ===================================================================== */

function LoanApplyModal({ onClose, onSuccess, onViewHistory }) {
  const [facilityId, setFacilityId] = useState(FACILITIES[0].id);
  const [amount, setAmount] = useState('500000');
  const [tenure, setTenure] = useState(36);
  const [name, setName] = useState(PROFILE_NAME);
  const [mobile, setMobile] = useState('');
  const [branch, setBranch] = useState('Vidarbha Agri Cluster #042, Akola');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [ref, setRef] = useState(null);

  const facility = FACILITIES.find(f => f.id === facilityId) || FACILITIES[0];
  const amountNum = parseFloat(amount) || 0;
  const subsidy = Math.min(amountNum * (facility.subsidyRate || 0), 500000);
  const valid = amountNum >= 10000 && amountNum <= CREDIT_LIMIT && /^\d{10}$/.test(mobile) && name.trim().length >= 2;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        applicant_name: name.trim(),
        mobile,
        branch: branch.trim() || 'Vidarbha Agri Cluster, Akola',
        business_category: facility.category.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        scheme_name: facility.scheme,
        loan_amount: Math.round(amountNum),
        subsidy_amount: Math.round(subsidy),
        annual_rate_pct: facility.annualRate,
        tenure_months: tenure,
      };
      const result = await submitLoanApplication(payload);
      setRef(result.id);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Submission failed — try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-background/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-xl p-6 md:p-8 flex flex-col gap-6 relative my-8">
        <div className="flex items-center justify-between pb-4 border-b border-surface-container">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">payments</span>
            </div>
            <div>
              <h3 className="font-headline-md text-headline-md text-on-surface leading-tight">Apply for Credit Facility</h3>
              <p className="font-label-sm text-label-sm text-on-surface-variant">Tier-1 pre-approved lending limit: {fmtINR(CREDIT_LIMIT)}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-lg hover:bg-surface-container flex items-center justify-center text-on-surface-variant" aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {ref ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="w-20 h-20 rounded-full bg-primary-container flex items-center justify-center">
              <span className="material-symbols-outlined text-on-primary-container text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>task_alt</span>
            </div>
            <div>
              <h4 className="font-headline-md text-headline-md text-on-surface font-bold mb-1">Application Submitted</h4>
              <p className="font-body-md text-body-md text-on-surface-variant">Reference <strong className="text-primary">{ref}</strong> · now under bank-officer review.</p>
              <p className="font-label-sm text-label-sm text-on-surface-variant mt-2">{facility.name} · {fmtINR(Math.round(amountNum))} at {facility.annualRate}% p.a. · {tenure} months</p>
            </div>
            <div className="flex gap-3 pt-2 w-full">
              <button onClick={onViewHistory} className="flex-1 bg-primary text-on-primary px-5 py-3 rounded-xl font-label-lg text-label-lg hover:bg-primary-container transition-colors">
                View in Loan Management
              </button>
              <button onClick={onClose} className="flex-1 bg-surface-container-high text-on-surface px-5 py-3 rounded-xl font-label-lg text-label-lg hover:bg-surface-container transition-colors">
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Input label="Select Loan Facility Type">
              <select value={facilityId} onChange={e => setFacilityId(e.target.value)} className={fieldCls}>
                {FACILITIES.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <p className="font-label-sm text-label-sm text-on-surface-variant mt-1.5 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px] text-primary">verified_user</span> {facility.note} · {facility.annualRate}% p.a.
              </p>
            </Input>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label={`Required Amount (${fmtINR(amountNum || 0)})`}>
                <input type="number" min={10000} max={CREDIT_LIMIT} step={10000} value={amount} onChange={e => setAmount(e.target.value)} className={fieldCls} placeholder="500000" />
              </Input>
              <Input label="Repayment Tenure">
                <select value={tenure} onChange={e => setTenure(Number(e.target.value))} className={fieldCls}>
                  {TENURE_OPTIONS.map(opt => <option key={opt.months} value={opt.months}>{opt.label}</option>)}
                </select>
              </Input>
              <Input label="Applicant Name">
                <input type="text" value={name} onChange={e => setName(e.target.value)} className={fieldCls} />
              </Input>
              <Input label="Mobile Number">
                <input type="tel" inputMode="numeric" maxLength={10} value={mobile} onChange={e => setMobile(e.target.value.replace(/\D/g, ''))} className={fieldCls} placeholder="10-digit mobile" />
              </Input>
            </div>

            <Input label="Home Branch / Cluster">
              <input type="text" value={branch} onChange={e => setBranch(e.target.value)} className={fieldCls} />
            </Input>

            <div className="p-4 rounded-xl bg-primary/5 flex items-start gap-3">
              <span className="material-symbols-outlined text-primary text-[20px] mt-0.5">verified_user</span>
              <p className="font-label-sm text-label-sm text-on-surface-variant">
                Land registry documentation (7/12 &amp; 8A extracts) syncs via Mahabhulekh on approval. Estimated eligible capital subsidy: <strong className="text-primary">{fmtINR(Math.round(subsidy))}</strong>.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-error-container/20 text-error font-label-sm text-label-sm flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px]">error</span> {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-4">
              <button type="button" onClick={onClose} className="px-6 h-12 rounded-xl text-on-surface-variant font-label-lg hover:bg-surface-container transition-colors">Cancel</button>
              <button
                type="submit"
                disabled={!valid || submitting}
                className="px-6 h-12 rounded-xl bg-primary text-on-primary font-label-lg hover:bg-primary-container transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
              >
                {submitting && <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>}
                {submitting ? 'Submitting…' : 'Submit Application'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ===================================================================== */
/* Harvest logging modal (real submission via POST /api/harvest)          */
/* ===================================================================== */

const PRODUCE_OPTIONS = ['Soybean', 'Cotton', 'Tur / Arhar Dal', 'Wheat', 'Onion', 'Chana (Bengal Gram)', 'Other'];

function HarvestModal({ onClose, onSuccess }) {
  const [produce, setProduce] = useState('Soybean');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [lots, setLots] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchHarvestLogs().then(data => setLots(data.lots || [])).catch(() => {});
  }, []);

  const qty = parseFloat(quantity) || 0;
  const pricePer = parseFloat(price) || 0;
  const valid = qty > 0 && pricePer > 0 && produce.trim().length >= 2 && date;

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await submitHarvest({
        produce: produce.trim(),
        quantity_qtl: qty,
        price_per_qtl: pricePer,
        harvest_date: date,
        notes: notes.trim() || undefined,
      });
      onSuccess();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Logging failed — try again.');
      setSubmitting(false);
    }
  };

  const removeLot = async (id) => {
    try {
      await deleteHarvest(id);
      setLots(prev => prev.filter(l => l.id !== id));
    } catch (err) {
      console.error(err);
      setError(err.message || 'Delete failed.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-background/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-xl p-6 md:p-8 flex flex-col gap-6 relative my-8 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-surface-container">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">inventory_2</span>
            </div>
            <div>
              <h3 className="font-headline-md text-headline-md text-on-surface leading-tight">Log Harvest Lot</h3>
              <p className="font-label-sm text-label-sm text-on-surface-variant">Record what left the farm — feeds your season revenue.</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-lg hover:bg-surface-container flex items-center justify-center text-on-surface-variant" aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Produce / Crop">
              <select value={produce} onChange={e => setProduce(e.target.value)} className={fieldCls}>
                {PRODUCE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </Input>
            <Input label="Harvest Date">
              <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={e => setDate(e.target.value)} className={fieldCls} />
            </Input>
            <Input label="Quantity (quintals)">
              <input type="number" min="0.1" step="0.1" value={quantity} onChange={e => setQuantity(e.target.value)} className={fieldCls} placeholder="e.g. 12.5" />
            </Input>
            <Input label="Price Realised (₹/quintal)">
              <input type="number" min="1" step="1" value={price} onChange={e => setPrice(e.target.value)} className={fieldCls} placeholder="e.g. 4800" />
            </Input>
          </div>
          <Input label="Notes (optional)">
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} maxLength={300} className={fieldCls} placeholder="e.g. Kharif batch A — sold at APMC" />
          </Input>

          {qty > 0 && pricePer > 0 && (
            <div className="p-4 rounded-xl bg-primary/5 flex items-center justify-between">
              <span className="font-label-sm text-label-sm text-on-surface-variant">Expected revenue</span>
              <span className="font-headline-md text-headline-md font-bold text-primary">{fmtINR(Math.round(qty * pricePer))}</span>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-error-container/20 text-error font-label-sm text-label-sm">{error}</div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-6 h-12 rounded-xl text-on-surface-variant font-label-lg hover:bg-surface-container transition-colors">Cancel</button>
            <button type="submit" disabled={!valid || submitting} className="px-6 h-12 rounded-xl bg-primary text-on-primary font-label-lg hover:bg-primary-container transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50">
              {submitting && <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>}
              {submitting ? 'Logging…' : 'Log Harvest'}
            </button>
          </div>
        </form>

        {lots.length > 0 && (
          <div className="border-t border-surface-variant pt-4">
            <p className="font-label-sm text-label-sm text-on-surface-variant font-semibold mb-2">Recently logged ({lots.length})</p>
            <div className="flex flex-col gap-2 max-h-44 overflow-y-auto">
              {lots.slice(0, 8).map(lot => (
                <div key={lot.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-container-low">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-primary text-[18px]">grass</span>
                    <div className="min-w-0">
                      <p className="font-label-sm text-label-sm text-on-surface truncate">{lot.produce} · {lot.quantity_qtl} qtl @ ₹{Number(lot.price_per_qtl).toLocaleString('en-IN')}</p>
                      <p className="font-label-sm text-[11px] text-on-surface-variant">{lot.id} · {fmtDateLabel(lot.harvest_date)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-label-sm text-label-sm text-primary font-bold">{fmtINR(lot.quantity_qtl * lot.price_per_qtl)}</span>
                    <button onClick={() => removeLot(lot.id)} title="Delete lot" className="w-8 h-8 rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container/20 flex items-center justify-center transition-colors">
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
