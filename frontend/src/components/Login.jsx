import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { login, signup } from '../hooks/auth';

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

const INPUT_CLASS =
  'w-full pl-12 pr-4 py-4 min-h-[56px] bg-surface-container-lowest border border-outline-variant rounded-xl ' +
  'text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary ' +
  'transition-colors font-body-md';

export default function Login({ onAuthenticated }) {
  const { t, i18n } = useTranslation();

  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const isSignup = mode === 'signup';

  const switchMode = (next) => {
    setMode(next);
    setError(null);
    setPassword('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setError('Enter your 10-digit mobile number.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (isSignup && !name.trim()) {
      setError('Enter your name.');
      return;
    }

    setIsLoading(true);
    try {
      const user = isSignup
        ? await signup({ phone: digits, password, name: name.trim(), profile: { language: i18n.language } })
        : await login({ phone: digits, password });
      onAuthenticated(user);
    } catch (err) {
      // The server writes these messages for the user, so show them as-is.
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-6 sm:py-12 px-4 sm:px-6 lg:px-8 font-body-md text-on-surface">
      <div className="max-w-4xl w-full mx-auto grid grid-cols-1 md:grid-cols-2 rounded-3xl overflow-hidden shadow-2xl bg-surface-container-lowest border border-surface-variant">

        {/* Left: photo carousel (desktop) */}
        <div className="hidden md:flex flex-col justify-between p-12 relative overflow-hidden bg-primary text-on-primary">
          <LoginGallery className="absolute inset-0 w-full h-full opacity-35" />
          <div className="absolute inset-0 bg-gradient-to-t from-primary/95 via-primary/65 to-primary/40 pointer-events-none" />

          <div className="relative z-10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-on-primary flex items-center justify-center text-primary shadow-sm">
              <span className="material-symbols-outlined text-[24px]">eco</span>
            </div>
            <span className="font-headline-lg text-headline-lg font-bold tracking-tight">{t('login.brand_name')}</span>
          </div>
          <div className="relative z-10 space-y-4">
            <p className="font-body-lg text-body-lg opacity-95 max-w-md">{t('login.brand_tagline')}</p>
            <div className="flex items-center gap-2 text-xs opacity-75">
              <span className="material-symbols-outlined text-[16px]">photo_camera</span>
              {t('login.photo_credit')}
            </div>
          </div>
        </div>

        {/* Right: the form */}
        <div className="flex flex-col justify-center p-6 md:p-12 bg-surface relative z-10">

          <div className="md:hidden mb-8">
            <LoginGallery className="w-full h-44 rounded-2xl" />
          </div>

          <div className="md:hidden flex items-center justify-center gap-2 mb-8">
            <span className="material-symbols-outlined text-3xl text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
            <span className="font-headline-md text-headline-md font-bold tracking-tight text-primary">{t('login.brand_name')}</span>
          </div>

          <div className="max-w-md w-full mx-auto">
            <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface mb-2">
              {isSignup ? 'Create your account' : t('login.welcome_back')}
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant mb-8">
              {isSignup
                ? 'Your loans, harvests and reports stay private to this account.'
                : t('login.login_prompt')}
            </p>

            <form onSubmit={handleSubmit} className="space-y-6">
              {isSignup && (
                <div>
                  <label className="block font-label-lg text-label-lg text-on-surface mb-2" htmlFor="name">
                    Your name
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <span className="material-symbols-outlined text-on-surface-variant">badge</span>
                    </span>
                    <input
                      id="name"
                      type="text"
                      autoComplete="name"
                      placeholder="Ramesh Kumar"
                      className={INPUT_CLASS}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-label-lg text-label-lg text-on-surface mb-2" htmlFor="phone">
                  Mobile number
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="material-symbols-outlined text-on-surface-variant">smartphone</span>
                  </span>
                  <input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={14}
                    placeholder="98765 43210"
                    className={INPUT_CLASS}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-label-lg text-label-lg text-on-surface mb-2" htmlFor="password">
                  {t('login.password_label')}
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="material-symbols-outlined text-on-surface-variant">lock</span>
                  </span>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={isSignup ? 'new-password' : 'current-password'}
                    placeholder={isSignup ? 'At least 6 characters' : t('login.password_placeholder')}
                    className={`${INPUT_CLASS} pr-12`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-on-surface-variant hover:text-primary transition-colors"
                  >
                    <span className="material-symbols-outlined">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 px-4 py-3 rounded-xl bg-error-container/20 text-on-error-container font-body-md text-body-md"
                >
                  <span className="material-symbols-outlined text-[20px]">error</span>
                  {error}
                </div>
              )}

              <button
                disabled={isLoading}
                type="submit"
                className="w-full min-h-[56px] bg-primary hover:bg-surface-tint text-on-primary font-label-lg text-label-lg rounded-xl shadow-sm hover:shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:active:scale-100"
              >
                {isLoading ? (
                  <span className="material-symbols-outlined animate-spin">progress_activity</span>
                ) : (
                  <>
                    {isSignup ? 'Create account' : t('login.login_button')}
                    <span className="material-symbols-outlined">arrow_forward</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 text-center">
              <p className="font-body-md text-body-md text-on-surface-variant">
                {isSignup ? 'Already have an account?' : t('login.no_account')}
                <button
                  type="button"
                  onClick={() => switchMode(isSignup ? 'login' : 'signup')}
                  className="font-label-lg text-label-lg text-primary hover:text-primary-container transition-colors ml-1"
                >
                  {isSignup ? t('login.login_button') : t('login.sign_up')}
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
