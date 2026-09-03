import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Real photographs of rural micro-businesses (downloaded from Wikimedia
// Commons — see public/images/ATTRIBUTION.txt for full credits & licenses).
const LOGIN_PHOTOS = [
  {
    src: `${import.meta.env.BASE_URL}images/login-teashop.jpg`,
    alt: 'A village tea shop in Kerala — a rural micro-business',
  },
  {
    src: `${import.meta.env.BASE_URL}images/login-vegetables.jpg`,
    alt: 'An elderly woman selling vegetables at a village bazaar',
  },
  {
    src: `${import.meta.env.BASE_URL}images/login-farmer.jpg`,
    alt: 'Farmers harvesting rice by hand in Raichur, Karnataka',
  },
];

function LoginGallery({ className }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % LOGIN_PHOTOS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={`relative overflow-hidden ${className}`} role="img" aria-label="Real photographs of rural micro-businesses in India">
      {LOGIN_PHOTOS.map((photo, i) => (
        <img
          key={photo.src}
          src={photo.src}
          alt={photo.alt}
          loading={i === 0 ? 'eager' : 'lazy'}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
            i === index ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ))}
    </div>
  );
}

export default function Login({ onLogin }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [otpMode, setOtpMode] = useState(false);
  const [otp, setOtp] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username && password) {
      setIsLoading(true);
      setTimeout(() => {
        setIsLoading(false);
        onLogin();
      }, 1000);
    }
  };

  const handleOtpSubmit = (e) => {
    e.preventDefault();
    if (otp.trim().length < 4) {
      setInfoMsg('Please enter the 4-digit OTP sent to your mobile.');
      return;
    }
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      onLogin();
    }, 800);
  };

  return (
    <div className="bg-background text-on-surface min-h-screen flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 bg-surface rounded-2xl overflow-hidden shadow-sm md:shadow-xl relative z-10">
        
        {/* Left Side: Real-Photo Gallery (scraped, non-AI images) */}
        <div className="hidden md:block relative h-full min-h-[600px] overflow-hidden bg-surface-container-high">
          <LoginGallery className="absolute inset-0 w-full h-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#06281c]/95 via-[#06281c]/30 to-transparent"></div>
          <div className="absolute bottom-10 left-10 right-10 text-on-primary">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
              <span className="font-headline-lg text-headline-lg font-bold tracking-tight">{t('login.brand_name')}</span>
            </div>
            <p className="font-body-lg text-body-lg opacity-95 max-w-md">{t('login.brand_tagline')}</p>
            <p className="mt-6 font-label-sm text-label-sm text-on-primary/70 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">photo_camera</span>
              {t('login.photo_credit')}
            </p>
          </div>
        </div>

        {/* Right Side: Login Form */}
        <div className="flex flex-col justify-center p-6 md:p-12 bg-surface relative z-10">
          
          {/* Mobile Photo Banner (real photos) */}
          <div className="md:hidden mb-8">
            <LoginGallery className="w-full h-44 rounded-2xl" />
          </div>

          {/* Mobile Brand Header */}
          <div className="md:hidden flex items-center justify-center gap-2 mb-8">
            <span className="material-symbols-outlined text-3xl text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
            <span className="font-headline-md text-headline-md font-bold tracking-tight text-primary">{t('login.brand_name')}</span>
          </div>

          <div className="max-w-md w-full mx-auto">
            <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface mb-2">{t('login.welcome_back')}</h1>
            <p className="font-body-md text-body-md text-on-surface-variant mb-8">{t('login.login_prompt')}</p>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* Input: Mobile / Email */}
              <div>
                <label className="block font-label-lg text-label-lg text-on-surface mb-2" htmlFor="identifier">{t('login.identifier_label')}</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="material-symbols-outlined text-on-surface-variant">person</span>
                  </span>
                  <input 
                    id="identifier" 
                    type="text" 
                    placeholder={t('login.identifier_placeholder')}
                    className="w-full pl-12 pr-4 py-4 min-h-[56px] bg-surface-container-lowest border border-outline-variant rounded-xl text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary transition-colors font-body-md"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Input: Password */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block font-label-lg text-label-lg text-on-surface" htmlFor="password">{t('login.password_label')}</label>
                  <button
                    type="button"
                    onClick={() => {
                      setOtpMode(false);
                      setInfoMsg('Password reset link sent to your registered mobile number.');
                    }}
                    className="font-label-lg text-label-lg text-primary hover:text-primary-container transition-colors"
                  >{t('login.forgot_password')}</button>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="material-symbols-outlined text-on-surface-variant">lock</span>
                  </span>
                  <input 
                    id="password" 
                    type="password" 
                    placeholder={t('login.password_placeholder')}
                    className="w-full pl-12 pr-12 py-4 min-h-[56px] bg-surface-container-lowest border border-outline-variant rounded-xl text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary transition-colors font-body-md"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setInfoMsg('Password visible (demo mode).')}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-on-surface-variant hover:text-primary transition-colors"
                  >
                    <span className="material-symbols-outlined">visibility</span>
                  </button>
                </div>
              </div>

              {/* Checkbox: Remember Me */}
              <div className="flex items-center">
                <input id="remember" type="checkbox" className="w-5 h-5 rounded border-outline-variant text-primary focus:ring-primary bg-surface-container-lowest" />
                <label htmlFor="remember" className="ml-3 font-body-md text-body-md text-on-surface-variant">{t('login.remember_me')}</label>
              </div>

              {/* Actions */}
              <div className="space-y-4 pt-2">
                <button disabled={isLoading} type="submit" className="w-full min-h-[56px] bg-primary hover:bg-surface-tint text-on-primary font-label-lg text-label-lg rounded-xl shadow-sm hover:shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:active:scale-100">
                  {isLoading ? (
                    <span className="material-symbols-outlined animate-spin">progress_activity</span>
                  ) : (
                    <>
                      {t('login.login_button')}
                      <span className="material-symbols-outlined">arrow_forward</span>
                    </>
                  )}
                </button>
                
                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-outline-variant"></div>
                  <span className="flex-shrink-0 mx-4 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">{t('login.or')}</span>
                  <div className="flex-grow border-t border-outline-variant"></div>
                </div>
                
                {otpMode ? (
                  <form onSubmit={handleOtpSubmit} className="space-y-3">
                    <div className="flex gap-3">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength="4"
                        placeholder={t('login.otp_placeholder')}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                        className="flex-1 px-4 py-4 min-h-[56px] bg-surface-container-lowest border border-outline-variant rounded-xl text-on-surface text-center font-headline-lg text-headline-lg focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="min-h-[56px] px-6 bg-primary hover:bg-surface-tint text-on-primary font-label-lg text-label-lg rounded-xl shadow-sm hover:shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70"
                      >
                        {isLoading ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : t('login.verify_button')}
                      </button>
                    </div>
                    <button type="button" onClick={() => setOtpMode(false)} className="font-label-sm text-label-sm text-on-surface-variant hover:text-primary transition-colors">
                      {t('login.back_to_password')}
                    </button>
                  </form>
                ) : (
                  <button type="button" onClick={() => { setOtpMode(true); setInfoMsg('OTP sent to +91 98765 43210 (demo). Use any 4 digits to log in.'); }} className="w-full min-h-[56px] bg-surface-container text-on-surface font-label-lg text-label-lg border border-outline-variant rounded-xl hover:bg-surface-container-high transition-colors active:scale-[0.98] flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined">sms</span>
                    {t('login.login_with_otp')}
                  </button>
                )}
              </div>
            </form>

            <div className="mt-8 text-center">
              <p className="font-body-md text-body-md text-on-surface-variant">
                {t('login.no_account')} 
                <button
                  type="button"
                  onClick={() => setInfoMsg('Sign-up is available at your nearest Common Service Centre (demo).')}
                  className="font-label-lg text-label-lg text-primary hover:text-primary-container transition-colors ml-1"
                >{t('login.sign_up')}</button>
              </p>
              {infoMsg && (
                <div className="mt-4 bg-surface-container-low border border-outline-variant rounded-xl px-4 py-3 font-label-sm text-label-sm text-on-surface-variant animate-in">
                  {infoMsg}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
