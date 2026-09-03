import React, { useState } from 'react';

const PROFILE_AVATAR = `${import.meta.env.BASE_URL}images/profile-ramesha.jpg`;

export default function Settings({ userLanguage, setUserLanguage, locationText, languages, onLogout }) {
  const [prefs, setPrefs] = useState({ smsAlerts: true, emailAlerts: false, voiceAssistant: true, marketTrends: true });
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
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
        <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface font-bold">Settings</h2>
        <p className="font-body-md text-body-md text-on-surface-variant mt-1">Manage your profile, language preferences, and notifications.</p>
      </div>

      {/* Profile Card */}
      <div className="bg-surface-container-lowest rounded-2xl p-6 md:p-8 shadow-sm border border-surface-variant">
        <h3 className="font-headline-md text-headline-md text-on-surface mb-6">Profile</h3>
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <img alt="Entrepreneur Profile" className="w-20 h-20 rounded-full object-cover shadow-sm" src={PROFILE_AVATAR} />
          <div className="flex-1 text-center sm:text-left">
            <p className="font-headline-md text-headline-md text-on-surface font-bold">Ramesh Kumar</p>
            <p className="font-body-md text-body-md text-on-surface-variant">District: Vidarbha, Maharashtra</p>
            <p className="font-body-md text-body-md text-on-surface-variant">Mobile: +91 98765 43210</p>
            <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-4">
              <span className="px-3 py-1 bg-primary/10 text-primary rounded-full font-label-sm text-label-sm border border-primary/20">Kisan Credit Card Holder</span>
              <span className="px-3 py-1 bg-surface-container text-on-surface-variant rounded-full font-label-sm text-label-sm border border-outline-variant">Verified Farmer</span>
            </div>
          </div>
          <button
            onClick={() => showToast('Profile details saved (demo).')}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary text-on-primary px-6 py-3 rounded-xl font-label-lg text-label-lg shadow-sm hover:shadow-xl transition-shadow min-h-[48px]"
          >
            <span className="material-symbols-outlined text-sm">edit</span> Edit Profile
          </button>
        </div>
      </div>

      {/* Language Card */}
      <div className="bg-surface-container-lowest rounded-2xl p-6 md:p-8 shadow-sm border border-surface-variant">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-primary">translate</span>
          <h3 className="font-headline-md text-headline-md text-on-surface">Language</h3>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant mb-6">Reports and advisory responses will be delivered in your preferred language.</p>
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
          <h3 className="font-headline-md text-headline-md text-on-surface">Preferences</h3>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant mb-4">Control how FinGrow Advisory keeps you informed.</p>
        <div className="divide-y divide-surface-variant">
          <PreferenceRow title="SMS Alerts" desc="Loan status and repayment reminders via SMS" checked={prefs.smsAlerts} onChange={() => togglePref('smsAlerts')} />
          <PreferenceRow title="Email Alerts" desc="Monthly statements and scheme updates by email" checked={prefs.emailAlerts} onChange={() => togglePref('emailAlerts')} />
          <PreferenceRow title="Voice Assistant" desc="Enable the voice assistant across the app" checked={prefs.voiceAssistant} onChange={() => togglePref('voiceAssistant')} />
          <PreferenceRow title="Market Trend Updates" desc="Daily price alerts for tracked commodities" checked={prefs.marketTrends} onChange={() => togglePref('marketTrends')} />
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
          <span className="material-symbols-outlined text-sm">logout</span> Log Out
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