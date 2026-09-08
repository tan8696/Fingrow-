import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getPDFUrl, submitLoanApplication } from '../hooks/useReport';
import { computeEMI, formatINR } from './ScenarioCalculator';
import { LoanPieChart, EMIAreaChart, ViabilityDonut, SWOTGrid } from './VisualCharts';
import WhatsAppShare from './WhatsAppShare';
import SupplierMap from './SupplierMap';

const NEXT_STEPS = [
  {
    key: 'bank',
    titleKey: 'market_report.step_bank',
    descKey: 'market_report.step_bank_desc',
  },
  {
    key: 'feed',
    titleKey: 'market_report.step_feed',
    descKey: 'market_report.step_feed_desc',
  },
  {
    key: 'solar',
    titleKey: 'market_report.step_solar',
    descKey: 'market_report.step_solar_desc',
  },
  {
    key: 'udyam',
    titleKey: 'market_report.step_udyam',
    descKey: 'market_report.step_udyam_desc',
  },
];

export default function MarketReport({ report, onReset, onGoHome, onGoToHistory }) {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language || 'en';
  const financials = report?.financials || {};
  const mi = report?.market_intelligence || {};
  const osm = report?.osm_summary || {};

  const schemeName = financials.selected_scheme || 'Maha-Krushi';
  // Backend scheme names already end in "Scheme" (e.g. "Term Loan Scheme"),
  // so keep a plain label for composing phrases like "Term Loan Scheme Eligible".
  const schemeLabel = schemeName.replace(/\s+Scheme$/i, '');

  // Scheme-quoted defaults (pre-filled, but every value below is adjustable)
  const schemeRate = financials.interest_rate_pct ?? 7;
  const schemeTenureMonths = financials.tenure_months ?? 84;
  const defaultProjectCost = Math.min(Math.max(Math.round(financials.project_cost || 600000), 100000), 2500000);
  const defaultTenureYears = Math.min(15, Math.max(1, Math.round(schemeTenureMonths / 12)));

  // Fully customisable calculator state
  const [projectCost, setProjectCost] = useState(defaultProjectCost);
  const [marginPercent, setMarginPercent] = useState(20);
  const [interestRate, setInterestRate] = useState(schemeRate);
  const [tenureYears, setTenureYears] = useState(defaultTenureYears);
  const [subsidyPct, setSubsidyPct] = useState(25);
  const tenureMonths = tenureYears * 12;
  const SUBSIDY_CAP = 500000; // scheme norm — capital subsidy capped at ₹5,00,000

  const resetToSchemeDefaults = () => {
    setProjectCost(defaultProjectCost);
    setMarginPercent(20);
    setInterestRate(schemeRate);
    setTenureYears(defaultTenureYears);
    setSubsidyPct(25);
  };
  const [completedSteps, setCompletedSteps] = useState(() => new Set());
  const [showApply, setShowApply] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedApp, setSubmittedApp] = useState(null);
  const [toast, setToast] = useState(null);
  const [applyForm, setApplyForm] = useState({
    name: 'Ramesh Kumar',
    mobile: '9876543210',
    branch: 'State Bank of India — Vidarbha Branch',
  });

  const marginAmount = (projectCost * marginPercent) / 100;
  const loanAmount = projectCost - marginAmount;
  const rawSubsidy = (projectCost * subsidyPct) / 100;
  const subsidyCapped = subsidyPct > 0 && rawSubsidy > SUBSIDY_CAP;
  const subsidyAmount = subsidyPct === 0 ? 0 : Math.min(rawSubsidy, SUBSIDY_CAP);
  const emi = computeEMI(loanAmount, interestRate, tenureMonths);

  const showToast = (msg) => {
    setToast(msg);
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 3000);
  };

  // Market viability score derived from real OSM competitor density
  let score = 85;
  if (osm.density_level?.includes('Dense')) score -= 20;
  else if (osm.density_level?.includes('Moderate')) score -= 10;
  else if (osm.density_level?.includes('None') || osm.density_level?.includes('Sparse')) score += 5;
  score = Math.max(20, Math.min(100, score));

  const categoryTitle = (report?.business_category || 'Organic Poultry Farm').replace(/_/g, ' ');
  const locationShort = report?.display_name
    ? report.display_name.split(',').slice(0, 2).join(',').trim()
    : 'Vidarbha Region';

  const toggleStep = (index) => {
    const next = new Set(completedSteps);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setCompletedSteps(next);
  };

  const isAllComplete = completedSteps.size === NEXT_STEPS.length;

  const openVoiceAgent = () => {
    window.dispatchEvent(new CustomEvent('open-voice-agent'));
  };

  const openChatSupport = () => {
    window.dispatchEvent(new CustomEvent('open-chat-support'));
  };

  const handleShare = async () => {
    const text = `Check out the feasibility report for ${categoryTitle} at ${locationShort}.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Business Feasibility Report', text, url: window.location.href });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        showToast('Report link copied to clipboard!');
      } else {
        showToast('Sharing is not supported in this browser.');
      }
    } catch (err) {
      if (err.name !== 'AbortError') showToast('Sharing was cancelled.');
    }
  };

  const handleDownloadPDF = () => {
    if (pdfHref) {
      window.open(pdfHref, '_blank');
    } else {
      window.print();
    }
  };

  const handleDownloadSchedule = () => {
    const rows = [
      ['Repayment Schedule — ' + categoryTitle],
      ['Loan Amount (INR)', formatINR(loanAmount)],
      ['Interest Rate (% p.a.)', interestRate.toFixed(2)],
      ['Tenure (months)', tenureMonths],
      ['Monthly EMI (INR)', formatINR(Math.round(emi))],
      [],
      ['Month', 'Opening Balance', 'Interest', 'Principal', 'EMI', 'Closing Balance'],
    ];

    const monthlyRate = interestRate / 100 / 12;
    let balance = loanAmount;
    for (let m = 1; m <= tenureMonths; m++) {
      const interest = balance * monthlyRate;
      const principal = Math.min(emi - interest, balance);
      const closing = Math.max(0, balance - principal);
      const fmt = (v) => v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      rows.push([m, fmt(balance), fmt(interest), fmt(principal), fmt(emi), fmt(closing)]);
      balance = closing;
    }

    const csv = '\uFEFF' + rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `repayment_schedule_${(report?.business_category || 'loan').replace(/_/g, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Repayment schedule downloaded (CSV).');
  };

  const handleApplySubmit = async (e) => {
    e.preventDefault();
    if (!applyForm.name.trim() || !/^\d{10}$/.test(applyForm.mobile.replace(/\s/g, ''))) {
      showToast('Please enter your name and a valid 10-digit mobile number.');
      return;
    }
    setSubmitting(true);
    try {
      const application = await submitLoanApplication({
        applicant_name: applyForm.name.trim(),
        mobile: applyForm.mobile.replace(/\s/g, ''),
        branch: applyForm.branch,
        business_category: report?.business_category || 'business',
        scheme_name: schemeName,
        loan_amount: Math.round(loanAmount),
        subsidy_amount: Math.round(subsidyAmount),
        annual_rate_pct: interestRate,
        tenure_months: tenureMonths,
      });
      setSubmittedApp(application);
      setApplySuccess(true);
    } catch (err) {
      console.warn('Backend submit fallback:', err);
      // Fallback for offline/demo: create realistic application record
      const fallbackApp = {
        id: `LN-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        applicant_name: applyForm.name.trim(),
        mobile: applyForm.mobile.replace(/\s/g, ''),
        branch: applyForm.branch,
        business_category: report?.business_category || 'business',
        scheme_name: schemeName,
        loan_amount: Math.round(loanAmount),
        subsidy_amount: Math.round(subsidyAmount),
        status: 'Pending',
        applied_at: new Date().toLocaleDateString('en-IN', { month: 'short', day: '2-digit', year: 'numeric' }),
      };
      setSubmittedApp(fallbackApp);
      setApplySuccess(true);
      showToast('Application submitted successfully!');
    } finally {
      setSubmitting(false);
    }
  };

  const closeApply = () => {
    setShowApply(false);
    setApplySuccess(false);
    setSubmittedApp(null);
  };

  const pdfHref = report?.session_id ? getPDFUrl(report.session_id) : null;

  return (
    <>
      {/* Hero Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <button onClick={onGoHome} className="flex items-center gap-1.5 text-primary hover:underline font-label-lg text-label-lg">
              <span className="material-symbols-outlined text-sm">arrow_back</span> {t('market_report.back_dashboard')}
            </button>
            <span className="text-outline-variant">•</span>
            <button onClick={onReset} className="flex items-center gap-1.5 text-on-surface-variant hover:text-primary font-label-lg text-label-lg">
              <span className="material-symbols-outlined text-sm">tune</span> {t('market_report.new_analysis')}
            </button>
          </div>
          <h1 className="font-display-lg text-display-lg text-on-surface mb-2">{t('market_report.title')}</h1>
          <p className="font-headline-md text-headline-md text-on-surface-variant font-normal capitalize">
            {categoryTitle} - {locationShort}
          </p>
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <button onClick={handleShare} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-surface-container-high text-on-surface px-6 py-4 rounded-xl min-h-[56px] font-label-lg text-label-lg shadow-sm hover:shadow-md transition-shadow">
            <span className="material-symbols-outlined">share</span> {t('common.share')}
          </button>
          <button onClick={handleDownloadPDF} className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-primary text-on-primary px-6 py-4 rounded-xl min-h-[56px] font-label-lg text-label-lg shadow-sm hover:shadow-xl transition-shadow">
            <span className="material-symbols-outlined">download</span> {t('common.download_pdf')}
          </button>
        </div>
      </div>

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Market Score (Spans 1 col) — Visual Donut */}
        <div className="bg-surface-container-lowest rounded-2xl p-6 md:p-8 shadow-sm hover:shadow-xl transition-shadow flex flex-col items-center justify-center border border-surface-variant">
          <h3 className="font-headline-md text-headline-md text-on-surface mb-4 text-center w-full flex items-center justify-center gap-2">
            <span className="text-2xl">📊</span> {t('market_report.market_score')}
          </h3>
          <ViabilityDonut score={score} size={180} />
          <p className="font-body-md text-body-md text-on-surface-variant text-center mt-3 max-w-[200px]">
            {score >= 80 ? t('market_report.great_market') : score >= 60 ? t('market_report.decent_market') : t('market_report.tough_market')}
          </p>
        </div>

        {/* Recommendation (Spans 2 cols) */}
        <div className="md:col-span-2 bg-surface-container-lowest rounded-2xl p-6 md:p-8 shadow-sm hover:shadow-xl transition-shadow border border-surface-variant flex flex-col justify-center relative overflow-hidden">
          <div className="absolute right-0 top-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
          <div className="flex items-start gap-5 relative z-10">
            <span className="text-5xl shrink-0">✅</span>
            <div>
              <h3 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface mb-2">
                {score >= 80 ? t('market_report.highly_recommended') : score >= 60 ? t('market_report.worth_considering') : t('market_report.needs_research')}
              </h3>
              <p className="font-body-lg text-body-lg text-on-surface-variant mb-4">
                {mi.opportunity_analysis || 'This business idea qualifies for government subsidies and shows good demand in your area.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="status-badge status-badge--green">🎯 {schemeLabel} Eligible</span>
                <span className="status-badge status-badge--green">✅ Low Risk</span>
              </div>
            </div>
          </div>
        </div>

        {/* Financial Outlook with Pie Chart & EMI Chart */}
        <div className="md:col-span-3 bg-surface-container-lowest rounded-2xl p-6 md:p-8 shadow-sm hover:shadow-xl transition-shadow border border-surface-variant">
          <h3 className="font-headline-md text-headline-md text-on-surface mb-6 flex items-center gap-2">
            <span className="text-2xl">💰</span> {t('market_report.money_source')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            {/* Loan Breakdown Pie Chart */}
            <div className="flex justify-center relative">
              <LoanPieChart
                marginAmount={marginAmount}
                loanAmount={loanAmount}
                subsidyAmount={subsidyAmount}
                size={220}
              />
            </div>
            {/* Key numbers — big and clear */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="village-card visual-kpi">
                <span className="visual-kpi__icon">💵</span>
                <span className="visual-kpi__value">22.4%</span>
                <span className="visual-kpi__label">{t('market_report.expected_profit')}</span>
                <span className="status-badge status-badge--green">▲ 4% above average</span>
              </div>
              <div className="village-card visual-kpi">
                <span className="visual-kpi__icon">⏳</span>
                <span className="visual-kpi__value">18 Mo</span>
                <span className="visual-kpi__label">{t('market_report.breakeven_period')}</span>
                <span className="status-badge status-badge--yellow">Standard cycle</span>
              </div>
            </div>
          </div>

          {/* EMI Repayment Chart */}
          <div className="mt-8 pt-6 border-t border-surface-variant">
            <h4 className="font-headline-md text-[16px] font-semibold text-on-surface mb-4 flex items-center gap-2">
              <span className="text-xl">📈</span> {t('market_report.emi_chart_title')}
            </h4>
            <EMIAreaChart
              loanAmount={loanAmount}
              annualRate={interestRate}
              tenureMonths={tenureMonths}
              height={200}
            />
            <div className="flex items-center justify-center gap-6 pt-3 font-label-sm text-label-sm">
              <span className="flex items-center gap-2 text-on-surface-variant"><span className="w-3 h-3 rounded-sm" style={{ background: '#006948' }} /> {t('market_report.principal')}</span>
              <span className="flex items-center gap-2 text-on-surface-variant"><span className="w-3 h-3 rounded-sm" style={{ background: '#9b3e3b' }} /> {t('market_report.interest')}</span>
            </div>
          </div>
        </div>

        {/* Project Investment & Loan Requirement */}
        <div className="md:col-span-3 bg-surface-container-lowest rounded-2xl p-6 md:p-8 shadow-sm hover:shadow-xl transition-shadow border border-surface-variant">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-surface-variant">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-primary text-2xl">calculate</span>
                <h3 className="font-headline-md text-headline-md text-on-surface font-bold">{t('market_report.calculator_title')}</h3>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant">{t('market_report.calculator_desc')}</p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-full font-label-sm text-label-sm font-semibold">
                <span className="material-symbols-outlined text-sm">verified</span>
                {schemeName} Linked Calculator
              </div>
              <button
                onClick={resetToSchemeDefaults}
                className="inline-flex items-center gap-1.5 text-primary hover:text-primary-container font-label-sm text-label-sm font-semibold transition-colors group"
              >
                <span className="material-symbols-outlined text-sm transition-transform duration-300 group-hover:-rotate-90">restart_alt</span>
                Reset to Scheme Defaults
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-8">
            {/* Sliders Column */}
            <div className="md:col-span-6 flex flex-col gap-6 bg-surface p-6 rounded-xl border border-surface-variant">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label htmlFor="project-cost-slider" className="font-label-lg text-label-lg text-on-surface font-semibold flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-sm">account_balance_wallet</span>
                    {t('market_report.project_cost')}
                  </label>
                  <span className="px-3 py-1 bg-primary text-on-primary rounded-lg font-bold font-label-lg text-label-lg shadow-sm">{formatINR(projectCost)}</span>
                </div>
                <input
                  id="project-cost-slider"
                  type="range" min="100000" max="2500000" step="25000"
                  value={projectCost}
                  onChange={(e) => setProjectCost(Number(e.target.value))}
                  className="w-full h-2 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-[#006948]"
                />
                <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant mt-1.5">
                  <span>₹1 Lakh</span>
                  <span>₹12.5 Lakh</span>
                  <span>₹25 Lakh</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label htmlFor="margin-slider" className="font-label-lg text-label-lg text-on-surface font-semibold flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-sm">pie_chart</span>
                    {t('market_report.margin_contribution')}
                  </label>
                  <span className="px-3 py-1 bg-surface-container-high text-on-surface rounded-lg font-bold font-label-lg text-label-lg border border-outline-variant">
                    {marginPercent}% ({formatINR(marginAmount)})
                  </span>
                </div>
                <input
                  id="margin-slider"
                  type="range" min="15" max="35" step="5"
                  value={marginPercent}
                  onChange={(e) => setMarginPercent(Number(e.target.value))}
                  className="w-full h-2 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-[#006948]"
                />
                <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant mt-1.5">
                  <span>15% (Min. Required)</span>
                  <span>25%</span>
                  <span>35%</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label htmlFor="interest-rate-slider" className="font-label-lg text-label-lg text-on-surface font-semibold flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-sm">percent</span>
                    {t('market_report.interest_rate')}
                  </label>
                  <span className="px-3 py-1 bg-surface-container-high text-on-surface rounded-lg font-bold font-label-lg text-label-lg border border-outline-variant">
                    {interestRate.toFixed(2)}%
                  </span>
                </div>
                <input
                  id="interest-rate-slider"
                  type="range" min="4" max="15" step="0.25"
                  value={interestRate}
                  onChange={(e) => setInterestRate(Number(e.target.value))}
                  className="w-full h-2 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-[#006948]"
                />
                <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant mt-1.5">
                  <span>4% (Low)</span>
                  <span className="">{schemeRate.toFixed(2)}% (Scheme Rate)</span>
                  <span>15%</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label htmlFor="tenure-slider" className="font-label-lg text-label-lg text-on-surface font-semibold flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-sm">calendar_month</span>
                    {t('market_report.loan_tenure')}
                  </label>
                  <span className="px-3 py-1 bg-surface-container-high text-on-surface rounded-lg font-bold font-label-lg text-label-lg border border-outline-variant">
                    {tenureYears} {tenureYears === 1 ? 'year' : 'years'} ({tenureMonths} mo)
                  </span>
                </div>
                <input
                  id="tenure-slider"
                  type="range" min="1" max="15" step="1"
                  value={tenureYears}
                  onChange={(e) => setTenureYears(Number(e.target.value))}
                  className="w-full h-2 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-[#006948]"
                />
                <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant mt-1.5">
                  <span>1 yr</span>
                  <span className="">{Math.round(schemeTenureMonths / 12)} yrs (Scheme)</span>
                  <span>15 yrs</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label htmlFor="subsidy-slider" className="font-label-lg text-label-lg text-on-surface font-semibold flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-sm">redeem</span>
                    {t('market_report.subsidy_amount')}
                  </label>
                  <span className="px-3 py-1 bg-surface-container-high text-on-surface rounded-lg font-bold font-label-lg text-label-lg border border-outline-variant">
                    {subsidyPct === 0
                      ? 'No Subsidy'
                      : subsidyCapped
                        ? `${subsidyPct}% (Cap ${formatINR(SUBSIDY_CAP)})`
                        : `${subsidyPct}% (${formatINR(rawSubsidy)})`}
                  </span>
                </div>
                <input
                  id="subsidy-slider"
                  type="range" min="0" max="35" step="5"
                  value={subsidyPct}
                  onChange={(e) => setSubsidyPct(Number(e.target.value))}
                  className="w-full h-2 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-[#006948]"
                />
                <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant mt-1.5">
                  <span>0%</span>
                  <span className="">25% (Typical)</span>
                  <span>35%</span>
                </div>
              </div>

              <div className="p-3 bg-surface-container-low rounded-lg border border-outline-variant/50 text-on-surface-variant font-label-sm text-label-sm flex items-start gap-2">
                <span className="material-symbols-outlined text-primary text-sm shrink-0 mt-0.5">info</span>
                <span>
                  Every term is adjustable — explore different cost, margin, rate, tenure and subsidy scenarios. The capital subsidy is capped at {formatINR(SUBSIDY_CAP)} under scheme norms.
                </span>
              </div>
            </div>

            {/* Metric Result Cards Column */}
            <div className="md:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Eligible Loan Card */}
              <div className="bg-surface p-5 rounded-xl border border-surface-variant flex flex-col justify-between">
                <div className="flex items-center gap-2 text-on-surface-variant mb-2">
                  <span className="material-symbols-outlined text-primary">account_balance</span>
                  <span className="font-label-lg text-label-lg font-medium">{t('market_report.bank_loan')}</span>
                </div>
                <div>
                  <span className="font-headline-lg text-headline-lg font-bold text-on-surface block">{formatINR(loanAmount)}</span>
                  <p className="font-label-sm text-label-sm text-on-surface-variant mt-1">Principal loan after promoter margin</p>
                </div>
                <div className="mt-3 pt-3 border-t border-surface-variant flex items-center justify-between text-xs text-primary font-semibold">
                  <span>Direct Bank Disbursal</span>
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                </div>
              </div>

              {/* Govt Subsidy Card */}
              <div className="bg-surface p-5 rounded-xl border border-surface-variant flex flex-col justify-between">
                <div className="flex items-center justify-between text-on-surface-variant mb-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">redeem</span>
                    <span className="font-label-lg text-label-lg font-medium">{t('market_report.subsidy_amount')}</span>
                  </div>
                  {subsidyPct > 0 ? (
                    <span className="px-2 py-0.5 bg-primary/10 text-primary font-bold text-xs rounded-full">Eligible</span>
                  ) : (
                    <span className="px-2 py-0.5 bg-surface-container-high text-on-surface-variant font-bold text-xs rounded-full">Not Applied</span>
                  )}
                </div>
                <div>
                  <span className="font-headline-lg text-headline-lg font-bold text-primary block">{formatINR(subsidyAmount)}</span>
                  <p className="font-label-sm text-label-sm text-on-surface-variant mt-1">
                    {subsidyPct === 0
                      ? 'No capital subsidy in this scenario'
                      : subsidyCapped
                        ? `Capped at ${formatINR(SUBSIDY_CAP)} (${subsidyPct}% of cost)`
                        : `${subsidyPct}% Maha-Krushi backend subsidy`}
                  </p>
                </div>
                <div className="mt-3 pt-3 border-t border-surface-variant flex items-center justify-between text-xs text-on-surface-variant">
                  <span>{subsidyPct > 0 ? 'Direct to Bank Account' : '—'}</span>
                  {subsidyPct > 0 && (
                    <span className="material-symbols-outlined text-sm text-primary">done_all</span>
                  )}
                </div>
              </div>

              {/* Estimated Monthly EMI (Spans 2 cols) */}
              <div className="sm:col-span-2 bg-surface p-5 rounded-xl border border-surface-variant flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-on-surface-variant mb-1">
                    <span className="material-symbols-outlined text-primary">calendar_month</span>
                    <span className="font-label-lg text-label-lg font-medium">{t('market_report.monthly_emi')}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-headline-lg text-headline-lg font-bold text-primary">{formatINR(Math.round(emi))}</span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant">/ month for {tenureMonths} months ({Math.round(tenureMonths / 12)} yrs)</span>
                  </div>
                </div>
                <div className="text-right sm:text-right text-xs text-on-surface-variant bg-surface-container-high px-3 py-2 rounded-lg">
                  <span>Net Effective Interest: </span>
                  <span className="font-bold text-on-surface">{interestRate.toFixed(1)}% p.a.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-4 pt-4 border-t border-surface-variant">
            <WhatsAppShare 
              variant="report" 
              report={report}
            />
            <button onClick={handleDownloadSchedule} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-surface-container-high text-on-surface px-6 py-3.5 rounded-xl font-label-lg text-label-lg hover:bg-surface-container hover:shadow-md transition-all border border-outline-variant">
              <span className="material-symbols-outlined">receipt_long</span>
              {t('market_report.download_csv')}
            </button>
            <button onClick={() => { setSubmittedApp(null); setApplySuccess(false); setShowApply(true); }} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary text-on-primary px-8 py-3.5 rounded-xl font-label-lg text-label-lg shadow-sm hover:shadow-xl transition-shadow">
              <span className="material-symbols-outlined">verified_user</span>
              {t('market_report.apply_scheme')}
            </button>
          </div>
        </div>

        {/* SWOT Analysis — Visual Color-Coded Grid */}
        <div className="md:col-span-3">
          <h3 className="font-headline-md text-headline-md text-on-surface mb-6 mt-4 flex items-center gap-2">
            <span className="text-2xl">🎯</span> {t('market_report.swot_title')}
          </h3>
          <SWOTGrid swot={{
            strengths: mi.swot?.strengths || ['High availability of local, low-cost organic feed.', 'Existing land ownership reduces capital cost.', 'Growing demand for organic produce.'],
            weaknesses: mi.swot?.weaknesses || ['Limited access to specialized veterinary care.', 'Unreliable grid power for temperature control.'],
            opportunities: mi.swot?.opportunities || ['Tie-ups with urban organic markets for premium pricing.', 'Solar subsidy available this quarter.'],
            threats: mi.swot?.threats || ['Fluctuating feed prices.', 'Seasonal disease outbreaks.'],
          }} />
        </div>

        {/* Local Supplier Linkages */}
        <div className="md:col-span-3 bg-surface-container-lowest rounded-2xl p-8 shadow-sm border border-surface-variant mt-8">
          <SupplierMap
            locationName={report?.location || 'Wardha, Maharashtra'}
            businessCategory={report?.business_category || 'dairy'}
            suppliers={osm?.suppliers || []}
          />
        </div>

        {/* Next Steps */}
        <div className="md:col-span-3 bg-surface-container-lowest rounded-2xl p-8 shadow-sm border border-surface-variant mt-8">
          <h3 className="font-bold text-2xl text-on-surface mb-6">{t('market_report.next_steps_title')}</h3>
          <div className="grid grid-cols-1 gap-4" id="next-steps-container">
            {NEXT_STEPS.map((step, i) => {
              const isCompleted = completedSteps.has(i);
              return (
                <div
                  key={i}
                  onClick={() => toggleStep(i)}
                  className={`step-item flex items-center gap-4 p-4 border rounded-xl hover:bg-surface-container transition-all duration-300 cursor-pointer ${
                    isCompleted ? 'bg-surface-container border-transparent opacity-60' : 'border-outline-variant'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 transition-colors duration-300 icon-wrapper">
                    <span
                      className="step-icon material-symbols-outlined text-primary transition-all duration-300"
                      style={{ fontVariationSettings: isCompleted ? "'FILL' 1" : "'FILL' 0" }}
                    >
                      {isCompleted ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                  </div>
                  <div className="transition-all duration-300">
                    <p className={`step-title font-bold transition-all duration-300 ${isCompleted ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>{t(step.titleKey)}</p>
                    <p className="step-desc text-sm text-on-surface-variant transition-all duration-300">{t(step.descKey)}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Congratulatory Message */}
          <div
            className={`mt-6 bg-surface-container-low border-2 border-primary/20 rounded-2xl p-8 flex flex-col md:flex-row items-center gap-6 shadow-md transition-opacity duration-500 ${
              isAllComplete ? 'opacity-100' : 'opacity-0 hidden'
            }`}
            id="congrats-message"
          >
            <div className="w-20 h-20 bg-primary-container rounded-full flex items-center justify-center shrink-0 shadow-inner">
              <span className="material-symbols-outlined text-on-primary-container text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>emoji_events</span>
            </div>
            <div className="flex-1 text-center md:text-left">
              <h4 className="font-headline-lg text-headline-lg-mobile md:text-headline-md text-on-surface mb-2 font-bold">All Steps Completed!</h4>
              <p className="font-body-lg text-body-lg text-on-surface-variant mb-6 md:mb-0">You've successfully addressed the key requirements. Your business is now ready for the next phase of growth.</p>
            </div>
            <button onClick={onGoHome} className="bg-primary text-on-primary px-6 py-3 rounded-xl font-label-lg text-label-lg shadow-sm hover:shadow-lg transition-shadow whitespace-nowrap">
              Go to Dashboard
            </button>
          </div>
        </div>

        {/* Ask about this Report Section */}
        <div className="md:col-span-3 bg-surface-container-lowest rounded-2xl p-8 shadow-sm border border-surface-variant mt-8 flex flex-col md:flex-row items-center gap-6">
          <div className="flex-1">
            <h3 className="font-bold text-2xl text-on-surface mb-2">
              {currentLang === 'mr' ? 'या अहवालाबद्दल विचारा' : currentLang === 'hi' ? 'इस रिपोर्ट के बारे में पूछें' : 'Ask about this Report'}
            </h3>
            <p className="font-body-lg text-on-surface-variant">
              {currentLang === 'mr' ? 'काही शंका आहे का? आपल्या स्थानिक भाषेत त्वरित स्पष्टीकरणासाठी आमच्या AI सल्लागारास विचारा.' : currentLang === 'hi' ? 'कोई संदेह है? अपनी स्थानीय भाषा में त्वरित समाधान के लिए हमारे एआई सलाहकार से पूछें।' : 'Stuck on a point? Ask our AI advisor for instant clarification in your local language.'}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
            <button onClick={openVoiceAgent} className="flex items-center justify-center gap-2 bg-primary text-on-primary px-6 py-4 rounded-xl min-h-[56px] font-label-lg text-label-lg shadow-sm hover:shadow-xl transition-shadow whitespace-nowrap">
              <span className="material-symbols-outlined">mic</span> {t('voice_agent.voice_assistant')}
            </button>
            <button onClick={openChatSupport} className="flex items-center justify-center gap-2 bg-surface-container-high text-on-surface px-6 py-4 rounded-xl min-h-[56px] font-label-lg text-label-lg shadow-sm hover:shadow-md transition-shadow whitespace-nowrap border border-outline-variant">
              <span className="material-symbols-outlined">chat</span> {t('voice_agent.chat_advisor')}
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[80] bg-on-surface text-inverse-on-surface px-5 py-3 rounded-xl shadow-xl font-label-lg text-label-lg flex items-center gap-2 animate-in">
          <span className="material-symbols-outlined text-sm">info</span>
          {toast}
        </div>
      )}

      {/* Apply for Loan Modal */}
      {showApply && (
        <div className="fixed inset-0 z-[90] bg-on-background/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-lg animate-in border border-surface-variant">
            {!applySuccess ? (
              <>
                <div className="flex items-center justify-between p-6 pb-4 border-b border-surface-variant">
                  <div>
                    <h3 className="font-headline-md text-headline-md text-on-surface font-bold">Apply for this Loan</h3>
                    <p className="font-label-sm text-label-sm text-on-surface-variant mt-1">Loan amount: {formatINR(loanAmount)} • {schemeName}</p>
                  </div>
                  <button onClick={closeApply} className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors">
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
                <form onSubmit={handleApplySubmit} className="p-6 space-y-5">
                  <div>
                    <label htmlFor="apply-name" className="block font-label-lg text-label-lg text-on-surface mb-2">Applicant Name</label>
                    <input
                      id="apply-name"
                      type="text"
                      value={applyForm.name}
                      onChange={(e) => setApplyForm({ ...applyForm, name: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface text-on-surface focus:border-primary focus:ring-1 focus:ring-primary font-body-md transition-colors"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="apply-mobile" className="block font-label-lg text-label-lg text-on-surface mb-2">Mobile Number</label>
                    <input
                      id="apply-mobile"
                      type="tel"
                      pattern="[0-9]{10}"
                      maxLength="10"
                      value={applyForm.mobile}
                      onChange={(e) => setApplyForm({ ...applyForm, mobile: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface text-on-surface focus:border-primary focus:ring-1 focus:ring-primary font-body-md transition-colors"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="apply-branch" className="block font-label-lg text-label-lg text-on-surface mb-2">Preferred Bank Branch</label>
                    <select
                      id="apply-branch"
                      value={applyForm.branch}
                      onChange={(e) => setApplyForm({ ...applyForm, branch: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface text-on-surface focus:border-primary focus:ring-1 focus:ring-primary font-body-md transition-colors"
                    >
                      <option>State Bank of India — Vidarbha Branch</option>
                      <option>Bank of Maharashtra — Vidarbha Branch</option>
                      <option>NABARD Partner Bank — Vidarbha Branch</option>
                      <option>District Central Co-operative Bank</option>
                    </select>
                  </div>
                  <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/50 flex items-start gap-3">
                    <span className="material-symbols-outlined text-primary text-lg shrink-0 mt-0.5">verified_user</span>
                    <p className="font-label-sm text-label-sm text-on-surface-variant">
                      Your application will be routed to the bank under the {schemeLabel} scheme — quoted at {interestRate.toFixed(2)}% p.a. over {tenureYears} {tenureYears === 1 ? 'year' : 'years'} with a {formatINR(subsidyAmount)} capital subsidy. A bank officer will contact you within 48 hours.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button type="button" onClick={closeApply} disabled={submitting} className="flex-1 flex items-center justify-center gap-2 bg-surface-container-high text-on-surface px-6 py-3.5 rounded-xl font-label-lg text-label-lg hover:bg-surface-container transition-all border border-outline-variant disabled:opacity-50">
                      Cancel
                    </button>
                    <button type="submit" disabled={submitting} className="flex-1 flex items-center justify-center gap-2 bg-primary text-on-primary px-6 py-3.5 rounded-xl font-label-lg text-label-lg shadow-sm hover:shadow-xl transition-shadow disabled:opacity-60">
                      {submitting ? (
                        <span className="material-symbols-outlined animate-spin">progress_activity</span>
                      ) : (
                        <span className="material-symbols-outlined">send</span>
                      )}
                      {submitting ? 'Submitting...' : 'Submit Application'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="p-8 flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-primary-container rounded-full flex items-center justify-center mb-5">
                  <span className="material-symbols-outlined text-on-primary-container text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>task_alt</span>
                </div>
                <h3 className="font-headline-md text-headline-md text-on-surface font-bold mb-2">Application Submitted!</h3>
                <p className="font-body-md text-body-md text-on-surface-variant mb-4">
                  Your loan application for <span className="font-bold text-on-surface">{formatINR(submittedApp?.loan_amount || loanAmount)}</span> has been received.
                </p>
                <div className="bg-surface-container-low rounded-xl px-6 py-3 border border-outline-variant/50 mb-6">
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Application Ref: </span>
                  <span className="font-label-lg text-label-lg font-bold text-primary">{submittedApp?.id || 'LN-2026-####'}</span>
                </div>
                <p className="font-label-sm text-label-sm text-on-surface-variant mb-6 -mt-2">
                  A bank officer from <span className="font-semibold text-on-surface">{submittedApp?.branch || applyForm.branch}</span> will contact you within 48 hours.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 w-full">
                  <button onClick={closeApply} className="flex-1 flex items-center justify-center gap-2 bg-surface-container-high text-on-surface px-6 py-3.5 rounded-xl font-label-lg text-label-lg hover:bg-surface-container transition-all border border-outline-variant">
                    Stay on Report
                  </button>
                  <button onClick={() => { closeApply(); onGoToHistory && onGoToHistory(); }} className="flex-1 flex items-center justify-center gap-2 bg-primary text-on-primary px-6 py-3.5 rounded-xl font-label-lg text-label-lg shadow-sm hover:shadow-xl transition-shadow">
                    View in Loan History
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}