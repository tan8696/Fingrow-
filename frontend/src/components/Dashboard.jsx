import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import FloatingVoiceAgent from './FloatingVoiceAgent';
import DashboardHome from './DashboardHome';
import WeatherRisk from './WeatherRisk';
import MarketReport from './MarketReport';
import LoanHistory from './LoanHistory';
import MarketPrices from './MarketPrices';
import InputWizard from './InputWizard';
import Settings from './Settings';
import SchemeCalculator from './SchemeCalculator';
import { generateReport, fetchNotifications } from '../hooks/useReport';

const PROFILE_AVATAR = `${import.meta.env.BASE_URL}images/profile-ramesha.jpg`;

const NAV_ITEMS = [
  { id: 'dashboard', icon: 'grid_view', label: 'Dashboard' },
  { id: 'feasibility', icon: 'assessment', label: 'Feasibility Reports' },
  { id: 'history', icon: 'account_balance', label: 'Loan Management & History' },
  { id: 'market', icon: 'storefront', label: 'Live Mandi Prices' },
  { id: 'weather', icon: 'thunderstorm', label: 'Weather & Crop Risk' },
  { id: 'settings', icon: 'settings', label: 'Settings' },
];

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi' },
  { code: 'bn', name: 'Bengali' },
  { code: 'te', name: 'Telugu' },
  { code: 'mr', name: 'Marathi' },
  { code: 'ta', name: 'Tamil' },
  { code: 'gu', name: 'Gujarati' },
  { code: 'kn', name: 'Kannada' },
  { code: 'ml', name: 'Malayalam' },
  { code: 'pa', name: 'Punjabi' },
  { code: 'or', name: 'Odia' },
];

const DEFAULT_FEASIBILITY_REPORT = {
  business_category: 'Organic Poultry Farm',
  display_name: 'Vidarbha Region, Maharashtra',
  financials: {
    selected_scheme: 'Maha-Krushi Scheme',
    project_cost: 600000,
    margin_contribution: 120000,
    loan_amount: 480000,
    interest_rate_pct: 7.0,
    tenure_months: 84,
    moratorium_months: 6,
  },
  market_intelligence: {
    market_reach: 'Strong local market potential within Vidarbha rural-urban corridor with direct-to-retailer linkages.',
    opportunity_analysis: 'This venture qualifies for multiple state agricultural subsidies and shows a strong local demand trajectory. Immediate execution is advised.',
    competitor_mapping: 'Low competitor saturation within a 5 km radius, presenting high capture rate for organic country eggs and broiler birds.',
    swot: {
      strengths: ['High availability of local, low-cost organic feed.', 'Existing land ownership reduces initial capital expenditure.', 'Growing local preference for organic produce.'],
      weaknesses: ['Limited access to specialized veterinary care in immediate vicinity.', 'Reliance on inconsistent grid power for temperature control.'],
      opportunities: ['Tie-ups with urban organic markets for premium pricing.', 'Solar panel installation subsidies available this quarter.'],
      threats: ['Fluctuating prices of supplemental commercial feed.', 'Seasonal disease outbreaks requiring rapid response protocols.'],
    },
    hyper_local_threats: 'Monsoon humidity fluctuations requiring proactive shelter ventilation.',
    pricing_strategy: 'Cost-plus pricing targeting 20-25% gross margin on organic poultry batches.',
  },
  osm_summary: { competitor_count: 2, density_level: 'Sparse', radius_km: 5 },
};

const MOBILE_NAV = [
  { id: 'dashboard', icon: 'grid_view', label: 'Dashboard' },
  { id: 'feasibility', icon: 'assessment', label: 'Reports' },
  { id: 'history', icon: 'account_balance', label: 'Loans' },
  { id: 'market', icon: 'storefront', label: 'Mandi' },
  { id: 'settings', icon: 'settings', label: 'More' },
];

const NOTIF_ICONS = {
  emi: 'payments',
  approval: 'verified_user',
  weather: 'thunderstorm',
  info: 'info',
};

