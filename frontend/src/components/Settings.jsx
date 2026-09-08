import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

const PROFILE_AVATAR = `${import.meta.env.BASE_URL}images/profile-ramesha.jpg`;

export default function Settings({ userLanguage, setUserLanguage, locationText, languages, onLogout, userProfile, onOpenKyc }) {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState({ smsAlerts: true, emailAlerts: false, voiceAssistant: true, marketTrends: true });
  const [toast, setToast] = useState(null);
  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'));

  const showToast = (msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  };

  const toggleDarkMode = () => {
    const nextDark = !darkMode;
    setDarkMode(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const togglePref = (key) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const PreferenceRow = ({ title, desc, checked, onChange }) => (
    <div className="flex items-center justify-between gap-4 py-4">
      <div>
        <p className="font-label-lg text-label-lg text-on-surface font-semibold">{title}</p>
        <p className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">{desc}</p>
      </div>
      <button
        onClick={onChange}
        aria-pressed={checked}
        className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${checked ? 'bg-primary' : 'bg-outline-variant'}`}
      >
        <span
          className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${checked ? 'left-6' : 'left-1'}`}
        />
      </button>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-stack-gap">
      <div className="mb-6">
        <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface font-bold">{t('settings.title')}</h2>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">{t('settings.subtitle')}</p>
      </div>

      {/* Profile Card */}
      <div className="bg-surface-container-lowest rounded-2xl p-6 md:p-8 shadow-sm border border-surface-variant">
        <h3 className="font-headline-md text-headline-md text-on-surface mb-6">{t('settings.profile_title')}</h3>
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <img alt={userProfile?.name || 'Profile'} className="w-20 h-20 rounded-full object-cover shadow-sm" src={PROFILE_AVATAR} />
          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <p className="font-headline-md text-headline-md text-on-surface font-bold">{userProfile?.name || t('settings.name')}</p>
              {userProfile?.kycVerified && (
                <span className="material-symbols-outlined text-primary text-[20px]" title="KYC Verified">verified</span>
              )}
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant">{t('settings.district')}</p>
            <p className="font-body-md text-body-md text-on-surface-variant">{t('settings.mobile')}</p>
            <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-4">
              {userProfile?.kycVerified ? (
                <span className="px-3 py-1 bg-primary/10 text-primary rounded-full font-label-sm text-label-sm border border-primary/20 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span> KYC Verified
                </span>
              ) : (
                <span className="px-3 py-1 bg-error-container text-on-error-container rounded-full font-label-sm text-label-sm flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">warning</span> KYC Pending
                </span>
              )}
              <span className="px-3 py-1 bg-surface-container text-on-surface-variant rounded-full font-label-sm text-label-sm border border-outline-variant">{t('settings.badge_farmer')}</span>
            </div>
          </div>
          <div className="flex flex-col gap-3 w-full sm:w-auto">
            {!userProfile?.kycVerified && (
              <button
                onClick={onOpenKyc}
                className="w-full flex items-center justify-center gap-2 bg-error text-on-error px-6 py-3 rounded-xl font-label-lg text-label-lg shadow-sm hover:shadow-md transition-shadow min-h-[48px]"
              >
                <span className="material-symbols-outlined text-sm">assignment_ind</span> Complete KYC
              </button>
            )}
            <button
              onClick={() => showToast(t('settings.saved_toast'))}
              className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-label-lg text-label-lg min-h-[48px] ${
                !userProfile?.kycVerified 
                  ? 'bg-surface-container text-on-surface hover:bg-surface-container-high' 
                  : 'bg-primary text-on-primary shadow-sm hover:shadow-xl transition-shadow'
              }`}
            >
              <span className="material-symbols-outlined text-sm">edit</span> {t('settings.edit_profile')}
            </button>
          </div>
        </div>
      </div>

      {/* Language Card */}
      <div className="bg-surface-container-lowest rounded-2xl p-6 md:p-8 shadow-sm border border-surface-variant">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-primary">translate</span>
          <h3 className="font-headline-md text-headline-md text-on-surface">{t('settings.language_title')}</h3>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant mb-6">{t('settings.language_desc')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                setUserLanguage(lang.code);
                showToast(`Language set to ${lang.name}.`);
              }}
              className={`px-4 py-3 rounded-xl font-label-lg text-label-lg border transition-all ${
                userLanguage === lang.code
                  ? 'bg-primary text-on-primary border-primary shadow-sm'
                  : 'bg-surface text-on-surface-variant border-outline-variant hover:bg-surface-container'
              }`}
            >
              {lang.name}
            </button>
          ))}
        </div>
      </div>

      {/* Preferences Card */}
      <div className="bg-surface-container-lowest rounded-2xl p-6 md:p-8 shadow-sm border border-surface-variant">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-primary">notifications</span>
          <h3 className="font-headline-md text-headline-md text-on-surface">{t('settings.preferences_title')}</h3>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant mb-4">{t('settings.preferences_desc')}</p>
        <div className="divide-y divide-surface-variant">
          <PreferenceRow title="Dark Mode" desc="Enable high-contrast dark theme" checked={darkMode} onChange={toggleDarkMode} />
          <PreferenceRow title={t('settings.sms_alerts')} desc={t('settings.sms_alerts_desc')} checked={prefs.smsAlerts} onChange={() => togglePref('smsAlerts')} />
          <PreferenceRow title={t('settings.email_alerts')} desc={t('settings.email_alerts_desc')} checked={prefs.emailAlerts} onChange={() => togglePref('emailAlerts')} />
          <PreferenceRow title={t('settings.voice_assistant')} desc={t('settings.voice_assistant_desc')} checked={prefs.voiceAssistant} onChange={() => togglePref('voiceAssistant')} />
          <PreferenceRow title={t('settings.market_trends')} desc={t('settings.market_trends_desc')} checked={prefs.marketTrends} onChange={() => togglePref('marketTrends')} />
        </div>
      </div>

      {/* About + Logout */}
      <div className="bg-surface-container-lowest rounded-2xl p-6 md:p-8 shadow-sm border border-surface-variant flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <p className="font-label-lg text-label-lg text-on-surface font-semibold">FinGrow Advisory</p>
          <p className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">Version 1.0.0 • Built for Smart India Hackathon</p>
          <p className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">Location: {locationText}</p>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-label-lg text-label-lg text-error bg-error-container/20 hover:bg-error-container/40 transition-colors min-h-[48px]"
        >
          <span className="material-symbols-outlined text-sm">logout</span> {t('nav.sign_out')}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[80] bg-on-surface text-inverse-on-surface px-5 py-3 rounded-xl shadow-xl font-label-lg text-label-lg flex items-center gap-2 animate-in">
          <span className="material-symbols-outlined text-sm">info</span>
          {toast}
        </div>
      )}
    </div>
  );
}