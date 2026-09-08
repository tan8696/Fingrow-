import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export default function OnboardingWizard({ onComplete }) {
  const { t, i18n } = useTranslation();
  const [selectedRole, setSelectedRole] = useState(null);
  const [gender, setGender] = useState('');
  const [socialCategory, setSocialCategory] = useState('');
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

  const GENDER_OPTIONS = [
    { id: 'male',   label: userLanguage === 'hi' ? 'पुरुष' : userLanguage === 'mr' ? 'पुरुष' : 'Male',   icon: '👨' },
    { id: 'female', label: userLanguage === 'hi' ? 'महिला' : userLanguage === 'mr' ? 'महिला' : 'Female', icon: '👩' },
    { id: 'other',  label: userLanguage === 'hi' ? 'अन्य'  : userLanguage === 'mr' ? 'इतर'   : 'Other',  icon: '🧑' },
  ];

  const SC_OPTIONS = [
    { id: 'general', label: userLanguage === 'hi' ? 'सामान्य'  : userLanguage === 'mr' ? 'सामान्य'  : 'General' },
    { id: 'obc',     label: 'OBC' },
    { id: 'sc_st',   label: 'SC / ST' },
  ];

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
              {/* Name Input */}
              <div className="mb-6">
                <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold block mb-2">
                  {userLanguage === 'hi' ? 'पूरा नाम' : userLanguage === 'mr' ? 'पूर्ण नाव' : 'Full Name'}
                </label>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder={userLanguage === 'hi' ? 'अपना नाम दर्ज करें' : userLanguage === 'mr' ? 'तुमचे नाव प्रविष्ट करा' : 'Enter your name'}
                  className="w-full px-4 py-3 rounded-xl border border-outline-variant bg-surface text-on-surface font-body-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-shadow"
                />
              </div>

              {/* Role selection */}
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

              {/* Optional demographics for subsidy matching */}
              {selectedRole && (
                <div className="mt-6 p-5 rounded-2xl bg-surface-container-low border border-outline-variant animate-in">
                  <p className="font-label-sm text-label-sm text-on-surface-variant mb-1 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-primary">tune</span>
                    {userLanguage === 'hi' ? 'बेहतर योजना सिफारिशों के लिए (वैकल्पिक)' :
                     userLanguage === 'mr' ? 'अधिक चांगल्या योजना शिफारशींसाठी (ऐच्छिक)' :
                     'For better scheme recommendations (optional)'}
                  </p>

                  {/* Gender */}
                  <div className="mt-3">
                    <span className="font-label-sm text-[12px] text-on-surface-variant font-semibold block mb-2">
                      {userLanguage === 'hi' ? 'लिंग' : userLanguage === 'mr' ? 'लिंग' : 'Gender'}
                    </span>
                    <div className="flex gap-2">
                      {GENDER_OPTIONS.map(opt => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setGender(opt.id)}
                          className={`flex-1 py-2.5 rounded-xl text-center font-label-sm text-label-sm transition-all ${
                            gender === opt.id
                              ? 'bg-primary text-on-primary font-bold shadow-sm'
                              : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                          }`}
                        >
                          <span className="text-lg block mb-0.5">{opt.icon}</span>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Social Category */}
                  <div className="mt-3">
                    <span className="font-label-sm text-[12px] text-on-surface-variant font-semibold block mb-2">
                      {userLanguage === 'hi' ? 'सामाजिक वर्ग' : userLanguage === 'mr' ? 'सामाजिक वर्ग' : 'Social Category'}
                    </span>
                    <div className="flex gap-2">
                      {SC_OPTIONS.map(opt => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setSocialCategory(opt.id)}
                          className={`flex-1 py-2.5 rounded-xl text-center font-label-sm text-label-sm transition-all ${
                            socialCategory === opt.id
                              ? 'bg-primary text-on-primary font-bold shadow-sm'
                              : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className="mt-3 font-label-sm text-[11px] text-on-surface-variant flex items-start gap-1.5">
                    <span className="material-symbols-outlined text-[14px] shrink-0 mt-0.5">lock</span>
                    {userLanguage === 'hi' ? 'यह जानकारी केवल योजना मिलान के लिए है और कभी साझा नहीं की जाती।' :
                     userLanguage === 'mr' ? 'ही माहिती फक्त योजना जुळणीसाठी आहे आणि कधीही शेअर केली जात नाही.' :
                     'This information is only used for scheme matching and is never shared.'}
                  </p>
                </div>
              )}

              <div className="mt-8 flex justify-center">
                <button
                  disabled={!selectedRole || !userName.trim()}
                  onClick={() => onComplete({ name: userName.trim(), type: selectedRole, gender, socialCategory, kycVerified: false })}
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
