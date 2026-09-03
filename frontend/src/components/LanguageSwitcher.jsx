import React from 'react';
import { useTranslation } from 'react-i18next';

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const changeLanguage = (e) => {
    i18n.changeLanguage(e.target.value);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="material-symbols-outlined text-on-surface-variant text-sm">language</span>
      <select
        value={i18n.language}
        onChange={changeLanguage}
        className="bg-surface-container-lowest border border-outline-variant text-on-surface font-label-md rounded-lg px-2 py-1 focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer transition-colors"
        aria-label="Select Language"
      >
        <option value="en">English</option>
        <option value="hi">हिंदी</option>
        <option value="mr">मराठी</option>
      </select>
    </div>
  );
}
