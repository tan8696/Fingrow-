import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import RepaymentTracker from './RepaymentTracker';
import WhatsAppShare from './WhatsAppShare';
import SubsidyMatcher from './SubsidyMatcher';
import CommunityProof from './CommunityProof';
import {
  LoanPieChart, EMIAreaChart, CropSparkline, WeatherGauge,
  RevenueBarChart, ProgressRing, fmtLakh,
} from './VisualCharts';
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

export default function DashboardHome({ onNavigate, onNewReport, report, hasLiveReport, userProfile }) {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language || 'en';
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
  const [dataLoaded, setDataLoaded] = useState(false);

  const isFarmer = userProfile?.type === 'farmer';

  const [loanModal, setLoanModal] = useState(false);
  const [harvestModal, setHarvestModal] = useState(false);
  const [trackingLoan, setTrackingLoan] = useState(null);
  const [payingId, setPayingId] = useState(null);

  const [toast, setToast] = useState(null);
  const feasibilityPanelRef = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 3800);
  };

  const refreshAll = useCallback(() => {
    setDataLoaded(false);
    Promise.allSettled([
      fetchPortfolio().then(setPortfolio),
      fetchPortfolioCashflow().then(setCashflowData),
      fetchLoanHistory().then(data => setLoans(data.loans || [])),
      fetchMarketPrices().then(data => { setMarketCrops(data.crops || data.prices || []); setMarketMeta({ generated_at: data.generated_at, source: data.source }); }),
      fetchHarvestLogs().then(setHarvestData),
      fetchClusterActivity().then(setCluster),
      fetchWeather('Akola, Maharashtra').then(payload => setWeather(payload)).catch(() => setWeatherFailed(true))
    ]).then(() => {
      setTimeout(() => setDataLoaded(true), 500); // minimum 500ms for skeleton to show
    });
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

  const reportDisplay = report || {
    business_category: 'Organic Poultry Farm',
    display_name: 'Vidarbha Region, Maharashtra',
    financials: { project_cost: 600000, loan_amount: 480000, margin_contribution: 120000, selected_scheme: 'Maha-Krushi Scheme', interest_rate_pct: 7.0, tenure_months: 84 },
  };
  const fin = reportDisplay.financials || {};

  const months = cashflowData.months || [];
  const shownMonths = months;

  return (
    <div className="flex flex-col gap-6 w-full">

      {/* ═══════════════════════════════════════════════════════════
          1. WELCOME HERO — Simple, friendly greeting with emoji
         ═══════════════════════════════════════════════════════════ */}
      <header className="fade-in-up">
        <div className="flex items-center gap-4 mb-3">
          <div className="text-5xl leading-none">{isFarmer ? '🌾' : '🏪'}</div>
          <div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
              {currentLang === 'mr' ? `नमस्कार, ${PROFILE_NAME} 🙏` : currentLang === 'hi' ? `नमस्ते, ${PROFILE_NAME} 🙏` : `Namaste, ${PROFILE_NAME} 🙏`}
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1">
              {p.active_loans > 0
                ? (currentLang === 'mr'
                    ? `तुमच्याकडे ${p.active_loans} सक्रिय कर्ज खाती आहेत • ${p.months_total} पैकी ${p.months_paid} हप्ते भरले आहेत`
                    : currentLang === 'hi'
                    ? `आपके पास ${p.active_loans} सक्रिय ऋण खाते हैं • ${p.months_total} में से ${p.months_paid} ईएमआई भुगतान पूर्ण`
                    : `You have ${p.active_loans} active loan${p.active_loans > 1 ? 's' : ''} • ${p.months_paid} of ${p.months_total} EMIs paid`)
                : (currentLang === 'mr'
                    ? 'स्वागत आहे! नवीन व्यवसाय कल्पना तपासा किंवा कर्जासाठी अर्ज करा.'
                    : currentLang === 'hi'
                    ? 'स्वागत है! नया व्यवसाय विचार जांचें या ऋण के लिए आवेदन करें।'
                    : 'Welcome! Start by checking a business idea or applying for a loan.')}
            </p>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════
          2. QUICK ACTIONS — Large, icon-heavy buttons
         ═══════════════════════════════════════════════════════════ */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 fade-in-up delay-100">
        <button className="quick-action" onClick={() => setLoanModal(true)}>
          <span className="quick-action__icon">🏦</span>
          <span className="quick-action__label">{t('dashboard_home.apply_btn')}</span>
        </button>
        <button className="quick-action" onClick={() => { feasibilityPanelRef.current?.scrollIntoView({ behavior: 'smooth' }); onNavigate('feasibility'); }}>
          <span className="quick-action__icon">📊</span>
          <span className="quick-action__label">{t('dashboard_home.run_report')}</span>
        </button>
        <button className="quick-action" onClick={() => setHarvestModal(true)}>
          <span className="quick-action__icon">{isFarmer ? '🌾' : '📦'}</span>
          <span className="quick-action__label">{isFarmer ? t('dashboard_home.harvest_btn') : (currentLang === 'mr' ? 'विक्री नोंदवा' : currentLang === 'hi' ? 'बिक्री दर्ज करें' : 'Log Sales')}</span>
        </button>
        <button className="quick-action" onClick={openVoiceAgent}>
          <span className="quick-action__icon">🎙️</span>
          <span className="quick-action__label">{t('nav.ask_bot')}</span>
        </button>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          3. VISUAL KPI CARDS — 4 cards with charts & big numbers
         ═══════════════════════════════════════════════════════════ */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 fade-in-up delay-200">
        {!dataLoaded ? (
          <>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="village-card visual-kpi animate-pulse bg-surface-container-low min-h-[160px]">
                <div className="w-12 h-12 bg-surface-container rounded-xl mb-4"></div>
                <div className="w-1/2 h-6 bg-surface-container rounded-md mb-2"></div>
                <div className="w-3/4 h-4 bg-surface-container rounded-md mb-4"></div>
                <div className="mt-auto w-full h-8 bg-surface-container rounded-md"></div>
              </div>
            ))}
          </>
        ) : (
          <>
            {/* Card 1: Loan Status with Progress Ring */}
            <button onClick={() => onNavigate('history')} className="village-card visual-kpi">
              <span className="visual-kpi__icon">🏦</span>
              <ProgressRing current={p.months_paid} total={p.months_total || 1} size={72} />
              <span className="visual-kpi__value">{fmtINR(p.monthly_emi_total)}<span className="text-[16px] font-normal text-on-surface-variant">/mo</span></span>
              <span className="visual-kpi__label">{t('dashboard_home.next_emi')}</span>
              {p.next_due_date && (
                <span className="status-badge status-badge--green">
                  <span className="material-symbols-outlined text-[14px]">event</span>
                  {currentLang === 'mr' ? 'पुढील: ' : currentLang === 'hi' ? 'अगला: ' : 'Next: '}{fmtDateLabel(p.next_due_date)}
                </span>
              )}
            </button>

            {/* Card 2: Harvest Revenue with bar sparkline */}
            <button onClick={() => setHarvestModal(true)} className="village-card visual-kpi">
              <span className="visual-kpi__icon">{isFarmer ? '🌾' : '📈'}</span>
              <span className="visual-kpi__value">{fmtINR(harvestData?.summary?.total_revenue)}</span>
              <span className="visual-kpi__label">{currentLang === 'mr' ? 'उत्पन्न' : currentLang === 'hi' ? 'राजस्व' : 'Revenue'}</span>
              {(harvestData?.summary?.by_month || []).length > 0 ? (
                <RevenueBarChart months={(harvestData?.summary?.by_month || []).slice(0, 4)} height={60} />
              ) : (
                <span className="text-[12px] text-on-surface-variant italic">
                  {currentLang === 'mr' ? 'नोंदवण्यासाठी टॅप करा' : currentLang === 'hi' ? 'दर्ज करने के लिए टैप करें' : 'Tap to log revenue'}
                </span>
              )}
              <span className="status-badge status-badge--green">
                <span className="material-symbols-outlined text-[14px]">trending_up</span>
                {harvestData?.summary?.lots || 0} {currentLang === 'mr' ? 'नोंदी' : currentLang === 'hi' ? 'प्रविष्टियां' : 'records'}
              </span>
            </button>

            {/* Card 3: Mandi Prices with sparklines */}
            <button onClick={() => onNavigate('market')} className="village-card visual-kpi">
              <span className="visual-kpi__icon">🛒</span>
              <span className="visual-kpi__value">
                {watchCrops.length ? `₹${watchCrops[0].price.toLocaleString('en-IN')}` : '—'}
                <span className="text-[14px] font-normal text-on-surface-variant">/qtl</span>
              </span>
              <span className="visual-kpi__label">{isFarmer ? t('dashboard_home.mandi_title') : 'Market Prices'}</span>
              <div className="flex flex-col gap-1.5 w-full">
                {watchCrops.slice(0, 3).map(crop => (
                  <div key={crop.id} className="flex items-center justify-between gap-2 px-1">
                    <span className="text-[12px] font-semibold text-on-surface truncate">{crop.name}</span>
                    <div className="flex items-center gap-1.5">
                      <CropSparkline trend={crop.trend} width={40} height={18} />
                      <span className={`text-[11px] font-bold ${crop.trend === 'up' ? 'text-green-600' : crop.trend === 'down' ? 'text-red-600' : 'text-amber-600'}`}>
                        {crop.trend === 'up' ? '▲' : crop.trend === 'down' ? '▼' : '◆'}{crop.trendPercent}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </button>

            {/* Card 4: Weather Risk with Gauge (Only for farmers) */}
            {isFarmer ? (
              <button onClick={() => onNavigate('weather')} className="village-card visual-kpi">
                <span className="visual-kpi__icon">{weather ? (weather.risk?.score >= 6 ? '🌧️' : weather.risk?.score >= 4 ? '⛅' : '☀️') : '🌤️'}</span>
                {weather ? (
                  <>
                    <WeatherGauge score={weather.risk?.score || 0} size={120} />
                    <span className="visual-kpi__label">{t('dashboard_home.weather_title')}</span>
                    <span className="text-[13px] font-semibold text-on-surface">
                      {weather.current?.temperature_c != null ? Math.round(weather.current.temperature_c) : '—'}°C
                      {weather.current?.condition?.label ? ` • ${weather.current.condition.label}` : ''}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="visual-kpi__value">—</span>
                    <span className="visual-kpi__label">{t('dashboard_home.weather_title')}</span>
                    <span className="text-[12px] text-on-surface-variant italic">
                      {weatherFailed ? (currentLang === 'mr' ? 'अनुपलब्ध' : currentLang === 'hi' ? 'अनुपलब्ध' : 'Unavailable') : (currentLang === 'mr' ? 'लोड होत आहे...' : currentLang === 'hi' ? 'लोड हो रहा है...' : 'Loading...')}
                    </span>
                  </>
                )}
              </button>
            ) : (
              <button onClick={() => onNavigate('feasibility')} className="village-card visual-kpi">
                <span className="visual-kpi__icon">📈</span>
                <span className="visual-kpi__value text-primary">High</span>
                <span className="visual-kpi__label">Market Demand</span>
                <div className="mt-2 text-[12px] font-medium text-on-surface text-center">Your area shows strong demand for retail goods.</div>
                <div className="status-badge status-badge--green mt-auto">Good Opportunity</div>
              </button>
            )}
          </>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════
          4. EMI CHART — Visual area chart of cashflow
         ═══════════════════════════════════════════════════════════ */}
      <section className="chart-section fade-in-up delay-300">
        <div className="chart-section__header">
          <span className="chart-section__emoji">📈</span>
          <h2 className="chart-section__title">
            {currentLang === 'mr' ? 'कर्ज परतफेड (EMI) प्रवास' : currentLang === 'hi' ? 'समय के साथ ईएमआई भुगतान' : 'EMI Payment Over Time'}
          </h2>
          {activeApps.length > 0 && (
            <span className="ml-auto status-badge status-badge--green">
              {p.months_paid}/{p.months_total} {currentLang === 'mr' ? 'वेळेत' : currentLang === 'hi' ? 'सही समय पर' : 'on track'}
            </span>
          )}
        </div>

        {activeApps.length > 0 && fin.loan_amount && fin.interest_rate_pct ? (
          <EMIAreaChart
            loanAmount={fin.loan_amount}
            annualRate={fin.interest_rate_pct}
            tenureMonths={fin.tenure_months || 84}
            height={240}
          />
        ) : shownMonths.length > 0 ? (
          <EMIAreaChart
            loanAmount={p.outstanding_total || 500000}
            annualRate={7}
            tenureMonths={84}
            height={240}
          />
        ) : (
          <div className="py-12 text-center flex flex-col items-center gap-4">
            <span className="text-5xl">📋</span>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
              No active loans yet. Apply for a loan to see your EMI payment chart here!
            </p>
            <button onClick={() => setLoanModal(true)} className="px-6 py-3 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg hover:bg-primary-container transition-colors shadow-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px]">add_circle</span>
              Apply for Loan
            </button>
          </div>
        )}

        {/* Legend */}
        {(activeApps.length > 0 || shownMonths.length > 0) && (
          <div className="flex items-center justify-center gap-6 pt-4 font-label-sm text-label-sm">
            <span className="flex items-center gap-2 text-on-surface-variant"><span className="w-3 h-3 rounded-sm" style={{ background: '#006948' }} /> {currentLang === 'mr' ? 'मुद्दल (Principal)' : currentLang === 'hi' ? 'मूलधन (Principal)' : 'Principal (मूलधन)'}</span>
            <span className="flex items-center gap-2 text-on-surface-variant"><span className="w-3 h-3 rounded-sm" style={{ background: '#9b3e3b' }} /> {currentLang === 'mr' ? 'व्याज (Interest)' : currentLang === 'hi' ? 'ब्याज (Interest)' : 'Interest (ब्याज)'}</span>
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════
          5. MAIN LAYOUT — Loans + Sidebar
         ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 flex flex-col gap-6">

          {/* Active loans — simplified visual cards */}
          <section className="chart-section">
            <div className="chart-section__header">
              <span className="chart-section__emoji">💰</span>
              <h2 className="chart-section__title">{t('dashboard_home.active_loans')}</h2>
              <button
                onClick={() => onNavigate('history')}
                className="ml-auto text-primary font-label-sm text-label-sm font-semibold hover:underline flex items-center gap-1"
              >
                {currentLang === 'mr' ? 'सर्व पहा' : currentLang === 'hi' ? 'सभी देखें' : 'View all'} <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {loans.length === 0 && !dataError && (
                <div className="p-8 text-center flex flex-col items-center gap-3">
                  <span className="text-4xl">📑</span>
                  <p className="text-on-surface-variant font-body-md text-body-md">
                    {currentLang === 'mr' ? 'अजून कोणतेही कर्ज नाही. सुरू करण्यासाठी अर्ज करा!' : currentLang === 'hi' ? 'अभी कोई ऋण नहीं है। शुरू करने के लिए आवेदन करें!' : 'No loans yet. Apply to get started!'}
                  </p>
                </div>
              )}
              {dataError && loans.length === 0 && (
                <div className="p-8 text-center bg-error-container/20 rounded-2xl text-error font-body-md text-body-md">{dataError}</div>
              )}

              {activeApps.map((loan) => (
                <div key={loan.id} className="p-5 rounded-2xl bg-surface-container-low hover:bg-surface-container transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <ProgressRing current={loan.months_paid || 0} total={loan.tenure_months || 84} size={56} />
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-headline-md text-[17px] leading-snug font-bold text-on-surface">{loan.name}</span>
                        <span className="status-badge status-badge--green">Active</span>
                      </div>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        Outstanding: <strong className="text-on-surface">{fmtINR(loan.outstanding_principal)}</strong> • EMI: <strong className="text-on-surface">{fmtINR(loan.amount)}/mo</strong>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                    <button
                      onClick={() => setTrackingLoan(loan)}
                      className="px-3.5 py-2 rounded-xl bg-surface-container-lowest text-on-surface font-label-sm text-label-sm shadow-sm hover:bg-surface transition-colors"
                    >
                      View
                    </button>
                    <button
                      onClick={() => payNextInstalment(loan)}
                      disabled={payingId === loan.id}
                      className="px-3.5 py-2 rounded-xl bg-primary text-on-primary font-label-sm text-label-sm hover:bg-primary-container disabled:opacity-60 transition-colors flex items-center gap-1.5"
                    >
                      {payingId === loan.id && <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>}
                      Pay EMI
                    </button>
                  </div>
                </div>
              ))}

              {pendingApps.map((loan) => (
                <div key={loan.id} className="p-5 rounded-2xl bg-surface-container-low/70 hover:bg-surface-container transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="text-3xl">⏳</span>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-headline-md text-[17px] leading-snug font-bold text-on-surface">{loan.name}</span>
                        <span className="status-badge status-badge--yellow">Under Review</span>
                      </div>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                        Requested: <strong className="text-on-surface">{fmtINR(loan.amount)}</strong> • Applied: {fmtDateLabel(loan.date)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => onNavigate('history')}
                    className="px-4 py-2 rounded-xl bg-primary text-on-primary font-label-sm text-label-sm hover:bg-primary-container transition-colors shadow-sm"
                  >
                    Track
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Mandi watchlist — simplified with sparklines */}
          <section className="chart-section">
            <div className="chart-section__header">
              <span className="chart-section__emoji">🛒</span>
              <h2 className="chart-section__title">Mandi Prices (Live)</h2>
              <span className="ml-auto flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                <span className="font-label-sm text-label-sm text-primary font-semibold">Live</span>
              </span>
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
                      <span className={`status-badge ${crop.trend === 'up' ? 'status-badge--green' : crop.trend === 'down' ? 'status-badge--red' : 'status-badge--yellow'}`}>
                        {crop.trend === 'up' ? '▲' : crop.trend === 'down' ? '▼' : '◆'} {crop.trendPercent}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-headline-lg text-[22px] font-bold text-on-surface">₹{crop.price.toLocaleString('en-IN')}<span className="font-label-sm text-label-sm font-normal text-on-surface-variant">/qtl</span></span>
                      <CropSparkline trend={crop.trend} width={56} height={24} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-on-surface-variant font-body-md text-body-md">
                <span className="text-4xl block mb-2">🏪</span>
                Market feed loading…
              </div>
            )}

            <div className="flex items-center justify-center pt-3">
              <button onClick={() => onNavigate('market')} className="font-label-sm text-label-sm text-primary font-semibold hover:underline flex items-center gap-1">
                {t('dashboard_home.all_prices')} <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="lg:col-span-4 flex flex-col gap-6">

          {/* Advisory AI widget */}
          <section className="chart-section">
            <div className="chart-section__header">
              <span className="chart-section__emoji">🤖</span>
              <h2 className="chart-section__title">{t('nav.ask_bot')}</h2>
              <span className="ml-auto status-badge status-badge--green">
                {currentLang === 'mr' ? 'सक्रिय' : currentLang === 'hi' ? 'सक्रिय' : 'Active'}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-surface-container-low flex flex-col gap-3">
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                {currentLang === 'mr' ? 'मराठी, हिंदी किंवा इंग्रजीत विचारा' : currentLang === 'hi' ? 'हिंदी, मराठी या अंग्रेजी में पूछें' : 'Ask in English, मराठी or हिन्दी'}
              </span>
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
                  placeholder="Ask about loans, subsidies…"
                  className="flex-1 w-full h-11 px-4 rounded-xl bg-surface-container-lowest text-on-surface font-body-md text-[13px] focus:outline-none focus:ring-2 focus:ring-primary shadow-sm"
                />
                <button type="submit" className="shrink-0 w-11 h-11 rounded-xl bg-primary text-on-primary flex items-center justify-center hover:bg-primary-container transition-colors">
                  <span className="material-symbols-outlined text-[18px]">send</span>
                </button>
              </form>
            </div>

            <div className="flex flex-col gap-2 mt-3">
              <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold">Try asking:</span>
              {[
                { q: 'How much EMI for ₹5 lakh loan?', icon: '🧮' },
                { q: 'Am I eligible for subsidy?', icon: '🎁' },
                { q: 'Best loan for my farm?', icon: '🌱' },
              ].map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => openChatWith(prompt.q)}
                  className="w-full text-left p-3 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface font-label-sm text-label-sm transition-colors flex items-center gap-3"
                >
                  <span className="text-xl">{prompt.icon}</span>
                  <span className="truncate">{prompt.q}</span>
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant ml-auto shrink-0">chevron_right</span>
                </button>
              ))}
            </div>
          </section>

          {/* Weather mini */}
          {isFarmer && (
            <section className="chart-section">
              <div className="chart-section__header">
                <span className="chart-section__emoji">{weather ? (weather.risk?.score >= 6 ? '🌧️' : '☀️') : '🌤️'}</span>
                <h2 className="chart-section__title">Weather</h2>
              </div>

              {weather ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="flex items-center gap-4 w-full p-4 rounded-xl bg-surface-container-low">
                    <span className="text-4xl">{weather.current?.temperature_c > 35 ? '🔥' : weather.current?.temperature_c < 15 ? '🥶' : '🌡️'}</span>
                    <div className="flex flex-col">
                      <span className="font-headline-lg text-[28px] font-bold text-on-surface leading-none">
                        {weather.current?.temperature_c != null ? Math.round(weather.current.temperature_c) : '—'}°C
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant">{weather.current?.condition?.label}</span>
                    </div>
                    <div className="ml-auto flex flex-col text-right font-label-sm text-label-sm text-on-surface-variant">
                      <span>💧 {weather.current?.humidity_pct ?? '—'}%</span>
                      <span>💨 {weather.current?.wind_kph ?? '—'} km/h</span>
                    </div>
                  </div>
                  <WeatherGauge score={weather.risk?.score || 0} size={130} />
                  <p className="font-body-md text-[13px] text-on-surface-variant text-center px-2">
                    {(weather.risk?.advisories || [])[0]?.title || 'Conditions look good — no weather warnings.'}
                  </p>
                </div>
              ) : (
                <div className="p-6 text-center text-on-surface-variant">
                  <span className="text-3xl block mb-2">🌤️</span>
                  <span className="font-label-sm text-label-sm">{weatherFailed ? 'Feed unavailable' : 'Loading weather...'}</span>
                </div>
              )}

              <button
                onClick={() => onNavigate('weather')}
                className="w-full h-12 mt-3 rounded-xl bg-surface-container text-on-surface font-label-sm text-label-sm hover:bg-surface-container-high transition-colors flex items-center justify-center gap-2"
              >
                <span className="text-lg">🌦️</span> See Full Weather & Risk
              </button>
            </section>
          )}

          {/* Feasibility quick peek */}
          <section className="chart-section" ref={feasibilityPanelRef}>
            <div className="chart-section__header">
              <span className="chart-section__emoji">📊</span>
              <h2 className="chart-section__title">Your Business Plan</h2>
              <span className="ml-auto px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-label-sm text-label-sm font-bold">
                {hasLiveReport ? 'Live' : 'Sample'}
              </span>
            </div>

            <div className="flex flex-col items-center gap-4">
              <h4 className="font-headline-md text-[16px] font-semibold text-on-surface text-center">
                {reportDisplay.business_category || 'Business Venture'}
              </h4>
              <p className="font-label-sm text-label-sm text-on-surface-variant text-center">
                {reportDisplay.display_name || ''} • Total {fmtINR(fin.project_cost)}
              </p>

              {/* Visual Pie Chart showing loan breakdown */}
              <div className="relative">
                <LoanPieChart
                  marginAmount={fin.margin_contribution || fin.project_cost * 0.1 || 60000}
                  loanAmount={fin.loan_amount || fin.project_cost * 0.9 || 540000}
                  subsidyAmount={Math.min((fin.project_cost || 0) * 0.25, 500000)}
                  size={160}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 w-full text-center">
                <div className="p-3 rounded-xl bg-surface-container-low">
                  <span className="block font-label-sm text-label-sm text-on-surface-variant">Interest</span>
                  <span className="block font-headline-md text-[18px] font-bold text-on-surface">{fin.interest_rate_pct || '—'}%</span>
                </div>
                <div className="p-3 rounded-xl bg-surface-container-low">
                  <span className="block font-label-sm text-label-sm text-on-surface-variant">Tenure</span>
                  <span className="block font-headline-md text-[18px] font-bold text-on-surface">{fin.tenure_months ? Math.round(fin.tenure_months / 12) + ' yrs' : '—'}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => onNavigate('feasibility')}
              className="w-full h-12 mt-3 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg hover:bg-primary-container transition-colors shadow-sm flex items-center justify-center gap-2"
            >
              📄 Open Full Report
            </button>
            <button
              onClick={onNewReport || (() => onNavigate('feasibility'))}
              className="w-full h-11 mt-2 rounded-xl bg-surface-container text-on-surface font-label-sm text-label-sm hover:bg-surface-container-high transition-colors"
            >
              {hasLiveReport ? '🔄 Generate New Report' : '✨ Generate Your First Report'}
            </button>
          </section>

          {/* Cluster co-op pulse — upgraded to Community Proof */}
          <section className="chart-section">
            <div className="chart-section__header">
              <span className="chart-section__emoji">🤝</span>
              <h2 className="chart-section__title">Community</h2>
            </div>
            <CommunityProof
              cluster={cluster}
              locationName={report?.display_name || 'Vidarbha Region'}
              businessCategory={report?.business_category || 'dairy'}
              lang={currentLang}
            />
          </section>

          {/* Smart Subsidy Matching */}
          <section className="chart-section">
            <div className="chart-section__header">
              <span className="chart-section__emoji">🎯</span>
              <h2 className="chart-section__title">
                {currentLang === 'hi' ? 'पात्र योजनाएँ' : currentLang === 'mr' ? 'पात्र योजना' : 'Eligible Schemes'}
              </h2>
            </div>
            <SubsidyMatcher
              userProfile={userProfile}
              projectCost={report?.financials?.project_cost || 500000}
              businessCategory={report?.business_category || ''}
            />
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
            <span className="text-3xl">🏦</span>
            <div>
              <h3 className="font-headline-md text-headline-md text-on-surface leading-tight">Apply for Loan</h3>
              <p className="font-label-sm text-label-sm text-on-surface-variant">Max limit: {fmtINR(CREDIT_LIMIT)}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-lg hover:bg-surface-container flex items-center justify-center text-on-surface-variant" aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {ref ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <span className="text-6xl">✅</span>
            <div>
              <h4 className="font-headline-md text-headline-md text-on-surface font-bold mb-1">Submitted!</h4>
              <p className="font-body-md text-body-md text-on-surface-variant">Reference <strong className="text-primary">{ref}</strong> — under bank review.</p>
              <p className="font-label-sm text-label-sm text-on-surface-variant mt-2">{facility.name} • {fmtINR(Math.round(amountNum))} at {facility.annualRate}% • {tenure} months</p>
            </div>
            <div className="flex gap-3 pt-2 w-full">
              <button onClick={onViewHistory} className="flex-1 bg-primary text-on-primary px-5 py-3 rounded-xl font-label-lg text-label-lg hover:bg-primary-container transition-colors">
                View Loans
              </button>
              <button onClick={onClose} className="flex-1 bg-surface-container-high text-on-surface px-5 py-3 rounded-xl font-label-lg text-label-lg hover:bg-surface-container transition-colors">
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Input label="Loan Type">
              <select value={facilityId} onChange={e => setFacilityId(e.target.value)} className={fieldCls}>
                {FACILITIES.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <p className="font-label-sm text-label-sm text-on-surface-variant mt-1.5 flex items-center gap-1">
                ✅ {facility.note} • {facility.annualRate}% interest
              </p>
            </Input>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label={`Amount (${fmtINR(amountNum || 0)})`}>
                <input type="number" min={10000} max={CREDIT_LIMIT} step={10000} value={amount} onChange={e => setAmount(e.target.value)} className={fieldCls} placeholder="500000" />
              </Input>
              <Input label="Duration">
                <select value={tenure} onChange={e => setTenure(Number(e.target.value))} className={fieldCls}>
                  {TENURE_OPTIONS.map(opt => <option key={opt.months} value={opt.months}>{opt.label}</option>)}
                </select>
              </Input>
              <Input label="Your Name">
                <input type="text" value={name} onChange={e => setName(e.target.value)} className={fieldCls} />
              </Input>
              <Input label="Mobile Number">
                <input type="tel" inputMode="numeric" maxLength={10} value={mobile} onChange={e => setMobile(e.target.value.replace(/\D/g, ''))} className={fieldCls} placeholder="10-digit mobile" />
              </Input>
            </div>

            <Input label="Branch">
              <input type="text" value={branch} onChange={e => setBranch(e.target.value)} className={fieldCls} />
            </Input>

            <div className="p-4 rounded-xl bg-primary/5 flex items-start gap-3">
              <span className="text-xl">📋</span>
              <p className="font-label-sm text-label-sm text-on-surface-variant">
                Land papers (7/12 & 8A) auto-sync on approval. Estimated subsidy: <strong className="text-primary">{fmtINR(Math.round(subsidy))}</strong>
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-error-container/20 text-error font-label-sm text-label-sm flex items-start gap-2">
                ❌ {error}
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
                {submitting ? 'Submitting…' : '✅ Submit'}
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
            <span className="text-3xl">🌾</span>
            <div>
              <h3 className="font-headline-md text-headline-md text-on-surface leading-tight">Log Harvest</h3>
              <p className="font-label-sm text-label-sm text-on-surface-variant">Record your harvest — feeds your revenue dashboard.</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-lg hover:bg-surface-container flex items-center justify-center text-on-surface-variant" aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="🌱 Crop">
              <select value={produce} onChange={e => setProduce(e.target.value)} className={fieldCls}>
                {PRODUCE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </Input>
            <Input label="📅 Harvest Date">
              <input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={e => setDate(e.target.value)} className={fieldCls} />
            </Input>
            <Input label="⚖️ Quantity (quintals)">
              <input type="number" min="0.1" step="0.1" value={quantity} onChange={e => setQuantity(e.target.value)} className={fieldCls} placeholder="e.g. 12.5" />
            </Input>
            <Input label="💰 Price (₹/quintal)">
              <input type="number" min="1" step="1" value={price} onChange={e => setPrice(e.target.value)} className={fieldCls} placeholder="e.g. 4800" />
            </Input>
          </div>
          <Input label="📝 Notes (optional)">
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} maxLength={300} className={fieldCls} placeholder="e.g. Kharif batch A — sold at APMC" />
          </Input>

          {qty > 0 && pricePer > 0 && (
            <div className="p-4 rounded-xl bg-primary/5 flex items-center justify-between">
              <span className="font-label-sm text-label-sm text-on-surface-variant">💵 Expected Revenue</span>
              <span className="font-headline-md text-headline-md font-bold text-primary">{fmtINR(Math.round(qty * pricePer))}</span>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-error-container/20 text-error font-label-sm text-label-sm">❌ {error}</div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-6 h-12 rounded-xl text-on-surface-variant font-label-lg hover:bg-surface-container transition-colors">Cancel</button>
            <button type="submit" disabled={!valid || submitting} className="px-6 h-12 rounded-xl bg-primary text-on-primary font-label-lg hover:bg-primary-container transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50">
              {submitting && <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>}
              {submitting ? 'Logging…' : '🌾 Log Harvest'}
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
                    <span className="text-lg">🌾</span>
                    <div className="min-w-0">
                      <p className="font-label-sm text-label-sm text-on-surface truncate">{lot.produce} • {lot.quantity_qtl} qtl @ ₹{Number(lot.price_per_qtl).toLocaleString('en-IN')}</p>
                      <p className="font-label-sm text-[11px] text-on-surface-variant">{fmtDateLabel(lot.harvest_date)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-label-sm text-label-sm text-primary font-bold">{fmtINR(lot.quantity_qtl * lot.price_per_qtl)}</span>
                    <button onClick={() => removeLot(lot.id)} title="Delete" className="w-8 h-8 rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container/20 flex items-center justify-center transition-colors">
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