function NotificationsPanel({ onNavigate }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const panelRef = useRef(null);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      try {
        const data = await fetchNotifications();
        setItems(data.notifications || []);
      } catch (err) {
        console.error(err);
        setItems([]);
      } finally {
        setLoaded(true);
      }
    }
  };

  const handleAction = (notif) => {
    setOpen(false);
    const target = notif.view || 'dashboard';
    const viewMap = { history: 'history', weather: 'weather', market: 'market', feasibility: 'feasibility', dashboard: 'dashboard', settings: 'settings' };
    onNavigate(viewMap[target] || 'dashboard');
  };

  return (
    <div className="relative">
      <button
        onClick={toggle}
        aria-label="Notifications"
        className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${open ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container'}`}
      >
        <span className="material-symbols-outlined text-[22px]">notifications</span>
        {items.length > 0 && !open && (
          <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-tertiary ring-2 ring-surface" />
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div ref={panelRef} className="absolute right-0 top-12 z-50 w-[340px] max-w-[calc(100vw-2rem)] bg-surface-container-lowest rounded-2xl shadow-2xl border border-surface-variant overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-variant bg-surface">
              <h3 className="font-label-lg text-label-lg font-bold text-on-surface">Notifications</h3>
              <span className="font-label-sm text-label-sm text-on-surface-variant">{items.length} new</span>
            </div>
            <div className="max-h-[380px] overflow-y-auto divide-y divide-surface-container">
              {items.length === 0 && loaded && (
                <div className="px-5 py-8 text-center text-on-surface-variant font-body-md text-body-md text-sm">You're all caught up.</div>
              )}
              {items.length === 0 && !loaded && (
                <div className="px-5 py-8 text-center text-on-surface-variant flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
                  <span className="font-label-sm text-label-sm">Loading…</span>
                </div>
              )}
              {items.map((notif, i) => (
                <button key={notif.id || i} onClick={() => handleAction(notif)} className="w-full text-left px-5 py-4 hover:bg-surface-container-low transition-colors flex items-start gap-3">
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    notif.type === 'weather' ? 'bg-tertiary/10 text-tertiary' : notif.type === 'emi' ? 'bg-error-container/20 text-on-error-container' : 'bg-primary/10 text-primary'
                  }`}>
                    <span className="material-symbols-outlined text-[18px]">{NOTIF_ICONS[notif.type] || 'info'}</span>
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-label-sm text-label-sm font-semibold text-on-surface">{notif.title}</span>
                    <span className="block font-body-md text-body-md text-on-surface-variant text-[12px] leading-relaxed mt-0.5">{notif.body}</span>
                    <span className="block font-label-sm text-[11px] text-primary mt-1">{notif.time}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function Dashboard({ currentView, setCurrentView, onLogout }) {
  const { i18n } = useTranslation();
  const [margin, setMargin] = useState(50000);
  const [locationText, setLocationText] = useState('Vidarbha, MH');
  const [reportData, setReportData] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [userLanguage, setUserLanguage] = useState('en');

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => setTimeout(() => setLocationText('Vidarbha, MH'), 800),
        () => setTimeout(() => setLocationText('Vidarbha, MH'), 800),
      );
    } else {
      setLocationText('Vidarbha, MH');
    }
  }, []);

  const handleGenerateReport = async (formData) => {
    setIsGenerating(true);
    try {
      const data = await generateReport({
        location: formData.location,
        margin_capital: parseFloat(formData.margin_capital),
        business_category: formData.business_category,
        language: userLanguage,
        radius_km: 5,
      });
      setReportData(data);
      setShowWizard(false);
    } catch (err) {
      console.warn('Backend live report error:', err);
      const marginVal = parseFloat(formData.margin_capital) || 50000;
      const projectCostVal = Math.round(marginVal / 0.1);
      const isMicro = projectCostVal <= 140000;
      const schemeName = isMicro ? 'Micro Finance Scheme' : 'Maha-Krushi Scheme';
      const interestRate = isMicro ? 6.5 : 7.0;
      const tenure = isMicro ? 36 : 84;
      const loanVal = Math.round(projectCostVal * 0.9);

      const fallbackReport = {
        ...DEFAULT_FEASIBILITY_REPORT,
        business_category: formData.business_category || 'Organic Farming',
        display_name: formData.location || 'Maharashtra, India',
        financials: {
          selected_scheme: schemeName,
          project_cost: projectCostVal,
          margin_contribution: marginVal,
          loan_amount: loanVal,
          interest_rate_pct: interestRate,
          tenure_months: tenure,
          moratorium_months: 6,
        },
      };
      setReportData(fallbackReport);
      setShowWizard(false);
    } finally {
      setIsGenerating(false);
    }
  };

  const startNewReport = () => {
    setShowWizard(true);
    setCurrentView('feasibility');
  };

  const setLanguage = (code) => {
    setUserLanguage(code);
    i18n.changeLanguage(code);
  };

  const openVoiceAgent = () => window.dispatchEvent(new CustomEvent('open-voice-agent'));

  return (
    <div className="min-h-screen bg-background text-on-surface font-body-md antialiased">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-72 bg-surface-container-low z-50 p-6 shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col gap-6 h-full">
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-on-primary shadow-sm">
              <span className="material-symbols-outlined text-[24px]">eco</span>
            </div>
            <div className="flex flex-col">
              <span className="font-headline-md text-headline-md text-primary tracking-tight">FinGrow</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant leading-none">Empowering Rural Growth</span>
            </div>
          </div>

          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                className={`flex items-center gap-3 px-4 py-3 transition-colors font-label-lg text-label-lg text-left ${
                  currentView === item.id
                    ? 'bg-primary-container text-on-primary-container font-semibold rounded-xl'
                    : 'rounded-xl text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: currentView === item.id ? "'FILL' 1" : "'FILL' 0" }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="mt-auto flex flex-col gap-3">
            <button
              onClick={openVoiceAgent}
              className="w-full min-h-[56px] flex items-center justify-between px-4 py-3 rounded-xl bg-primary text-on-primary hover:bg-primary-container transition-colors shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-[22px]">support_agent</span>
                <div className="flex flex-col text-left">
                  <span className="font-label-lg text-label-lg leading-tight">Ask Advisory Bot</span>
                  <span className="font-label-sm text-label-sm text-primary-fixed-dim leading-none">Instant Agri Assistance</span>
                </div>
              </div>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
            <button
              onClick={onLogout}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-on-surface-variant hover:bg-surface-container hover:text-error transition-colors font-label-sm text-label-sm"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Content column */}
      <div className="md:pl-72">
        {/* Top header */}
        <header className="fixed top-0 right-0 left-0 md:left-72 z-40 h-16 md:h-20 bg-surface/85 backdrop-blur-xl px-4 md:px-8 flex items-center justify-between shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Mobile brand */}
            <div className="md:hidden flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-on-primary">
                <span className="material-symbols-outlined text-[20px]">eco</span>
              </div>
              <span className="font-headline-md text-[18px] text-primary tracking-tight">FinGrow</span>
            </div>
            <div className="hidden md:flex flex-col min-w-0">
              <span className="font-label-lg text-label-lg text-on-surface">Namaste, Ramesh</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">Vidarbha Agri Cluster (Lead Officer)</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 md:gap-4">
            {/* Language segmented control */}
            <div className="hidden sm:flex items-center bg-surface-container-low rounded-xl p-1 gap-1">
              {['en', 'mr', 'hi'].map(code => (
                <button
                  key={code}
                  onClick={() => setLanguage(code)}
                  className={`px-3 py-1.5 rounded-lg font-label-sm text-label-sm transition-colors ${
                    userLanguage === code ? 'bg-surface-container-lowest text-primary font-semibold shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {code === 'en' ? 'EN' : code === 'mr' ? 'मराठी' : 'हिन्दी'}
                </button>
              ))}
            </div>

            <NotificationsPanel onNavigate={setCurrentView} />

            <div className="flex items-center gap-3 pl-1 md:pl-2">
              <div className="relative">
                <img src={PROFILE_AVATAR} alt="Ramesh Rao" className="w-9 h-9 md:w-10 md:h-10 rounded-full object-cover ring-2 ring-surface" />
                <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center ring-2 ring-surface" title="KYC Verified">
                  <span className="material-symbols-outlined text-[12px]">verified</span>
                </span>
              </div>
              <div className="hidden xl:flex flex-col">
                <span className="font-label-sm text-label-sm text-on-surface font-semibold">Ramesh Rao</span>
                <span className="font-label-sm text-label-sm text-primary flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-[12px]">check_circle</span> KYC Verified
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Main canvas */}
        <main className="pt-16 md:pt-20 px-2 sm:px-4 md:px-8 pb-28 md:pb-10 bg-background min-h-screen">
          {currentView === 'dashboard' && (
            <DashboardHome
              onNavigate={setCurrentView}
              onNewReport={startNewReport}
              report={reportData}
              hasLiveReport={!!reportData}
            />
          )}

          {currentView === 'calculator' && (
            <div className="max-w-7xl mx-auto">
              <SchemeCalculator margin={margin} onNavigate={setCurrentView} />
            </div>
          )}

          {currentView === 'feasibility' && (
            <div className="max-w-7xl mx-auto">
              {showWizard ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <button
                      onClick={() => setShowWizard(false)}
                      className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors"
                    >
                      <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <div>
                      <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface font-bold">New Feasibility Analysis</h2>
                      <p className="font-body-md text-body-md text-on-surface-variant">Tell us where and what you want to build — we handle the rest.</p>
                    </div>
                  </div>
                  <InputWizard
                    t={{
                      title: 'Feasibility Analysis',
                      locationLabel: '📍 Your Location',
                      locationPlaceholder: 'e.g., Akola, Maharashtra',
                      locationHint: 'Include village, block/tehsil, district and state for accuracy.',
                      capitalLabel: '💰 Your Available Margin Capital',
                      capitalHint: 'Your own money — the scheme funds up to 90% of project cost.',
                      projectCost: 'Total Project Cost',
                      loanAmount: 'Government Loan',
                      yourCapital: 'Your Capital',
                      categoryLabel: '🏪 Select Your Business Category',
                      generate: 'Generate Feasibility Report',
                      generating: 'Analysing…',
                      back: '← Back',
                      next: 'Continue →',
                    }}
                    onSubmit={handleGenerateReport}
                    loading={isGenerating}
                    onCancel={() => setShowWizard(false)}
                  />
                </div>
              ) : (
                <MarketReport
                  report={reportData || DEFAULT_FEASIBILITY_REPORT}
                  onReset={() => setShowWizard(true)}
                  onGoHome={() => setCurrentView('dashboard')}
                  onGoToHistory={() => setCurrentView('history')}
                  onNewReport={() => setShowWizard(true)}
                />
              )}
            </div>
          )}

          {currentView === 'history' && (
            <div className="max-w-7xl mx-auto">
              <LoanHistory onNavigate={setCurrentView} />
            </div>
          )}

          {currentView === 'market' && (
            <div className="max-w-7xl mx-auto">
              <MarketPrices />
            </div>
          )}

          {currentView === 'weather' && (
            <div className="max-w-7xl mx-auto">
              <WeatherRisk locationText={locationText} />
            </div>
          )}

          {currentView === 'settings' && (
            <div className="max-w-7xl mx-auto">
              <Settings
                userLanguage={userLanguage}
                setUserLanguage={setLanguage}
                locationText={locationText}
                languages={SUPPORTED_LANGUAGES}
                onLogout={onLogout}
              />
            </div>
          )}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-container-lowest border-t border-surface-variant shadow-[0_-2px_10px_rgba(0,0,0,0.05)] flex justify-around items-center px-1 pb-[env(safe-area-inset-bottom)]">
        {MOBILE_NAV.map(item => (
          <button
            key={item.id}
            onClick={() => setCurrentView(item.id)}
            className={`flex-1 min-w-0 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors ${
              currentView === item.id ? 'text-primary' : 'text-on-surface-variant'
            }`}
          >
            <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: currentView === item.id ? "'FILL' 1" : "'FILL' 0" }}>{item.icon}</span>
            <span className="font-label-sm text-label-sm truncate max-w-full">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Voice assistant overlay + FAB */}
      <FloatingVoiceAgent onNavigate={setCurrentView} setMargin={setMargin} />
    </div>
  );
}
