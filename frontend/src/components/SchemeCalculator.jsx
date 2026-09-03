import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ScenarioCalculator, { SUBSIDY_CAP, computeEMI } from './ScenarioCalculator';

// Scheme routing mirrors the backend engine (calculator.py):
// Micro Finance up to ₹1,40,000 project cost, Term Loan above that.
const SCHEMES = {
  micro: { name: 'Micro Finance Scheme', rate: 6.5, tenureMonths: 36 },
  term: { name: 'Term Loan Scheme', rate: 8.0, tenureMonths: 84 },
};

const clampCost = (cost) => Math.min(Math.max(Math.round(cost || 600000), 100000), 2500000);

function schemeForCost(cost) {
  return cost <= 140000 ? SCHEMES.micro : SCHEMES.term;
}

export default function SchemeCalculator({ margin, onNavigate }) {
  const { t } = useTranslation();
  // The farmer's own capital (from the wizard / voice assistant) seeds the
  // project cost via the scheme's 10% margin rule; every term is then editable.
  const seedCost = clampCost((margin || 50000) / 0.1);
  const seedScheme = schemeForCost(seedCost);

  const [projectCost, setProjectCost] = useState(seedCost);
  const [marginPercent, setMarginPercent] = useState(20);
  const [interestRate, setInterestRate] = useState(seedScheme.rate);
  const [tenureYears, setTenureYears] = useState(Math.round(seedScheme.tenureMonths / 12));
  const [subsidyPct, setSubsidyPct] = useState(25);

  // If the voice assistant supplies a new capital figure, re-seed only the cost
  // so the speaker's intent lands without clobbering the user's other tweaks.
  useEffect(() => {
    setProjectCost(clampCost((margin || 50000) / 0.1));
  }, [margin]);

  const scheme = schemeForCost(projectCost);
  const tenureMonths = tenureYears * 12;
  const marginAmount = (projectCost * marginPercent) / 100;
  const loanAmount = projectCost - marginAmount;
  const rawSubsidy = (projectCost * subsidyPct) / 100;
  const subsidyCapped = subsidyPct > 0 && rawSubsidy > SUBSIDY_CAP;
  const subsidyAmount = subsidyPct === 0 ? 0 : Math.min(rawSubsidy, SUBSIDY_CAP);
  const emi = computeEMI(loanAmount, interestRate, tenureMonths);

  const resetToSchemeDefaults = () => {
    const s = schemeForCost(projectCost);
    setInterestRate(s.rate);
    setTenureYears(Math.round(s.tenureMonths / 12));
    setSubsidyPct(25);
    setMarginPercent(20);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-stack-gap">
      <div className="flex items-center gap-4">
        <button
          onClick={() => onNavigate('dashboard')}
          className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-on-surface hover:bg-surface-container-high transition-colors"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="flex-1">
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile md:font-headline-lg md:text-headline-lg text-on-surface font-bold">{t('dashboard.calculator_nav')}</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">Every term is customisable — adjust any slider to model your own loan scenario.</p>
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-2xl p-6 md:p-8 shadow-sm border border-surface-variant">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-surface-variant">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="material-symbols-outlined text-primary text-2xl">calculate</span>
              <h3 className="font-headline-md text-headline-md text-on-surface font-bold">Project Investment &amp; Loan Requirement</h3>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Project cost {projectCost <= 140000 ? 'up to ₹1.4 Lakh' : 'above ₹1.4 Lakh'} routes you to the {scheme.name}.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-full font-label-sm text-label-sm font-semibold">
              <span className="material-symbols-outlined text-sm">verified</span>
              {scheme.name} Linked Calculator
            </div>
            <button
              onClick={resetToSchemeDefaults}
              className="inline-flex items-center gap-1.5 text-primary hover:text-primary-container font-label-sm text-label-sm font-semibold transition-colors group"
            >
              <span className="material-symbols-outlined text-sm transition-transform duration-300 group-hover:-rotate-90">restart_alt</span>
              Reset to Scheme Defaults
            </button>
          </div>
        </div>

        <ScenarioCalculator
          controls={{ projectCost, setProjectCost, marginPercent, setMarginPercent, interestRate, setInterestRate, tenureYears, setTenureYears, subsidyPct, setSubsidyPct }}
          derived={{
            marginAmount, loanAmount, rawSubsidy, subsidyAmount, subsidyCapped,
            emi, tenureMonths,
            schemeRate: scheme.rate,
            schemeTenureMonths: scheme.tenureMonths,
          }}
        />

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-surface-variant">
          <p className="font-label-sm text-label-sm text-on-surface-variant flex items-start gap-2">
            <span className="material-symbols-outlined text-primary text-sm shrink-0 mt-0.5">info</span>
            This is a planning estimate. Generate a feasibility report for your business to apply for the loan with real subsidy eligibility.
          </p>
          <button
            onClick={() => onNavigate('feasibility')}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary text-on-primary px-8 py-3.5 rounded-xl font-label-lg text-label-lg shadow-sm hover:shadow-xl transition-shadow"
          >
            <span className="material-symbols-outlined">assessment</span>
            Generate Feasibility Report
          </button>
        </div>
      </div>
    </div>
  );
}
