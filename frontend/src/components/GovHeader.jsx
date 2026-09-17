import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FONT_STEPS,
  applyAccessibility,
  getFontScale,
  getHighContrast,
  stepFontScale,
  toggleHighContrast,
} from '../hooks/accessibility';

/**
 * The masthead Indian government portals share: a dark utility strip carrying
 * accessibility and language controls, then the portal identity beneath it.
 *
 * This is a Smart India Hackathon prototype, not a live government service, and
 * the utility strip says so rather than borrowing an emblem or a ministry name
 * it has no right to.
 */

const LANGUAGES = [
  { code: 'en', short: 'EN', label: 'English' },
  { code: 'hi', short: 'हिं', label: 'हिन्दी' },
  { code: 'mr', short: 'मरा', label: 'मराठी' },
  { code: 'bn', short: 'বাং', label: 'বাংলা' },
  { code: 'te', short: 'తెలు', label: 'తెలుగు' },
  { code: 'ta', short: 'தமி', label: 'தமிழ்' },
  { code: 'gu', short: 'ગુજ', label: 'ગુજરાતી' },
  { code: 'kn', short: 'ಕನ್ನ', label: 'ಕನ್ನಡ' },
  { code: 'ml', short: 'മല', label: 'മലയാളം' },
  { code: 'pa', short: 'ਪੰਜਾ', label: 'ਪੰਜਾਬੀ' },
  { code: 'or', short: 'ଓଡ଼ି', label: 'ଓଡ଼ିଆ' },
];

export default function GovHeader({ compact = false }) {
  const { i18n } = useTranslation();
  const [scale, setScale] = useState(getFontScale);
  const [contrast, setContrast] = useState(getHighContrast);
  const [langOpen, setLangOpen] = useState(false);
  const shellRef = useRef(null);

  useEffect(() => {
    applyAccessibility();
  }, []);

  // The dashboard's sidebar and header are viewport-fixed, so they need to know
  // how tall this masthead is. Measured rather than hardcoded because the
  // utility strip wraps on narrow screens and at larger text sizes.
  useEffect(() => {
    const node = shellRef.current;
    if (!node) return undefined;

    const publish = () => {
      document.documentElement.style.setProperty('--gov-header-h', `${node.offsetHeight}px`);
    };
    publish();

    const observer = new ResizeObserver(publish);
    observer.observe(node);
    window.addEventListener('resize', publish);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', publish);
    };
  }, [compact]);

  const atMin = scale === FONT_STEPS[0];
  const atMax = scale === FONT_STEPS[FONT_STEPS.length - 1];
  const current = LANGUAGES.find((l) => l.code === (i18n.language || 'en')) || LANGUAGES[0];

  return (
    <header ref={shellRef} className="w-full sticky top-0 z-[60]">
      {/* Utility strip */}
      <div className="bg-[#22303f] text-white">
        <div className="max-w-[1400px] mx-auto px-4 flex flex-wrap items-center justify-between gap-2 py-1.5 text-[12px]">
          <div className="flex items-center gap-3">
            {/* Deliberately not "Government of India": this is a proposal, and
                a cropped screenshot should not read as a live GoI service. */}
            <span className="hidden sm:inline opacity-90">
              प्रस्तावित डिजिटल लोक सेवा&nbsp;·&nbsp;Proposed Digital Public Service
            </span>
            <span className="sm:hidden opacity-90">प्रस्तावित लोक सेवा</span>
            <span className="px-1.5 py-0.5 rounded bg-[#ff9933] text-[#301900] font-semibold tracking-wide">
              SIH PROTOTYPE
            </span>
          </div>

          <div className="flex items-center gap-1">
            <a
              href="#main-content"
              className="px-2 py-1 rounded hover:bg-white/15 focus:bg-white/20 transition-colors"
            >
              Skip to main content
            </a>

            <span className="w-px h-4 bg-white/25 mx-1" aria-hidden="true" />

            <div className="flex items-center" role="group" aria-label="Text size">
              <button
                type="button"
                onClick={() => setScale(stepFontScale(-1))}
                disabled={atMin}
                aria-label="Decrease text size"
                className="w-7 h-7 rounded hover:bg-white/15 disabled:opacity-40 transition-colors"
              >
                A<span className="text-[9px] align-super">−</span>
              </button>
              <button
                type="button"
                onClick={() => setScale(stepFontScale(0) || 1)}
                aria-label="Reset text size"
                className="w-7 h-7 rounded hover:bg-white/15 transition-colors"
              >
                A
              </button>
              <button
                type="button"
                onClick={() => setScale(stepFontScale(1))}
                disabled={atMax}
                aria-label="Increase text size"
                className="w-7 h-7 rounded hover:bg-white/15 disabled:opacity-40 transition-colors"
              >
                A<span className="text-[9px] align-super">+</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setContrast(toggleHighContrast())}
              aria-pressed={contrast}
              aria-label="Toggle high contrast"
              className={`w-7 h-7 rounded transition-colors ${
                contrast ? 'bg-[#ff9933] text-[#301900]' : 'hover:bg-white/15'
              }`}
              title="High contrast"
            >
              ◐
            </button>

            <span className="w-px h-4 bg-white/25 mx-1" aria-hidden="true" />

            <div className="relative">
              <button
                type="button"
                onClick={() => setLangOpen((v) => !v)}
                aria-expanded={langOpen}
                aria-haspopup="listbox"
                className="px-2 py-1 rounded hover:bg-white/15 transition-colors flex items-center gap-1"
              >
                <span aria-hidden="true">🌐</span>
                {current.label}
                <span aria-hidden="true" className="text-[9px]">▼</span>
              </button>
              {langOpen && (
                <ul
                  role="listbox"
                  className="absolute right-0 top-full mt-1 z-50 min-w-[160px] py-1 rounded-md bg-white text-[#1a1a1a] shadow-xl border border-[#c3cedb] max-h-[60vh] overflow-auto"
                >
                  {LANGUAGES.map((lang) => (
                    <li key={lang.code}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={lang.code === current.code}
                        onClick={() => {
                          i18n.changeLanguage(lang.code);
                          setLangOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 hover:bg-[#eef1f6] transition-colors ${
                          lang.code === current.code ? 'font-bold text-[#123a6d]' : ''
                        }`}
                      >
                        {lang.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tricolour rule — the one flourish these portals all share */}
      <div className="h-[3px] w-full flex" aria-hidden="true">
        <div className="flex-1 bg-[#ff9933]" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-[#138808]" />
      </div>

      {/* Portal identity */}
      {!compact && (
        <div className="bg-white border-b border-[#c3cedb]">
          <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-full bg-[#123a6d] text-white flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[26px]">agriculture</span>
              </div>
              <div className="min-w-0">
                <p className="font-bold text-[#123a6d] text-[15px] sm:text-[19px] leading-tight truncate">
                  FinGrow&nbsp;·&nbsp;Rural Enterprise Finance Portal
                </p>
                <p className="text-[11px] sm:text-[13px] text-[#41505f] leading-tight truncate">
                  ग्रामीण उद्यम वित्त पोर्टल&nbsp;·&nbsp;Scheme eligibility, credit structuring and agro-advisory
                </p>
              </div>
            </div>

            <div className="hidden lg:flex items-center gap-4 shrink-0 text-[11px] text-[#41505f] text-right">
              <div className="px-3 py-1.5 rounded border border-[#c3cedb] bg-[#f7f9fc]">
                <p className="font-semibold text-[#123a6d]">Digital India</p>
                <p>Power to Empower</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
