import React from 'react';

/**
 * The band government portals put above page content: a breadcrumb trail and
 * the section's title, so a citizen always knows where in the service they are
 * and how to get back.
 */

const SECTIONS = {
  dashboard: {
    title: 'Dashboard',
    hindi: 'डैशबोर्ड',
    blurb: 'Your applications, repayments and advisories at a glance.',
  },
  feasibility: {
    title: 'Feasibility Reports',
    hindi: 'व्यवहार्यता रिपोर्ट',
    blurb: 'Assess a business idea against local market and scheme criteria.',
  },
  history: {
    title: 'Loan Management & History',
    hindi: 'ऋण प्रबंधन एवं इतिहास',
    blurb: 'Track applications, sanctioned loans and repayment schedules.',
  },
  market: {
    title: 'Live Mandi Prices',
    hindi: 'मंडी भाव',
    blurb: 'Daily APMC arrivals published through AGMARKNET.',
  },
  weather: {
    title: 'Weather & Crop Risk',
    hindi: 'मौसम एवं फसल जोखिम',
    blurb: 'District forecast, spray windows and parametric insurance triggers.',
  },
  calculator: {
    title: 'Scheme Calculator',
    hindi: 'योजना कैलकुलेटर',
    blurb: 'Work out eligibility, subsidy and instalments under each scheme.',
  },
  settings: {
    title: 'Settings',
    hindi: 'सेटिंग्स',
    blurb: 'Profile, language preference and notification options.',
  },
};

export default function GovPageHeader({ view, onNavigate }) {
  const section = SECTIONS[view] || SECTIONS.dashboard;
  const isHome = view === 'dashboard';

  return (
    <div className="bg-surface-container-lowest border-b border-outline-variant -mx-2 sm:-mx-4 md:-mx-8 px-4 md:px-8 py-4 mb-6">
      <nav aria-label="Breadcrumb" className="mb-2">
        <ol className="flex flex-wrap items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
          <li>
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="inline-flex items-center gap-1 hover:text-primary hover:underline transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">home</span>
              Home
            </button>
          </li>
          {!isHome && (
            <>
              <li aria-hidden="true" className="text-outline">/</li>
              <li aria-current="page" className="text-on-surface font-semibold">
                {section.title}
              </li>
            </>
          )}
        </ol>
      </nav>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="gov-section-title font-headline-md text-[20px] md:text-[24px] font-bold text-primary">
          {section.title}
        </h1>
        <span className="font-body-md text-body-md text-on-surface-variant">{section.hindi}</span>
      </div>
      <p className="font-body-md text-body-md text-on-surface-variant mt-1">{section.blurb}</p>
    </div>
  );
}
