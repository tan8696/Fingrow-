import React from 'react';

// ---------------------------------------------------------------------------
// Shared scheme-linked scenario calculator
// ---------------------------------------------------------------------------
// A controlled, presentational calculator: every loan term (project cost,
// promoter margin, interest rate, tenure, subsidy rate) is exposed as an
// adjustable slider. Hosts own the state and derived values so they can also
// drive CSVs, loan applications, and modal copy from the same numbers.
//
//   <ScenarioCalculator controls={{ projectCost, setProjectCost, ... }}
//                        derived={{ loanAmount, emi, ... }} />

export const SUBSIDY_CAP = 500000; // scheme norm — capital subsidy capped at ₹5,00,000

export function formatINR(num) {
  return '₹' + Number(num || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function computeEMI(principal, annualRatePct, months) {
  const monthlyRate = annualRatePct / 100 / 12;
  if (!monthlyRate) return principal / months;
  const factor = Math.pow(1 + monthlyRate, months);
  return (principal * monthlyRate * factor) / (factor - 1);
}

export default function ScenarioCalculator({ controls, derived }) {
  const {
    projectCost, setProjectCost,
    marginPercent, setMarginPercent,
    interestRate, setInterestRate,
    tenureYears, setTenureYears,
    subsidyPct, setSubsidyPct,
  } = controls;

  const {
    marginAmount, loanAmount, rawSubsidy, subsidyAmount, subsidyCapped,
    emi, tenureMonths, schemeRate, schemeTenureMonths,
  } = derived;

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-8">
      {/* Sliders Column */}
      <div className="md:col-span-6 flex flex-col gap-6 bg-surface p-6 rounded-xl border border-surface-variant">
        <div>
          <div className="flex justify-between items-center mb-2">
            <label htmlFor="project-cost-slider" className="font-label-lg text-label-lg text-on-surface font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-sm">account_balance_wallet</span>
              Total Project Cost / Capital Requirement
            </label>
            <span className="px-3 py-1 bg-primary text-on-primary rounded-lg font-bold font-label-lg text-label-lg shadow-sm">{formatINR(projectCost)}</span>
          </div>
          <input
            id="project-cost-slider"
            type="range" min="100000" max="2500000" step="25000"
            value={projectCost}
            onChange={(e) => setProjectCost(Number(e.target.value))}
            className="w-full h-2 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-[#006948]"
          />
          <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant mt-1.5">
            <span>₹1 Lakh</span>
            <span>₹12.5 Lakh</span>
            <span>₹25 Lakh</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label htmlFor="margin-slider" className="font-label-lg text-label-lg text-on-surface font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-sm">pie_chart</span>
              Farmer / Promoter Margin Money (Equity)
            </label>
            <span className="px-3 py-1 bg-surface-container-high text-on-surface rounded-lg font-bold font-label-lg text-label-lg border border-outline-variant">
              {marginPercent}% ({formatINR(marginAmount)})
            </span>
          </div>
          <input
            id="margin-slider"
            type="range" min="15" max="35" step="5"
            value={marginPercent}
            onChange={(e) => setMarginPercent(Number(e.target.value))}
            className="w-full h-2 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-[#006948]"
          />
          <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant mt-1.5">
            <span>15% (Min. Required)</span>
            <span>25%</span>
            <span>35%</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label htmlFor="interest-rate-slider" className="font-label-lg text-label-lg text-on-surface font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-sm">percent</span>
              Interest Rate (p.a.)
            </label>
            <span className="px-3 py-1 bg-surface-container-high text-on-surface rounded-lg font-bold font-label-lg text-label-lg border border-outline-variant">
              {interestRate.toFixed(2)}%
            </span>
          </div>
          <input
            id="interest-rate-slider"
            type="range" min="4" max="15" step="0.25"
            value={interestRate}
            onChange={(e) => setInterestRate(Number(e.target.value))}
            className="w-full h-2 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-[#006948]"
          />
          <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant mt-1.5">
            <span>4% (Low)</span>
            <span className="">{schemeRate.toFixed(2)}% (Scheme Rate)</span>
            <span>15%</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label htmlFor="tenure-slider" className="font-label-lg text-label-lg text-on-surface font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-sm">calendar_month</span>
              Loan Tenure
            </label>
            <span className="px-3 py-1 bg-surface-container-high text-on-surface rounded-lg font-bold font-label-lg text-label-lg border border-outline-variant">
              {tenureYears} {tenureYears === 1 ? 'year' : 'years'} ({tenureMonths} mo)
            </span>
          </div>
          <input
            id="tenure-slider"
            type="range" min="1" max="15" step="1"
            value={tenureYears}
            onChange={(e) => setTenureYears(Number(e.target.value))}
            className="w-full h-2 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-[#006948]"
          />
          <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant mt-1.5">
            <span>1 yr</span>
            <span className="">{Math.round(schemeTenureMonths / 12)} yrs (Scheme)</span>
            <span>15 yrs</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <label htmlFor="subsidy-slider" className="font-label-lg text-label-lg text-on-surface font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-sm">redeem</span>
              Capital Subsidy Rate
            </label>
            <span className="px-3 py-1 bg-surface-container-high text-on-surface rounded-lg font-bold font-label-lg text-label-lg border border-outline-variant">
              {subsidyPct === 0
                ? 'No Subsidy'
                : subsidyCapped
                  ? `${subsidyPct}% (Cap ${formatINR(SUBSIDY_CAP)})`
                  : `${subsidyPct}% (${formatINR(rawSubsidy)})`}
            </span>
          </div>
          <input
            id="subsidy-slider"
            type="range" min="0" max="35" step="5"
            value={subsidyPct}
            onChange={(e) => setSubsidyPct(Number(e.target.value))}
            className="w-full h-2 bg-surface-container-high rounded-lg appearance-none cursor-pointer accent-[#006948]"
          />
          <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant mt-1.5">
            <span>0%</span>
            <span className="">25% (Typical)</span>
            <span>35%</span>
          </div>
        </div>

        <div className="p-3 bg-surface-container-low rounded-lg border border-outline-variant/50 text-on-surface-variant font-label-sm text-label-sm flex items-start gap-2">
          <span className="material-symbols-outlined text-primary text-sm shrink-0 mt-0.5">info</span>
          <span>
            Every term is adjustable — explore different cost, margin, rate, tenure and subsidy scenarios. The capital subsidy is capped at {formatINR(SUBSIDY_CAP)} under scheme norms.
          </span>
        </div>
      </div>

      {/* Metric Result Cards Column */}
      <div className="md:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Eligible Loan Card */}
        <div className="bg-surface p-5 rounded-xl border border-surface-variant flex flex-col justify-between">
          <div className="flex items-center gap-2 text-on-surface-variant mb-2">
            <span className="material-symbols-outlined text-primary">account_balance</span>
            <span className="font-label-lg text-label-lg font-medium">Eligible Bank Loan</span>
          </div>
          <div>
            <span className="font-headline-lg text-headline-lg font-bold text-on-surface block">{formatINR(loanAmount)}</span>
            <p className="font-label-sm text-label-sm text-on-surface-variant mt-1">Principal loan after promoter margin</p>
          </div>
          <div className="mt-3 pt-3 border-t border-surface-variant flex items-center justify-between text-xs text-primary font-semibold">
            <span>Direct Bank Disbursal</span>
            <span className="material-symbols-outlined text-sm">check_circle</span>
          </div>
        </div>

        {/* Govt Subsidy Card */}
        <div className="bg-surface p-5 rounded-xl border border-surface-variant flex flex-col justify-between">
          <div className="flex items-center justify-between text-on-surface-variant mb-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">redeem</span>
              <span className="font-label-lg text-label-lg font-medium">Capital Subsidy</span>
            </div>
            {subsidyPct > 0 ? (
              <span className="px-2 py-0.5 bg-primary/10 text-primary font-bold text-xs rounded-full">Eligible</span>
            ) : (
              <span className="px-2 py-0.5 bg-surface-container-high text-on-surface-variant font-bold text-xs rounded-full">Not Applied</span>
            )}
          </div>
          <div>
            <span className="font-headline-lg text-headline-lg font-bold text-primary block">{formatINR(subsidyAmount)}</span>
            <p className="font-label-sm text-label-sm text-on-surface-variant mt-1">
              {subsidyPct === 0
                ? 'No capital subsidy in this scenario'
                : subsidyCapped
                  ? `Capped at ${formatINR(SUBSIDY_CAP)} (${subsidyPct}% of cost)`
                  : `${subsidyPct}% Maha-Krushi backend subsidy`}
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-surface-variant flex items-center justify-between text-xs text-on-surface-variant">
            <span>{subsidyPct > 0 ? 'Direct to Bank Account' : '—'}</span>
            {subsidyPct > 0 && (
              <span className="material-symbols-outlined text-sm text-primary">done_all</span>
            )}
          </div>
        </div>

        {/* Estimated Monthly EMI (Spans 2 cols) */}
        <div className="sm:col-span-2 bg-surface p-5 rounded-xl border border-surface-variant flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-on-surface-variant mb-1">
              <span className="material-symbols-outlined text-primary">calendar_month</span>
              <span className="font-label-lg text-label-lg font-medium">Estimated Monthly Repayment (EMI)</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-headline-lg text-headline-lg font-bold text-primary">{formatINR(Math.round(emi))}</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">/ month for {tenureMonths} months ({Math.round(tenureMonths / 12)} yrs)</span>
            </div>
          </div>
          <div className="text-right sm:text-right text-xs text-on-surface-variant bg-surface-container-high px-3 py-2 rounded-lg">
            <span>Net Effective Interest: </span>
            <span className="font-bold text-on-surface">{interestRate.toFixed(1)}% p.a.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
