import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import hi from './locales/hi.json';
import mr from './locales/mr.json';
// Generated from en.json by scripts/translate-locales.py — see each file's _meta.
import ta from './locales/ta.json';
import te from './locales/te.json';
import bn from './locales/bn.json';
import gu from './locales/gu.json';
import kn from './locales/kn.json';
import ml from './locales/ml.json';
import pa from './locales/pa.json';
import or_ from './locales/or.json';

// Get saved language from localStorage or default to 'en'
const savedLanguage = localStorage.getItem('i18nextLng') || 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      mr: { translation: mr },
      ta: { translation: ta },
      te: { translation: te },
      bn: { translation: bn },
      gu: { translation: gu },
      kn: { translation: kn },
      ml: { translation: ml },
      pa: { translation: pa },
      or: { translation: or_ },
    },
    lng: savedLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
  });

// Save to localStorage whenever language changes
i18n.on('languageChanged', (lng) => {
  localStorage.setItem('i18nextLng', lng);
});

export default i18n;
