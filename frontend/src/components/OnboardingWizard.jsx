import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export default function OnboardingWizard({ onComplete }) {
  const { t, i18n } = useTranslation();
  const [selectedRole, setSelectedRole] = useState(null);
  const [userLanguage, setUserLanguage] = useState(i18n.language || 'en');

  useEffect(() => {
    const handleLangChange = (e) => {
      const code = e.detail;
      setUserLanguage(code);
      i18n.changeLanguage(code);
    };
    window.addEventListener('change-language', handleLangChange);
    return () => window.removeEventListener('change-language', handleLangChange);
  }, [i18n]);

  const roles = [
    { id: 'farmer', icon: '🌾', label: t('onboarding.farmer_role'), desc: t('onboarding.farmer_desc') },
    { id: 'shop_owner', icon: '🏪', label: t('onboarding.shop_role'), desc: t('onboarding.shop_desc') },
  ];

  const setLanguage = (code) => {
    const evt = new CustomEvent('change-language', { detail: code });
    window.dispatchEvent(evt);
  };

  return (
    <div className="min-h-screen bg-surface-container-lowest flex flex-col font-body-md antialiased">
      {/* Top Header - Similar to Login */}
      <div className="absolute top-6 right-6 flex items-center bg-surface-container-low rounded-xl p-1 gap-1 border border-outline-variant shadow-sm z-50">
        {['en', 'mr', 'hi'].map(code => (
          <button
            key={code}
            onClick={() => setLanguage(code)}
            className={`px-3 py-1.5 rounded-lg font-label-sm text-label-sm transition-all ${
              userLanguage === code ? 'bg-primary text-on-primary font-bold shadow-sm' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
          >
            {code === 'en' ? 'EN' : code === 'mr' ? 'मराठी' : 'हिन्दी'}
          </button>
        ))}
      </div>

      <div className="flex-1 flex items-center justify-center p-4 fade-in-up">
        <div className="max-w-2xl w-full bg-surface rounded-3xl shadow-xl border border-outline-variant overflow-hidden">
          <div className="p-8 text-center bg-surface-container-low border-b border-outline-variant">
            <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-6 shadow-sm">
              <span className="material-symbols-outlined text-[32px] text-on-primary">eco</span>
            </div>
            <h1 className="font-headline-lg text-[28px] font-bold text-on-surface mb-2">{t('onboarding.title')}</h1>
            <p className="font-body-md text-on-surface-variant text-[16px] max-w-md mx-auto">{t('onboarding.subtitle')}</p>
          </div>

          <div className="p-6 md:p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {roles.map(role => (
                <button
                  key={role.id}
                  onClick={() => setSelectedRole(role.id)}
                  className={`p-6 rounded-2xl border-2 text-left transition-all ${
                    selectedRole === role.id 
                      ? 'border-primary bg-primary-container/30 ring-4 ring-primary/10' 
                      : 'border-outline-variant bg-surface hover:border-primary/40 hover:bg-surface-container-lowest shadow-sm'
                  }`}
                >
                  <span className="text-4xl block mb-4">{role.icon}</span>
                  <span className="block font-headline-md text-[18px] font-bold text-on-surface mb-2">{role.label}</span>
                  <span className="block font-body-md text-[14px] text-on-surface-variant leading-relaxed">{role.desc}</span>
                </button>
              ))}
            </div>

            <div className="mt-8 flex justify-center">
              <button
                disabled={!selectedRole}
                onClick={() => onComplete({ type: selectedRole })}
                className="w-full md:w-auto min-w-[240px] px-8 py-4 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg font-bold shadow-md hover:bg-primary-container hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {t('onboarding.continue')}
                <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
